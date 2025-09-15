// routes/pay.js
'use strict';
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const Player = require('../models/Player');
const CreatorNumber = require('../models/CreatorNumber');
const PaymentOrder = require('../models/PaymentOrder');
const InviteCode = require('../models/InviteCode');

// --- helpers ---
const RZP_KEY_ID = process.env.RZP_KEY_ID || '';
const RZP_KEY_SECRET = process.env.RZP_KEY_SECRET || '';
function requireRzp(res) {
  if (!RZP_KEY_ID || !RZP_KEY_SECRET) {
    res.status(500).json({ error: 'Razorpay keys not configured on server' });
    return false;
  }
  return true;
}
const digits = s => String(s || '').replace(/\D+/g, '');
const normalizePhone = s => {
  if (!s) return '';
  const raw = String(s).trim();
  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D+/g, '');
  return '+' + raw.replace(/\D+/g, '');
};
const priceFor = (n) => (n <= 100 ? 49 : (n <= 3000 ? 99 : 199));
const codeStr = (n) => '#' + String(n).padStart(4, '0');

// Reserve the next creator number fairly (no gaps, no race)
async function reserveCreatorNumber(playerId, rzpOrderId, holdMs = 60 * 60 * 1000) {
  // Try to take the smallest 'free'
  let doc = await CreatorNumber.findOneAndUpdate(
    { status: 'free' },
    {
      $set: {
        status: 'reserved',
        reservedBy: playerId,
        orderId: rzpOrderId,
        reservedAt: new Date(),
        expiresAt: new Date(Date.now() + holdMs)
      }
    },
    { sort: { n: 1 }, new: true }
  );

  if (doc) return doc.n;

  // Create a new 'n' (largest + 1) with reservation; loop to avoid dup keys
  for (;;) {
    const last = await CreatorNumber.findOne().sort({ n: -1 }).select('n').lean().exec();
    const nextN = (last?.n || 0) + 1;

    try {
      const created = await CreatorNumber.create({
        n: nextN,
        status: 'reserved',
        reservedBy: playerId,
        orderId: rzpOrderId,
        reservedAt: new Date(),
        expiresAt: new Date(Date.now() + holdMs)
      });
      return created.n;
    } catch (e) {
      if (e && e.code === 11000) {
        // race: someone inserted same 'n'; retry
        continue;
      }
      throw e;
    }
  }
}

// Clean stale reservations (optional but recommended)
async function releaseExpiredHolds() {
  const now = new Date();
  await CreatorNumber.updateMany(
    { status: 'reserved', expiresAt: { $lt: now } },
    { $set: { status: 'free', reservedBy: null, orderId: '', reservedAt: null, expiresAt: null } }
  ).catch(() => {});
}

// GET /api/pay/preview  -> { price }
router.get('/preview', async (_req, res) => {
  try {
    await releaseExpiredHolds();
    const free = await CreatorNumber.findOne({ status: 'free' }).sort({ n: 1 }).select('n').lean();
    const last = await CreatorNumber.findOne().sort({ n: -1 }).select('n').lean();
    const nextN = free?.n ?? ((last?.n || 0) + 1);
    const price = priceFor(nextN);
    res.json({ ok: true, price, nextNumber: nextN });
  } catch (e) {
    console.error('preview error:', e);
    res.status(500).json({ ok: false, error: 'SERVER' });
  }
});

