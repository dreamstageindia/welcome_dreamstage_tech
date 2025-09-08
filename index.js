// server.js
// Dream Stage backend with unique phone enforcement + atomic joinOrder + payments (Razorpay)

'use strict';

const express  = require('express');
const path     = require('path');
const cors     = require('cors');
const mongoose = require('mongoose');
const crypto   = require('crypto');
require("dotenv").config();

const app = express();

/* ------------------ DB CONNECT ------------------ */
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI).catch(err => {
  console.error('MongoDB connection failed:', err);
});

mongoose.connection
  .on('error', console.error.bind(console, 'MongoDB connection error:'))
  .once('open', () => console.log('✔ Connected to MongoDB'));

/* ------------------ MODELS ------------------ */

// Levels (unchanged)
const levelSchema = new mongoose.Schema({
  map: { type: [[Number]], required: true },
  createdAt: { type: Date, default: Date.now }
});
levelSchema.index({ createdAt: 1 });
const Level = mongoose.model('Level', levelSchema);

// Atomic counters (for joinOrder)
const counterSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', counterSchema);
async function nextSequence(key) {
  const doc = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).exec();
  return doc.seq;
}

// Player/Journey
const playerSchema = new mongoose.Schema({
  sessionId: { type: String, index: true }, // stored in localStorage on client
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
    number: { type: String, default: '' },  // will be unique across players
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null }
  },
  otp: {
    codeHash: { type: String, default: '' },
    expiresAt: { type: Date, default: null }
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

    // NEW: store the two checkboxes you requested
    commitmentAgreed: { type: Boolean, default: false },
    subscriptionConfirmed: { type: Boolean, default: false }
  },

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

// Enforce unique phone numbers (sparse allows docs with empty number)
playerSchema.index({ 'phone.number': 1 }, { unique: true, sparse: true });

playerSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Player = mongoose.model('Player', playerSchema);

/* ------------------ UTILS ------------------ */

function hashOTP(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000); // 6-digit
}
function normalizePhone(s) {
  if (!s) return '';
  // store in E.164-like form with optional +
  const raw = String(s).trim();
  // keep leading +, strip other non-digits
  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D+/g,'');
  return '+' + raw.replace(/\D+/g,''); // default to +<digits>
}
function onlyDigits(s) {
  return String(s||'').replace(/\D+/g,'');
}

/* ------------------ MIDDLEWARE ------------------ */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

/* ------------------ STATIC ------------------ */
app.use('/', express.static(path.join(__dirname, 'public')));

/* ------------------ LEVEL ROUTES (unchanged) ------------------ */
app.post('/api/levels', async (req, res) => {
  try {
    const { map } = req.body;
    if (!Array.isArray(map) || !map.every(row => Array.isArray(row))) {
      return res.status(400).json({ error: '`map` must be a 2D array' });
    }
    const lvl = new Level({ map });
    await lvl.save();
    res.json({ _id: lvl._id });
  } catch (err) {
    console.error('POST /api/levels error:', err);
    res.status(500).json({ error: 'Failed to save level' });
  }
});

app.get('/api/levels/list', async (req, res) => {
  try {
    const docs = await Level.find().sort({ createdAt: 1 }).select({ map: 0 }).exec();
    res.json(docs.map(d => ({ _id: d._id.toString(), createdAt: d.createdAt })));
  } catch (err) {
    console.error('GET /api/levels/list error:', err);
    res.status(500).json({ error: 'Failed to list levels' });
  }
});

app.get('/api/levels', async (req, res) => {
  try {
    const levels = await Level.find().sort({ createdAt: 1 }).exec();
    res.json(levels);
  } catch (err) {
    console.error('GET /api/levels error:', err);
    res.status(500).json({ error: 'Failed to fetch levels' });
  }
});

app.get('/api/levels/first', async (req, res) => {
  try {
    const docs = await Level.find().sort({ createdAt: 1 }).exec();
    if (!docs.length) {
      return res.status(404).json({ error: 'No levels found' });
    }
    res.json(docs.map(doc => ({ map: doc.map })));
  } catch (err) {
    console.error('GET /api/levels/first error:', err);
    res.status(500).json({ error: 'Failed to fetch levels' });
  }
});

