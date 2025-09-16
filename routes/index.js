'use strict';

const express = require('express');
const router  = express.Router();

// feature routers
router.use('/levels',    require('./levels'));
router.use('/journey',   require('./journey'));
router.use('/otp',       require('./otp'));

// Mount player routes on BOTH singular and plural bases.
// This ensures the frontend can call either /api/player/... or /api/players/...
const playerRouter = require('./player');
router.use('/player',  playerRouter);
router.use('/players', playerRouter);

// payments
router.use('/pay',       require('./payments'));

// invites: export both the router and the handler (for legacy /claim in app.js)
const invites = require('./invites');
router.use('/invite',  invites.router);
router.use('/invites', invites.router);

module.exports = router;
