const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    pushToken: {
      type: String,
      required: [true, 'Expo push token is required'],
      unique: true,
      trim: true,
    },
    platform: {
      type: String,
      required: true,
      enum: ['ios', 'android', 'web'],
      default: 'android',
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);