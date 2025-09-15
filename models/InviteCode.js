// models/InviteCode.js
const mongoose = require('mongoose');

const InviteCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    minlength: 4,
    maxlength: 4
  },
  // was used before; keep it for final consumption
  used: { type: Boolean, default: false, index: true },
  usedAt: { type: Date, default: null },

  // NEW: lock while the invited user is inside the gated flow
  locked: { type: Boolean, default: false, index: true },
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  lockedAt: { type: Date, default: null },

  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  claimedAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InviteCode', InviteCodeSchema);
