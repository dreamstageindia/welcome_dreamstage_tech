const express = require('express');
const router = express.Router();
const Player = require('../models/Player');

const normalizePhone = (s) => {
  if (!s) return '';
  const raw = String(s).trim();
  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D+/g,'');
  return '+' + raw.replace(/\D+/g,'');
};

// POST /api/player/session
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

// PATCH /api/player/:sessionId
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

// GET /api/player/by-phone?phone=+E164
router.get('/by-phone', async (req, res) => {
  try {
    const phoneRaw = req.query.phone;
    if (!phoneRaw) return res.status(400).json({ error: 'phone is required' });
    const phone = normalizePhone(phoneRaw);
    const p = await require('../models/Player')
      .findOne({ 'phone.number': phone }).lean().exec();
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

module.exports = router;
