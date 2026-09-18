'use strict';
// Saldos reales de la cuenta de Binance (solo lectura).
const { requireSession } = require('../lib/auth');
const binance = require('../lib/binance');
const rc = require('../lib/runtime-config');

module.exports = async (req, res) => {
  await rc.apply();
  if (!requireSession(req, res)) return;
  try {
    res.status(200).json(await binance.getBalances());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
