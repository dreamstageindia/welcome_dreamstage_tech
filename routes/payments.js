'use strict';

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

const Player       = require('../models/Player');
const Counter      = require('../models/Counter');
const PaymentOrder = require('../models/PaymentOrder');

const RZP_KEY_ID     = process.env.RZP_KEY_ID || '';
const RZP_KEY_SECRET = process.env.RZP_KEY_SECRET || '';

const onlyDigits = (s) => String(s || '').replace(/\D+/g, '');
const normalizePhone = (s) => {
  if (!s) return '';
  const raw = String(s).trim();
  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D+/g, '');
  return '+' + raw.replace(/\D+/g, '');
};
const pad4 = (n) => String(Math.max(0, Math.floor(n))).padStart(4, '0');

function requireRzp(res) {
  if (!RZP_KEY_ID || !RZP_KEY_SECRET) {
    res.status(500).json({ error: 'Razorpay keys not configured on server' });
    return false;
  }
  return true;
}

// Assign creator code once (idempotent-ish with a guarded update)
async function ensureCreatorCode(playerId) {
  if (!playerId) return { number: 0, code: '' };

  const current = await Player.findById(playerId).select('creator').lean().exec();
  if (current?.creator?.number > 0) {
    const n = current.creator.number;
    return { number: n, code: current.creator.code || ('#' + pad4(n)) };
  }

  const next = await Counter.nextSequence('creator');   // 1, 2, 3, ...
  const code = '#' + pad4(next);

  await Player.updateOne(
    {
      _id: playerId,
      $or: [{ 'creator.number': { $exists: false } }, { 'creator.number': 0 }]
    },
    {
      $set: {
        'creator.number': next,
        'creator.code': code,
        'steps.creatorCodeAssigned': true
      }
    }
  ).exec();

  return { number: next, code };
}

// Price helper — mirror your frontend tiers if needed
function computeRupees(joinOrder) {
  if (typeof joinOrder === 'number' && joinOrder > 0) {
    if (joinOrder <= 100) return 49;
    if (joinOrder <= 3000) return 99;
  }
  return 199;
}

