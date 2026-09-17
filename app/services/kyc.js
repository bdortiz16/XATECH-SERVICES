'use strict';

// KYC de contrapartes nuevas con Didit (https://didit.me).
//
// MODO REAL: crea una sesión de verificación con la API de Didit y devuelve el
// enlace que se envía por el chat de la orden; el resultado llega por webhook
// (POST /api/webhooks/didit) o se consulta por API.
// MODO DEMO (sin DIDIT_API_KEY): genera un enlace simulado y permite aprobar
// manualmente para probar el flujo completo.

const config = require('../config');

async function createSession(order) {
  if (config.demoKyc) {
    return {
      sessionId: `demo-${order.orderNumber}`,
      url: `https://verify.didit.me/session/demo-${order.orderNumber}`,
      demo: true,
    };
  }

  const res = await fetch(`${config.kyc.baseUrl}/v2/session/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.kyc.apiKey,
    },
    body: JSON.stringify({
      workflow_id: config.kyc.workflowId,
      vendor_data: order.orderNumber, // para casar el webhook con la orden
    }),
  });
  if (!res.ok) throw new Error(`Didit ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { sessionId: data.session_id, url: data.url, demo: false };
}

module.exports = { createSession };
