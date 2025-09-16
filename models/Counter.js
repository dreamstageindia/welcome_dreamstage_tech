'use strict';

const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, index: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

counterSchema.statics.nextSequence = async function (key) {
  const doc = await this.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).exec();
  return doc.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
