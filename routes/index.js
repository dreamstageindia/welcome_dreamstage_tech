// backend/routes/index.js
'use strict';

const express = require('express');
const router = express.Router();

// other feature routers
router.use('/levels',    require('./levels'));
router.use('/journey',   require('./journey'));
router.use('/otp',       require('./otp'));
router.use('/player',    require('./player'));
router.use('/community', require('./community'));
router.use('/pay',       require('./payments'));

// invites: export both the router and the handler (for legacy /claim)
const invites = require('./invites');   // NOTE: this matches the file created above

// Mount BOTH singular and plural to satisfy any frontend calls
router.use('/invite',  invites.router);
router.use('/invites', invites.router);

module.exports = router;
