'use strict';

const mongoose = require('mongoose');

const PaymentOrderSchema = new mongoose.Schema(
  {
    // Razorpay IDs
    orderId:   { type: String, required: true, unique: true, index: true },
    paymentId: { type: String, index: true },
    signature: { type: String },

    // Lifecycle
    status: {
      type: String,
      enum: ['created', 'paid', 'failed', 'refunded'],
      default: 'created',
      index: true
    },

    // Money (paise)
    amount:   { type: Number, required: true },
    currency: { type: String, default: 'INR' },

    // Who
    phone:    { type: String, index: true },
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', index: true },

    // Optional extra
    rpOrder:       { type: mongoose.Schema.Types.Mixed },  // raw RZP order payload (audit/debug)
    meta:          { type: mongoose.Schema.Types.Mixed },  // any app-side notes
    verifiedAt:    { type: Date },
    failureReason: { type: String }
  },
  {
    timestamps: true,     // adds createdAt, updatedAt
    minimize: false
  }
);

// Useful listing index
PaymentOrderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PaymentOrder', PaymentOrderSchema);
