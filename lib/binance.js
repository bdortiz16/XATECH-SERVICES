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
const config = require('./config');

function sign(query, secret) {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

async function sapi(pathName, params = {}, method = 'GET') {
  const { apiKey, apiSecret, baseUrl } = config.binance;
  const q = new URLSearchParams({ ...params, timestamp: Date.now(), recvWindow: 10000 });
  q.set('signature', sign(q.toString(), apiSecret));
  const res = await fetch(`${baseUrl}${pathName}?${q}`, {
    method,
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
      realName: 'Juan Camilo Rodríguez',
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
      realName: 'Luz Marina Torres',
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
      realName: 'Pedro Alonso Patrón García',
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
      realName: 'Andrés Felipe Mora',
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
  // El endpoint devuelve máximo 30 días por consulta y 6 meses hacia atrás:
  // consultamos las 6 ventanas de 30 días en paralelo para traer todo.
  const DAY30 = 30 * 24 * 3600 * 1000;
  const now = Date.now();
  const calls = [];
  for (const tradeType of ['SELL', 'BUY']) {
    for (let i = 0; i < 6; i++) {
      calls.push(
        sapi('/sapi/v1/c2c/orderMatch/listUserOrderHistory', {
          tradeType,
          rows: 100,
          startTimestamp: now - (i + 1) * DAY30 + 1,
          endTimestamp: now - i * DAY30,
        }).catch(() => ({ data: [] }))
      );
    }
  }
  const results = await Promise.all(calls);
  const rows = results.flatMap((r) => r.data || []);
  // Estados reales del endpoint → estados internos de la plataforma
  const ST = {
    PENDING: 'PENDING_PAYMENT',
    TRADING: 'PENDING_PAYMENT',
    BUYER_PAYED: 'BUYER_PAID',
    DISTRIBUTING: 'COMPLETED',
    COMPLETED: 'COMPLETED',
    IN_APPEAL: 'IN_APPEAL',
    CANCELLED: 'CANCELLED',
    CANCELLED_BY_SYSTEM: 'CANCELLED',
  };
  return rows.map((r) => ({
    orderNumber: String(r.orderNumber),
    tradeType: r.tradeType,
    asset: r.asset,
    fiat: r.fiat,
    price: Number(r.unitPrice),
    amount: Number(r.amount),
    totalPrice: Number(r.totalPrice),
    binanceStatus: ST[r.orderStatus] || r.orderStatus,
    createdAt: new Date(r.createTime).toISOString(),
    counterparty: {
      nickname: r.counterPartNickName || 'contraparte',
      ordersCount: null,
      completionRate: null,
      // additionalKycVerify: 0 no requerida, 1 sin verificar, 2 verificada
      isNew: r.additionalKycVerify === 1,
    },
    // El nombre real y la llave llegan con la API de comerciante; por ahora el método
    payMethod: r.payMethodName
      ? { type: r.payMethodName, key: '', bank: '', holder: 'Datos del perfil de Binance' }
      : null,
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

// Saldos reales de la cuenta (billeteras spot/funding). Solo lectura.
async function getBalances() {
  if (config.demoBinance) return { demo: true };
  const rows = await sapi('/sapi/v3/asset/getUserAsset', {}, 'POST');
  const find = (a) => rows.find((r) => r.asset === a) || {};
  const num = (v) => Number(v || 0);
  const usdt = find('USDT');
  return {
    demo: false,
    usdt: { free: num(usdt.free), locked: num(usdt.locked) + num(usdt.freeze) },
    assets: rows
      .map((r) => ({ asset: r.asset, free: num(r.free), locked: num(r.locked) + num(r.freeze) }))
      .filter((r) => r.free + r.locked > 0),
  };
}

module.exports = { listOrders, getOrder, releaseOrder, getBalances };
