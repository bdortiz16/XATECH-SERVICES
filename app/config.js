'use strict';

// Configuración central de la plataforma XATECH P2P.
// TODO se configura por variables de entorno; nada de llaves en el código
// ni en el navegador. Sin credenciales reales la app corre en MODO DEMO.

const crypto = require('crypto');

const env = (k, def = '') => (process.env[k] ?? def).trim();

const config = {
  port: parseInt(env('PORT', '3000'), 10),

  // --- Acceso (solo login, sin registro) ---
  adminEmail: env('ADMIN_EMAIL', 'admin@xatech.services'),
  // En producción defina ADMIN_PASSWORD_SHA256 (hash) en lugar de la clave plana.
  adminPassword: env('ADMIN_PASSWORD', 'xatech2026'),
  adminPasswordSha256: env('ADMIN_PASSWORD_SHA256'),
  sessionSecret: env('SESSION_SECRET') || crypto.randomBytes(32).toString('hex'),
  sessionHours: parseInt(env('SESSION_HOURS', '12'), 10),

  // --- Binance (API del comerciante; las llaves viven SOLO en el servidor) ---
  binance: {
    apiKey: env('BINANCE_API_KEY'),
    apiSecret: env('BINANCE_API_SECRET'),
    baseUrl: env('BINANCE_BASE_URL', 'https://api.binance.com'),
  },

  // --- Recaudo: la llave (Bre-B) que se envía al comprador para que pague ---
  payment: {
    breBKey: env('BREB_KEY', '@xatech-demo'),
    breBBank: env('BREB_BANK', 'Banco (configurar BREB_BANK)'),
    accountHolder: env('ACCOUNT_HOLDER', 'XATECH SERVICES'),
  },

  // --- Siigo (facturación electrónica) ---
  siigo: {
    username: env('SIIGO_USERNAME'),
    accessKey: env('SIIGO_ACCESS_KEY'),
    partnerId: env('SIIGO_PARTNER_ID', 'XatechP2P'),
    baseUrl: env('SIIGO_BASE_URL', 'https://api.siigo.com'),
    documentId: env('SIIGO_DOCUMENT_ID'), // id del tipo de comprobante FV
    sellerId: env('SIIGO_SELLER_ID'),
  },

  // --- KYC (Didit) para contrapartes nuevas ---
  kyc: {
    apiKey: env('DIDIT_API_KEY'),
    workflowId: env('DIDIT_WORKFLOW_ID'),
    baseUrl: env('DIDIT_BASE_URL', 'https://verification.didit.me'),
  },
};

config.demoBinance = !config.binance.apiKey || !config.binance.apiSecret;
config.demoSiigo = !config.siigo.username || !config.siigo.accessKey;
config.demoKyc = !config.kyc.apiKey;

module.exports = config;
