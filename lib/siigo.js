'use strict';

// Integración con Siigo (facturación electrónica, Colombia).
//
// MODO REAL: autentica con POST /auth (username + access_key), cachea el token
// y crea la factura con POST /v1/invoices. El PDF se obtiene con
// GET /v1/invoices/{id}/pdf (base64). Requiere encabezado Partner-Id.
// MODO DEMO (sin credenciales): genera una factura simulada para probar el flujo.

const config = require('./config');

let tokenCache = { token: null, exp: 0 };

async function authToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const res = await fetch(`${config.siigo.baseUrl}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Partner-Id': config.siigo.partnerId },
    body: JSON.stringify({
      username: config.siigo.username,
      access_key: config.siigo.accessKey,
    }),
  });
  if (!res.ok) throw new Error(`Siigo auth ${res.status}: ${await res.text()}`);
  const data = await res.json();
  tokenCache = { token: data.access_token, exp: Date.now() + 23 * 3600 * 1000 };
  return tokenCache.token;
}

let demoSeq = 1000;

async function createInvoice(order, customer) {
  if (config.demoSiigo) {
    demoSeq += 1;
    return {
      id: `demo-${demoSeq}`,
      number: `FV-1-${demoSeq}`,
      createdAt: new Date().toISOString(),
      demo: true,
    };
  }

  const token = await authToken();
  const body = {
    document: { id: Number(config.siigo.documentId) },
    date: new Date().toISOString().slice(0, 10),
    customer: {
      identification: customer.identification,
      branch_office: 0,
    },
    seller: Number(config.siigo.sellerId),
    items: [
      {
        code: 'P2P-USDT',
        description: `Operación P2P ${order.tradeType} ${order.amount} ${order.asset} — orden ${order.orderNumber}`,
        quantity: 1,
        price: order.totalPrice,
      },
    ],
    payments: [
      // El id del medio de pago se consulta en Siigo (GET /v1/payment-types).
      { id: 5636, value: order.totalPrice, due_date: new Date().toISOString().slice(0, 10) },
    ],
  };

  const res = await fetch(`${config.siigo.baseUrl}/v1/invoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Partner-Id': config.siigo.partnerId,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Siigo invoice ${res.status}: ${await res.text()}`);
  const inv = await res.json();
  return {
    id: inv.id,
    number: inv.number ? `${inv.name || 'FV'}-${inv.number}` : inv.id,
    createdAt: new Date().toISOString(),
    demo: false,
  };
}

async function invoicePdfBase64(invoiceId) {
  if (config.demoSiigo) return null;
  const token = await authToken();
  const res = await fetch(`${config.siigo.baseUrl}/v1/invoices/${invoiceId}/pdf`, {
    headers: { 'Partner-Id': config.siigo.partnerId, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Siigo pdf ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.base64 || null;
}

module.exports = { createInvoice, invoicePdfBase64 };
