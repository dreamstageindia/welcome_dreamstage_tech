const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

const Player = require('../models/Player');

const RZP_KEY_ID     = process.env.RZP_KEY_ID || '';
const RZP_KEY_SECRET = process.env.RZP_KEY_SECRET || '';

const onlyDigits = (s) => String(s||'').replace(/\D+/g,'');
const normalizePhone = (s) => {
  if (!s) return '';
  const raw = String(s).trim();
  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D+/g,'');
  return '+' + raw.replace(/\D+/g,'');
};

function requireRzp(res) {
  if (!RZP_KEY_ID || !RZP_KEY_SECRET) {
    res.status(500).json({ error: 'Razorpay keys not configured on server' });
    return false;
  }
  return true;
}

// POST /api/pay/order
router.post('/order', async (req, res) => {
  try {
    if (!requireRzp(res)) return;
    let { phone } = req.body || {};
    phone = normalizePhone(phone);
    if (!phone) return res.status(400).json({ error: 'Invalid phone' });

    const p = await Player.findOne({ 'phone.number': phone }).exec();
    if (!p) return res.status(404).json({ error: 'Account not found' });

    const rupees = (typeof p.joinOrder === 'number' && p.joinOrder <= 50) ? 49 : 99;
    const amount = rupees * 100; // paise
    const currency = 'INR';

    // Node v18+: global fetch is available
    const auth = 'Basic ' + Buffer.from(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`).toString('base64');
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        currency,
        receipt: `ds_${p._id}_${Date.now()}`,
        payment_capture: 1
      })
    });

    if (!r.ok) {
      const e = await r.text().catch(()=> '');
      console.error('Razorpay order create failed:', e);
      return res.status(502).json({ error: 'Failed to create payment order' });
    }

    const order = await r.json();
    const contactDigits = onlyDigits(p.phone?.number || '');

    res.json({
      keyId: RZP_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      name: p.name || 'Dream Stage Member',
      contact: contactDigits || '',
      joinOrder: p.joinOrder || 0
    });
  } catch (err) {
    console.error('POST /pay/order error:', err);
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

    const hmac = crypto
      .createHmac('sha256', RZP_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (hmac !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    const rupees = (typeof p.joinOrder === 'number' && p.joinOrder <= 50) ? 49 : 99;
    const amountPaise = rupees * 100;

    const now = new Date();
    const validTill = new Date(now.getTime() + 365*24*60*60*1000);

    p.membership.status = 'active';
    p.membership.startedAt = now;
    p.membership.validTill = validTill;
    p.membership.lastOrderId = razorpay_order_id;
    p.membership.lastPaymentId = razorpay_payment_id;
    p.membership.amount = amountPaise;

    await p.save();

    res.json({ ok: true, validTill, amount: amountPaise });
  } catch (err) {
    console.error('POST /pay/verify error:', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

module.exports = router;
