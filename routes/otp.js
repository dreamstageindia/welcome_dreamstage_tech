// routes/otp.js (CommonJS)
const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

const Player  = require('../models/Player');
const Counter = require('../models/Counter');
const twilio  = require('twilio');

const hashOTP = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');
const generateOTP = () => Math.floor(100000 + Math.random() * 900000); // 6-digit
const normalizePhone = (s) => {
  if (!s) return '';
  const raw = String(s).trim();
  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D+/g,'');
  return '+' + raw.replace(/\D+/g,'');
};

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    const msg = 'SMS provider not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)';
    const err = new Error(msg);
    err.code = 'TWILIO_CONFIG_MISSING';
    throw err;
  }
  const client = twilio(accountSid, authToken);
  return { client, fromNumber };
}

// POST /api/otp/send
router.post('/send', async (req, res) => {
  try {
    let { playerId, sessionId, phone } = req.body;

    phone = normalizePhone(phone);
    if (!phone || phone.length < 8) return res.status(400).json({ error: 'Invalid phone' });

    let doc = null;

    if (playerId) {
      const mongoose = require('mongoose');
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
        doc = await Player.create({ sessionId });
      }
    } else {
      return res.status(400).json({ error: 'playerId or sessionId is required' });
    }

    // Unique phone guard
    const existing = await Player.findOne({ 'phone.number': phone }).select('_id').lean().exec();
    if (existing && String(existing._id) !== String(doc._id)) {
      return res.status(409).json({ error: 'PHONE_EXISTS', message: 'Phone number already exists' });
    }

    // Generate + hash OTP
    const code = generateOTP();
    const codeHash = hashOTP(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Persist OTP + phone state
    doc.phone.number = phone;
    doc.phone.verified = false;
    doc.phone.verifiedAt = null;
    doc.steps.phone = true;
    doc.otp.codeHash = codeHash;
    doc.otp.expiresAt = expiresAt;

    try {
      await doc.save();
    } catch (e) {
      if (e && e.code === 11000) {
        return res.status(409).json({ error: 'PHONE_EXISTS', message: 'Phone number already exists' });
      }
      throw e;
    }

    // Always send SMS via Twilio (no dev fallback / no OTP in response)
    try {
      const { client, fromNumber } = getTwilioClient();
      await client.messages.create({
        from: fromNumber,    // must be a Twilio-verified E.164 number
        to: phone,           // E.164
        body: `Your Dream Stage verification code is: ${code}. It will expire in 5 minutes.`,
      });
    } catch (twilioErr) {
      if (twilioErr?.code === 'TWILIO_CONFIG_MISSING') {
        return res.status(500).json({ error: 'SMS provider not configured' });
      }
      console.error('Twilio send error:', twilioErr);
      return res.status(502).json({ error: 'Failed to send SMS OTP' });
    }

    // Success: never return / log the OTP
    return res.json({ ok: true, expiresAt });
  } catch (err) {
    console.error('POST /otp/send error:', err);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// POST /api/otp/verify
router.post('/verify', async (req, res) => {
  try {
    let { playerId, sessionId, code, otp } = req.body;
    const cand = String(code || otp || '').trim();
    if (!/^\d{4,8}$/.test(cand)) return res.status(400).json({ error: 'Invalid OTP' });

    let doc = null;
    const mongoose = require('mongoose');

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

    if (!doc.joinOrder || doc.joinOrder <= 0) {
      doc.joinOrder = await Counter.nextSequence('joinOrder');
    }

    await doc.save();

    res.json({ ok: true, verified: true, playerId: doc._id.toString(), joinOrder: doc.joinOrder });
  } catch (err) {
    console.error('POST /otp/verify error:', err);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

module.exports = router;