/* -------------------------------- CREATE ORDER -------------------------------- */
router.post('/order', async (req, res) => {
  try {
    if (!requireRzp(res)) return;

    let { phone } = req.body || {};
    phone = normalizePhone(phone);
    if (!phone) return res.status(400).json({ error: 'Invalid phone' });

    const player = await Player.findOne({ 'phone.number': phone }).exec();
    if (!player) return res.status(404).json({ error: 'Account not found' });

    const rupees   = computeRupees(player.joinOrder);
    const amount   = rupees * 100;               // paise
    const currency = 'INR';

    // Razorpay requires <= 40 chars for receipt
    const shortId = player._id.toString().slice(-6);
    const shortTs = Date.now().toString(36);
    const receipt = (`ds_${shortId}_${shortTs}`).slice(0, 40);

    // Create RZP order; NEVER write DB until we have order.id
    const auth = 'Basic ' + Buffer.from(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`).toString('base64');
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency, receipt, payment_capture: 1, notes: { phone } })
    });

    if (!r.ok) {
      const e = await r.text().catch(() => '');
      console.error('Razorpay order create failed:', e);
      return res.status(502).json({ error: 'Failed to create payment order' });
    }

    const order = await r.json().catch(() => null);
    if (!order || !order.id) {
      console.error('Razorpay order response missing id:', order);
      return res.status(502).json({ error: 'Invalid response from payment gateway' });
    }

    // Now we have a legit orderId → safe to upsert
    await PaymentOrder.findOneAndUpdate(
      { orderId: order.id },
      {
        $setOnInsert: {
          playerId: player._id,
          phone,
          rpOrder: order
        },
        $set: {
          orderId: order.id,
          amount: order.amount ?? amount,
          currency: order.currency || currency,
          status: 'created'
        }
      },
      { upsert: true, new: true }
    ).exec();

    const contactDigits = onlyDigits(player.phone?.number || '');
    res.json({
      ok: true,
      keyId: RZP_KEY_ID,
      orderId: order.id,
      amount: order.amount ?? amount,
      currency: order.currency || currency,
      name: player.name || 'Dream Stage Member',
      contact: contactDigits,
      joinOrder: player.joinOrder || 0,
      plan: { name: 'Yearly', priceRupees: rupees }
    });
  } catch (err) {
    console.error('POST /pay/order error:', err);
    res.status(500).json({ error: 'Could not create order' });
  }
});

/* ------------------------- VERIFY + ACTIVATE + ASSIGN CODE ------------------------- */
router.post('/verify', async (req, res) => {
  try {
    if (!requireRzp(res)) return;

    let { phone, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body || {};
    phone = normalizePhone(phone);
    if (!phone) return res.status(400).json({ error: 'Invalid phone' });
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay fields' });
    }

    const player = await Player.findOne({ 'phone.number': phone }).exec();
    if (!player) return res.status(404).json({ error: 'Account not found' });

    // Signature check (gateway -> backend)
    const hmac = crypto
      .createHmac('sha256', RZP_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (hmac !== razorpay_signature) {
      // Mark failed (idempotent)
      await PaymentOrder.findOneAndUpdate(
        { orderId: razorpay_order_id },
        {
          $set: {
            paymentId: razorpay_payment_id,
            signature: razorpay_signature,
            status: 'failed',
            verifiedAt: new Date(),
            failureReason: 'Invalid signature',
            phone,
            playerId: player._id
          }
        },
        { upsert: true }
      ).exec();
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Amount: prefer what we stored on create; fallback to computed tier
    const created = await PaymentOrder.findOne({ orderId: razorpay_order_id }).lean().exec();
    const rupees  = computeRupees(player.joinOrder);
    const amountPaise = created?.amount ?? (rupees * 100);

    // Mark the order PAID (idempotent)
    await PaymentOrder.findOneAndUpdate(
      { orderId: razorpay_order_id },
      {
        $set: {
          paymentId: razorpay_payment_id,
          signature: razorpay_signature,
          status: 'paid',
          verifiedAt: new Date(),
          amount: amountPaise,
          currency: 'INR',
          phone,
          playerId: player._id
        }
      },
      { upsert: true, new: true }
    ).exec();

    // Activate membership
    const now = new Date();
    const validTill = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    player.membership.status        = 'active';
    player.membership.startedAt     = now;
    player.membership.validTill     = validTill;
    player.membership.lastOrderId   = razorpay_order_id;
    player.membership.lastPaymentId = razorpay_payment_id;
    player.membership.amount        = amountPaise;

    await player.save();

    // Assign creator code (if not already)
    const { number: creatorCodeNum, code: creatorCodeText } = await ensureCreatorCode(player._id);

    res.json({
      ok: true,
      orderId:   razorpay_order_id,
      paymentId: razorpay_payment_id,
      amount:    amountPaise,
      currency:  'INR',
      creatorCodeNumber: creatorCodeNum,
      creatorCode:       creatorCodeText,
      validTill
    });
  } catch (err) {
    console.error('POST /pay/verify error:', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

/* ------------------------------- STATS (optional) ------------------------------- */
router.get('/stats', async (_req, res) => {
  try {
    const [created, paid] = await Promise.all([
      PaymentOrder.countDocuments({ status: 'created' }),
      PaymentOrder.countDocuments({ status: 'paid' }),
    ]);
    const agg = await PaymentOrder.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, totalPaid: { $sum: '$amount' } } }
    ]);
    res.json({ ok: true, created, paid, totalPaid: agg[0]?.totalPaid || 0 });
  } catch (err) {
    console.error('GET /pay/stats error:', err);
    res.status(500).json({ error: 'Failed to read stats' });
  }
});

// Legacy helper some frontends call
router.get('/total', async (_req, res) => {
  try {
    const paid = await PaymentOrder.countDocuments({ status: 'paid' });
    res.json({ ok: true, totalPaid: paid });
  } catch {
    res.status(500).json({ error: 'Failed to read total' });
  }
});

module.exports = router;