app.get('/api/levels/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (mongoose.Types.ObjectId.isValid(id)) {
      const doc = await Level.findById(id).exec();
      if (!doc || !doc.map) {
        return res.status(404).json({ error: 'Level not found or invalid' });
      }
      return res.json({ map: doc.map });
    } else {
      const number = parseInt(id, 10);
      if (isNaN(number) || number < 1) {
        return res.status(400).json({ error: 'Invalid level ID or number' });
      }
      const doc = await Level.findOne().sort({ createdAt: 1 }).skip(number - 1).exec();
      if (!doc || !doc.map) {
        return res.status(404).json({ error: 'Level not found' });
      }
      return res.json({ map: doc.map });
    }
  } catch (err) {
    console.error('GET /api/levels/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch level' });
  }
});

app.delete('/api/levels', async (req, res) => {
  try {
    await Level.deleteMany({});
    res.json({ message: 'All levels deleted' });
  } catch (err) {
    console.error('DELETE /api/levels error:', err);
    res.status(500).json({ error: 'Failed to delete levels' });
  }
});

/* ------------------ JOURNEY ROUTES ------------------ */

// Initialize journey (with sessionId + optional name)
// NOTE: we DO NOT assign joinOrder here anymore.
app.post('/api/journey/init', async (req, res) => {
  try {
    const { name, sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    const safeName = (typeof name === 'string' ? name.trim() : '');
    let doc = await Player.findOne({ sessionId }).exec();
    if (!doc) {
      doc = await Player.create({
        sessionId,
        name: safeName,
        steps: { name: !!safeName }
      });
    } else if (safeName && !doc.steps.name) {
      doc.name = safeName;
      doc.steps.name = true;
      await doc.save();
    }
    res.json({ playerId: doc._id.toString(), steps: doc.steps, name: doc.name, joinOrder: doc.joinOrder || 0 });
  } catch (err) {
    console.error('POST /api/journey/init error:', err);
    res.status(500).json({ error: 'Failed to initialize journey' });
  }
});

// Update partial journey (role, artistType, etc.) — also accepts commitment/confirmation
app.patch('/api/journey/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const updates = {};
    const steps = {};

    if (typeof req.body.role === 'string') {
      const raw = req.body.role.toLowerCase().trim();
      const accepted = ['artist','helper','manager','business','appreciator','lover'];
      const role = accepted.includes(raw) ? raw : null;
      if (role) {
        updates.role = role;
        steps.role = true;
      }
    }

    if (req.body.roleMessageDone === true) steps.roleMessage = true;

    if (req.body.artistType && typeof req.body.artistType === 'object') {
      updates['artistType.name'] = req.body.artistType.name || '';
      updates['artistType.description'] = req.body.artistType.description || '';
      steps.postLevel2Q = true;
    }

    if (typeof req.body.location === 'string') {
      updates.location = req.body.location.trim();
      steps.location = true;
    }

    if (Array.isArray(req.body.helperWork)) {
      updates.helperWork = req.body.helperWork;
      steps.postLevel2Q = true;
    }

    if (typeof req.body.helperCapacity === 'string') {
      updates.helperCapacity = req.body.helperCapacity.trim();
    }

    if (typeof req.body.helperStage === 'string') {
      updates.helperStage = req.body.helperStage.trim();
      steps.postLevel2Q = true;
    }

    if (typeof req.body.managerRoleText === 'string') {
      updates.managerRoleText = req.body.managerRoleText.trim();
      steps.postLevel2Q = true;
    }

    if (typeof req.body.appreciatorEngagement === 'string') {
      updates.appreciatorEngagement = req.body.appreciatorEngagement.trim();
      steps.postLevel2Q = true;
    }

    if (typeof req.body.eventFrequency === 'string') {
      updates.eventFrequency = req.body.eventFrequency.trim();
      steps.postLevel2Q = true;
    }

    if (typeof req.body.attendance === 'string') {
      updates.attendance = req.body.attendance.trim();
      steps.postLevel2Q = true;
    }

    // Commitment checkbox (also map into consent)
    if (typeof req.body.commitmentAgreed === 'boolean') {
      steps.commitmentAgreed = req.body.commitmentAgreed;
      updates['consent.agreed'] = !!req.body.commitmentAgreed;
      updates['consent.timestamp'] = req.body.commitmentAgreed ? new Date() : null;
      steps.consent = !!req.body.commitmentAgreed;
      if (req.body.commitmentAgreed) steps.waitlist = true;
    }

    // Final confirmation checkbox
    if (typeof req.body.subscriptionConfirmed === 'boolean') {
      steps.subscriptionConfirmed = !!req.body.subscriptionConfirmed;
    }

    if (typeof req.body.consentAgreed === 'boolean') {
      updates['consent.agreed'] = req.body.consentAgreed;
      updates['consent.timestamp'] = req.body.consentAgreed ? new Date() : null;
      steps.consent = true;
      if (req.body.consentAgreed) steps.waitlist = true;
    }

    if (typeof req.body.phoneNumber === 'string') {
      updates['phone.number'] = normalizePhone(req.body.phoneNumber);
      steps.phone = true;
    }

    if (typeof req.body.name === 'string') {
      updates.name = req.body.name.trim();
      steps.name = !!updates.name;
    }

    const doc = await Player.findById(id).exec();
    if (!doc) return res.status(404).json({ error: 'Not found' });

    Object.keys(updates).forEach(k => doc.set(k, updates[k]));
    Object.keys(steps).forEach(k => { doc.steps[k] = steps[k]; });
    await doc.save();

    res.json({ ok: true, steps: doc.steps });
  } catch (err) {
    console.error('PATCH /api/journey/:id error:', err);
    res.status(500).json({ error: 'Failed to update journey' });
  }
});

