'use strict';
const config = require('../lib/config');
const { passwordOk, sessionCookie } = require('../lib/auth');

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const { email, password } = req.body || {};
  if (email?.toLowerCase() === config.adminEmail.toLowerCase() && passwordOk(password || '')) {
    res.setHeader('Set-Cookie', sessionCookie());
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
};
