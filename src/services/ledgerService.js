const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');

const roundMoney = (value) => {
  return Math.round((Number(value) || 0) * 100) / 100;
};

const isValidObjectId = (id) => {
  return Boolean(id) && mongoose.Types.ObjectId.isValid(String(id));
};

const getCustomerBalanceSummary = async (userId, customerId) => {
  const transactions = await Transaction.find({ userId, customerId }).select(
    'type amount'
  );

  let totalDebt = 0;
  let totalPaid = 0;

  for (const tx of transactions) {
    if (tx.type === 'debt') {
      totalDebt += Number(tx.amount || 0);
    } else if (tx.type === 'payment') {
      totalPaid += Number(tx.amount || 0);
    }
  }

  totalDebt = roundMoney(totalDebt);
  totalPaid = roundMoney(totalPaid);
  const balance = roundMoney(totalDebt - totalPaid);

  return {
    totalDebt,
    totalPaid,
    balance,
  };
};

module.exports = {
  roundMoney,
  isValidObjectId,
  getCustomerBalanceSummary,
};