'use strict';
const config = require('../lib/config');
const { requireSession } = require('../lib/auth');

module.exports = (req, res) => {
  if (!requireSession(req, res)) return;
  res.status(200).json({
    email: config.adminEmail,
    demo: {
      binance: config.demoBinance,
      siigo: config.demoSiigo,
      kyc: config.demoKyc,
      store: config.demoStore,
    },
    payment: config.payment,
  });
};
