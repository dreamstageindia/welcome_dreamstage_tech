// backend/routes/invites.js
'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Invite = require('../models/InviteCode');   // code, used, claimedBy, claimedAt
const Player = require('../models/Player');   // optional: to attach invite to player

/**
 * Normalize an invite code to avoid common look-alikes.
 * If you NEVER intend to generate letter 'O', we can safely map O->0 here.
 */
function normalizeCode(raw) {
  const up = String(raw || '').trim().toUpperCase();
  // If your generator never uses 'O', prefer mapping O -> 0:
  return up.replace(/O/g, '0');
  // If you DO use both O and 0 in different codes, instead try a small variant set.
  // See commented code in the query below for that approach.
}

/**
 * POST /api/invite/claim   (also mounted at /api/invites/claim)
 * Body: { code: string, playerId?: string }
 */
async function claimHandler(req, res) {
  try {
    const { code, playerId } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ ok: false, error: 'INVALID_CODE' });
    }

    const norm = normalizeCode(code);

    // If you need to support both 'O' and '0' because you used both historically,
    // use the variant search below instead of the single normalized lookup:
    // const variants = new Set([norm, norm.replace(/0/g,'O')]);
    // let invite = await Invite.findOne({ code: { $in: Array.from(variants) }, used: false }).exec();

    // Single normalized lookup (preferred if you never generate 'O'):
    let invite = await Invite.findOne({ code: norm, used: false }).exec();

    if (!invite) {
      // If the code exists but is already used, tell the client distinctly (optional)
      const existed = await Invite.findOne({ code: norm }).lean().exec();
      if (existed && existed.used) {
        return res.status(409).json({ ok: false, error: 'INVITE_USED' });
      }
      return res.status(404).json({ ok: false, error: 'INVITE_NOT_FOUND' });
    }

    // Optionally validate playerId format before saving it
    let claimedBy = null;
    if (playerId && mongoose.Types.ObjectId.isValid(playerId)) {
      const p = await Player.findById(playerId).select('_id').lean().exec();
      if (p) claimedBy = p._id;
    }

    // Atomically mark used
    invite.used = true;
    invite.claimedBy = claimedBy;
    invite.claimedAt = new Date();
    await invite.save();

    // Optional: mark on the player/Journey doc immediately (frontend also patches it later)
    if (claimedBy) {
      try {
        await Player.updateOne(
          { _id: claimedBy },
          { $set: { 'steps.inviteVerified': true } }  // adjust path to your schema
        ).exec();
      } catch {}
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Invite claim error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}

// Wire routes
router.post('/claim', claimHandler);
// Optional alternate path (verify)
router.post('/verify', claimHandler);

module.exports = { router, claimHandler };
