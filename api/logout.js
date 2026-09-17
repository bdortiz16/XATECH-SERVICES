'use strict';
const { clearCookie } = require('../lib/auth');

module.exports = (req, res) => {
  res.setHeader('Set-Cookie', clearCookie());
  res.status(200).json({ ok: true });
};
