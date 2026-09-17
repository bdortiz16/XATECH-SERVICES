'use strict';

// Configuración central. TODO va por variables de entorno (en Vercel:
// Settings → Environment Variables). Sin credenciales corre en MODO DEMO.

const crypto = require('crypto');

const env = (k, def = '') => (process.env[k] ?? def).trim();

const adminEmail = env('ADMIN_EMAIL', 'admin@xatech.services');
const adminPassword = env('ADMIN_PASSWORD', 'xatech2026');

const config = {
  // --- Acceso (solo login, sin registro) ---
  adminEmail,
  adminPassword,
  adminPasswordSha256: env('ADMIN_PASSWORD_SHA256'),
  // Estable entre invocaciones serverless aunque no definas SESSION_SECRET.
  sessionSecret:
    env('SESSION_SECRET') ||
    crypto.createHash('sha256').update(`xatech|${adminEmail}|${adminPassword}`).digest('hex'),
  sessionHours: parseInt(env('SESSION_HOURS', '12'), 10),

  // --- Supabase (persistencia del estado de las órdenes) ---
  supabase: {
    url: env('SUPABASE_URL'),
    serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'),
    table: env('SUPABASE_TABLE', 'p2p_order_state'),
  },

  // --- Binance (las llaves viven SOLO en el servidor) ---
  binance: {
    apiKey: env('BINANCE_API_KEY'),
    apiSecret: env('BINANCE_API_SECRET'),
    baseUrl: env('BINANCE_BASE_URL', 'https://api.binance.com'),
  },

  // --- Recaudo: la llave (Bre-B) que se envía al comprador ---
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
    documentId: env('SIIGO_DOCUMENT_ID'),
    sellerId: env('SIIGO_SELLER_ID'),
  },

  // --- KYC (Didit) ---
  kyc: {
    apiKey: env('DIDIT_API_KEY'),
    workflowId: env('DIDIT_WORKFLOW_ID'),
    baseUrl: env('DIDIT_BASE_URL', 'https://verification.didit.me'),
  },
};

config.demoBinance = !config.binance.apiKey || !config.binance.apiSecret;
config.demoSiigo = !config.siigo.username || !config.siigo.accessKey;
config.demoKyc = !config.kyc.apiKey;
config.demoStore = !config.supabase.url || !config.supabase.serviceKey;

module.exports = config;
