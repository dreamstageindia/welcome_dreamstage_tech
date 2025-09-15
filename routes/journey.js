const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Player = require('../models/Player');

const normalizePhone = (s) => {
  if (!s) return '';
  const raw = String(s).trim();
  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D+/g,'');
  return '+' + raw.replace(/\D+/g,'');
};

// POST /api/journey/init
router.post('/init', async (req, res) => {
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
    console.error('POST /journey/init error:', err);
    res.status(500).json({ error: 'Failed to initialize journey' });
  }
});

// PATCH /api/journey/:id
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const updates = {};
    const steps = {};

    if (typeof req.body.role === 'string') {
      const raw = req.body.role.toLowerCase().trim();
      const accepted = ['artist','helper','manager','business','appreciator','lover'];
      const role = accepted.includes(raw) ? raw : null;
      if (role) { updates.role = role; steps.role = true; }
    }

    if (req.body.roleMessageDone === true) steps.roleMessage = true;

    if (req.body.artistType && typeof req.body.artistType === 'object') {
      updates['artistType.name'] = req.body.artistType.name || '';
      updates['artistType.description'] = req.body.artistType.description || '';
      steps.postLevel2Q = true;
    }

    if (typeof req.body.location === 'string') { updates.location = req.body.location.trim(); steps.location = true; }
    if (Array.isArray(req.body.helperWork)) { updates.helperWork = req.body.helperWork; steps.postLevel2Q = true; }
    if (typeof req.body.helperCapacity === 'string') updates.helperCapacity = req.body.helperCapacity.trim();
    if (typeof req.body.helperStage === 'string') { updates.helperStage = req.body.helperStage.trim(); steps.postLevel2Q = true; }
    if (typeof req.body.managerRoleText === 'string') { updates.managerRoleText = req.body.managerRoleText.trim(); steps.postLevel2Q = true; }
    if (typeof req.body.appreciatorEngagement === 'string') { updates.appreciatorEngagement = req.body.appreciatorEngagement.trim(); steps.postLevel2Q = true; }
    if (typeof req.body.eventFrequency === 'string') { updates.eventFrequency = req.body.eventFrequency.trim(); steps.postLevel2Q = true; }
    if (typeof req.body.attendance === 'string') { updates.attendance = req.body.attendance.trim(); steps.postLevel2Q = true; }

    if (typeof req.body.commitmentAgreed === 'boolean') {
      steps.commitmentAgreed = req.body.commitmentAgreed;
      updates['consent.agreed'] = !!req.body.commitmentAgreed;
      updates['consent.timestamp'] = req.body.commitmentAgreed ? new Date() : null;
      steps.consent = !!req.body.commitmentAgreed;
      if (req.body.commitmentAgreed) steps.waitlist = true;
    }

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
      const n = normalizePhone(req.body.phoneNumber);
      if (n) { updates['phone.number'] = n; steps.phone = true; }
    }

    if (typeof req.body.name === 'string') {
      updates.name = req.body.name.trim();
      steps.name = !!updates.name;
    }

    // invite mirror (if frontend decides to set it)
    if (typeof req.body.inviteVerified === 'boolean') {
      updates.inviteVerified = !!req.body.inviteVerified;
      steps.inviteVerified = !!req.body.inviteVerified;
    }
    if (typeof req.body.inviteCode === 'string') {
      updates.inviteCode = (req.body.inviteCode || '').toUpperCase().trim().slice(0,4);
    }

    const doc = await Player.findById(id).exec();
    if (!doc) return res.status(404).json({ error: 'Not found' });

    Object.keys(updates).forEach(k => doc.set(k, updates[k]));
    Object.keys(steps).forEach(k => { doc.steps[k] = steps[k]; });
    await doc.save();

    res.json({ ok: true, steps: doc.steps });
  } catch (err) {
    console.error('PATCH /journey/:id error:', err);
    res.status(500).json({ error: 'Failed to update journey' });
  }
});

// GET /api/journey/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    const doc = await Player.findById(id).lean().exec();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (doc.otp) delete doc.otp.codeHash;
    res.json(doc);
  } catch (err) {
    console.error('GET /journey/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch journey' });
  }
});

module.exports = router;
