'use strict';

// Integración con Binance.
//
// MODO REAL: usa las llaves de BINANCE_API_KEY / BINANCE_API_SECRET (solo en el
// servidor) y firma cada petición con HMAC-SHA256, como exige la API SAPI.
// - Historial de órdenes P2P: GET /sapi/v1/c2c/orderMatch/listUserOrderHistory
// - IMPORTANTE: las operaciones de comerciante (responder chat, liberar cripto,
//   publicar anuncios) solo están disponibles para cuentas con perfil de
//   comerciante verificado en Binance P2P; Binance entrega esos endpoints al
//   aprobar el perfil. Este módulo deja el punto de conexión listo.
//
// MODO DEMO (sin llaves): sirve órdenes de ejemplo realistas para desarrollar
// y probar todo el flujo de la plataforma sin tocar dinero real.

const crypto = require('crypto');
const config = require('../config');

function sign(query, secret) {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

async function sapi(pathName, params = {}) {
  const { apiKey, apiSecret, baseUrl } = config.binance;
  const q = new URLSearchParams({ ...params, timestamp: Date.now(), recvWindow: 10000 });
  q.set('signature', sign(q.toString(), apiSecret));
  const res = await fetch(`${baseUrl}${pathName}?${q}`, {
    headers: { 'X-MBX-APIKEY': apiKey },
  });
  if (!res.ok) throw new Error(`Binance ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------- Órdenes de ejemplo (modo demo) ----------

const DEMO_ORDERS = [
  {
    orderNumber: '20268899101',
    tradeType: 'SELL', // vendemos USDT → el comprador nos paga (recaudo)
    asset: 'USDT',
    fiat: 'COP',
    price: 4180,
    amount: 250,
    totalPrice: 1045000,
    binanceStatus: 'PENDING_PAYMENT',
    createdAt: minutesAgo(6),
    counterparty: {
      nickname: 'CryptoJuan_88',
      ordersCount: 2,
      completionRate: 100,
      isNew: true,
    },
    payMethod: null,
  },
  {
    orderNumber: '20268899074',
    tradeType: 'SELL',
    asset: 'USDT',
    fiat: 'COP',
    price: 4175,
    amount: 1200,
    totalPrice: 5010000,
    binanceStatus: 'BUYER_PAID',
    createdAt: minutesAgo(22),
    counterparty: {
      nickname: 'InversionesLuz',
      ordersCount: 341,
      completionRate: 99.4,
      isNew: false,
    },
    payMethod: null,
  },
  {
    orderNumber: '20268898921',
    tradeType: 'BUY', // compramos USDT → pagamos SOLO a los datos del perfil
    asset: 'USDT',
    fiat: 'COP',
    price: 4160,
    amount: 500,
    totalPrice: 2080000,
    binanceStatus: 'PENDING_PAYMENT',
    createdAt: minutesAgo(41),
    counterparty: {
      nickname: 'ElPatronP2P',
      ordersCount: 1,
      completionRate: 100,
      isNew: true,
    },
    payMethod: {
      type: 'Bre-B (llave)',
      key: '@elpatron-925',
      bank: 'Bancolombia',
      holder: 'Datos del perfil verificado de Binance',
    },
  },
  {
    orderNumber: '20268897750',
    tradeType: 'SELL',
    asset: 'USDT',
    fiat: 'COP',
    price: 4182,
    amount: 90,
    totalPrice: 376380,
    binanceStatus: 'COMPLETED',
    createdAt: minutesAgo(180),
    counterparty: {
      nickname: 'MonedaFuerte',
      ordersCount: 77,
      completionRate: 98.1,
      isNew: false,
    },
    payMethod: null,
  },
];

function minutesAgo(m) {
  return new Date(Date.now() - m * 60000).toISOString();
}

// ---------- API del servicio ----------

async function listOrders() {
  if (config.demoBinance) return DEMO_ORDERS;

  // Modo real: historial de órdenes P2P de la cuenta (compras y ventas).
  const [sell, buy] = await Promise.all([
    sapi('/sapi/v1/c2c/orderMatch/listUserOrderHistory', { tradeType: 'SELL' }),
    sapi('/sapi/v1/c2c/orderMatch/listUserOrderHistory', { tradeType: 'BUY' }),
  ]);
  const rows = [...(sell.data || []), ...(buy.data || [])];
  return rows.map((r) => ({
    orderNumber: String(r.orderNumber),
    tradeType: r.tradeType,
    asset: r.asset,
    fiat: r.fiat,
    price: Number(r.unitPrice),
    amount: Number(r.amount),
    totalPrice: Number(r.totalPrice),
    binanceStatus: r.orderStatus,
    createdAt: new Date(r.createTime).toISOString(),
    counterparty: {
      nickname: r.counterPartNickName || 'contraparte',
      ordersCount: null,
      completionRate: null,
      isNew: false,
    },
    payMethod: null, // el detalle de método de pago llega por el endpoint de detalle del comerciante
  }));
}

async function getOrder(orderNumber) {
  const orders = await listOrders();
  return orders.find((o) => o.orderNumber === orderNumber) || null;
}

// Liberación de cripto: en Binance la liberación vía API está reservada al
// programa de comerciantes; hasta tener esos endpoints habilitados la
// liberación se hace en la app/web de Binance y aquí se registra el evento.
async function releaseOrder(orderNumber) {
  if (config.demoBinance) return { ok: true, demo: true };
  return {
    ok: true,
    manual: true,
    note: 'Liberación registrada. Ejecute la liberación en Binance (endpoint de comerciante no habilitado en esta cuenta).',
  };
}

module.exports = { listOrders, getOrder, releaseOrder };
