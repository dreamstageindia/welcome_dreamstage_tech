const express = require('express');
const router = express.Router();
const Level = require('../models/Level');
const mongoose = require('mongoose');

// POST /api/levels
router.post('/', async (req, res) => {
  try {
    const { map } = req.body;
    if (!Array.isArray(map) || !map.every(row => Array.isArray(row))) {
      return res.status(400).json({ error: '`map` must be a 2D array' });
    }
    const lvl = new Level({ map });
    await lvl.save();
    res.json({ _id: lvl._id });
  } catch (err) {
    console.error('POST /levels error:', err);
    res.status(500).json({ error: 'Failed to save level' });
  }
});

// GET /api/levels/list
router.get('/list', async (_req, res) => {
  try {
    const docs = await Level.find().sort({ createdAt: 1 }).select({ map: 0 }).exec();
    res.json(docs.map(d => ({ _id: d._id.toString(), createdAt: d.createdAt })));
  } catch (err) {
    console.error('GET /levels/list error:', err);
    res.status(500).json({ error: 'Failed to list levels' });
  }
});

// GET /api/levels
router.get('/', async (_req, res) => {
  try {
    const levels = await Level.find().sort({ createdAt: 1 }).exec();
    res.json(levels);
  } catch (err) {
    console.error('GET /levels error:', err);
    res.status(500).json({ error: 'Failed to fetch levels' });
  }
});

// GET /api/levels/first
router.get('/first', async (_req, res) => {
  try {
    const docs = await Level.find().sort({ createdAt: 1 }).exec();
    if (!docs.length) return res.status(404).json({ error: 'No levels found' });
    res.json(docs.map(doc => ({ map: doc.map })));
  } catch (err) {
    console.error('GET /levels/first error:', err);
    res.status(500).json({ error: 'Failed to fetch levels' });
  }
});

// GET /api/levels/:id  (id or 1-based number)
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (mongoose.Types.ObjectId.isValid(id)) {
      const doc = await Level.findById(id).exec();
      if (!doc || !doc.map) return res.status(404).json({ error: 'Level not found or invalid' });
      return res.json({ map: doc.map });
    } else {
      const number = parseInt(id, 10);
      if (isNaN(number) || number < 1) return res.status(400).json({ error: 'Invalid level ID or number' });
      const doc = await Level.findOne().sort({ createdAt: 1 }).skip(number - 1).exec();
      if (!doc || !doc.map) return res.status(404).json({ error: 'Level not found' });
      return res.json({ map: doc.map });
    }
  } catch (err) {
    console.error('GET /levels/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch level' });
  }
});

// DELETE /api/levels
router.delete('/', async (_req, res) => {
  try {
    await Level.deleteMany({});
    res.json({ message: 'All levels deleted' });
  } catch (err) {
    console.error('DELETE /levels error:', err);
    res.status(500).json({ error: 'Failed to delete levels' });
  }
});

module.exports = router;
