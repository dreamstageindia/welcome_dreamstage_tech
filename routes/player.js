'use strict';

const express   = require('express');
const mongoose  = require('mongoose');
const router    = express.Router();

const Player  = require('../models/Player');
const Counter = require('../models/Counter');

/* ------------- helpers ------------- */
const normalizePhone = (s) => {
  if (!s) return '';
  const raw = String(s).trim();
  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D+/g,'');
  return '+' + raw.replace(/\D+/g,'');
};
const toInt = (n) => Math.max(1, parseInt(n, 10) || 1);
const pad4  = (n) => String(Math.max(0, Math.floor(n))).padStart(4, '0');

/* ============================================================
   ASSIGN CREATOR CODE (manual/idempotent)
   ============================================================ */
router.post('/:playerId/assign-creator-code', async (req, res) => {
  try {
    const { playerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(playerId)) {
      return res.status(400).json({ error: 'INVALID_PLAYER_ID' });
    }

    const player = await Player.findById(playerId).exec();
    if (!player) return res.status(404).json({ error: 'PLAYER_NOT_FOUND' });

    // Return if already assigned
    if (player.creator && Number(player.creator.number) > 0) {
      const codeTxt = player.creator.code || ('#' + pad4(player.creator.number));
      return res.json({
        ok: true,
        alreadyAssigned: true,
        creatorCode: codeTxt,
        creatorCodeNumber: player.creator.number
      });
    }

    // (Optionally enforce membership active)
    // if (player.membership?.status !== 'active') {
    //   return res.status(403).json({ error: 'MEMBERSHIP_REQUIRED' });
    // }

    const next = await Counter.nextSequence('creatorCode');
    const n    = toInt(next);
    player.creator = player.creator || {};
    player.creator.number = n;
    player.creator.code   = '#' + pad4(n);
    player.steps          = player.steps || {};
    player.steps.creatorCodeAssigned = true;

    await player.save();

    res.json({ ok: true, creatorCode: player.creator.code, creatorCodeNumber: n });
  } catch (err) {
    console.error('assign-creator-code error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* ============================================================
   COUNT endpoint for your S5 UI
   ============================================================ */
router.get('/creator-codes/count', async (_req, res) => {
  try {
    const ctr = await Counter.findOne({ key: 'creatorCode' }).lean().exec();
    res.json({ count: ctr?.seq || 0 });
  } catch (err) {
    console.error('GET /players/creator-codes/count error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* ============================================================
   EXISTING ENDPOINTS (unchanged)
   ============================================================ */
router.post('/session', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId required' });
    }
    let p = await Player.findOne({ sessionId }).exec();
    if (!p) p = await Player.create({ sessionId });
    res.json({ ok: true, sessionId: p.sessionId, playerId: p._id.toString(), joinOrder: p.joinOrder || 0 });
  } catch (err) {
    console.error('POST /player/session error:', err);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

router.get('/by-phone', async (req, res) => {
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
    console.error('GET /player/by-phone error:', err);
    res.status(500).json({ error: 'Failed to lookup phone' });
  }
});

router.patch('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const body = { ...req.body };

    if (body.artistKind && !body.artistType) {
      body.artistType = { name: body.artistKind, description: '' };
      delete body.artistKind;
    }
    if (body.city && !body.location) { body.location = body.city; delete body.city; }
    if (body.businessKind && !body.managerRoleText) { body.managerRoleText = body.businessKind; delete body.businessKind; }
    if (body.loverPreference && !body.appreciatorEngagement) { body.appreciatorEngagement = body.loverPreference; delete body.loverPreference; }

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

    if (typeof body.consent === 'boolean') {
      update['consent.agreed']    = body.consent;
      update['consent.timestamp'] = body.consent ? new Date() : null;
      update['steps.consent']     = true;
      if (body.consent) update['steps.waitlist'] = true;
    }

    if (typeof body.commitmentAgreed === 'boolean') {
      update['steps.commitmentAgreed'] = body.commitmentAgreed;
    }

    if (typeof body.subscriptionConfirmed === 'boolean') {
      update['steps.subscriptionConfirmed'] = body.subscriptionConfirmed;
    }

    if (typeof body.phone === 'string') {
      const normalized = normalizePhone(body.phone);
      if (normalized) { update['phone.number'] = normalized; update['steps.phone'] = true; }
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
    console.error('PATCH /player/:sessionId error:', err);
    res.status(500).json({ error: 'Failed to save player data' });
  }
});

module.exports = router;
