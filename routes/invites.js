'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Invite = require('../models/InviteCode');
const Player = require('../models/Player');

// Normalize: map O -> 0 to avoid look-alikes (only if you never generate 'O')
function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/O/g, '0');
}

/**
 * POST /api/invites/check
 * Body: { code: string }
 * Returns:
 *  200 { ok: true }                 -> exists & unused
 *  409 { ok: false, error:'INVITE_USED' }
 *  404 { ok: false, error:'INVITE_NOT_FOUND' }
 */
async function checkHandler(req, res) {
  try {
    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ ok: false, error: 'INVALID_CODE' });
    }
    const norm = normalizeCode(code);

    const invite = await Invite.findOne({ code: norm }).lean().exec();
    if (!invite) return res.status(404).json({ ok: false, error: 'INVITE_NOT_FOUND' });
    if (invite.used) return res.status(409).json({ ok: false, error: 'INVITE_USED' });

    return res.json({ ok: true });
  } catch (err) {
    console.error('Invite check error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}

/**
 * POST /api/invites/claim?dryRun=1
 * Body: { code: string, playerId?: string }
 * - dryRun: if true, DO NOT consume; just validate like /check but returns { ok:true, dryRun:true }
 * - otherwise atomically marks the code used and optionally attaches claimedBy.
 */
async function claimHandler(req, res) {
  try {
    const { code, playerId } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ ok: false, error: 'INVALID_CODE' });
    }
    const norm = normalizeCode(code);

    const dryRun =
      req.query.dryRun === '1' ||
      req.query.dryRun === 'true' ||
      req.body?.dryRun === true;

    // For dry-run, just validate existence & unused (no mutation)
    if (dryRun) {
      const invite = await Invite.findOne({ code: norm }).lean().exec();
      if (!invite) return res.status(404).json({ ok: false, error: 'INVITE_NOT_FOUND' });
      if (invite.used) return res.status(409).json({ ok: false, error: 'INVITE_USED' });
      return res.json({ ok: true, dryRun: true });
    }

    // Resolve claimedBy if playerId is valid
    let claimedBy = null;
    if (playerId && mongoose.Types.ObjectId.isValid(playerId)) {
      const p = await Player.findById(playerId).select('_id').lean().exec();
      if (p) claimedBy = p._id;
    }

    // Atomically consume only if still unused
    const updated = await Invite.findOneAndUpdate(
      { code: norm, used: false },
      { $set: { used: true, claimedBy, claimedAt: new Date() } },
      { new: true }
    ).exec();

    if (!updated) {
      // Determine why it failed (used vs not found)
      const existed = await Invite.findOne({ code: norm }).lean().exec();
      if (!existed) return res.status(404).json({ ok: false, error: 'INVITE_NOT_FOUND' });
      return res.status(409).json({ ok: false, error: 'INVITE_USED' });
    }

    // Optional: mark journey flag
    if (claimedBy) {
      try {
        await Player.updateOne(
          { _id: claimedBy },
          { $set: { 'steps.inviteVerified': true } }
        ).exec();
      } catch {}
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Invite claim error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}

// Routes
router.post('/check',  checkHandler);
router.post('/claim',  claimHandler);
// Optional alias some clients might call:
router.post('/verify', claimHandler);

module.exports = { router, checkHandler, claimHandler };
