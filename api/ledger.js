'use strict';
// Utilidad diaria: cada día se registra capital inicial y final (COP);
// la utilidad se calcula como final - inicial. Persistido en Supabase.
const { requireSession } = require('../lib/auth');
const store = require('../lib/store');

const KEY = '_registro_caja';

module.exports = async (req, res) => {
  if (!requireSession(req, res)) return;
  try {
    const st = await store.getState(KEY);
    if (!Array.isArray(st.days)) st.days = [];

    if (req.method === 'GET') return res.status(200).json({ days: st.days });

    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.action === 'delete') {
        st.days = st.days.filter((d) => d.id !== b.id);
      } else {
        const inicial = Number(b.inicial);
        const final = Number(b.final);
        if (!b.fecha || !isFinite(inicial) || !isFinite(final) || inicial < 0)
          return res.status(400).json({ error: 'Fecha, capital inicial y final son obligatorios' });
        // Un registro por fecha: si ya existe, se reemplaza
        st.days = st.days.filter((d) => d.fecha !== b.fecha);
        st.days.push({
          id: String(Date.now()),
          fecha: b.fecha,
          inicial,
          final,
          utilidad: final - inicial,
          nota: (b.nota || '').trim(),
        });
        st.days.sort((a, c) => (a.fecha < c.fecha ? 1 : -1));
      }
      await store.setState(KEY, st);
      return res.status(200).json({ days: st.days });
    }

    res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
