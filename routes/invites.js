// backend/routes/invites.js
'use strict';

const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');

const Invite = require('../models/InviteCode'); // updated schema with maxUses/uses
const Player = require('../models/Player');

// ---- Helpers ----
function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/O/g, '0');
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/I/1
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
 *  200 { ok: true, remaining, maxUses, uses, active }
 *  404 { ok: false, error: 'INVITE_NOT_FOUND' }
 *  409 { ok: false, error: 'INVITE_EXHAUSTED' }
 */
async function checkHandler(req, res) {
  try {
    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ ok: false, error: 'INVALID_CODE' });
    }
    const norm = normalizeCode(code);

    const inv = await Invite.findOne({ code: norm }).lean().exec();
    if (!inv) return res.status(404).json({ ok: false, error: 'INVITE_NOT_FOUND' });

    const maxUses = Math.max(1, inv.maxUses || 1);
    const uses = Math.max(0, inv.uses || 0);
    const remaining = Math.max(0, maxUses - uses);
    const exhausted = remaining <= 0 || inv.active === false;

    if (exhausted) {
      return res.status(409).json({ ok: false, error: 'INVITE_EXHAUSTED' });
    }

    return res.json({ ok: true, remaining, maxUses, uses, active: inv.active !== false });
  } catch (err) {
    console.error('Invite check error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}

/**
 * POST /api/invites/claim (alias: /api/invites/verify)
 * Body: { code: string, playerId?: string }
 * Query/body: dryRun=1|true -> validate only
 * Returns:
 *  200 { ok: true, remaining, maxUses, uses }
 *  404 { ok: false, error: 'INVITE_NOT_FOUND' }
 *  409 { ok: false, error: 'INVITE_EXHAUSTED' }
 */
async function claimHandler(req, res) {
  try {
    const { code, playerId } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ ok: false, error: 'INVALID_CODE' });
    }
    const norm = normalizeCode(code);

    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true' || req.body?.dryRun === true;

    const inv = await Invite.findOne({ code: norm }).lean().exec();
    if (!inv) return res.status(404).json({ ok: false, error: 'INVITE_NOT_FOUND' });

    const maxUses = Math.max(1, inv.maxUses || 1);
    const uses = Math.max(0, inv.uses || 0);
    const remaining = Math.max(0, maxUses - uses);

    if (inv.active === false || remaining <= 0) {
      return res.status(409).json({ ok: false, error: 'INVITE_EXHAUSTED' });
    }

    if (dryRun) {
      return res.json({ ok: true, dryRun: true, remaining, maxUses, uses });
    }

    let claimedBy = null;
    if (playerId) {
      const p = await ensurePlayer(playerId);
      if (p) claimedBy = p._id;
    }

    const updated = await Invite.findOneAndUpdate(
      { code: norm, active: { $ne: false }, $expr: { $lt: ['$uses', '$maxUses'] } },
      { $inc: { uses: 1 }, $set: { claimedBy, claimedAt: new Date() } },
      { new: true }
    ).exec();

    if (!updated) {
      return res.status(409).json({ ok: false, error: 'INVITE_EXHAUSTED' });
    }

    if (!updated.used && updated.uses >= updated.maxUses) {
      await Invite.updateOne(
        { _id: updated._id, used: false },
        { $set: { used: true, usedAt: new Date() } }
      ).exec();
    }

    if (claimedBy) {
      try {
        await Player.updateOne(
          { _id: claimedBy },
          { $set: { 'steps.inviteVerified': true } }
        ).exec();
      } catch {}
    }

    const rem = Math.max(0, (updated.maxUses || 1) - (updated.uses || 0));
    return res.json({ ok: true, remaining: rem, maxUses: updated.maxUses || 1, uses: updated.uses || 0 });
  } catch (err) {
    console.error('Invite claim error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}

/**
 * POST /api/invites/referrals
 * Body: { playerId: string, limit: 1|2|3 }
 * Creates ONE code with maxUses=limit and source='spin'.
 * Returns: 200 { ok: true, code, maxUses, uses: 0 }
 */
async function referralsHandler(req, res) {
  try {
    const { playerId, limit } = req.body || {};
    const owner = await ensurePlayer(playerId);
    const maxUses = Number(limit);

    if (!owner) return res.status(400).json({ ok: false, error: 'INVALID_PLAYER' });
    if (![1, 2, 3].includes(maxUses)) return res.status(400).json({ ok: false, error: 'INVALID_LIMIT' });

    let doc = null;
    for (let attempts = 0; !doc && attempts < 25; attempts++) {
      const code = normalizeCode(randomCode(4));
      try {
        doc = await Invite.create({
          code,
          maxUses,
          uses: 0,
          used: false,
          active: true,
          createdBy: owner._id,
          source: 'spin'
        });
      } catch { /* collision -> retry */ }
    }
    if (!doc) return res.status(500).json({ ok: false, error: 'GENERATION_FAILED' });

    return res.json({ ok: true, code: doc.code, maxUses: doc.maxUses, uses: doc.uses });
  } catch (err) {
    console.error('Invite referrals error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}

/**
 * POST /api/invites/generate
 * Body:
 *   - EITHER { createdBy, count: 1..10 } -> that many single-use codes
 *   - OR { createdBy, maxUses: n } -> one code with n uses
 * Returns: 200 { ok: true, codes: [{ code, maxUses, uses }] }
 */
async function generateHandler(req, res) {
  try {
    const { createdBy } = req.body || {};
    const owner = await ensurePlayer(createdBy);
    if (!owner) return res.status(400).json({ ok: false, error: 'INVALID_CREATED_BY' });

    const requestedCount = Number(req.body.count);
    const requestedMax = Number(req.body.maxUses);

    if (Number.isFinite(requestedMax) && requestedMax >= 1 && !Number.isFinite(requestedCount)) {
      let doc = null;
      for (let attempts = 0; !doc && attempts < 25; attempts++) {
        try {
          doc = await Invite.create({
            code: normalizeCode(randomCode(4)),
            maxUses: requestedMax,
            uses: 0,
            used: false,
            active: true,
            createdBy: owner._id,
            source: 'other'
          });
        } catch {}
      }
      if (!doc) return res.status(500).json({ ok: false, error: 'GENERATION_FAILED' });
      return res.json({ ok: true, codes: [{ code: doc.code, maxUses: doc.maxUses, uses: doc.uses }] });
    }

    const count = Number.isFinite(requestedCount) ? Math.min(Math.max(1, requestedCount), 10) : 1;
    const out = [];
    for (let i = 0; i < count; i++) {
      let doc = null;
      for (let attempts = 0; !doc && attempts < 25; attempts++) {
        try {
          doc = await Invite.create({
            code: normalizeCode(randomCode(4)),
            maxUses: 1,
            uses: 0,
            used: false,
            active: true,
            createdBy: owner._id,
            source: 'other'
          });
        } catch {}
      }
      if (!doc) return res.status(500).json({ ok: false, error: 'GENERATION_FAILED' });
      out.push({ code: doc.code, maxUses: doc.maxUses, uses: doc.uses });
    }
    return res.json({ ok: true, codes: out });
  } catch (err) {
    console.error('Invite generate error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}

/**
 * GET /api/invites/available?createdBy=<playerId>
 * Returns: 200 { ok: true, codes: [{ code, remaining, maxUses, uses }] }
 */
async function listAvailableByCreator(req, res) {
  try {
    const { createdBy } = req.query || {};
    const owner = await ensurePlayer(createdBy);
    if (!owner) return res.status(400).json({ ok: false, error: 'INVALID_CREATED_BY' });

    const docs = await Invite.find({
      createdBy: owner._id,
      active: { $ne: false },
      $expr: { $lt: ['$uses', '$maxUses'] }
    }).select('code maxUses uses -_id').lean().exec();

    const codes = docs.map(d => ({
      code: d.code,
      maxUses: d.maxUses || 1,
      uses: d.uses || 0,
      remaining: Math.max(0, (d.maxUses || 1) - (d.uses || 0))
    }));

    return res.json({ ok: true, codes });
  } catch (err) {
    console.error('Invite list available error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}

// ---- Routes ----
router.post('/check', checkHandler);
router.post('/claim', claimHandler);
router.post('/verify', claimHandler);
router.post('/referrals', referralsHandler);
router.post('/generate', generateHandler);
router.get('/available', listAvailableByCreator);

// Export router + handlers
module.exports = {
  router,
  checkHandler,
  claimHandler,
  referralsHandler,
  generateHandler,
  listAvailableByCreator
};