'use strict';

// Anuncios P2P persistidos en Supabase (clave especial del store).
// En modo real, al guardar/activar también se sincronizan con Binance vía la
// API de comerciante (cuando la cuenta tenga ese acceso habilitado).

const store = require('./store');

const KEY = '_ads';

// Espejo de los anuncios reales de la cuenta (portal de Binance, todos
// desconectados). Binance no expone un endpoint público para leerlos, así que
// se cargan aquí una vez y se editan desde la plataforma; cuando llegue la API
// de comerciante, esta lista se sincronizará automáticamente.
const SEED_VERSION = 3;

// Anuncio de COMPRA USDT/COP creado en la plataforma para completar la pareja
// del bot de precios (venta + compra conectadas por el margen). Aún no existe
// en Binance: cuando lo publiques allá, edita aquí lo que cambie.
const BOT_BUY_USDT = {
  id: 'bot-buy-usdt-cop',
  type: 'BUY', asset: 'USDT', fiat: 'COP', pair: 'USDT/COP',
  priceType: 'FIXED', price: 3316, floatMargin: 100, // ≈ 0,7% debajo de la venta
  amount: 0, minLimit: 1000000, maxLimit: 80000000,
  methods: ['Nequi', 'Bancolombia S.A'],
  payTime: 15,
  terms: 'Pago solo a cuenta del titular verificado.',
  autoReply: '',
  status: 'offline',
  botManaged: true,
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
};

const SEED = [
  {
    id: 'real-sell-usdt-cop',
    type: 'SELL', asset: 'USDT', fiat: 'COP', pair: 'USDT/COP',
    priceType: 'FIXED', price: 3339, floatMargin: 100,
    amount: 0, minLimit: 100000, maxLimit: 5000000,
    methods: ['Bancolombia S.A'],
    payTime: 15,
    terms: 'No acepto pagos de terceros ni por corresponsal.',
    autoReply: '',
    status: 'offline', // online | offline | private
    botManaged: true,
    created: '2026-01-15T12:00:00Z',
    updated: new Date().toISOString(),
  },
  {
    id: 'real-buy-sol-cop',
    type: 'BUY', asset: 'SOL', fiat: 'COP', pair: 'SOL/COP',
    priceType: 'FLOATING', price: 330262.06, floatMargin: 93, // -7,00 %
    amount: 0, minLimit: 1000000, maxLimit: 80000000,
    methods: ['Nequi', 'Bancolombia S.A'],
    payTime: 15,
    terms: 'Pago solo a cuenta del titular verificado.',
    autoReply: '',
    status: 'offline',
    botManaged: false,
    created: '2026-01-15T12:00:00Z',
    updated: new Date().toISOString(),
  },
  {
    id: 'real-buy-usdc-cop',
    type: 'BUY', asset: 'USDC', fiat: 'COP', pair: 'USDC/COP',
    priceType: 'FLOATING', price: 2925.83, floatMargin: 92, // -8 %
    amount: 0, minLimit: 1000000, maxLimit: 80000000,
    methods: ['Nequi', 'Bancolombia S.A'],
    payTime: 15,
    terms: 'Pago solo a cuenta del titular verificado.',
    autoReply: '',
    status: 'offline',
    botManaged: false,
    created: '2026-01-15T12:00:00Z',
    updated: new Date().toISOString(),
  },
  {
    id: 'real-buy-eth-cop',
    type: 'BUY', asset: 'ETH', fiat: 'COP', pair: 'ETH/COP',
    priceType: 'FIXED', price: 7596121.19, floatMargin: 100,
    amount: 0, minLimit: 1000000, maxLimit: 80000000,
    methods: ['DAVIbank', 'Daviplata', 'Nequi'],
    payTime: 15,
    terms: 'Pago solo a cuenta del titular verificado.',
    autoReply: '',
    status: 'offline',
    botManaged: false,
    created: '2026-01-15T12:00:00Z',
    updated: new Date().toISOString(),
  },
  {
    id: 'real-buy-bnb-cop',
    type: 'BUY', asset: 'BNB', fiat: 'COP', pair: 'BNB/COP',
    priceType: 'FIXED', price: 2218761.13, floatMargin: 100,
    amount: 0, minLimit: 1000000, maxLimit: 80000000,
    methods: ['Nequi', 'Bancolombia S.A'],
    payTime: 15,
    terms: 'Pago solo a cuenta del titular verificado.',
    autoReply: '',
    status: 'offline',
    botManaged: false,
    created: '2026-01-15T12:00:00Z',
    updated: new Date().toISOString(),
  },
  BOT_BUY_USDT,
];

async function getState() {
  const st = await store.getState(KEY);
  // Solo se reemplaza la lista mientras siga siendo la semilla sin editar:
  // si el usuario ya editó algún anuncio (updatedByUser), se respeta lo suyo.
  const edited = st.userEdited || (Array.isArray(st.ads) && st.ads.some((a) => a.updatedByUser));
  if (!Array.isArray(st.ads) || (st.ads.length === 0 && !st.userEdited) || (!edited && (st.seedVersion || 1) < SEED_VERSION)) {
    st.ads = SEED;
    st.seedVersion = SEED_VERSION;
    await store.setState(KEY, st);
  } else if ((st.seedVersion || 1) < SEED_VERSION) {
    // Estado ya editado por el usuario: no se pisa nada, solo se AGREGA el
    // anuncio de compra USDT si no existe (la pareja que necesita el bot).
    if (!st.ads.some((a) => a.type === 'BUY' && a.asset === 'USDT' && a.fiat === 'COP')) {
      st.ads.push({ ...BOT_BUY_USDT });
    }
    st.seedVersion = SEED_VERSION;
    await store.setState(KEY, st);
  }
  return st;
}

async function saveState(st) {
  await store.setState(KEY, st);
}

module.exports = { getState, saveState };
