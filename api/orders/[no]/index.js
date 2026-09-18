'use strict';
const { requireSession } = require('../../../lib/auth');
const binance = require('../../../lib/binance');
const store = require('../../../lib/store');
const { viewOrder } = require('../../../lib/orders');
const rc = require('../../../lib/runtime-config');

module.exports = async (req, res) => {
  await rc.apply();
  if (!requireSession(req, res)) return;
  try {
    const order = await binance.getOrder(req.query.no);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    const st = await store.getState(order.orderNumber);
    res.status(200).json({ order: viewOrder(order, st) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
