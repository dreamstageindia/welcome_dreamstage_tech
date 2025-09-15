// scripts/seed-invite-codes.js
/* Run: NODE_ENV=production node scripts/seed-invite-codes.js */
const mongoose = require('mongoose');
const InviteCode = require('../models/InviteCode');
require("dotenv").config();

const MONGO_URI = process.env.MONGODB_URI;

function makeCode() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 4; i++) {
    s += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return s;
}

async function main() {
  await mongoose.connect("mongodb://localhost:27017/dreamstage");

  // ensure unique index
  await InviteCode.init();

  const target = 5000;
  const batch = new Set();

  // generate in-memory unique set
  while (batch.size < target) {
    batch.add(makeCode());
  }

  // transform into insert docs
  const docs = Array.from(batch).map(code => ({ code, used: false }));

  console.log(`Inserting ${docs.length} invite codes…`);
  try {
    await InviteCode.insertMany(docs, { ordered: false });
    console.log('Done ✅');
  } catch (e) {
    // ordered:false means duplicates (from pre-existing codes) are skipped
    console.warn('Insert completed with some duplicate skips (ok).');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
