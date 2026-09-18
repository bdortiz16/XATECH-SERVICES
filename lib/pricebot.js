'use strict';

// Bot de precios P2P.
//
// NORMAS DEL BOT (el margen manda):
// 1. El anuncio de VENTA y el de COMPRA quedan conectados: entre ellos siempre
//    se respeta el margen configurado manualmente (ej. 0,7%):
//       precio_venta >= precio_compra × (1 + margen)
// 2. Para competir, el bot coloca la venta justo por debajo del mejor
//    vendedor del mercado y la compra justo por encima del mejor comprador
//    (paso configurable en COP).
// 3. Si el mercado comprime el margen por debajo del configurado, se
//    prioriza el margen: se ancla el lado elegido (venta o compra) y el otro
//    se recalcula — el bot nunca rompe el margen para perseguir el mercado.
// 4. Topes de seguridad: nunca vender por debajo de "precio mínimo de venta"
//    ni comprar por encima de "precio máximo de compra".
//
// Mercado: intenta leer los mejores precios reales del libro público de
// Binance P2P; si no hay acceso, simula un mercado de referencia (demo).
// Aplicar el precio EN Binance requiere la API de comerciante verificado;
// mientras tanto el bot calcula y actualiza los anuncios de la plataforma.

const store = require('./store');
const adsLib = require('./ads');

const KEY = '_pricebot';

function defaultCfg() {
  return {
    enabled: false,
    asset: 'USDT',
    fiat: 'COP',
    sellAdId: null,
    buyAdId: null,
    marginPct: 0.7, // margen manual entre compra y venta (%)
    stepCop: 1, // paso para competir (COP)
    minSell: null, // tope: nunca vender por debajo
    maxBuy: null, // tope: nunca comprar por encima
    anchor: 'sell', // lado que manda si el mercado comprime el margen
  };
}

async function getState() {
  const st = await store.getState(KEY);
  if (!st.cfg) st.cfg = defaultCfg();
  st.cfg = { ...defaultCfg(), ...st.cfg };
  // Auto-conexión: si aún no hay anuncios elegidos, tomar la pareja del
  // activo configurado (preferir los marcados como gestionados por el bot).
  if (!st.cfg.sellAdId || !st.cfg.buyAdId) {
    try {
      const adsSt = await adsLib.getState();
      const pick = (type) => {
        const same = adsSt.ads.filter(
          (a) => a.type === type && a.asset === st.cfg.asset && a.fiat === st.cfg.fiat
        );
        return same.find((a) => a.botManaged) || same[0] || null;
      };
      if (!st.cfg.sellAdId) st.cfg.sellAdId = (pick('SELL') || {}).id || null;
      if (!st.cfg.buyAdId) st.cfg.buyAdId = (pick('BUY') || {}).id || null;
      if (st.cfg.sellAdId && st.cfg.buyAdId) await saveState(st);
    } catch {
      /* sin anuncios todavía: se configura desde la interfaz */
    }
  }
  return st;
}

async function saveState(st) {
  await store.setState(KEY, st);
}

// Mejores precios del mercado (libro público de Binance P2P).
async function getMarket(asset, fiat) {
  const search = async (tradeType) => {
    const res = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 1, rows: 3, asset, fiat, tradeType, payTypes: [], publisherType: null }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`p2p search ${res.status}`);
    const data = await res.json();
    const price = Number(data?.data?.[0]?.adv?.price);
    if (!isFinite(price) || price <= 0) throw new Error('sin precios');
    return price;
  };
  try {
    // tradeType=SELL → anuncios donde los comerciantes VENDEN (el mejor = más barato)
    // tradeType=BUY  → anuncios donde COMPRAN (el mejor = más caro)
    const [bestSell, bestBuy] = await Promise.all([search('SELL'), search('BUY')]);
    return { bestSell, bestBuy, source: 'binance-p2p' };
  } catch {
    const base = 4170 * (1 + (Math.random() - 0.5) * 0.004);
    return {
      bestSell: Math.round(base * 1.004 * 100) / 100,
      bestBuy: Math.round(base * 0.996 * 100) / 100,
      source: 'demo',
    };
  }
}

const r2 = (n) => Math.round(n * 100) / 100;

// Un tick del bot: lee mercado, aplica las normas y actualiza los anuncios.
async function run() {
  const st = await getState();
  const cfg = st.cfg;
  const notes = [];

  if (!cfg.sellAdId || !cfg.buyAdId) {
    return { ok: false, error: 'Configura el anuncio de venta y el de compra en el bot' };
  }

  const adsSt = await adsLib.getState();
  const sellAd = adsSt.ads.find((a) => a.id === cfg.sellAdId);
  const buyAd = adsSt.ads.find((a) => a.id === cfg.buyAdId);
  if (!sellAd || !buyAd) return { ok: false, error: 'Los anuncios del bot ya no existen' };

  const market = await getMarket(cfg.asset, cfg.fiat);
  const m = cfg.marginPct / 100;
  const step = Number(cfg.stepCop) || 1;

  // Norma 2: competir contra los mejores del mercado
  let sell = market.bestSell - step;
  let buy = market.bestBuy + step;

  // Norma 1 y 3: el margen manda; si el mercado lo comprime, anclar un lado
  if (sell < buy * (1 + m)) {
    if (cfg.anchor === 'sell') {
      buy = sell / (1 + m);
      notes.push('Mercado comprimido: se ancló la VENTA y se recalculó la compra para respetar el margen');
    } else {
      sell = buy * (1 + m);
      notes.push('Mercado comprimido: se ancló la COMPRA y se recalculó la venta para respetar el margen');
    }
  }

  // Norma 4: topes de seguridad
  if (cfg.minSell && sell < Number(cfg.minSell)) {
    sell = Number(cfg.minSell);
    notes.push(`Venta ajustada al mínimo configurado ($${sell})`);
  }
  if (cfg.maxBuy && buy > Number(cfg.maxBuy)) {
    buy = Number(cfg.maxBuy);
    notes.push(`Compra ajustada al máximo configurado ($${buy})`);
  }

  sell = r2(sell);
  buy = r2(buy);
  const marginReal = r2(((sell - buy) / buy) * 100);
  if (marginReal < cfg.marginPct - 0.01)
    notes.push(`⚠ Los topes dejaron el margen real en ${marginReal}% (configurado: ${cfg.marginPct}%)`);

  // Actualizar los anuncios de la plataforma
  const now = new Date().toISOString();
  sellAd.price = sell; sellAd.priceType = 'FIXED'; sellAd.updated = now; sellAd.botManaged = true;
  buyAd.price = buy; buyAd.priceType = 'FIXED'; buyAd.updated = now; buyAd.botManaged = true;
  await adsLib.saveState(adsSt);
  // En modo real, aquí se llama además a la API de comerciante de Binance
  // para actualizar el precio de ambos anuncios publicados.

  st.lastRun = {
    at: now,
    market,
    sell,
    buy,
    marginReal,
    notes,
  };
  await saveState(st);
  return { ok: true, lastRun: st.lastRun };
}

module.exports = { getState, saveState, run, defaultCfg };
