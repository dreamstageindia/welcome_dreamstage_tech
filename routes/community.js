const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Player = require('../models/Player');

// GET /api/community/count
router.get('/count', async (_req, res) => {
  try {
    const total = await Player.countDocuments({ 'phone.verified': true }).exec();
    res.json({ total });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/community/me/:id
router.get('/me/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    const p = await Player.findById(id).select('joinOrder phone.verified').lean().exec();
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json({ joinOrder: p.joinOrder || 0, verified: !!(p.phone && p.phone.verified) });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
