'use strict';
// Tick automático del bot (Vercel Cron). Protegido con CRON_SECRET si está definido.
const bot = require('../lib/pricebot');

module.exports = async (req, res) => {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (secret && req.headers.authorization !== `Bearer ${secret}`)
    return res.status(401).json({ error: 'No autorizado' });
  try {
    const st = await bot.getState();
    if (!st.cfg.enabled) return res.status(200).json({ skipped: 'bot desactivado' });
    const r = await bot.run();
    return res.status(r.ok ? 200 : 400).json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
