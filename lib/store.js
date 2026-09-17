'use strict';

// Estado local de cada orden (chat, KYC, verificación, factura) en SUPABASE.
//
// Tabla (crear una vez en el SQL Editor de Supabase — ver DEPLOY.md):
//   create table if not exists p2p_order_state (
//     order_number text primary key,
//     state jsonb not null,
//     updated_at timestamptz not null default now()
//   );
//
// Se accede con la service_role key SOLO desde estas funciones del servidor.
// Sin SUPABASE_URL la app usa memoria (demo; se reinicia con cada despliegue).

const config = require('./config');

const memory = new Map(); // fallback demo

function defaults() {
  return {
    chat: [],
    keySent: false,
    kyc: { status: 'none', link: null }, // none | pending | approved | rejected
    paymentVerified: false,
    markedPaid: false,
    released: false,
    invoice: null, // { id, number, createdAt, sentToChat }
  };
}

function sbHeaders() {
  return {
    apikey: config.supabase.serviceKey,
    Authorization: `Bearer ${config.supabase.serviceKey}`,
    'Content-Type': 'application/json',
  };
}

async function getState(orderNumber) {
  if (config.demoStore) {
    if (!memory.has(orderNumber)) memory.set(orderNumber, defaults());
    return memory.get(orderNumber);
  }
  const url = `${config.supabase.url}/rest/v1/${config.supabase.table}?order_number=eq.${encodeURIComponent(orderNumber)}&select=state`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows[0]?.state ? { ...defaults(), ...rows[0].state } : defaults();
}

// Estados de todas las órdenes de una vez (para el listado).
async function getAllStates() {
  const map = new Map();
  if (config.demoStore) {
    for (const [k, v] of memory) map.set(k, v);
    return map;
  }
  const url = `${config.supabase.url}/rest/v1/${config.supabase.table}?select=order_number,state`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  for (const row of await res.json()) map.set(row.order_number, { ...defaults(), ...row.state });
  return map;
}

async function setState(orderNumber, state) {
  if (config.demoStore) {
    memory.set(orderNumber, state);
    return;
  }
  const url = `${config.supabase.url}/rest/v1/${config.supabase.table}?on_conflict=order_number`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ order_number: orderNumber, state, updated_at: new Date().toISOString() }]),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

async function addChat(orderNumber, from, text, kind = 'text', state = null) {
  const st = state || (await getState(orderNumber));
  const msg = { from, text, kind, at: new Date().toISOString() };
  st.chat.push(msg);
  await setState(orderNumber, st);
  return { msg, state: st };
}

module.exports = { defaults, getState, getAllStates, setState, addChat };
