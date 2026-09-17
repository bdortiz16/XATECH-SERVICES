'use strict';

// XATECH P2P — frontend del módulo de órdenes.

let ME = null;
let ORDERS = [];
let TAB = 'activas';
let SELECTED = null;

const $ = (s) => document.querySelector(s);
const fmt = (n) => Number(n).toLocaleString('es-CO');
const timeAgo = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
};

const STAGE_LABEL = {
  PENDIENTE_PAGO: 'Pendiente de pago',
  VERIFICAR_PAGO: 'Verificar pago',
  LISTA_PARA_LIBERAR: 'Lista para liberar',
  REQUIERE_KYC: 'Requiere KYC',
  LISTA_PARA_PAGAR: 'Lista para pagar',
  COMPLETADA: 'Completada',
  FACTURADA: 'Facturada',
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { location.href = '/plataforma/'; throw new Error('sesión'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function toast(text, isErr = false) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

// ---------- Carga ----------

async function boot() {
  ME = await api('/api/me');
  const demo = ME.demo;
  $('#modeBadge').textContent = demo.binance ? 'modo demo' : 'binance conectado';
  await refresh();
}

async function refresh() {
  const data = await api('/api/orders');
  ORDERS = data.orders;
  renderStats();
  renderTable();
  if (SELECTED) {
    const cur = ORDERS.find((o) => o.orderNumber === SELECTED);
    if (cur) renderDetail(cur);
  }
}

// ---------- Render ----------

function inTab(o) {
  const active = ['PENDIENTE_PAGO', 'REQUIERE_KYC', 'LISTA_PARA_PAGAR'];
  const verify = ['VERIFICAR_PAGO', 'LISTA_PARA_LIBERAR'];
  if (TAB === 'activas') return active.includes(o.stage);
  if (TAB === 'verificar') return verify.includes(o.stage);
  if (TAB === 'completadas') return ['COMPLETADA', 'FACTURADA'].includes(o.stage);
  return true;
}

function renderStats() {
  const act = ORDERS.filter((o) => !['COMPLETADA', 'FACTURADA'].includes(o.stage)).length;
  const ver = ORDERS.filter((o) => ['VERIFICAR_PAGO', 'LISTA_PARA_LIBERAR'].includes(o.stage)).length;
  const done = ORDERS.filter((o) => ['COMPLETADA', 'FACTURADA'].includes(o.stage)).length;
  const vol = ORDERS.reduce((s, o) => s + o.totalPrice, 0);
  $('#stats').innerHTML = `
    <div class="stat"><strong>${act}</strong><span>órdenes activas</span></div>
    <div class="stat"><strong>${ver}</strong><span>por verificar / liberar</span></div>
    <div class="stat"><strong>${done}</strong><span>completadas</span></div>
    <div class="stat"><strong>$${fmt(vol)}</strong><span>volumen COP</span></div>`;
}

function renderTable() {
  const rows = ORDERS.filter(inTab);
  $('#emptyMsg').hidden = rows.length > 0;
  $('#ordersBody').innerHTML = rows
    .map(
      (o) => `
    <tr data-no="${o.orderNumber}" class="${o.orderNumber === SELECTED ? 'sel' : ''}">
      <td class="mono">${o.orderNumber}<br><span style="color:var(--muted)">${timeAgo(o.createdAt)}</span></td>
      <td><span class="side ${o.tradeType}">${o.tradeType === 'SELL' ? 'VENTA' : 'COMPRA'}</span></td>
      <td>${o.amount} ${o.asset}</td>
      <td class="mono">$${fmt(o.price)}</td>
      <td class="mono"><strong>$${fmt(o.totalPrice)}</strong></td>
      <td>${o.counterparty.nickname}${o.counterparty.isNew ? '<span class="badge-new">NUEVO</span>' : ''}</td>
      <td><span class="pill st-${o.stage}">${STAGE_LABEL[o.stage]}</span></td>
    </tr>`
    )
    .join('');
  document.querySelectorAll('#ordersBody tr').forEach((tr) =>
    tr.addEventListener('click', () => selectOrder(tr.dataset.no))
  );
}

function selectOrder(no) {
  SELECTED = no;
  renderTable();
  const o = ORDERS.find((x) => x.orderNumber === no);
  if (o) renderDetail(o);
}

function flowSteps(o) {
  const L = o.local;
  const sell = o.tradeType === 'SELL';
  const steps = sell
    ? [
        ['Llave enviada al comprador', L.keySent],
        ['Comprador marcó pagado', o.binanceStatus !== 'PENDING_PAYMENT' || L.paymentVerified],
        ['Pago verificado en cuenta', L.paymentVerified],
        ['Cripto liberada', L.released || o.binanceStatus === 'COMPLETED'],
        ['Factura Siigo generada', !!L.invoice],
        ['Factura enviada al chat', !!L.invoice?.sentToChat],
      ]
    : [
        ['KYC aprobado (si es nuevo)', !o.counterparty.isNew || L.kyc.status === 'approved'],
        ['Pago SOLO a datos del perfil Binance', L.markedPaid],
        ['Marcada como pagada', L.markedPaid],
        ['Cripto recibida', L.markedPaid || o.binanceStatus === 'COMPLETED'],
        ['Factura Siigo generada', !!L.invoice],
        ['Factura enviada al chat', !!L.invoice?.sentToChat],
      ];
  let nowSet = false;
  return steps
    .map(([label, done], i) => {
      let cls = done ? 'done' : '';
      if (!done && !nowSet) { cls = 'now'; nowSet = true; }
      return `<div class="flow-step ${cls}"><span class="dot">${done ? '✔' : i + 1}</span>${label}</div>`;
    })
    .join('');
}

function actionButtons(o) {
  const L = o.local;
  const b = [];
  if (o.tradeType === 'SELL') {
    if (!['COMPLETADA', 'FACTURADA'].includes(o.stage)) {
      b.push(`<button class="btn btn-primary" data-act="send-key">🔑 Enviar llave de pago (Bre-B)</button>`);
      b.push(
        `<button class="btn btn-teal" data-act="verify-payment" ${L.paymentVerified ? 'disabled' : ''}>🏦 Confirmar que el dinero llegó</button>`
      );
      b.push(
        `<button class="btn btn-green" data-act="release" ${L.paymentVerified && !L.released ? '' : 'disabled'}>🔓 Liberar cripto</button>`
      );
    }
  } else {
    if (o.counterparty.isNew && L.kyc.status !== 'approved') {
      b.push(`<button class="btn btn-primary" data-act="kyc" ${L.kyc.status === 'pending' ? 'disabled' : ''}>🪪 ${L.kyc.status === 'pending' ? 'KYC en curso...' : 'Enviar KYC (Didit)'}</button>`);
      if (L.kyc.status === 'pending')
        b.push(`<button class="btn btn-outline" data-act="kyc-approve">✅ Marcar KYC aprobado (resultado manual)</button>`);
    }
    if (!['COMPLETADA', 'FACTURADA'].includes(o.stage)) {
      b.push(
        `<button class="btn btn-green" data-act="mark-paid" ${o.stage === 'LISTA_PARA_PAGAR' && !L.markedPaid ? '' : 'disabled'}>💸 Ya pagué — marcar como pagado</button>`
      );
    }
  }
  if (['COMPLETADA', 'FACTURADA'].includes(o.stage)) {
    if (!L.invoice) b.push(`<button class="btn btn-primary" data-act="invoice">🧾 Generar factura en Siigo</button>`);
    else if (!L.invoice.sentToChat)
      b.push(`<button class="btn btn-teal" data-act="invoice-send">📨 Enviar factura ${L.invoice.number} al chat</button>`);
    else b.push(`<button class="btn btn-outline" disabled>Factura ${L.invoice.number} enviada ✔</button>`);
  }
  return b.join('');
}

function renderDetail(o) {
  const L = o.local;
  const sell = o.tradeType === 'SELL';
  const payBox = sell
    ? `<div class="box">
        <h3>recaudo — nuestra llave</h3>
        <p>El comprador paga a nuestra llave Bre-B. <span class="warn">Nunca liberar sin confirmar el dinero en cuenta.</span></p>
        <div class="kv" style="margin-top:.4rem">
          <dt>llave</dt><dd class="mono">${ME.payment.breBKey}</dd>
          <dt>banco</dt><dd>${ME.payment.breBBank}</dd>
          <dt>titular</dt><dd>${ME.payment.accountHolder}</dd>
        </div>
      </div>`
    : `<div class="box">
        <h3>pago — datos del perfil binance</h3>
        <p class="warn">Pagar ÚNICAMENTE a los datos registrados en el perfil de Binance de la contraparte. Si pide otra cuenta: no pagar y apelar.</p>
        ${
          o.payMethod
            ? `<div class="kv" style="margin-top:.4rem">
                <dt>método</dt><dd>${o.payMethod.type}</dd>
                <dt>llave</dt><dd class="mono">${o.payMethod.key}</dd>
                <dt>banco</dt><dd>${o.payMethod.bank}</dd>
                <dt>titular</dt><dd>${o.payMethod.holder}</dd>
              </div>`
            : '<p>Método de pago visible en el detalle de la orden en Binance.</p>'
        }
      </div>`;

  const kycStatus = { none: '—', pending: 'en curso ⏳', approved: 'aprobado ✅', rejected: 'rechazado ❌' }[L.kyc.status];

  $('#detailPanel').innerHTML = `
    <div class="d-head">
      <div>
        <h2>${sell ? 'VENTA' : 'COMPRA'} · ${o.amount} ${o.asset}</h2>
        <span class="mono">#${o.orderNumber} · ${timeAgo(o.createdAt)}</span>
      </div>
      <span class="pill st-${o.stage}">${STAGE_LABEL[o.stage]}</span>
    </div>

    <dl class="kv">
      <dt>precio</dt><dd class="mono">$${fmt(o.price)} ${o.fiat}/${o.asset}</dd>
      <dt>total</dt><dd class="mono"><strong>$${fmt(o.totalPrice)} ${o.fiat}</strong></dd>
      <dt>contraparte</dt><dd>${o.counterparty.nickname}${o.counterparty.isNew ? '<span class="badge-new">NUEVO</span>' : ''}</dd>
      <dt>órdenes</dt><dd>${o.counterparty.ordersCount ?? '—'} · ${o.counterparty.completionRate ?? '—'}% completadas</dd>
      <dt>kyc</dt><dd>${kycStatus}</dd>
    </dl>

    ${payBox}

    <div class="box"><h3>flujo de la orden</h3><div class="flow">${flowSteps(o)}</div></div>

    <div class="actions">${actionButtons(o)}</div>

    <div class="chat">
      <div class="chat-head">chat de la orden · ${o.counterparty.nickname}</div>
      <div class="chat-msgs" id="chatMsgs">
        ${L.chat.length === 0 ? '<span class="msg system">sin mensajes aún</span>' : ''}
        ${L.chat
          .map(
            (m) =>
              `<div class="msg ${m.from === 'me' ? 'me' : m.from === 'system' ? 'system' : 'them'}">${escapeHtml(m.text)}${
                m.from !== 'system' ? `<span class="t">${new Date(m.at).toLocaleTimeString('es-CO')}</span>` : ''
              }</div>`
          )
          .join('')}
      </div>
      <form class="chat-input" id="chatForm">
        <input id="chatText" placeholder="Escribir mensaje..." autocomplete="off">
        <button type="submit">➤</button>
      </form>
    </div>`;

  const msgs = $('#chatMsgs');
  msgs.scrollTop = msgs.scrollHeight;

  $('#chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#chatText').value.trim();
    if (!text) return;
    $('#chatText').value = '';
    await doAction(o, 'chat', { text });
  });

  document.querySelectorAll('[data-act]').forEach((btn) =>
    btn.addEventListener('click', () => runAction(o, btn.dataset.act))
  );
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Acciones ----------

async function doAction(o, action, body = {}) {
  try {
    await api(`/api/orders/${o.orderNumber}/${action}`, { method: 'POST', body });
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
}

function modal(html) {
  return new Promise((resolve) => {
    const back = $('#modalBack');
    $('#modalBox').innerHTML = html;
    back.hidden = false;
    $('#modalBox').addEventListener(
      'click',
      (e) => {
        if (e.target.dataset.r) {
          back.hidden = true;
          resolve(e.target.dataset.r === 'ok');
        }
      },
      { once: false }
    );
  });
}

async function runAction(o, act) {
  if (act === 'verify-payment') {
    const ok = await modal(`
      <h3>🏦 Verificación del pago</h3>
      <p>Orden <span class="mono">#${o.orderNumber}</span> por <strong>$${fmt(o.totalPrice)} ${o.fiat}</strong>.</p>
      <p>Entra a la cuenta bancaria y confirma que el dinero <strong>ya está acreditado</strong> (no solo el comprobante). Montos y remitente deben coincidir.</p>
      <label><input type="checkbox" id="ckBank"> Revisé la cuenta y el dinero llegó completo.</label>
      <div class="modal-actions">
        <button class="btn btn-outline" data-r="no">Cancelar</button>
        <button class="btn btn-teal" data-r="ok">Confirmar verificación</button>
      </div>`);
    if (ok) {
      if (!document.getElementById('ckBank')?.checked) return toast('Debes marcar la casilla de verificación', true);
      await doAction(o, 'verify-payment', { confirmed: true });
      toast('Pago verificado ✔');
    }
    return;
  }

  if (act === 'release') {
    const ok = await modal(`
      <h3>🔓 Liberar cripto</h3>
      <p>Vas a liberar <strong>${o.amount} ${o.asset}</strong> a <strong>${o.counterparty.nickname}</strong>.</p>
      <div class="highlight">Esta acción es irreversible. Solo continúa si el pago está verificado en la cuenta.</div>
      <div class="modal-actions">
        <button class="btn btn-outline" data-r="no">Cancelar</button>
        <button class="btn btn-green" data-r="ok">Liberar ahora</button>
      </div>`);
    if (ok) { await doAction(o, 'release'); toast('Cripto liberada ✔'); }
    return;
  }

  if (act === 'mark-paid') {
    const ok = await modal(`
      <h3>💸 Marcar como pagado</h3>
      <p>Confirma que pagaste <strong>$${fmt(o.totalPrice)} ${o.fiat}</strong> exactamente a los <strong>datos del perfil de Binance</strong> de ${o.counterparty.nickname}.</p>
      <label><input type="checkbox" id="ckProfile"> Pagué solo a los datos del perfil verificado.</label>
      <div class="modal-actions">
        <button class="btn btn-outline" data-r="no">Cancelar</button>
        <button class="btn btn-green" data-r="ok">Marcar pagado</button>
      </div>`);
    if (ok) {
      if (!document.getElementById('ckProfile')?.checked) return toast('Debes confirmar el destino del pago', true);
      await doAction(o, 'mark-paid');
    }
    return;
  }

  if (act === 'kyc-approve') return doAction(o, 'kyc-result', { status: 'approved' });
  if (act === 'send-key') { await doAction(o, 'send-key'); toast('Llave enviada al chat 🔑'); return; }
  if (act === 'kyc') { await doAction(o, 'kyc'); toast('Enlace de KYC enviado al chat 🪪'); return; }
  if (act === 'invoice') { await doAction(o, 'invoice'); toast('Factura generada en Siigo 🧾'); return; }
  if (act === 'invoice-send') { await doAction(o, 'invoice-send'); toast('Factura enviada al chat 📨'); return; }
  return doAction(o, act);
}

// ---------- Eventos globales ----------

$('#tabs').addEventListener('click', (e) => {
  if (!e.target.dataset.tab) return;
  TAB = e.target.dataset.tab;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b === e.target));
  renderTable();
});

$('#btnRefresh').addEventListener('click', refresh);
$('#btnLogout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  location.href = '/plataforma/';
});

boot().catch((e) => toast(e.message, true));
setInterval(refresh, 30000); // refresco automático cada 30 s
