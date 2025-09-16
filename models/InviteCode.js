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
    maxlength: 4,
    index: true
  },

  // legacy single-use flags (retain)
  used: { type: Boolean, default: false, index: true },
  usedAt: { type: Date, default: null },

  // lock while invitee is inside gated flow
  locked: { type: Boolean, default: false, index: true },
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  lockedAt: { type: Date, default: null },

  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  claimedAt: { type: Date, default: null },

  // NEW: multi-use support (non-breaking; default behaves like old single-use)
  maxUses: { type: Number, default: 1, min: 1 },
  uses:    { type: Number, default: 0, min: 0 },

  // optional metadata
  active: { type: Boolean, default: true },
  source: { type: String, enum: ['spin','manual','other'], default: 'spin' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },

  createdAt: { type: Date, default: Date.now }
});

// convenience virtual: remaining uses
InviteCodeSchema.virtual('remaining').get(function () {
  return Math.max(0, (this.maxUses || 1) - (this.uses || 0));
});

module.exports = mongoose.model('InviteCode', InviteCodeSchema);
