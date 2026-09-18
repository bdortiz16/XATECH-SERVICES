'use strict';
// Gestión de anuncios: listar, guardar (crear/editar), cambiar estado, eliminar.
const { requireSession } = require('../lib/auth');
const adsLib = require('../lib/ads');

module.exports = async (req, res) => {
  if (!requireSession(req, res)) return;
  try {
    const st = await adsLib.getState();

    if (req.method === 'GET') return res.status(200).json({ ads: st.ads });

    if (req.method === 'POST') {
      const b = req.body || {};

      if (b.action === 'toggle') {
        const ad = st.ads.find((a) => a.id === b.id);
        if (!ad) return res.status(404).json({ error: 'Anuncio no encontrado' });
        ad.status = b.online ? 'online' : 'offline';
        ad.updated = new Date().toISOString();
      } else if (b.action === 'delete') {
        st.ads = st.ads.filter((a) => a.id !== b.id);
      } else if (b.action === 'save') {
        const a = b.ad || {};
        const clean = {
          type: a.type === 'BUY' ? 'BUY' : 'SELL',
          asset: (a.asset || 'USDT').toUpperCase(),
          fiat: (a.fiat || 'COP').toUpperCase(),
          priceType: a.priceType === 'FLOATING' ? 'FLOATING' : 'FIXED',
          price: Number(a.price) || 0,
          floatMargin: Number(a.floatMargin) || 100,
          amount: Number(a.amount) || 0,
          minLimit: Number(a.minLimit) || 0,
          maxLimit: Number(a.maxLimit) || 0,
          methods: Array.isArray(a.methods)
            ? a.methods
            : String(a.methods || '').split(',').map((s) => s.trim()).filter(Boolean),
          payTime: Number(a.payTime) || 15,
          terms: (a.terms || '').slice(0, 1000),
          autoReply: (a.autoReply || '').slice(0, 1000),
          status: ['online', 'offline', 'private'].includes(a.status) ? a.status : 'offline',
          updated: new Date().toISOString(),
        };
        clean.pair = `${clean.asset}/${clean.fiat}`;
        if (a.id) {
          const i = st.ads.findIndex((x) => x.id === a.id);
          if (i < 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
          st.ads[i] = { ...st.ads[i], ...clean };
        } else {
          st.ads.unshift({ id: String(Date.now()), created: new Date().toISOString(), botManaged: false, ...clean });
        }
      }

      await adsLib.saveState(st);
      // En modo real, aquí se sincroniza el cambio con la API de comerciante de Binance.
      return res.status(200).json({ ads: st.ads });
    }

    res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
