// models/SpinAttempt.js
const mongoose = require('mongoose');

const SpinAttemptSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
  result:   { type: String, enum: ['none', 'referrals', 'refund'], required: true },
  limit:    { type: Number, default: 0 },        // 0,1,2,3
  inviteCode: { type: String }                   // set if referrals
}, { timestamps: true });

module.exports = mongoose.model('SpinAttempt', SpinAttemptSchema);
