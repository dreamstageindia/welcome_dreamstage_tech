const mongoose = require('mongoose');

const levelSchema = new mongoose.Schema({
  map: { type: [[Number]], required: true },
  createdAt: { type: Date, default: Date.now }
});

levelSchema.index({ createdAt: 1 });

module.exports = mongoose.model('Level', levelSchema);
