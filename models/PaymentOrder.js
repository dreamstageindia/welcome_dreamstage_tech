// models/PaymentOrder.js
const mongoose = require('mongoose');

const PaymentOrderSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true, index: true },
  phone: { type: String, required: true },

  rzp: {
    orderId: { type: String, required: true, unique: true, index: true },
    paymentId: { type: String, default: '' },
    signature: { type: String, default: '' }
  },

  amount: { type: Number, required: true },           // paise
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['created','paid','failed','expired'], default: 'created', index: true },

  // reserved creator number for fair pricing & assignment
  reservedCodeNumber: { type: Number, required: true, index: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 60 * 60 * 1000) } // 60 min hold
});

PaymentOrderSchema.pre('save', function(next){ this.updatedAt = new Date(); next(); });

module.exports = mongoose.model('PaymentOrder', PaymentOrderSchema);
