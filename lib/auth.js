'use strict';

// Sesión con token HMAC en cookie httpOnly. Solo login — no hay registro.

const crypto = require('crypto');
const config = require('./config');

function makeToken() {
  const exp = Date.now() + config.sessionHours * 3600 * 1000;
  const payload = `${config.adminEmail}|${exp}`;
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('hex');
  return Buffer.from(`${payload}|${sig}`).toString('base64url');
}

function checkToken(token) {
  try {
    const [email, exp, sig] = Buffer.from(token, 'base64url').toString().split('|');
    const expect = crypto
      .createHmac('sha256', config.sessionSecret)
      .update(`${email}|${exp}`)
      .digest('hex');
    return (
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect)) && Number(exp) > Date.now()
    );
  } catch {
    return false;
  }
}

function hasSession(req) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim().split('=').map(decodeURIComponent))
      .filter((p) => p.length === 2)
  );
  return Boolean(cookies.xatech_session && checkToken(cookies.xatech_session));
}

// Devuelve true si hay sesión; si no, responde 401 y devuelve false.
function requireSession(req, res) {
  if (hasSession(req)) return true;
  res.status(401).json({ error: 'Sesión requerida' });
  return false;
}

function passwordOk(password) {
  if (config.adminPasswordSha256) {
    const h = crypto.createHash('sha256').update(password).digest('hex');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(h),
        Buffer.from(config.adminPasswordSha256.toLowerCase())
      );
    } catch {
      return false;
    }
  }
  return password === config.adminPassword;
}

function sessionCookie() {
  const secure = process.env.VERCEL ? ' Secure;' : '';
  return `xatech_session=${makeToken()}; HttpOnly;${secure} Path=/; SameSite=Lax; Max-Age=${config.sessionHours * 3600}`;
}

function clearCookie() {
  return 'xatech_session=; HttpOnly; Path=/; Max-Age=0';
}

module.exports = { hasSession, requireSession, passwordOk, sessionCookie, clearCookie };
