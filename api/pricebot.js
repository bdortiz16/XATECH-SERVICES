'use strict';
// Configuración y ejecución manual del bot de precios.
const { requireSession } = require('../lib/auth');
const bot = require('../lib/pricebot');

module.exports = async (req, res) => {
  if (!requireSession(req, res)) return;
  try {
    if (req.method === 'GET') {
      const st = await bot.getState();
      return res.status(200).json({ cfg: st.cfg, lastRun: st.lastRun || null });
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.action === 'run') {
        const r = await bot.run();
        if (!r.ok) return res.status(400).json({ error: r.error });
        return res.status(200).json(r);
      }
      const st = await bot.getState();
      st.cfg = { ...st.cfg, ...b.cfg };
      st.cfg.marginPct = Math.max(0, Number(st.cfg.marginPct) || 0);
      st.cfg.stepCop = Math.max(0.01, Number(st.cfg.stepCop) || 1);
      await bot.saveState(st);
      return res.status(200).json({ cfg: st.cfg, lastRun: st.lastRun || null });
    }
    res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