// Get journey (no OTP hash)
app.get('/api/journey/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    const doc = await Player.findById(id).lean().exec();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (doc.otp) delete doc.otp.codeHash;
    res.json(doc);
  } catch (err) {
    console.error('GET /api/journey/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch journey' });
  }
});

/* ------------------ OTP ROUTES ------------------ */

// Send OTP (supports either {playerId, phone} OR {sessionId, phone})
// Enforces unique phone: if the number belongs to another player, return 409 PHONE_EXISTS
app.post('/api/otp/send', async (req, res) => {
  try {
    let { playerId, sessionId, phone } = req.body;

    phone = normalizePhone(phone);
    if (!phone) return res.status(400).json({ error: 'Invalid phone' });

    let doc = null;

    if (playerId) {
      if (!mongoose.Types.ObjectId.isValid(playerId)) {
        return res.status(400).json({ error: 'Invalid playerId' });
      }
      doc = await Player.findById(playerId).exec();
    } else if (sessionId) {
      if (typeof sessionId !== 'string' || !sessionId.trim()) {
        return res.status(400).json({ error: 'Invalid sessionId' });
      }
      doc = await Player.findOne({ sessionId }).exec();
      if (!doc) {
        // NOTE: do NOT assign joinOrder here
        doc = await Player.create({ sessionId });
      }
    } else {
      return res.status(400).json({ error: 'playerId or sessionId is required' });
    }

    // Check if this phone already belongs to some *other* player
    const existing = await Player.findOne({ 'phone.number': phone }).select('_id').lean().exec();
    if (existing && String(existing._id) !== String(doc._id)) {
      return res.status(409).json({ error: 'PHONE_EXISTS', message: 'Phone number already exists' });
    }

    const code = generateOTP();
    const codeHash = hashOTP(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    doc.phone.number = phone;
    doc.phone.verified = false;
    doc.phone.verifiedAt = null;
    doc.steps.phone = true;
    doc.otp.codeHash = codeHash;
    doc.otp.expiresAt = expiresAt;

    try {
      await doc.save();
    } catch (e) {
      // translate duplicate key into 409 PHONE_EXISTS
      if (e && e.code === 11000) {
        return res.status(409).json({ error: 'PHONE_EXISTS', message: 'Phone number already exists' });
      }
      throw e;
    }

    const payload = { ok: true, expiresAt };
    if (process.env.NODE_ENV !== 'production') {
      payload.devOtp = code;
      console.log(`DEV OTP for ${phone} (${doc._id}): ${code}`);
    }
    res.json(payload);
  } catch (err) {
    console.error('POST /api/otp/send error:', err);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP (supports {playerId, code} OR {sessionId, otp})
// Assign joinOrder atomically on first successful verification.
app.post('/api/otp/verify', async (req, res) => {
  try {
    let { playerId, sessionId, code, otp } = req.body;
    const cand = String(code || otp || '').trim();

    if (!/^\d{4,8}$/.test(cand)) return res.status(400).json({ error: 'Invalid OTP' });

    let doc = null;

    if (playerId) {
      if (!mongoose.Types.ObjectId.isValid(playerId)) return res.status(400).json({ error: 'Invalid playerId' });
      doc = await Player.findById(playerId).exec();
    } else if (sessionId) {
      if (typeof sessionId !== 'string' || !sessionId.trim()) {
        return res.status(400).json({ error: 'Invalid sessionId' });
      }
      doc = await Player.findOne({ sessionId }).exec();
    } else {
      return res.status(400).json({ error: 'playerId or sessionId is required' });
    }

    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (!doc.otp || !doc.otp.codeHash || !doc.otp.expiresAt) {
      return res.status(400).json({ error: 'No OTP issued' });
    }
    if (new Date() > new Date(doc.otp.expiresAt)) {
      return res.status(400).json({ error: 'OTP expired' });
    }

    const ok = (doc.otp.codeHash === hashOTP(cand));
    if (!ok) return res.status(400).json({ error: 'Incorrect OTP' });

    doc.phone.verified = true;
    doc.phone.verifiedAt = new Date();
    doc.steps.phoneVerified = true;
    doc.otp.codeHash = '';
    doc.otp.expiresAt = null;

    // Assign joinOrder ONCE, atomically
    if (!doc.joinOrder || doc.joinOrder <= 0) {
      doc.joinOrder = await nextSequence('joinOrder');
    }

    await doc.save();

    res.json({ ok: true, verified: true, playerId: doc._id.toString(), joinOrder: doc.joinOrder });
  } catch (err) {
    console.error('POST /api/otp/verify error:', err);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

/* ------------------ COMPAT: /api/player/* (session-based) ------------------ */
// NOTE: joinOrder is NOT incremented here anymore.
app.post('/api/player/session', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId required' });
    }
    let p = await Player.findOne({ sessionId }).exec();
    if (!p) {
      p = await Player.create({ sessionId });
    }
    res.json({ ok: true, sessionId: p.sessionId, playerId: p._id.toString(), joinOrder: p.joinOrder || 0 });
  } catch (err) {
    console.error('POST /api/player/session error:', err);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

app.patch('/api/player/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    // --- Compat mapping: accept old client keys and normalize to schema ---
    const body = { ...req.body };

    if (body.artistKind && !body.artistType) {
      body.artistType = { name: body.artistKind, description: '' };
      delete body.artistKind;
    }
    if (body.city && !body.location) {
      body.location = body.city;
      delete body.city;
    }
    if (body.businessKind && !body.managerRoleText) {
      body.managerRoleText = body.businessKind;
      delete body.businessKind;
    }
    if (body.loverPreference && !body.appreciatorEngagement) {
      body.appreciatorEngagement = body.loverPreference;
      delete body.loverPreference;
    }

    const update = { updatedAt: new Date() };

    if (typeof body.name === 'string')           update.name = body.name.trim();
    if (typeof body.role === 'string')           update.role = body.role.trim();

    if (body.artistType && typeof body.artistType === 'object') {
      update['artistType.name'] = body.artistType.name || '';
      update['artistType.description'] = body.artistType.description || '';
      update['steps.postLevel2Q'] = true;
    }
    if (typeof body.location === 'string')       { update.location = body.location.trim(); update['steps.location'] = true; }
    if (typeof body.helperCapacity === 'string') update.helperCapacity = body.helperCapacity.trim();
    if (typeof body.helperStage === 'string')    { update.helperStage = body.helperStage.trim(); update['steps.postLevel2Q'] = true; }
    if (typeof body.managerRoleText === 'string') { update.managerRoleText = body.managerRoleText.trim(); update['steps.postLevel2Q'] = true; }
    if (typeof body.eventFrequency === 'string') { update.eventFrequency = body.eventFrequency.trim(); update['steps.postLevel2Q'] = true; }
    if (typeof body.appreciatorEngagement === 'string') { update.appreciatorEngagement = body.appreciatorEngagement.trim(); update['steps.postLevel2Q'] = true; }
    if (typeof body.attendance === 'string')     { update.attendance = body.attendance.trim(); update['steps.postLevel2Q'] = true; }

    // Existing consent boolean mapping
    if (typeof body.consent === 'boolean') {
      update['consent.agreed']    = body.consent;
      update['consent.timestamp'] = body.consent ? new Date() : null;
      update['steps.consent']     = true;
      if (body.consent) update['steps.waitlist'] = true;
    }

    // NEW: explicit step for the commitment checkbox (in addition to consent)
    if (typeof body.commitmentAgreed === 'boolean') {
      update['steps.commitmentAgreed'] = body.commitmentAgreed;
      // If you also want to mirror into consent, uncomment below:
      // update['consent.agreed']    = body.commitmentAgreed;
      // update['consent.timestamp'] = body.commitmentAgreed ? new Date() : null;
      // update['steps.consent']     = true;
      // if (body.commitmentAgreed) update['steps.waitlist'] = true;
    }

    // NEW: final confirmation before payment
    if (typeof body.subscriptionConfirmed === 'boolean') {
      update['steps.subscriptionConfirmed'] = body.subscriptionConfirmed;
    }

    if (typeof body.phone === 'string') {
      const normalized = normalizePhone(body.phone);
      update['phone.number']   = normalized;
      update['steps.phone']    = !!normalized;
    }

    let p;
    try {
      p = await Player.findOneAndUpdate(
        { sessionId },
        { $set: update, $setOnInsert: { sessionId, createdAt: new Date() } },
        { new: true, upsert: true }
      ).exec();
    } catch (e) {
      if (e && e.code === 11000 && e.keyPattern && e.keyPattern['phone.number']) {
        return res.status(409).json({ error: 'PHONE_EXISTS', message: 'Phone number already exists' });
      }
      throw e;
    }

    res.json({ ok: true, player: p });
  } catch (err) {
    console.error('PATCH /api/player/:sessionId error:', err);
    res.status(500).json({ error: 'Failed to save player data' });
  }
});


/* ------------------ COMMUNITY HELPERS ------------------ */
app.get('/api/community/count', async (req, res) => {
  try {
    const total = await Player.countDocuments({ 'phone.verified': true }).exec();
    res.json({ total });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/community/me/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    const p = await Player.findById(id).select('joinOrder phone.verified').lean().exec();
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json({ joinOrder: p.joinOrder || 0, verified: !!(p.phone && p.phone.verified) });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

/* ------------------ NEW: FIND PLAYER BY PHONE ------------------ */
/**
 * GET /api/player/by-phone?phone=+E164
 * Returns: {_id, name, joinOrder, phone:{number}, membership}
 */
app.get('/api/player/by-phone', async (req, res) => {
  try {
    const phoneRaw = req.query.phone;
    if (!phoneRaw) return res.status(400).json({ error: 'phone is required' });
    const phone = normalizePhone(phoneRaw);
    const p = await Player.findOne({ 'phone.number': phone }).lean().exec();
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json({
      _id: p._id.toString(),
      name: p.name || '',
      joinOrder: p.joinOrder || 0,
      phone: { number: p.phone?.number || '' },
      membership: p.membership || { status: 'none' }
    });
  } catch (err) {
    console.error('GET /api/player/by-phone error:', err);
    res.status(500).json({ error: 'Failed to lookup phone' });
  }
});

/* ------------------ NEW: PAYMENTS (RAZORPAY) ------------------ */

const RZP_KEY_ID = process.env.RZP_KEY_ID || '';
const RZP_KEY_SECRET = process.env.RZP_KEY_SECRET || '';

function requireRzp(res) {
  if (!RZP_KEY_ID || !RZP_KEY_SECRET) {
    res.status(500).json({ error: 'Razorpay keys not configured on server' });
    return false;
  }
  return true;
}

/**
 * POST /api/pay/order
 * body: { phone: '+91xxxxxxxxxx' }
 * Creates Razorpay order with amount:
 *   joinOrder <= 50 => ₹49 (4900),
 *   else => ₹99 (9900)
 * Returns: { keyId, orderId, amount, currency, name, contact, joinOrder }
 */
app.post('/api/pay/order', async (req, res) => {
  try {
    if (!requireRzp(res)) return;
    let { phone } = req.body || {};
    phone = normalizePhone(phone);
    if (!phone) return res.status(400).json({ error: 'Invalid phone' });

    const p = await Player.findOne({ 'phone.number': phone }).exec();
    if (!p) return res.status(404).json({ error: 'Account not found' });

    const rupees = (typeof p.joinOrder === 'number' && p.joinOrder <= 50) ? 49 : 99;
    const amount = rupees * 100; // paise
    const currency = 'INR';

    // Create order via Razorpay Orders API
    const auth = 'Basic ' + Buffer.from(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`).toString('base64');
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        currency,
        receipt: `ds_${p._id}_${Date.now()}`,
        payment_capture: 1 // auto-capture
      })
    });

    if (!r.ok) {
      const e = await r.text().catch(()=> '');
      console.error('Razorpay order create failed:', e);
      return res.status(502).json({ error: 'Failed to create payment order' });
    }

    const order = await r.json();
    // contact should be digits only
    const contactDigits = onlyDigits(p.phone?.number || '');

    res.json({
      keyId: RZP_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      name: p.name || 'Dream Stage Member',
      contact: contactDigits || '',
      joinOrder: p.joinOrder || 0
    });
  } catch (err) {
    console.error('POST /api/pay/order error:', err);
    res.status(500).json({ error: 'Could not create order' });
  }
});

/**
 * POST /api/pay/verify
 * body: { phone, razorpay_payment_id, razorpay_order_id, razorpay_signature }
 * Verifies signature and activates 1-year membership.
 */
app.post('/api/pay/verify', async (req, res) => {
  try {
    if (!requireRzp(res)) return;
    let { phone, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body || {};
    phone = normalizePhone(phone);
    if (!phone) return res.status(400).json({ error: 'Invalid phone' });
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay fields' });
    }

    const p = await Player.findOne({ 'phone.number': phone }).exec();
    if (!p) return res.status(404).json({ error: 'Account not found' });

    const hmac = crypto
      .createHmac('sha256', RZP_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (hmac !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Determine charged amount from joinOrder rule so we store it
    const rupees = (typeof p.joinOrder === 'number' && p.joinOrder <= 50) ? 49 : 99;
    const amountPaise = rupees * 100;

    const now = new Date();
    const validTill = new Date(now.getTime() + 365*24*60*60*1000); // +1 year

    p.membership.status = 'active';
    p.membership.startedAt = now;
    p.membership.validTill = validTill;
    p.membership.lastOrderId = razorpay_order_id;
    p.membership.lastPaymentId = razorpay_payment_id;
    p.membership.amount = amountPaise;

    await p.save();

    res.json({ ok: true, validTill, amount: amountPaise });
  } catch (err) {
    console.error('POST /api/pay/verify error:', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

/* ------------------ SPA FALLBACK ------------------ */
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ------------------ GRACEFUL SHUTDOWN ------------------ */
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});

/* ------------------ START ------------------ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Listening on http://localhost:${PORT}`);
});
