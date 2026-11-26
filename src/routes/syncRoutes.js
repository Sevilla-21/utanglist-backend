const express = require('express');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');
const { roundMoney, isValidObjectId } = require('../services/ledgerService');

const router = express.Router();

// All sync routes require a valid JWT Bearer token
router.use(protect);

const resolveEntityId = (rawId, mappingTable) => {
  if (!rawId) return null;
  const key = String(rawId).trim();
  if (mappingTable[key]) {
    return mappingTable[key];
  }
  if (isValidObjectId(key)) {
    return key;
  }
  return null;
};

/**
 * @route   POST /api/v1/sync
 * @desc    Idempotently apply offline customer & transaction changes and return cloud updates
 */
router.post('/', async (req, res, next) => {
  try {
    const { changes = [], lastSyncAt } = req.body || {};

    if (!Array.isArray(changes)) {
      return res.status(400).json({
        success: false,
        message: 'changes must be an array of sync operations.',
      });
    }

    const userId = req.user._id;
    const idMappings = {
      customers: {},
      transactions: {},
    };
    const results = [];

    for (const change of changes) {
      const {
        operationId,
        entity,
        action,
        localId,
        serverId,
        payload = {},
      } = change || {};

      if (!operationId || !entity || !action) {
        results.push({
          operationId: operationId || null,
          status: 'error',
          message: 'Missing operationId, entity, or action.',
        });
        continue;
      }

      try {
        // --- 1. CUSTOMERS ---
        if (entity === 'customer') {
          if (action === 'create') {
            const existing = await Customer.findOne({ userId, operationId });
            if (existing) {
              if (localId) {
                idMappings.customers[localId] = String(existing._id);
              }
              results.push({
                operationId,
                status: 'duplicate_skipped',
                serverId: String(existing._id),
              });
              continue;
            }

            const cleanName = String(payload.name || '').trim();
            if (!cleanName) {
              results.push({
                operationId,
                status: 'error',
                message: 'Customer name is required.',
              });
              continue;
            }

            const created = await Customer.create({
              userId,
              name: cleanName,
              contactNumber: String(payload.contactNumber || '').trim(),
              address: String(payload.address || '').trim(),
              operationId,
            });

            if (localId) {
              idMappings.customers[localId] = String(created._id);
            }
            results.push({
              operationId,
              status: 'synced',
              serverId: String(created._id),
            });
          } else if (action === 'update') {
            const targetId = resolveEntityId(
              serverId || localId,
              idMappings.customers
            );
            if (!targetId) {
              results.push({
                operationId,
                status: 'error',
                message: 'Customer target ID could not be resolved.',
              });
              continue;
            }

            const updateData = {};
            if (payload.name !== undefined) {
              updateData.name = String(payload.name).trim();
            }
            if (payload.contactNumber !== undefined) {
              updateData.contactNumber = String(payload.contactNumber).trim();
            }
            if (payload.address !== undefined) {
              updateData.address = String(payload.address).trim();
            }

            await Customer.findOneAndUpdate(
              { _id: targetId, userId },
              updateData,
              { new: true }
            );
            results.push({ operationId, status: 'synced', serverId: targetId });
          } else if (action === 'delete') {
            const targetId = resolveEntityId(
              serverId || localId,
              idMappings.customers
            );
            if (targetId) {
              await Transaction.deleteMany({ userId, customerId: targetId });
              await Customer.findOneAndDelete({ _id: targetId, userId });
            }
            results.push({
              operationId,
              status: 'synced',
              serverId: targetId || null,
            });
          }
        }

        // --- 2. TRANSACTIONS (DEBTS & PAYMENTS) ---
        else if (entity === 'transaction') {
          if (action === 'create') {
            const existing = await Transaction.findOne({ userId, operationId });
            if (existing) {
              if (localId) {
                idMappings.transactions[localId] = String(existing._id);
              }
              results.push({
                operationId,
                status: 'duplicate_skipped',
                serverId: String(existing._id),
              });
              continue;
            }

            const resolvedCustomerId = resolveEntityId(
              payload.customerId,
              idMappings.customers
            );
            if (!resolvedCustomerId) {
              results.push({
                operationId,
                status: 'error',
                message: 'Customer ID could not be resolved for transaction.',
              });
              continue;
            }

            const txType = payload.type === 'payment' ? 'payment' : 'debt';
            const rawItems = Array.isArray(payload.items) ? payload.items : [];
            const normalizedItems = rawItems.map((item) => {
              const qty = Math.max(1, Number(item.quantity) || 1);
              const unitPrice = Math.max(0, roundMoney(item.unitPrice));
              return {
                productName: String(item.productName || 'Item').trim(),
                quantity: qty,
                unitPrice,
                subtotal: roundMoney(qty * unitPrice),
              };
            });

            const amount = roundMoney(payload.amount);
            if (amount <= 0) {
              results.push({
                operationId,
                status: 'error',
                message: 'Transaction amount must be greater than zero.',
              });
              continue;
            }

            const created = await Transaction.create({
              userId,
              customerId: resolvedCustomerId,
              type: txType,
              items: txType === 'debt' ? normalizedItems : [],
              amount,
              description: String(payload.description || '').trim(),
              transactionDate: payload.transactionDate
                ? new Date(payload.transactionDate)
                : new Date(),
              operationId,
            });

            if (localId) {
              idMappings.transactions[localId] = String(created._id);
            }
            results.push({
              operationId,
              status: 'synced',
              serverId: String(created._id),
            });
          }
        }
      } catch (itemError) {
        results.push({
          operationId,
          status: 'error',
          message: itemError.message,
        });
      }
    }

    // Fetch updated cloud records since lastSyncAt (or full dataset if omitted)
    const pullFilter = { userId };
    if (lastSyncAt) {
      const parsedLastSync = new Date(lastSyncAt);
      if (!Number.isNaN(parsedLastSync.getTime())) {
        pullFilter.updatedAt = { $gt: parsedLastSync };
      }
    }

    const [customers, transactions] = await Promise.all([
      Customer.find(pullFilter).sort({ name: 1 }),
      Transaction.find(pullFilter).sort({ transactionDate: -1, createdAt: -1 }),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Synchronization completed.',
      serverTime: new Date().toISOString(),
      results,
      idMappings,
      updatedRecords: {
        customers,
        transactions,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/sync/status
 * @desc    Retrieve cloud backup counts & status for the signed-in store owner
 */
router.get('/status', async (req, res, next) => {
  try {
    const userId = req.user._id;

    const [
      customersCount,
      transactionsCount,
      latestCustomer,
      latestTransaction,
    ] = await Promise.all([
      Customer.countDocuments({ userId }),
      Transaction.countDocuments({ userId }),
      Customer.findOne({ userId }).sort({ updatedAt: -1 }).select('updatedAt'),
      Transaction.findOne({ userId })
        .sort({ updatedAt: -1 })
        .select('updatedAt'),
    ]);

    const timestamps = [
      latestCustomer?.updatedAt,
      latestTransaction?.updatedAt,
    ]
      .filter(Boolean)
      .map((d) => new Date(d).getTime());

    const lastCloudActivityAt =
      timestamps.length > 0
        ? new Date(Math.max(...timestamps)).toISOString()
        : null;

    return res.status(200).json({
      success: true,
      status: {
        connected: true,
        serverTime: new Date().toISOString(),
        lastCloudActivityAt,
        counts: {
          customers: customersCount,
          transactions: transactionsCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;