// backend/routes/invites.js
'use strict';

const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');

const Invite = require('../models/InviteCode'); // fields: code (string, unique), used (bool), claimedBy, claimedAt, createdBy, createdAt
const Player = require('../models/Player');

// ---- Helpers ----

// If you NEVER generate 'O', it's safe to map O->0 to avoid look-alikes.
// (Front-end already normalizes this way.)
function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/O/g, '0');
}

// Ambiguity-safe alphabet (no 0/O/I/1) for new code generation
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(len = 4) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

async function ensurePlayer(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
  return Player.findById(id).select('_id').lean().exec();
}

/**
 * POST /api/invites/check
 * Body: { code: string }
 * Returns:
 *  200 { ok: true }                      -> exists & unused
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
    if (!invite)    return res.status(404).json({ ok: false, error: 'INVITE_NOT_FOUND' });
    if (invite.used) return res.status(409).json({ ok: false, error: 'INVITE_USED' });

    return res.json({ ok: true });
  } catch (err) {
    console.error('Invite check error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}

/**
 * POST /api/invites/claim   (alias: /api/invites/verify)
 * Body: { code: string, playerId?: string }
 * Query/body: dryRun=1|true  -> validate only, do NOT consume
 *
 * 200 { ok:true, dryRun?:true }
 * 404 { ok:false, error:'INVITE_NOT_FOUND' }
 * 409 { ok:false, error:'INVITE_USED' }
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

    // Dry run → only validate
    if (dryRun) {
      const invite = await Invite.findOne({ code: norm }).lean().exec();
      if (!invite)    return res.status(404).json({ ok: false, error: 'INVITE_NOT_FOUND' });
      if (invite.used) return res.status(409).json({ ok: false, error: 'INVITE_USED' });
      return res.json({ ok: true, dryRun: true });
    }

    // Resolve claimedBy if playerId valid
    let claimedBy = null;
    if (playerId) {
      const p = await ensurePlayer(playerId);
      if (p) claimedBy = p._id;
    }

    // Atomically mark as used only if still unused
    const updated = await Invite.findOneAndUpdate(
      { code: norm, used: false },
      { $set: { used: true, claimedBy, claimedAt: new Date() } },
      { new: true }
    ).exec();

    if (!updated) {
      // Determine reason
      const existed = await Invite.findOne({ code: norm }).lean().exec();
      if (!existed)   return res.status(404).json({ ok: false, error: 'INVITE_NOT_FOUND' });
      return res.status(409).json({ ok: false, error: 'INVITE_USED' });
    }

    // Optional: mark journey flag on player
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

/**
 * POST /api/invites/generate
 * Body: { count: 1|2|3, createdBy: string }
 *
 * Generates 1–3 new invite codes (length=4) marked with createdBy.
 * Skips ambiguous characters, guarantees uniqueness (best-effort; assumes unique index on code).
 *
 * Returns: 200 { ok:true, codes:[ { code, used:false } ] }
 */
async function generateHandler(req, res) {
  try {
    let { count, createdBy } = req.body || {};
    count = Number(count);

    if (!Number.isFinite(count) || count < 1 || count > 3) {
      return res.status(400).json({ ok: false, error: 'INVALID_COUNT' });
    }

    const owner = await ensurePlayer(createdBy);
    if (!owner) {
      return res.status(400).json({ ok: false, error: 'INVALID_CREATED_BY' });
    }

    const results = [];
    // Try to create 'count' codes; retry on rare collisions
    for (let i = 0; i < count; i++) {
      let attempts = 0;
      let doc = null;

      while (attempts < 20 && !doc) {
        attempts++;
        const raw = randomCode(4);         // e.g., A3F9
        const code = normalizeCode(raw);   // currently identical (no 'O' generated)
        // ensure not existing
        const exists = await Invite.exists({ code });
        if (exists) continue;

        try {
          doc = await Invite.create({
            code,
            used: false,
            createdBy: owner._id,
            createdAt: new Date()
          });
        } catch (e) {
          // Unique index collision—retry
          doc = null;
        }
      }

      if (!doc) {
        return res.status(500).json({ ok: false, error: 'GENERATION_FAILED' });
      }
      results.push({ code: doc.code, used: doc.used });
    }

    return res.json({ ok: true, codes: results });
  } catch (err) {
    console.error('Invite generate error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}

/**
 * GET /api/invites/available?createdBy=<playerId>
 * Returns unused invites created by given player (for UI/showing referrals)
 * 200 { ok:true, codes:[{ code }] }
 */
async function listAvailableByCreator(req, res) {
  try {
    const { createdBy } = req.query || {};
    const owner = await ensurePlayer(createdBy);
    if (!owner) {
      return res.status(400).json({ ok: false, error: 'INVALID_CREATED_BY' });
    }
    const docs = await Invite.find({ createdBy: owner._id, used: false })
                             .select('code -_id')
                             .lean()
                             .exec();
    return res.json({ ok: true, codes: docs });
  } catch (err) {
    console.error('Invite list available error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}

// ---- Routes ----
router.post('/check',      checkHandler);
router.post('/claim',      claimHandler);
router.post('/verify',     claimHandler);    // alias
router.post('/generate',   generateHandler); // for referrals after spin wheel
router.get('/available',   listAvailableByCreator);

// Export router + handlers (legacy alias usage supported by caller)
module.exports = {
  router,
  checkHandler,
  claimHandler,
  generateHandler,
};
