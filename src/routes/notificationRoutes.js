const express = require('express');
const { Expo } = require('expo-server-sdk');
const DeviceToken = require('../models/DeviceToken');
const Customer = require('../models/Customer');
const { protect } = require('../middleware/auth');
const {
  isValidObjectId,
  getCustomerBalanceSummary,
} = require('../services/ledgerService');

const router = express.Router();
const expo = new Expo();

// All notification routes require authentication
router.use(protect);

/**
 * @route   POST /api/v1/notifications/register-token
 * @desc    Register or refresh an Expo Push Notification token
 */
router.post('/register-token', async (req, res, next) => {
  try {
    const { pushToken, platform } = req.body || {};

    if (!pushToken || !String(pushToken).trim()) {
      return res.status(400).json({
        success: false,
        message: 'pushToken is required.',
      });
    }

    const cleanToken = String(pushToken).trim();
    if (!Expo.isExpoPushToken(cleanToken)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Expo push token format.',
      });
    }

    const cleanPlatform = ['ios', 'android', 'web'].includes(platform)
      ? platform
      : 'android';

    const deviceToken = await DeviceToken.findOneAndUpdate(
      { pushToken: cleanToken },
      {
        userId: req.user._id,
        pushToken: cleanToken,
        platform: cleanPlatform,
        lastActive: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Device push token registered successfully.',
      deviceToken,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/v1/notifications/remove-token
 * @desc    Unregister an Expo Push Notification token on logout
 */
router.delete('/remove-token', async (req, res, next) => {
  try {
    const { pushToken } = req.body || {};

    if (!pushToken || !String(pushToken).trim()) {
      return res.status(400).json({
        success: false,
        message: 'pushToken is required.',
      });
    }

    await DeviceToken.findOneAndDelete({
      userId: req.user._id,
      pushToken: String(pushToken).trim(),
    });

    return res.status(200).json({
      success: true,
      message: 'Device push token removed.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/notifications/send-reminder
 * @desc    Validate customer consent and log/dispatch a private payment reminder
 */
router.post('/send-reminder', async (req, res, next) => {
  try {
    const { customerId, message, consentConfirmed } = req.body || {};

    if (!consentConfirmed) {
      return res.status(400).json({
        success: false,
        message: 'Customer consent confirmation is required before sending.',
      });
    }

    if (!isValidObjectId(customerId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid customerId is required.',
      });
    }

    const customer = await Customer.findOne({
      _id: customerId,
      userId: req.user._id,
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found.',
      });
    }

    const { balance } = await getCustomerBalanceSummary(
      req.user._id,
      customer._id
    );

    const reminderText =
      String(message || '').trim() ||
      `Hi ${customer.name}, friendly reminder from ${req.user.name} regarding your remaining utang balance of ₱${balance.toFixed(
        2
      )}. Thank you!`;

    const tokens = await DeviceToken.find({ userId: req.user._id });
    const pushMessages = tokens
      .filter((t) => Expo.isExpoPushToken(t.pushToken))
      .map((t) => ({
        to: t.pushToken,
        sound: 'default',
        title: `Reminder Prepared: ${customer.name}`,
        body: reminderText,
        data: { customerId: String(customer._id), balance },
      }));

    if (pushMessages.length > 0) {
      const chunks = expo.chunkPushNotifications(pushMessages);
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Payment reminder verified and prepared.',
      reminder: {
        customerId: String(customer._id),
        customerName: customer.name,
        contactNumber: customer.contactNumber,
        balance,
        text: reminderText,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;