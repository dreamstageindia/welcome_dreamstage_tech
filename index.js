// backend/app.js
'use strict';

const express  = require('express');
const path     = require('path');
const cors     = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const apiRouter = require('./routes');
const invites   = require('./routes/invites'); // <— make sure this matches the filename

const app = express();

/* ------------------ DB CONNECT ------------------ */
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI).catch(err => {
  console.error('MongoDB connection failed:', err);
});
mongoose.connection
  .on('error', console.error.bind(console, 'MongoDB connection error:'))
  .once('open', () => console.log('✔ Connected to MongoDB'));

/* ------------------ MIDDLEWARE ------------------ */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

/* ------------------ STATIC ------------------ */
app.use('/', express.static(path.join(__dirname, 'public')));

/* ------------------ API ROUTES ------------------ */
app.use('/api', apiRouter);

// Legacy alias (keeps any older frontend that posts to "/claim")
app.post('/claim', invites.claimHandler);

app.use('/api', require('./routes/spin'));

/* ------------------ SPA FALLBACK ------------------ */
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});




/* ------------------ GRACEFUL SHUTDOWN ------------------ */
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});

/* ------------------ START ------------------ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Listening on http://localhost:${PORT}`);
});
  