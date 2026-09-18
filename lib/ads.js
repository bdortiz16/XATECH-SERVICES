'use strict';

// Anuncios P2P persistidos en Supabase (clave especial del store).
// En modo real, al guardar/activar también se sincronizan con Binance vía la
// API de comerciante (cuando la cuenta tenga ese acceso habilitado).

const store = require('./store');

const KEY = '_ads';

const SEED = [
  {
    id: '13825952134009303040',
    type: 'SELL', asset: 'USDT', fiat: 'COP', pair: 'USDT/COP',
    priceType: 'FIXED', price: 4180, floatMargin: 100,
    amount: 1450, minLimit: 100000, maxLimit: 5000000,
    methods: ['Bre-B (llave)', 'Bancolombia S.A'],
    payTime: 15,
    terms: 'hola no acepto pagos de tercero ni corresponsal',
    autoReply: '',
    status: 'offline', // online | offline | private
    botManaged: true,
    created: '2025-11-23T11:45:38Z',
    updated: new Date().toISOString(),
  },
  {
    id: '13825952134009303041',
    type: 'BUY', asset: 'USDT', fiat: 'COP', pair: 'USDT/COP',
    priceType: 'FIXED', price: 4150, floatMargin: 100,
    amount: 500, minLimit: 1000000, maxLimit: 80000000,
    methods: ['Nequi', 'Bancolombia S.A'],
    payTime: 15,
    terms: 'hola no acepto pagos de tercero ni corresponsal',
    autoReply: '',
    status: 'offline',
    botManaged: true,
    created: '2025-11-22T10:32:11Z',
    updated: new Date().toISOString(),
  },
  {
    id: '12825571264454512640',
    type: 'BUY', asset: 'SOL', fiat: 'COP', pair: 'SOL/COP',
    priceType: 'FLOATING', price: 298703.71, floatMargin: 93,
    amount: 200, minLimit: 1000000, maxLimit: 80000000,
    methods: ['Nequi', 'Bancolombia S.A'],
    payTime: 15,
    terms: 'hola no acepto pagos de tercero ni corresponsal',
    autoReply: '',
    status: 'offline',
    botManaged: false,
    created: '2025-11-22T10:32:11Z',
    updated: '2026-02-02T22:23:04Z',
  },
];

async function getState() {
  const st = await store.getState(KEY);
  if (!Array.isArray(st.ads) || st.ads.length === 0) {
    st.ads = SEED;
    await store.setState(KEY, st);
  }
  return st;
}

async function saveState(st) {
  await store.setState(KEY, st);
}

module.exports = { getState, saveState };
