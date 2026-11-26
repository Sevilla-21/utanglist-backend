const mongoose = require('mongoose');

const transactionItemSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Item quantity must be at least 1'],
    },
    unitPrice: {
      type: Number,
      required: true,
      min: [0, 'Unit price cannot be negative'],
    },
    subtotal: {
      type: Number,
      required: true,
      min: [0, 'Subtotal cannot be negative'],
    },
  },
  { _id: false }
);

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['debt', 'payment'],
    },
    items: {
      type: [transactionItemSchema],
      default: [],
    },
    amount: {
      type: Number,
      required: [true, 'Transaction amount is required'],
      min: [0.01, 'Amount must be greater than zero'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    transactionDate: {
      type: Date,
      default: Date.now,
    },
    operationId: {
      type: String,
      trim: true,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

transactionSchema.index(
  { userId: 1, operationId: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model('Transaction', transactionSchema);