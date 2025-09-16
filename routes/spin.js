// routes/spin.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const InviteCode = require('../models/InviteCode');
const SpinAttempt = require('../models/SpinAttempt');

// ===== Helpers =====
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789'; // no I/O/0
function randomCode(len = 4) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
async function generateUniqueCode(len = 4, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const code = randomCode(len);
    const exists = await InviteCode.exists({ code });
    if (!exists) return code;
  }
  throw new Error('Could not generate unique code');
}

// ===== API =====

/** GET /api/spin/status?playerId=...  */
router.get('/spin/status', async (req, res) => {
  try {
    const { playerId } = req.query;
    if (!playerId || !mongoose.isValidObjectId(playerId)) {
      return res.status(400).json({ error: 'playerId required' });
    }
    const a = await SpinAttempt.findOne({ playerId }).lean();
    if (!a) return res.json({ spun: false });
    return res.json({
      spun: true,
      result: a.result,
      limit: a.limit,
      inviteCode: a.inviteCode || null
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

/**
 * POST /api/spin/claim
 * Body: { playerId, prize: 'referrals'|'refund'|'none', limit: 0|1|2|3 }
 * - Enforces single spin per user via unique index.
 * - If referrals, creates ONE InviteCode with maxUses=limit and returns it.
 */
router.post('/spin/claim', async (req, res) => {
  try {
    const { playerId, prize, limit } = req.body || {};
    if (!playerId || !mongoose.isValidObjectId(playerId)) {
      return res.status(400).json({ error: 'playerId required' });
    }

    // already spun?
    const existing = await SpinAttempt.findOne({ playerId }).lean();
    if (existing) {
      return res.status(409).json({
        error: 'ALREADY_SPUN',
        result: existing.result,
        limit: existing.limit,
        code: existing.inviteCode || null
      });
    }

    // normalize prize
    let result = 'none';
    let lim = Number(limit) || 0;
    if (String(prize) === 'refund') result = 'refund';
    if (String(prize) === 'referrals') {
      result = 'referrals';
      lim = [1,2,3].includes(lim) ? lim : 1;
    }

    let code = null;
    if (result === 'referrals') {
      const c = await generateUniqueCode(4);
      await InviteCode.create({
        code: c,
        maxUses: lim,
        uses: 0,
        used: false,
        active: true,
        source: 'spin',
        createdBy: playerId
      });
      code = c;
    }

    await SpinAttempt.create({ playerId, result, limit: lim, inviteCode: code || undefined });

    res.json({ ok: true, result, limit: lim, code });
  } catch (e) {
    // unique index trip = already spun
    if (e?.code === 11000) {
      const dup = await SpinAttempt.findOne({ playerId: req.body.playerId }).lean();
      return res.status(409).json({
        error: 'ALREADY_SPUN',
        result: dup?.result || 'none',
        limit: dup?.limit || 0,
        code: dup?.inviteCode || null
      });
    }
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

/**
 * POST /api/invites/referrals
 * Body: { playerId, count }
 * For compatibility with your existing frontend call.
 * Returns { ok, codes:[<oneCode>], limit }
 */
router.post('/invites/referrals', async (req, res) => {
  try {
    const { playerId, count } = req.body || {};
    if (!playerId || !mongoose.isValidObjectId(playerId)) {
      return res.status(400).json({ error: 'playerId required' });
    }
    const lim = [1,2,3].includes(Number(count)) ? Number(count) : 1;

    // Already spun?
    const prev = await SpinAttempt.findOne({ playerId }).lean();
    if (prev) {
      if (prev.result === 'referrals' && prev.inviteCode) {
        return res.json({ ok: true, codes: [prev.inviteCode], limit: prev.limit });
      }
      return res.status(409).json({ error: 'ALREADY_SPUN', result: prev.result, limit: prev.limit, codes: [] });
    }

    const code = await generateUniqueCode(4);
    await InviteCode.create({
      code, maxUses: lim, uses: 0, used: false, active: true, source: 'spin', createdBy: playerId
    });
    await SpinAttempt.create({ playerId, result: 'referrals', limit: lim, inviteCode: code });

    res.json({ ok: true, codes: [code], limit: lim });
  } catch (e) {
    if (e?.code === 11000) {
      const prev = await SpinAttempt.findOne({ playerId: req.body.playerId }).lean();
      if (prev) {
        return res.status(409).json({
          error: 'ALREADY_SPUN',
          result: prev.result, limit: prev.limit,
          codes: prev.inviteCode ? [prev.inviteCode] : []
        });
      }
    }
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

/**
 * POST /api/invites/claim
 * Body: { code, playerId? }
 * Increments uses atomically up to maxUses; sets legacy fields when exhausted.
 */
router.post('/invites/claim', async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const playerId = req.body?.playerId && mongoose.isValidObjectId(req.body.playerId)
      ? req.body.playerId : null;

    if (!code) return res.status(400).json({ error: 'Code required' });

    const invite = await InviteCode.findOne({ code }).lean();
    if (!invite || invite.active === false) return res.status(404).json({ error: 'INVALID_CODE' });
    if ((invite.uses || 0) >= (invite.maxUses || 1)) return res.status(410).json({ error: 'CODE_EXHAUSTED' });

    const updated = await InviteCode.findOneAndUpdate(
      { code, uses: { $lt: invite.maxUses || 1 }, active: true },
      {
        $inc: { uses: 1 },
        ...(playerId ? { claimedBy: playerId, claimedAt: new Date() } : {})
      },
      { new: true }
    );

    if (!updated) return res.status(409).json({ error: 'CODE_ALREADY_TAKEN' });

    // if exhausted now, mirror legacy flags
    if (updated.uses >= (updated.maxUses || 1)) {
      updated.used = true;
      updated.usedAt = new Date();
      await updated.save();
    }

    res.json({ ok: true, remaining: Math.max(0, (updated.maxUses || 1) - (updated.uses || 0)) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

module.exports = router;
