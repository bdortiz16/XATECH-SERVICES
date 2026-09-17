'use strict';
const { requireSession } = require('../../lib/auth');
const binance = require('../../lib/binance');
const store = require('../../lib/store');
const { viewOrder } = require('../../lib/orders');

module.exports = async (req, res) => {
  if (!requireSession(req, res)) return;
  try {
    const [orders, states] = await Promise.all([binance.listOrders(), store.getAllStates()]);
    const view = orders.map((o) => viewOrder(o, states.get(o.orderNumber) || store.defaults()));
    view.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    res.status(200).json({ orders: view });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
