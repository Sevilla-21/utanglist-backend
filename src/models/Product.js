const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    productName: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Price cannot be negative'],
    },
    quantity: {
      type: Number,
      required: true,
      min: [0, 'Stock quantity cannot be negative'],
      default: 0,
    },
    minimumStock: {
      type: Number,
      required: true,
      min: [0, 'Minimum stock cannot be negative'],
      default: 5,
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

productSchema.index(
  { userId: 1, operationId: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model('Product', productSchema);