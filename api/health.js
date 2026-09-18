'use strict';

// Diagnóstico de conexiones: abre /api/health en el navegador.
// No expone ningún secreto: solo dice qué está conectado y qué falta.

const config = require('../lib/config');
const rc = require('../lib/runtime-config');

module.exports = async (req, res) => {
  const out = { hora: new Date().toISOString() };

  // 1. ¿Vercel tiene las credenciales de Supabase?
  out.vercel_supabase_url = config.supabase.url ? 'configurada ✔' : 'FALTA (Vercel → SUPABASE_URL)';
  out.vercel_service_role = config.supabase.serviceKey ? 'configurada ✔' : 'FALTA (Vercel → SUPABASE_SERVICE_ROLE_KEY)';

  // Detectar si la llave es realmente service_role o la anon (error común)
  if (config.supabase.serviceKey) {
    try {
      const k = config.supabase.serviceKey;
      if (k.startsWith('sb_secret_')) out.tipo_de_llave_supabase = 'secret ✔';
      else if (k.startsWith('sb_publishable_')) out.tipo_de_llave_supabase = '❌ ES LA PUBLishABLE — usa una Secret key';
      else {
        const payload = JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString());
        out.tipo_de_llave_supabase =
          payload.role === 'service_role'
            ? 'service_role ✔'
            : `❌ ES LA "${payload.role}" — copia la service_role (secret) en Supabase → Settings → API`;
      }
    } catch {
      out.tipo_de_llave_supabase = 'no se pudo identificar';
    }
  }

  // 2. ¿Se puede leer la tabla app_config de Supabase?
  if (config.supabase.url && config.supabase.serviceKey) {
    try {
      const r = await fetch(`${config.supabase.url}/rest/v1/app_config?select=key`, {
        headers: {
          apikey: config.supabase.serviceKey,
          Authorization: `Bearer ${config.supabase.serviceKey}`,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const rows = await r.json();
        out.supabase = 'conectada ✔';
        out.app_config_llaves_encontradas = rows.map((x) => x.key).sort();
      } else {
        out.supabase = `error ${r.status}: ${(await r.text()).slice(0, 140)} — ¿corriste el SQL de la tabla app_config?`;
      }
      // Vault (secretos cifrados) vía RPC get_app_secrets
      const v = await fetch(`${config.supabase.url}/rest/v1/rpc/get_app_secrets`, {
        method: 'POST',
        headers: {
          apikey: config.supabase.serviceKey,
          Authorization: `Bearer ${config.supabase.serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        signal: AbortSignal.timeout(8000),
      });
      if (v.ok) {
        const rows = await v.json();
        out.vault = 'conectado ✔ (secretos cifrados)';
        out.vault_secretos_encontrados = rows.map((x) => x.name).sort();
      } else {
        out.vault = `no disponible (${v.status}) — ¿corriste el SQL de get_app_secrets? (DEPLOY.md)`;
      }
    } catch (e) {
      out.supabase = `sin conexión: ${e.message}`;
    }
  } else {
    out.supabase = 'sin credenciales en Vercel';
  }

  // 3. Aplicar la configuración de Supabase y probar Binance
  await rc.apply();
  out.binance_llaves = config.demoBinance ? 'no encontradas (modo demo)' : 'encontradas ✔';
  if (!config.demoBinance) {
    try {
      const crypto = require('crypto');
      const q = new URLSearchParams({ timestamp: Date.now(), recvWindow: 10000 });
      q.set('signature', crypto.createHmac('sha256', config.binance.apiSecret).update(q.toString()).digest('hex'));
      const r = await fetch(`${config.binance.baseUrl}/api/v3/account?${q}`, {
        headers: { 'X-MBX-APIKEY': config.binance.apiKey },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) out.binance_conexion = 'CONECTADA ✔ — llaves válidas';
      else out.binance_conexion = `rechazada (${r.status}): ${(await r.text()).slice(0, 160)}`;
    } catch (e) {
      out.binance_conexion = `sin conexión: ${e.message}`;
    }
  }

  out.siigo = config.demoSiigo ? 'modo demo (sin llaves)' : 'llaves encontradas ✔';
  out.didit_kyc = config.demoKyc ? 'modo demo (sin llaves)' : 'llaves encontradas ✔';

  res.status(200).json(out);
};
