'use strict';
// Configuración del bot de atención al cliente.
const { requireSession } = require('../lib/auth');
const chatbot = require('../lib/chatbot');

module.exports = async (req, res) => {
  if (!requireSession(req, res)) return;
  try {
    if (req.method === 'GET') {
      const cfg = await chatbot.getCfg();
      return res.status(200).json({ enabled: cfg.enabled });
    }
    if (req.method === 'POST') {
      const cfg = await chatbot.setCfg({ enabled: !!(req.body || {}).enabled });
      return res.status(200).json({ enabled: cfg.enabled });
    }
    res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
