// models/CreatorNumber.js
const mongoose = require('mongoose');

const CreatorNumberSchema = new mongoose.Schema({
  n: { type: Number, unique: true, index: true },                 // 1,2,3...
  status: { type: String, enum: ['free', 'reserved', 'assigned'], default: 'free', index: true },

  reservedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  orderId: { type: String, default: '' },                          // Razorpay order id
  reservedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },                        // for releasing stale reservations

  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  assignedAt: { type: Date, default: null }
});

// Optional: background job will clear stale holds; we do NOT use TTL delete to avoid gaps.
module.exports = mongoose.model('CreatorNumber', CreatorNumberSchema);
