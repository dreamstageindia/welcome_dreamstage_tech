const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  sessionId: { type: String, index: true },
  name: { type: String, default: '' },

  role: {
    type: String,
    enum: ['artist', 'helper', 'manager', 'business', 'appreciator', 'lover', ''],
    default: ''
  },

  // Artist
  artistType: {
    name: { type: String, default: '' },
    description: { type: String, default: '' }
  },
  location: { type: String, default: '' },

  // Helper
  helperWork: { type: [String], default: [] },
  helperCapacity: { type: String, default: '' },
  helperStage: { type: String, default: '' },

  // Manager/Business
  managerRoleText: { type: String, default: '' },
  eventFrequency: { type: String, default: '' },

  // Appreciator/Lover
  appreciatorEngagement: { type: String, default: '' },
  attendance: { type: String, default: '' },

  // Consent
  consent: {
    agreed: { type: Boolean, default: false },
    timestamp: { type: Date, default: null }
  },

  // Phone + OTP
  phone: {
    number: { type: String, default: undefined },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null }
  },
  otp: {
    codeHash: { type: String, default: '' },
    expiresAt: { type: Date, default: null }
  },
  creator: {
    number: { type: Number, default: 0 },   // 1..N
    code:   { type: String, default: '' }   // '#0001'
  },

  // NEW: invite gating state
  invite: {
    code: { type: String, default: '' },    // locked code string they entered
    locked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },
    verified: { type: Boolean, default: false } // becomes true after successful payment
  },

  // Step flags
  steps: {
    name: { type: Boolean, default: false },
    role: { type: Boolean, default: false },
    roleMessage: { type: Boolean, default: false },
    postLevel2Q: { type: Boolean, default: false },
    location: { type: Boolean, default: false },
    consent: { type: Boolean, default: false },
    waitlist: { type: Boolean, default: false },
    phone: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    commitmentAgreed: { type: Boolean, default: false },
    subscriptionConfirmed: { type: Boolean, default: false },
    // for invite flow (keeps UI checks simple)
    inviteVerified: { type: Boolean, default: false },
    inviteLocked:   { type: Boolean, default: false }, // allowed to access gated pages
 
  },

  // Invite gate (top-level mirror for easy querying)
  inviteVerified: { type: Boolean, default: false },
  inviteCode: { type: String, default: '' },

  // Rank (assigned ONLY when OTP is verified)
  joinOrder: { type: Number, default: 0 },

  // Membership / subscription
  membership: {
    status: { type: String, enum: ['none','active','expired'], default: 'none' },
    validTill: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    lastOrderId: { type: String, default: '' },
    lastPaymentId: { type: String, default: '' },
    amount: { type: Number, default: 0 } // in paise
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Unique phone (sparse)
playerSchema.index(
  { 'phone.number': 1 },
  { unique: true, partialFilterExpression: { 'phone.number': { $exists: true, $ne: '' } } }
);

playerSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Player', playerSchema);
