'use strict';

// Configuración en caliente desde Supabase.
//
// Las llaves y ajustes viven en la tabla `app_config` (key/value) de Supabase,
// protegida con RLS (solo la service_role del servidor puede leerla).
// Cada handler llama a apply() al inicio: lee la tabla (con caché de 60 s)
// y superpone los valores sobre la configuración en memoria. Así puedes
// cambiar llaves desde el panel de Supabase sin hacer Redeploy en Vercel.
//
// Únicas variables que SÍ deben estar en Vercel (bootstrap):
//   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (y opcionalmente SESSION_SECRET).

const config = require('./config');

let cache = { at: 0, rows: null };

async function fetchRows() {
  const { url, serviceKey } = config.supabase;
  if (!url || !serviceKey) return null; // sin Supabase no hay nada que superponer
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const rows = [];

  // 1) Tabla app_config (opcional, valores simples)
  try {
    const res = await fetch(`${url}/rest/v1/app_config?select=key,value`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) rows.push(...(await res.json()));
  } catch {}

  // 2) Supabase VAULT (recomendado: secretos cifrados en reposo).
  //    Se lee vía la función RPC get_app_secrets (ver DEPLOY.md); si hay
  //    un secreto con el mismo nombre en Vault y en la tabla, gana Vault.
  try {
    const res = await fetch(`${url}/rest/v1/rpc/get_app_secrets`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      for (const r of await res.json()) rows.push({ key: r.name, value: r.secret });
    }
  } catch {}

  return rows.length ? rows : null;
}

function overlay(rows) {
  if (!rows || !rows.length) return;
  const m = {};
  for (const r of rows) m[String(r.key).trim().toUpperCase()] = String(r.value ?? '').trim();
  const set = (k, fn) => { if (m[k]) fn(m[k]); };

  set('BINANCE_API_KEY', (v) => (config.binance.apiKey = v));
  set('BINANCE_API_SECRET', (v) => (config.binance.apiSecret = v));

  set('SIIGO_USERNAME', (v) => (config.siigo.username = v));
  set('SIIGO_ACCESS_KEY', (v) => (config.siigo.accessKey = v));
  set('SIIGO_PARTNER_ID', (v) => (config.siigo.partnerId = v));
  set('SIIGO_DOCUMENT_ID', (v) => (config.siigo.documentId = v));
  set('SIIGO_SELLER_ID', (v) => (config.siigo.sellerId = v));

  set('DIDIT_API_KEY', (v) => (config.kyc.apiKey = v));
  set('DIDIT_WORKFLOW_ID', (v) => (config.kyc.workflowId = v));

  set('BREB_KEY', (v) => (config.payment.breBKey = v));
  set('BREB_BANK', (v) => (config.payment.breBBank = v));
  set('ACCOUNT_HOLDER', (v) => (config.payment.accountHolder = v));

  set('ADMIN_EMAIL', (v) => (config.adminEmail = v));
  set('ADMIN_PASSWORD', (v) => (config.adminPassword = v));
  set('ADMIN_PASSWORD_SHA256', (v) => (config.adminPasswordSha256 = v));

  // Recalcular modos demo con los valores efectivos
  config.demoBinance = !config.binance.apiKey || !config.binance.apiSecret;
  config.demoSiigo = !config.siigo.username || !config.siigo.accessKey;
  config.demoKyc = !config.kyc.apiKey;
}

async function apply() {
  try {
    if (Date.now() - cache.at > 60000) {
      cache = { at: Date.now(), rows: await fetchRows() };
    }
    overlay(cache.rows);
  } catch {
    // Si Supabase no responde, se sigue con las variables de entorno.
  }
}

module.exports = { apply };
