'use strict';
// Resultado del KYC de Didit (configurar la URL del webhook en Didit:
// https://<tu-proyecto>.vercel.app/api/webhooks/didit).
const store = require('../../lib/store');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const body = req.body || {};
  const orderNumber = body.vendor_data;
  if (orderNumber) {
    const st = await store.getState(orderNumber);
    const s = (body.status || '').toLowerCase();
    if (s.includes('approv')) st.kyc.status = 'approved';
    else if (s.includes('declin') || s.includes('reject')) st.kyc.status = 'rejected';
    await store.setState(orderNumber, st);
  }
  res.status(200).json({ ok: true });
};