// POST /api/pay/order  { phone }
router.post('/order', async (req, res) => {
  try {
    if (!requireRzp(res)) return;
    let { phone } = req.body || {};
    phone = normalizePhone(phone);
    if (!phone) return res.status(400).json({ error: 'Invalid phone' });

    const p = await Player.findOne({ 'phone.number': phone }).exec();
    if (!p) return res.status(404).json({ error: 'Account not found' });

    // must have invite locked to enter this page
    if (!p.steps?.inviteLocked) {
      return res.status(403).json({ error: 'INVITE_REQUIRED' });
    }

    // Create Razorpay order with the CORRECT tier based on a reserved number
    const auth = 'Basic ' + Buffer.from(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`).toString('base64');

    // create a lightweight order first (amount will be filled after reserving number)
    const fakeAmount = 100; // placeholder; Razorpay needs a number; we’ll replace after reserve via new call
    const pre = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: fakeAmount, currency: 'INR', receipt: `pre_${p._id}_${Date.now()}`, payment_capture: 1 })
    });
    if (!pre.ok) {
      const e = await pre.text().catch(()=> '');
      console.error('RZP pre-order failed:', e);
      return res.status(502).json({ error: 'Failed to create payment order' });
    }
    const preOrder = await pre.json();

    // Reserve creator number tied to THIS order id for fairness
    await releaseExpiredHolds();
    const reservedNumber = await reserveCreatorNumber(p._id, preOrder.id);
    const rupees = priceFor(reservedNumber);
    const amount = rupees * 100;

    // Recreate the order with real amount (simplest + reliable)
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount, currency: 'INR',
        receipt: `ds_${p._id}_${Date.now()}`,
        payment_capture: 1
      })
    });
    if (!r.ok) {
      // release reservation if Razorpay final order fails
      await CreatorNumber.updateOne({ orderId: preOrder.id, status: 'reserved' }, {
        $set: { status: 'free', reservedBy: null, orderId: '', reservedAt: null, expiresAt: null }
      }).catch(()=>{});
      const e = await r.text().catch(()=> '');
      console.error('RZP order failed:', e);
      return res.status(502).json({ error: 'Failed to create payment order' });
    }
    const order = await r.json();

    // Attach reservation to our order record
    await PaymentOrder.create({
      playerId: p._id,
      phone: p.phone?.number || '',
      rzp: { orderId: order.id },
      amount,
      currency: order.currency || 'INR',
      status: 'created',
      reservedCodeNumber: reservedNumber
    });

    // point the reservation to real order id
    await CreatorNumber.updateOne(
      { orderId: preOrder.id, status: 'reserved' },
      { $set: { orderId: order.id } }
    ).catch(()=>{});

    const contactDigits = digits(p.phone?.number || '');
    res.json({
      keyId: RZP_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      name: p.name || 'Dream Stage Member',
      contact: contactDigits,
      reservedNumber
    });
  } catch (err) {
    console.error('POST /api/pay/order error:', err);
    res.status(500).json({ error: 'Could not create order' });
  }
});

// POST /api/pay/verify
router.post('/verify', async (req, res) => {
  try {
    if (!requireRzp(res)) return;
    let { phone, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body || {};
    phone = normalizePhone(phone);
    if (!phone) return res.status(400).json({ error: 'Invalid phone' });
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay fields' });
    }

    const p = await Player.findOne({ 'phone.number': phone }).exec();
    if (!p) return res.status(404).json({ error: 'Account not found' });

    const ord = await PaymentOrder.findOne({ 'rzp.orderId': razorpay_order_id, playerId: p._id }).exec();
    if (!ord) return res.status(404).json({ error: 'Order not found' });
    if (ord.status === 'paid') {
      // idempotent response
      return res.json({ ok: true, amount: ord.amount, code: codeStr(ord.reservedCodeNumber) });
    }

    const hmac = crypto.createHmac('sha256', RZP_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    if (hmac !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Finalize: mark reserved number as assigned to this user
    const cn = await CreatorNumber.findOneAndUpdate(
      { orderId: razorpay_order_id, status: 'reserved' },
      { $set: { status: 'assigned', assignedTo: p._id, assignedAt: new Date() } },
      { new: true }
    ).exec();

    // Fallback (should rarely happen): if reservation missing, take next free
    let finalN = cn?.n;
    if (!finalN) {
      await releaseExpiredHolds();
      finalN = await reserveCreatorNumber(p._id, razorpay_order_id);
      await CreatorNumber.updateOne(
        { orderId: razorpay_order_id, status: 'reserved' },
        { $set: { status: 'assigned', assignedTo: p._id, assignedAt: new Date() } }
      );
    }

    // Update order
    ord.status = 'paid';
    ord.rzp.paymentId = razorpay_payment_id;
    ord.rzp.signature = razorpay_signature;
    await ord.save();

    const now = new Date();
    const validTill = new Date(now.getTime() + 365*24*60*60*1000);

    // Activate membership + set creator code on the player
    p.membership.status = 'active';
    p.membership.startedAt = now;
    p.membership.validTill = validTill;
    p.membership.lastOrderId = razorpay_order_id;
    p.membership.lastPaymentId = razorpay_payment_id;
    p.membership.amount = ord.amount;

    p.creator.number = finalN;
    p.creator.code = codeStr(finalN);

    // Consume invite code now
    if (p.invite?.code) {
      await InviteCode.findOneAndUpdate(
        { code: p.invite.code, locked: true, lockedBy: p._id, used: false },
        { $set: { used: true, usedAt: new Date() } }
      ).catch(()=>{});
      p.invite.verified = true;
      p.steps.inviteVerified = true;
    }

    await p.save();

    res.json({ ok: true, validTill, amount: ord.amount, code: p.creator.code });
  } catch (err) {
    console.error('POST /api/pay/verify error:', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// OPTIONAL: tiny cron to auto-release expired holds
setInterval(() => {
  releaseExpiredHolds().catch(()=>{});
}, 60 * 1000);

module.exports = router;
