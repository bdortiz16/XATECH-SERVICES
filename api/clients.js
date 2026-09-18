'use strict';
// Registro de clientes (recolección del bot/KYC): nombre, cédula, correo,
// llave Bre-B y banco. Persistido en Supabase (clave especial del store).
const { requireSession } = require('../lib/auth');
const store = require('../lib/store');

const KEY = '_registro_clientes';

module.exports = async (req, res) => {
  if (!requireSession(req, res)) return;
  try {
    const st = await store.getState(KEY);
    if (!Array.isArray(st.clients)) st.clients = [];

    if (req.method === 'GET') return res.status(200).json({ clients: st.clients });

    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.action === 'delete') {
        st.clients = st.clients.filter((c) => c.id !== b.id);
      } else {
        const c = b.client || {};
        if (!c.nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
        if (c.id) {
          const i = st.clients.findIndex((x) => x.id === c.id);
          if (i >= 0) st.clients[i] = { ...st.clients[i], ...c };
        } else {
          st.clients.unshift({
            id: String(Date.now()),
            nombre: c.nombre.trim(),
            cedula: (c.cedula || '').trim(),
            correo: (c.correo || '').trim(),
            llave: (c.llave || '').trim(),
            banco: (c.banco || '').trim(),
            origen: (c.origen || 'manual').trim(),
            createdAt: new Date().toISOString(),
          });
        }
      }
      await store.setState(KEY, st);
      return res.status(200).json({ clients: st.clients });
    }

    res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
