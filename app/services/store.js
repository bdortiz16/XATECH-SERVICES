'use strict';

// Persistencia simple en disco (JSON) para el estado local de cada orden:
// chat, KYC, verificación de pago, liberación y factura.
// En producción esto se reemplaza por una base de datos real.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'store.json');

let state = { orders: {} };

function load() {
  try {
    state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!state.orders) state.orders = {};
  } catch {
    state = { orders: {} };
  }
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}

function orderState(orderNumber) {
  if (!state.orders[orderNumber]) {
    state.orders[orderNumber] = {
      chat: [],
      keySent: false,
      kyc: { status: 'none', link: null }, // none | pending | approved | rejected
      paymentVerified: false,
      markedPaid: false,
      released: false,
      invoice: null, // { id, number, createdAt, sentToChat }
    };
  }
  return state.orders[orderNumber];
}

function addChat(orderNumber, from, text, kind = 'text') {
  const os = orderState(orderNumber);
  const msg = { from, text, kind, at: new Date().toISOString() };
  os.chat.push(msg);
  save();
  return msg;
}

load();

module.exports = { orderState, addChat, save };
