'use strict';

// XATECH P2P — panel de órdenes (diseño estilo exchange).

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
const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STAGE_LABEL = {
  PENDIENTE_PAGO: 'Pendiente de pago',
  VERIFICAR_PAGO: 'Verificar pago',
  LISTA_PARA_LIBERAR: 'Lista para liberar',
  REQUIERE_KYC: 'Requiere KYC',
  LISTA_PARA_PAGAR: 'Lista para pagar',
  COMPLETADA: 'Completada',
  FACTURADA: 'Facturada',
  EN_APELACION: 'En apelación',
  CANCELADA: 'Cancelada',
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

// ================== Arranque ==================

async function boot() {
  ME = await api('/api/me');
  $('#connStatus').textContent = ME.demo.binance ? 'Conectado · modo demo' : 'Conectado · Binance';
  renderAgenda();
  renderDepth(5);
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
  if (!document.querySelector('#viewOrden').hidden) renderOrden();
  if (!document.querySelector('#viewChat').hidden) renderChat();
}

// ================== Agenda ==================

function renderAgenda() {
  const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const DOW = ['l', 'm', 'm', 'j', 'v', 's', 'd'];
  const now = new Date();
  $('#agendaMonth').textContent = `${MES[now.getMonth()]} ${now.getFullYear()} ▾`;
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  let html = DOW.map((d) => `<span class="dow">${d}</span>`).join('');
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const today = d.toDateString() === now.toDateString();
    html += `<span class="day${today ? ' today' : ''}">${d.getDate()}</span>`;
  }
  $('#week').innerHTML = html;
}

// ================== Libro de órdenes (referencia) ==================

const DEPTH_SELL = [
  [3142.01, 5, '187.409,69'], [3142, 1, '50.000'], [3141.99, 1, '50.000'],
  [3141, 3, '1.758,24'], [3140.25, 1, '50.000'], [3140.2, 2, '96.412'],
  [3140.15, 1, '12.500'], [3140.1, 4, '210.330'], [3140.05, 1, '8.240'], [3140.01, 2, '61.780'],
];
const DEPTH_BUY = [
  [3093, 1, '300,67'], [3139.89, 1, '342,71'], [3140, 2, '293,55'],
  [3140.11, 1, '285,31'], [3142, 1, '145,95'], [3139.5, 2, '410,20'],
  [3139.2, 1, '96,40'], [3138.9, 3, '512,00'], [3138.5, 1, '75,10'], [3138, 2, '220,60'],
];

function renderDepth(n) {
  const take = (arr) => (n <= arr.length ? arr.slice(0, n) : [...arr, ...arr].slice(0, n));
  const maxAds = 5;
  const row = (r, cls) => `
    <div class="depth-row ${cls}">
      <div class="fill" style="width:${Math.min(100, (r[1] / maxAds) * 100)}%"></div>
      <span class="price">${r[0].toLocaleString('es-CO', { minimumFractionDigits: 2 })}</span>
      <span>${r[1]}</span>
      <span class="amt">${r[2]}</span>
    </div>`;
  $('#depthRows').innerHTML =
    take(DEPTH_SELL).map((r) => row(r, 'sell')).join('') +
    take(DEPTH_BUY).map((r) => row(r, 'buy')).join('');
}

$('#depthSelect').addEventListener('click', (e) => {
  if (!e.target.dataset.n) return;
  document.querySelectorAll('#depthSelect button').forEach((b) => b.classList.toggle('active', b === e.target));
  renderDepth(Number(e.target.dataset.n));
});

$('#assetTabs').addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON') return;
  document.querySelectorAll('#assetTabs button').forEach((b) => b.classList.toggle('active', b === e.target));
  if (e.target.textContent !== 'USDT') toast('Libro de referencia disponible solo para USDT por ahora');
});

// ================== Stats y tabla ==================

function inTab(o) {
  const active = ['PENDIENTE_PAGO', 'REQUIERE_KYC', 'LISTA_PARA_PAGAR', 'EN_APELACION'];
  const verify = ['VERIFICAR_PAGO', 'LISTA_PARA_LIBERAR'];
  if (TAB === 'activas') return active.includes(o.stage);
  if (TAB === 'verificar') return verify.includes(o.stage);
  if (TAB === 'completadas') return ['COMPLETADA', 'FACTURADA', 'CANCELADA'].includes(o.stage);
  return true;
}

function renderStats() {
  const done = ORDERS.filter((o) => ['COMPLETADA', 'FACTURADA', 'CANCELADA'].includes(o.stage)).length;
  const act = ORDERS.length - done;
  const ver = ORDERS.filter((o) => ['VERIFICAR_PAGO', 'LISTA_PARA_LIBERAR'].includes(o.stage)).length;
  const vol = ORDERS.reduce((s, o) => s + o.totalPrice, 0);
  $('#stats').innerHTML = `
    <div class="stat"><strong>${act}</strong><span>órdenes activas</span></div>
    <div class="stat c-blue"><strong>${ver}</strong><span>por verificar / liberar</span></div>
    <div class="stat c-green"><strong>${done}</strong><span>completadas</span></div>
    <div class="stat mono"><strong>$${fmt(vol)}</strong><span>volumen COP</span></div>`;
  $('#chipPending').innerHTML = `⏱ ${act} orden(es) pendiente(s)`;
  $('#kpiPend').textContent = act;
  $('#kpiHist').textContent = ORDERS.length;
  const unread = ORDERS.reduce((s, o) => s + o.local.chat.filter((m) => m.from === 'them').length, 0);
  $('#navChatBadge').textContent = unread > 99 ? '99+' : unread;
  $('#navChatBadge').hidden = unread === 0;
}

function renderTable() {
  const rows = ORDERS.filter(inTab);
  $('#emptyMsg').hidden = rows.length > 0;
  $('#ordersBody').innerHTML = rows
    .map(
      (o) => `
    <tr data-no="${o.orderNumber}" class="${o.orderNumber === SELECTED ? 'sel' : ''}">
      <td><span class="o-id">${o.orderNumber}</span><span class="o-time">${timeAgo(o.createdAt)}</span></td>
      <td><span class="side ${o.tradeType}">${o.tradeType === 'SELL' ? 'VENTA' : 'COMPRA'}</span></td>
      <td class="mono">${o.amount} ${o.asset}</td>
      <td class="mono">$${fmt(o.price)}</td>
      <td class="mono"><strong>$${fmt(o.totalPrice)}</strong></td>
      <td><span class="pill st-${o.stage}">${STAGE_LABEL[o.stage]}</span>${o.counterparty.isNew ? '<span class="badge-new">NUEVO</span>' : ''}</td>
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
  if (o) {
    renderDetail(o);
    $('#detailPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ================== Panel de gestión ==================

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
        ['Factura Siigo generada', !!L.invoice],
        ['Factura enviada al chat', !!L.invoice?.sentToChat],
      ];
  let nowSet = false;
  return steps
    .map(([label, done], i) => {
      let cls = done ? 'done' : '';
      if (!done && !nowSet) { cls = 'now'; nowSet = true; }
      return `<div class="flow-step ${cls}"><span class="fdot">${done ? '✔' : i + 1}</span>${label}</div>`;
    })
    .join('');
}

function actionButtons(o) {
  const L = o.local;
  const b = [];
  if (o.tradeType === 'SELL') {
    if (!['COMPLETADA', 'FACTURADA'].includes(o.stage)) {
      b.push(`<button class="btn btn-primary" data-act="send-key">🔑 Enviar llave de pago (Bre-B)</button>`);
      b.push(`<button class="btn btn-outline" data-act="verify-payment" ${L.paymentVerified ? 'disabled' : ''}>🏦 Verificar pago</button>`);
      b.push(`<button class="btn btn-green" data-act="release" ${L.paymentVerified && !L.released ? '' : 'disabled'}>🔓 Liberar cripto</button>`);
    }
  } else {
    if (o.counterparty.isNew && L.kyc.status !== 'approved') {
      b.push(`<button class="btn btn-primary" data-act="kyc" ${L.kyc.status === 'pending' ? 'disabled' : ''}>🪪 ${L.kyc.status === 'pending' ? 'KYC en curso...' : 'Enviar KYC (Didit)'}</button>`);
      if (L.kyc.status === 'pending')
        b.push(`<button class="btn btn-outline" data-act="kyc-approve">✅ Registrar KYC aprobado</button>`);
    }
    if (!['COMPLETADA', 'FACTURADA'].includes(o.stage)) {
      b.push(`<button class="btn btn-green" data-act="mark-paid" ${o.stage === 'LISTA_PARA_PAGAR' && !L.markedPaid ? '' : 'disabled'}>💸 Ya pagué — marcar como pagado</button>`);
    }
  }
  if (['COMPLETADA', 'FACTURADA'].includes(o.stage)) {
    if (!L.invoice) b.push(`<button class="btn btn-primary" data-act="invoice">🧾 Generar factura en Siigo</button>`);
    else if (!L.invoice.sentToChat)
      b.push(`<button class="btn btn-outline" data-act="invoice-send">📨 Enviar factura ${L.invoice.number} al chat</button>`);
    else b.push(`<button class="btn btn-outline" disabled>Factura ${L.invoice.number} enviada ✔</button>`);
  }
  b.push(`<button class="btn btn-red" data-act="report">⚠ Reportar</button>`);
  return b.join('');
}

function renderDetail(o) {
  const L = o.local;
  const sell = o.tradeType === 'SELL';
  const payBox = sell
    ? `<div class="box">
        <h3>Recaudo — nuestra llave</h3>
        <p>El comprador paga a nuestra llave Bre-B. <span class="warn">Nunca liberar sin confirmar el dinero en cuenta.</span></p>
        <div class="kv" style="margin-top:.5rem">
          <dt>llave</dt><dd class="mono">${ME.payment.breBKey}</dd>
          <dt>banco</dt><dd>${ME.payment.breBBank}</dd>
          <dt>titular</dt><dd>${ME.payment.accountHolder}</dd>
        </div>
      </div>`
    : `<div class="box">
        <h3>Pago — datos del perfil Binance</h3>
        <p class="warn">Pagar ÚNICAMENTE a los datos registrados en el perfil de Binance de la contraparte. Si pide otra cuenta: no pagar y apelar.</p>
        ${
          o.payMethod
            ? `<div class="kv" style="margin-top:.5rem">
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
    <div class="d-head" style="margin-bottom:1rem">
      <div>
        <h2>${sell ? 'VENTA' : 'COMPRA'} · ${o.amount} ${o.asset}</h2>
        <span class="mono muted" style="font-size:.78rem">#${o.orderNumber} · ${timeAgo(o.createdAt)}</span>
      </div>
      <span class="pill st-${o.stage}">${STAGE_LABEL[o.stage]}</span>
    </div>
    <div class="manage-grid">
      <div class="manage-col">
        <dl class="kv">
          <dt>precio</dt><dd class="mono">$${fmt(o.price)} ${o.fiat}/${o.asset}</dd>
          <dt>total</dt><dd class="mono"><strong>$${fmt(o.totalPrice)} ${o.fiat}</strong></dd>
          <dt>contraparte</dt><dd>${o.counterparty.nickname}${o.counterparty.isNew ? '<span class="badge-new">NUEVO</span>' : ''}</dd>
          <dt>órdenes</dt><dd>${o.counterparty.ordersCount ?? '—'} · ${o.counterparty.completionRate ?? '—'}% completadas</dd>
          <dt>kyc</dt><dd>${kycStatus}</dd>
        </dl>
        ${payBox}
        <div class="box"><h3>Flujo de la orden</h3><div class="flow">${flowSteps(o)}</div></div>
      </div>
      <div class="manage-col">
        <div class="actions">${actionButtons(o)}</div>
        <div class="chat">
          <div class="chat-head">Chat de la orden · ${o.counterparty.nickname}</div>
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
            <button type="submit" aria-label="Enviar">➤</button>
          </form>
        </div>
      </div>
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

// ================== Acciones ==================

async function doAction(o, action, body = {}) {
  if (apiPausedBlock()) return;
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
    $('#modalBox').onclick = (e) => {
      if (e.target.dataset.r) { back.hidden = true; resolve(e.target.dataset.r === 'ok'); }
    };
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
        <button type="button" class="btn btn-outline" data-r="no">Cancelar</button>
        <button type="button" class="btn btn-primary" data-r="ok">Confirmar verificación</button>
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
        <button type="button" class="btn btn-outline" data-r="no">Cancelar</button>
        <button type="button" class="btn btn-green" data-r="ok">Liberar ahora</button>
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
        <button type="button" class="btn btn-outline" data-r="no">Cancelar</button>
        <button type="button" class="btn btn-green" data-r="ok">Marcar pagado</button>
      </div>`);
    if (ok) {
      if (!document.getElementById('ckProfile')?.checked) return toast('Debes confirmar el destino del pago', true);
      await doAction(o, 'mark-paid');
    }
    return;
  }

  if (act === 'report') {
    const ok = await modal(`
      <h3>⚠ Reportar orden</h3>
      <p>Se registrará un reporte de la orden <span class="mono">#${o.orderNumber}</span> con ${o.counterparty.nickname} para revisión del equipo (apelación en Binance si aplica).</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-r="no">Cancelar</button>
        <button type="button" class="btn btn-red" data-r="ok">Reportar</button>
      </div>`);
    if (ok) {
      await doAction(o, 'chat', { text: '⚠ Orden reportada al equipo de cumplimiento para revisión.' });
      toast('Reporte registrado ⚠');
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

// ================== Eventos globales ==================

$('#tabs').addEventListener('click', (e) => {
  if (!e.target.dataset.tab) return;
  TAB = e.target.dataset.tab;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b === e.target));
  renderTable();
});

$('#btnLogout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  location.href = '/plataforma/';
});

$('#btnPublish').addEventListener('click', () =>
  toast('Publicar anuncios estará disponible al conectar la API de comerciante de Binance')
);
$('#btnOffer').addEventListener('click', () =>
  toast('Las ofertas de anuncios estarán disponibles al conectar la API de comerciante de Binance')
);
$('#bannerClose').addEventListener('click', () => { $('#promoBanner').hidden = true; });

// ================== Cambio de vistas (sidebar) ==================

const VIEWS = { panel: '#viewPanel', orden: '#viewOrden', anuncio: '#viewAnuncio', chat: '#viewChat', perfil: '#viewPerfil', fondos: '#viewFondos', conta: '#viewConta' };

// ================== Ajustes de operación (pausas) ==================

let SETTINGS = { bizPaused: false, apiPaused: false, auto: true };
try { SETTINGS = { ...SETTINGS, ...JSON.parse(localStorage.getItem('xatech_settings') || '{}') }; } catch {}
function saveSettings() {
  try { localStorage.setItem('xatech_settings', JSON.stringify(SETTINGS)); } catch {}
}

function applyPauseUI() {
  const btn = $('#btnPause');
  btn.textContent = SETTINGS.bizPaused ? '▶ Reanudar negocios' : '⏸ Pausar negocios';
  btn.classList.toggle('btn-pause-on', SETTINGS.bizPaused);
  const flag = $('#pauseFlag');
  if (flag) flag.hidden = !SETTINGS.bizPaused;
  const swBiz = $('#swBiz'), swApi = $('#swApi'), swAuto = $('#swAuto');
  if (swBiz) swBiz.checked = SETTINGS.bizPaused;
  if (swApi) swApi.checked = SETTINGS.apiPaused;
  if (swAuto) swAuto.checked = SETTINGS.auto;
  $('#btnNewAd').disabled = SETTINGS.bizPaused;
  $('#btnPublish').disabled = SETTINGS.bizPaused;
}

function setBizPaused(v) {
  SETTINGS.bizPaused = v;
  if (v) ADS.forEach((a) => (a.online = false)); // desconectar todos los anuncios
  saveSettings();
  applyPauseUI();
  if (!document.querySelector('#viewAnuncio').hidden) renderAds();
  toast(v
    ? 'Negocios en pausa ⏸ — anuncios desconectados; solo se terminan las operaciones pendientes'
    : 'Negocios reanudados ▶ — ya puedes volver a publicar anuncios');
}

const apiPausedBlock = () => {
  if (SETTINGS.apiPaused) {
    toast('API en pausa (solo lectura). Reactívala en Perfil → Configuración API', true);
    return true;
  }
  return false;
};

function showView(name) {
  Object.entries(VIEWS).forEach(([k, sel]) => { $(sel).hidden = k !== name; });
  document.querySelectorAll('.nav-item').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === name)
  );
  if (name === 'orden') renderOrden();
  if (name === 'anuncio') loadAds();
  if (name === 'chat') renderChat();
  if (name === 'perfil') renderPerfil();
  if (name === 'fondos') renderFondos();
  if (name === 'conta') loadConta();
  window.scrollTo({ top: 0 });
}

// Botón "Órdenes pendientes" del header → pestaña Pendiente de Mis órdenes
$('#chipPending').addEventListener('click', () => {
  OTAB = 'pendiente';
  document.querySelectorAll('#ordenTabs button').forEach((b) =>
    b.classList.toggle('active', b.dataset.otab === 'pendiente')
  );
  showView('orden');
});

document.querySelectorAll('.nav-item').forEach((b) =>
  b.addEventListener('click', () => {
    if (b.dataset.view) showView(b.dataset.view);
    else toast('Sección en desarrollo — disponible próximamente');
  })
);

// ================== Vista: Mis órdenes ==================

let OTAB = 'pendiente';

const oFilters = () => ({
  asset: $('#fAsset').value,
  type: $('#fType').value,
  state: $('#fState').value,
  fiat: $('#fFiat').value,
  q: $('#fSearch').value.trim(),
});

function renderOrden() {
  const isInforme = OTAB === 'informe';
  $('#ordenTableCard').hidden = isInforme;
  $('#informeCard').hidden = !isInforme;
  if (isInforme) return renderInforme();

  const f = oFilters();
  let rows = ORDERS.filter((o) => {
    if (OTAB === 'pendiente') return !['COMPLETADA', 'FACTURADA', 'CANCELADA', 'EN_APELACION'].includes(o.stage);
    if (OTAB === 'historial') return ['COMPLETADA', 'FACTURADA', 'CANCELADA'].includes(o.stage);
    return o.stage === 'EN_APELACION'; // pestaña Apelar
  });
  rows = rows.filter(
    (o) =>
      (!f.asset || o.asset === f.asset) &&
      (!f.type || o.tradeType === f.type) &&
      (!f.state || o.stage === f.state) &&
      (!f.fiat || o.fiat === f.fiat) &&
      (!f.q || o.orderNumber.includes(f.q))
  );

  $('#ordenEmpty').hidden = rows.length > 0;
  $('#ordenEmptyMsg').textContent =
    OTAB === 'pendiente' ? 'No hay órdenes pendientes'
    : OTAB === 'historial' ? 'No hay órdenes en el historial'
    : 'No hay órdenes en apelación';

  $('#ordenBody').innerHTML = rows
    .map((o) => {
      const d = new Date(o.createdAt);
      const fecha = d.toLocaleDateString('es-CO') + ' ' + d.toLocaleTimeString('es-CO', { hour12: false });
      const metodo = o.tradeType === 'SELL' ? 'Bre-B (llave)' : (o.payMethod?.type || '—');
      return `
      <tr>
        <td class="asset-cell">${o.asset}</td>
        <td><div class="cell-stack">
          <button class="o-link" data-open="${o.orderNumber}">${o.orderNumber}</button>
          <span class="side ${o.tradeType}" style="font-size:.78rem">${o.tradeType === 'SELL' ? 'Vender' : 'Comprar'}</span>
          <span class="sub">Anuncio</span>
        </div></td>
        <td><div class="cell-stack">
          <span class="mono"><strong>$${fmt(o.totalPrice)} ${o.fiat}</strong></span>
          <span class="sub mono">$${fmt(o.price)}</span>
          <span class="sub mono">${o.amount} ${o.asset}</span>
        </div></td>
        <td><div class="cell-stack">
          <span>${o.counterparty.nickname}${o.counterparty.isNew ? '<span class="badge-new">NUEVO</span>' : ''}</span>
          <span class="sub">${metodo}</span>
        </div></td>
        <td class="mono" style="font-size:.8rem">${fecha}</td>
        <td><span class="pill st-${o.stage}">${STAGE_LABEL[o.stage]}</span></td>
        <td><button class="btn btn-outline btn-sm" data-open="${o.orderNumber}">Gestionar</button></td>
      </tr>`;
    })
    .join('');

  document.querySelectorAll('#ordenBody [data-open]').forEach((el) =>
    el.addEventListener('click', () => {
      showView('panel');
      selectOrder(el.dataset.open);
    })
  );
}

function renderInforme() {
  const done = ORDERS.filter((o) => ['COMPLETADA', 'FACTURADA'].includes(o.stage));
  const ventas = done.filter((o) => o.tradeType === 'SELL');
  const compras = done.filter((o) => o.tradeType === 'BUY');
  const sum = (a, k) => a.reduce((s, o) => s + o[k], 0);
  $('#informeRange').textContent = new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  $('#informeStats').innerHTML = `
    <div class="stat c-green"><strong>$${fmt(sum(ventas, 'totalPrice'))}</strong><span>vendido (COP) · ${ventas.length} órdenes</span></div>
    <div class="stat"><strong>$${fmt(sum(compras, 'totalPrice'))}</strong><span>comprado (COP) · ${compras.length} órdenes</span></div>
    <div class="stat mono"><strong>${fmt(sum(done, 'amount'))} USDT</strong><span>volumen cripto completado</span></div>
    <div class="stat c-blue"><strong>${done.length}</strong><span>operaciones completadas</span></div>`;
}

$('#ordenTabs').addEventListener('click', (e) => {
  if (!e.target.dataset.otab) return;
  OTAB = e.target.dataset.otab;
  document.querySelectorAll('#ordenTabs button').forEach((b) => b.classList.toggle('active', b === e.target));
  renderOrden();
});
$('#fApply').addEventListener('click', renderOrden);
$('#fClear').addEventListener('click', () => {
  ['fAsset', 'fType', 'fState', 'fFiat'].forEach((id) => ($('#' + id).value = ''));
  $('#fSearch').value = '';
  renderOrden();
});
$('#fSearch').addEventListener('input', renderOrden);
$('#fPaste').addEventListener('click', async () => {
  try {
    $('#fSearch').value = (await navigator.clipboard.readText()).trim();
    renderOrden();
  } catch {
    toast('No se pudo leer el portapapeles — pega con Ctrl/Cmd+V', true);
  }
});

// ================== Vista: Mis anuncios ==================

let ADS = [];
let ADTAB = 'activos';

async function loadAds() {
  try {
    const r = await api('/api/ads');
    ADS = r.ads;
    renderAds();
    await loadBot();
  } catch (e) {
    toast(e.message, true);
  }
}

function adFiltersPass(a) {
  const asset = $('#adAsset').value, fiat = $('#adFiat').value, type = $('#adType').value,
    state = $('#adState').value, q = $('#adSearch').value.trim();
  return (
    (!asset || a.asset === asset) &&
    (!fiat || a.fiat === fiat) &&
    (!type || a.type === type) &&
    (!state || (state === 'on') === (a.status === 'online')) &&
    (!q || a.id.includes(q))
  );
}

const fdate = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-CO')} ${d.toLocaleTimeString('es-CO', { hour12: false })}`;
};
const fmt2 = (n) => Number(n).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function renderAds() {
  const rows = ADS.filter((a) => (ADTAB === 'activos' ? a.status !== 'private' : a.status === 'private')).filter(adFiltersPass);
  $('#adEmpty').hidden = rows.length > 0;
  const paused = SETTINGS.bizPaused;
  $('#adPauseBanner').hidden = !paused;
  $('#adBody').innerHTML = rows
    .map(
      (a) => `
    <tr>
      <td><input type="checkbox" class="ad-check" data-id="${a.id}"></td>
      <td><div class="cell-stack">
        <button class="o-link" data-ad-edit="${a.id}">${a.id}</button>
        <span class="side ${a.type}" style="font-size:.78rem">${a.type === 'SELL' ? 'Vender' : 'Comprar'}${a.botManaged ? '<span class="bot-pill">BOT</span>' : ''}</span>
        <span class="sub">${a.pair}</span>
      </div></td>
      <td><div class="cell-stack">
        <span class="mono">${fmt(a.amount)} ${a.asset}</span>
        <span class="sub mono">${fmt(a.minLimit)} ~ ${fmt(a.maxLimit)} ${a.fiat}</span>
      </div></td>
      <td><div class="cell-stack">
        <span class="mono">${fmt2(a.price)} ${a.fiat}</span>
        <span class="sub mono">${a.priceType === 'FIXED' ? 'precio fijo' : `variable ${a.floatMargin}%`}</span>
      </div></td>
      <td><div class="cell-stack">${a.methods.map((m) => `<span>${escapeHtml(m)}</span>`).join('')}</div></td>
      <td><div class="cell-stack mono" style="font-size:.8rem">
        <span>${fdate(a.updated)}</span>
        <span class="sub">${fdate(a.created)}</span>
      </div></td>
      <td><div class="ad-state">
        <span class="lbl">${paused ? 'En pausa ⏸' : a.status === 'online' ? 'En línea' : a.status === 'private' ? 'Privado' : 'Desconectado'}</span>
        <label class="switch"><input type="checkbox" data-toggle="${a.id}" ${a.status === 'online' ? 'checked' : ''} ${paused ? 'disabled' : ''}><i></i></label>
      </div></td>
      <td><div class="icon-btns">
        <button title="Editar" data-ad-edit="${a.id}">✎</button>
        <button title="Duplicar" data-ad-dup="${a.id}">⧉</button>
        <button title="Eliminar" data-ad-del="${a.id}">✕</button>
      </div></td>
    </tr>`
    )
    .join('');

  document.querySelectorAll('[data-toggle]').forEach((sw) =>
    sw.addEventListener('change', async (e) => {
      try {
        const r = await api('/api/ads', { method: 'POST', body: { action: 'toggle', id: e.target.dataset.toggle, online: e.target.checked } });
        ADS = r.ads;
        renderAds();
        toast(e.target.checked ? 'Anuncio en línea ✔' : 'Anuncio desconectado');
      } catch (err) { toast(err.message, true); }
    })
  );
  document.querySelectorAll('[data-ad-edit]').forEach((b) =>
    b.addEventListener('click', () => adForm(ADS.find((a) => a.id === b.dataset.adEdit)))
  );
  document.querySelectorAll('[data-ad-dup]').forEach((b) =>
    b.addEventListener('click', () => {
      const a = ADS.find((x) => x.id === b.dataset.adDup);
      adForm({ ...a, id: null, status: 'offline' });
    })
  );
  document.querySelectorAll('[data-ad-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const a = ADS.find((x) => x.id === b.dataset.adDel);
      const ok = await modal(`
        <h3>Eliminar anuncio</h3>
        <p>¿Eliminar el anuncio <span class="mono">${a.id}</span> (${a.type === 'SELL' ? 'Vender' : 'Comprar'} ${a.pair})?</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-r="no">Cancelar</button>
          <button type="button" class="btn btn-red" data-r="ok">Eliminar</button>
        </div>`);
      if (!ok) return;
      const r = await api('/api/ads', { method: 'POST', body: { action: 'delete', id: a.id } });
      ADS = r.ads;
      renderAds();
      toast('Anuncio eliminado');
    })
  );
  document.querySelectorAll('.ad-check, #adCheckAll').forEach((c) =>
    c.addEventListener('change', updateBulk)
  );
  updateBulk();
}

// ---- Editor de anuncio (asistente en 3 pasos, como el de Binance) ----

const PAY_METHODS = ['Nequi', 'Bancolombia S.A', 'Bre-B (llave)', 'Daviplata', 'DAVIbank', 'Movii', 'BBVA', 'Efectivo'];
const AD_ASSETS = ['USDT', 'USDC', 'BTC', 'ETH', 'SOL', 'BNB', 'FDUSD'];

async function adForm(existing = null) {
  const isEdit = !!existing?.id;
  const a = {
    type: 'SELL', asset: 'USDT', fiat: 'COP', priceType: 'FIXED', price: 4170,
    floatMargin: 100, amount: 0, minLimit: 100000, maxLimit: 5000000,
    methods: ['Bre-B (llave)'], payTime: 15, terms: '', autoReply: '',
    kycRequired: false, regDays: 0, status: 'offline',
    ...(existing || {}),
  };
  let side = a.type, asset = a.asset, fiat = a.fiat, priceType = a.priceType;
  let methods = [...(a.methods || [])];
  let step = 1;

  const pairIds = [BOTCFG?.sellAdId, BOTCFG?.buyAdId].filter(Boolean);
  const inBotPair = isEdit && pairIds.includes(a.id);
  const botOn = !!(BOTCFG?.enabled && inBotPair);
  const mref = BOTLAST?.market || null; // referencia del mercado (última ejecución del bot)
  const chk = (c) => (c ? 'checked' : '');

  const box = $('#modalBox');
  box.onclick = null;
  box.classList.add('lg', 'wiz');
  box.innerHTML = `
    <div class="wiz-head">
      <h3>${isEdit ? 'Editar anuncio' : 'Publicar un nuevo anuncio'}</h3>
      ${isEdit ? `<span class="mono muted" style="font-size:.72rem">#${a.id}</span>` : ''}
    </div>
    <div class="wiz-steps">
      <button type="button" class="wstep active" data-ws="1"><i>1</i> Tipo y precio</button>
      <button type="button" class="wstep" data-ws="2"><i>2</i> Cantidad y pago</button>
      <button type="button" class="wstep" data-ws="3"><i>3</i> Condiciones y bot</button>
    </div>

    <div class="wiz-step" data-wstep="1">
      <div class="side-tabs" id="wSide">
        <button type="button" data-side="BUY" class="${side === 'BUY' ? 'active buy' : ''}">Quiero comprar</button>
        <button type="button" data-side="SELL" class="${side === 'SELL' ? 'active sell' : ''}">Quiero vender</button>
      </div>
      <div class="wiz-field">
        <span class="wiz-lbl">Activo</span>
        <div class="chip-row" id="wAsset">
          ${AD_ASSETS.map((x) => `<button type="button" class="chip ${asset === x ? 'on' : ''}" data-a="${x}">${x}</button>`).join('')}
        </div>
      </div>
      <div class="wiz-field">
        <span class="wiz-lbl">Con la divisa</span>
        <div class="chip-row" id="wFiat">
          ${['COP', 'USD'].map((x) => `<button type="button" class="chip ${fiat === x ? 'on' : ''}" data-f="${x}">${x}</button>`).join('')}
        </div>
      </div>
      <div class="wiz-field">
        <span class="wiz-lbl">Tipo de precio</span>
        <div class="pt-cards">
          <button type="button" class="pt-card ${priceType === 'FIXED' ? 'on' : ''}" data-pt="FIXED">Fijo<span>tú defines el precio exacto</span></button>
          <button type="button" class="pt-card ${priceType === 'FLOATING' ? 'on' : ''}" data-pt="FLOATING">Variable<span>% sobre el precio del mercado</span></button>
        </div>
      </div>
      <div class="wiz-field" id="wFixedWrap" ${priceType === 'FIXED' ? '' : 'hidden'}>
        <span class="wiz-lbl">Precio del anuncio</span>
        <div class="num-stepper">
          <button type="button" id="wPMinus">−</button>
          <input type="number" id="wPrice" step="0.01" value="${a.price}">
          <button type="button" id="wPPlus">+</button>
          <span class="suffix" id="wPriceSuf">${fiat}</span>
        </div>
      </div>
      <div class="wiz-field" id="wFloatWrap" ${priceType === 'FLOATING' ? '' : 'hidden'}>
        <span class="wiz-lbl">Margen sobre el mercado</span>
        <div class="num-stepper">
          <button type="button" id="wMMinus">−</button>
          <input type="number" id="wMargin" step="0.01" value="${a.floatMargin}">
          <button type="button" id="wMPlus">+</button>
          <span class="suffix">%</span>
        </div>
        <span class="sub" id="wFloatHint">93% = 7% por debajo del mercado · 105% = 5% por encima</span>
      </div>
      <div class="market-ref" id="wMref">${mref
        ? `Mercado ahora — mejor venta <span class="mono red">$${fmt2(mref.bestSell)}</span> · mejor compra <span class="mono green">$${fmt2(mref.bestBuy)}</span>`
        : 'La referencia del mercado aparece tras la primera ejecución del bot.'}</div>
    </div>

    <div class="wiz-step" data-wstep="2" hidden>
      <div class="form-2col">
        <label>Cantidad total (<span id="wAmountSuf">${asset}</span>) <input type="number" id="wAmount" class="f-input" step="0.01" value="${a.amount}"></label>
        <label>Tiempo límite del pago <select id="wPayTime" class="f-select">
          ${[15, 30, 45, 60].map((t) => `<option value="${t}" ${a.payTime === t ? 'selected' : ''}>${t} minutos</option>`).join('')}
        </select></label>
        <label>Límite de orden mínimo (${a.fiat}) <input type="number" id="wMin" class="f-input" value="${a.minLimit}"></label>
        <label>Límite de orden máximo (${a.fiat}) <input type="number" id="wMax" class="f-input" value="${a.maxLimit}"></label>
      </div>
      <div class="wiz-field">
        <span class="wiz-lbl">Métodos de pago <span class="sub">(elige hasta 5)</span></span>
        <div class="chip-row" id="wMethods"></div>
        <div class="add-method">
          <input id="wMethodOther" class="f-input" placeholder="Otro método de pago">
          <button type="button" class="btn btn-outline btn-sm" id="wMethodAdd">Añadir</button>
        </div>
      </div>
    </div>

    <div class="wiz-step" data-wstep="3" hidden>
      <div class="ledger-form">
        <label>Términos y comentarios (opcional) <textarea id="wTerms" class="f-input" maxlength="1000">${escapeHtml(a.terms || '')}</textarea></label>
        <label>Mensaje automático de respuesta (opcional) <textarea id="wReply" class="f-input" maxlength="1000" placeholder="La contraparte lo recibirá al crear la orden">${escapeHtml(a.autoReply || '')}</textarea></label>
      </div>
      <div class="wiz-field">
        <span class="wiz-lbl">Condiciones para la contraparte</span>
        <label class="wiz-check"><input type="checkbox" id="wKyc" ${chk(a.kycRequired)}> Exigir verificación adicional (KYC)</label>
        <label class="wiz-inline">Días mínimos desde el registro <input type="number" id="wRegDays" class="f-input" min="0" value="${a.regDays || 0}"></label>
      </div>
      <div class="wiz-field">
        <span class="wiz-lbl">Estado del anuncio</span>
        <div class="radio-row">
          <label><input type="radio" name="wStatus" value="online" ${chk(a.status === 'online')}> En línea</label>
          <label><input type="radio" name="wStatus" value="offline" ${chk(a.status === 'offline')}> Desconectado</label>
          <label><input type="radio" name="wStatus" value="private" ${chk(a.status === 'private')}> Privado</label>
        </div>
      </div>
      <div class="wiz-bot">
        <div class="ctl-row" style="border:none;padding:0">
          <b>🤖 Precio gestionado por el bot</b>
          <label class="switch"><input type="checkbox" id="wBotOn" ${chk(botOn)}><i></i></label>
        </div>
        <p class="sub" style="margin:.2rem 0 .6rem">Conecta este anuncio con el del lado contrario: el bot compite con el mercado cada 5 minutos y <b>nunca rompe el margen</b> entre tu compra y tu venta.</p>
        <div id="wBotFields" ${botOn ? '' : 'hidden'}>
          <div class="form-2col">
            <label class="full">Anuncio conectado (lado contrario) <select id="wBotPair" class="f-select"></select>
              <span class="sub" id="wBotPairEmpty" hidden>No tienes un anuncio de ${side === 'SELL' ? 'compra' : 'venta'} de ${asset}/${fiat}: créalo primero.</span>
            </label>
            <label>Margen compra ↔ venta (%) <input type="number" id="wBotMargin" class="f-input" step="0.1" min="0" value="${BOTCFG?.marginPct ?? 0.7}"></label>
            <label>Paso para competir (${fiat}) <input type="number" id="wBotStep" class="f-input" step="0.5" min="0.01" value="${BOTCFG?.stepCop ?? 1}"></label>
            <label>Tope: precio mínimo de venta <input type="number" id="wBotMin" class="f-input" placeholder="opcional" value="${BOTCFG?.minSell ?? ''}"></label>
            <label>Tope: precio máximo de compra <input type="number" id="wBotMax" class="f-input" placeholder="opcional" value="${BOTCFG?.maxBuy ?? ''}"></label>
            <label class="full">Si el mercado comprime el margen, manda
              <select id="wBotAnchor" class="f-select">
                <option value="sell" ${BOTCFG?.anchor !== 'buy' ? 'selected' : ''}>La VENTA (se recalcula la compra)</option>
                <option value="buy" ${BOTCFG?.anchor === 'buy' ? 'selected' : ''}>La COMPRA (se recalcula la venta)</option>
              </select>
            </label>
          </div>
          <div class="bot-last" id="wBotLast" style="margin-top:.7rem">${BOTLAST && inBotPair
            ? `Última ejecución ${fdate(BOTLAST.at)} — venta <span class="mono red">$${fmt2(BOTLAST.sell)}</span> · compra <span class="mono green">$${fmt2(BOTLAST.buy)}</span> · margen real <span class="mono">${String(BOTLAST.marginReal).replace('.', ',')}%</span>`
            : 'Aún no se ha ejecutado con este anuncio.'}</div>
          <p class="sub" style="margin-top:.5rem">Al activar el bot, el precio pasa a ser <b>fijo</b> y lo mueve el bot en ambos anuncios.</p>
        </div>
      </div>
    </div>

    <div class="modal-actions">
      <button type="button" class="btn btn-outline" id="wCancel">Cancelar</button>
      <button type="button" class="btn btn-outline" id="wPrev" hidden>‹ Atrás</button>
      <button type="button" class="btn btn-primary" id="wNext">Siguiente ›</button>
      <button type="button" class="btn btn-primary" id="wSave" hidden>${isEdit ? 'Guardar cambios' : 'Publicar anuncio'}</button>
    </div>`;
  $('#modalBack').hidden = false;

  const q = (s) => box.querySelector(s);
  const qa = (s) => [...box.querySelectorAll(s)];
  const close = () => { $('#modalBack').hidden = true; box.classList.remove('lg', 'wiz'); };

  // ---- navegación entre pasos ----
  function showStep(n) {
    step = n;
    qa('.wiz-step').forEach((s) => (s.hidden = Number(s.dataset.wstep) !== n));
    qa('.wstep').forEach((s) => {
      s.classList.toggle('active', Number(s.dataset.ws) === n);
      s.classList.toggle('done', Number(s.dataset.ws) < n);
    });
    q('#wPrev').hidden = n === 1;
    q('#wNext').hidden = n === 3;
    q('#wSave').hidden = n !== 3;
  }
  qa('.wstep').forEach((s) => s.addEventListener('click', () => showStep(Number(s.dataset.ws))));
  q('#wNext').addEventListener('click', () => showStep(Math.min(3, step + 1)));
  q('#wPrev').addEventListener('click', () => showStep(Math.max(1, step - 1)));
  q('#wCancel').addEventListener('click', close);

  // ---- paso 1: lado, activo, divisa y precio ----
  qa('#wSide button').forEach((b) =>
    b.addEventListener('click', () => {
      side = b.dataset.side;
      qa('#wSide button').forEach((x) => x.className = x === b ? `active ${side === 'SELL' ? 'sell' : 'buy'}` : '');
      renderPairOpts();
      syncPrice();
    })
  );
  qa('#wAsset .chip').forEach((c) =>
    c.addEventListener('click', () => {
      asset = c.dataset.a;
      qa('#wAsset .chip').forEach((x) => x.classList.toggle('on', x === c));
      q('#wAmountSuf').textContent = asset;
      renderPairOpts();
    })
  );
  qa('#wFiat .chip').forEach((c) =>
    c.addEventListener('click', () => {
      fiat = c.dataset.f;
      qa('#wFiat .chip').forEach((x) => x.classList.toggle('on', x === c));
      q('#wPriceSuf').textContent = fiat;
      renderPairOpts();
    })
  );
  qa('.pt-card').forEach((c) =>
    c.addEventListener('click', () => {
      priceType = c.dataset.pt;
      qa('.pt-card').forEach((x) => x.classList.toggle('on', x === c));
      syncPrice();
    })
  );
  function syncPrice() {
    q('#wFixedWrap').hidden = priceType !== 'FIXED';
    q('#wFloatWrap').hidden = priceType !== 'FLOATING';
    if (priceType === 'FLOATING' && mref) {
      const ref = side === 'SELL' ? mref.bestSell : mref.bestBuy;
      const est = (ref * (Number(q('#wMargin').value) || 100)) / 100;
      q('#wFloatHint').textContent = `≈ $${fmt2(est)} ${fiat} con el mercado actual`;
    }
  }
  const bump = (input, dir, stepV) => {
    input.value = (Math.round((Number(input.value) + dir * stepV) * 100) / 100) || 0;
    syncPrice();
  };
  q('#wPMinus').addEventListener('click', () => bump(q('#wPrice'), -1, 1));
  q('#wPPlus').addEventListener('click', () => bump(q('#wPrice'), 1, 1));
  q('#wMMinus').addEventListener('click', () => bump(q('#wMargin'), -1, 0.5));
  q('#wMPlus').addEventListener('click', () => bump(q('#wMargin'), 1, 0.5));
  q('#wMargin').addEventListener('input', syncPrice);

  // ---- paso 2: métodos de pago (chips) ----
  function renderMethodChips() {
    const all = [...new Set([...PAY_METHODS, ...methods])];
    q('#wMethods').innerHTML = all
      .map((m) => `<button type="button" class="chip ${methods.includes(m) ? 'on' : ''}" data-m="${escapeHtml(m)}">${escapeHtml(m)}</button>`)
      .join('');
    qa('#wMethods .chip').forEach((c) =>
      c.addEventListener('click', () => {
        const m = c.dataset.m;
        if (methods.includes(m)) methods = methods.filter((x) => x !== m);
        else if (methods.length >= 5) return toast('Máximo 5 métodos de pago', true);
        else methods.push(m);
        renderMethodChips();
      })
    );
  }
  renderMethodChips();
  q('#wMethodAdd').addEventListener('click', () => {
    const m = q('#wMethodOther').value.trim();
    if (!m) return;
    if (methods.length >= 5) return toast('Máximo 5 métodos de pago', true);
    if (!methods.includes(m)) methods.push(m);
    q('#wMethodOther').value = '';
    renderMethodChips();
  });

  // ---- paso 3: bot dentro del anuncio ----
  function renderPairOpts() {
    const ct = side === 'SELL' ? 'BUY' : 'SELL';
    const opts = ADS.filter((x) => x.type === ct && x.asset === asset && x.fiat === fiat && x.id !== a.id);
    const prev = q('#wBotPair').value;
    const cur = prev || (inBotPair ? (side === 'SELL' ? BOTCFG.buyAdId : BOTCFG.sellAdId) : (opts.find((o) => o.botManaged)?.id || ''));
    q('#wBotPair').innerHTML =
      '<option value="">— seleccionar —</option>' +
      opts.map((o) => `<option value="${o.id}" ${o.id === cur ? 'selected' : ''}>${o.type === 'SELL' ? 'Venta' : 'Compra'} ${o.pair} · $${fmt2(o.price)}</option>`).join('');
    q('#wBotPairEmpty').hidden = opts.length > 0;
  }
  renderPairOpts();
  q('#wBotOn').addEventListener('change', () => {
    q('#wBotFields').hidden = !q('#wBotOn').checked;
  });

  // ---- guardar ----
  q('#wSave').addEventListener('click', async () => {
    const price = Number(q('#wPrice').value) || 0;
    const minL = Number(q('#wMin').value) || 0;
    const maxL = Number(q('#wMax').value) || 0;
    if (priceType === 'FIXED' && price <= 0) { showStep(1); return toast('Ingresa el precio del anuncio', true); }
    if (!methods.length) { showStep(2); return toast('Elige al menos un método de pago', true); }
    if (maxL && minL && maxL < minL) { showStep(2); return toast('El límite máximo no puede ser menor que el mínimo', true); }
    const botWanted = q('#wBotOn').checked;
    const counterId = q('#wBotPair').value;
    if (botWanted && !counterId) return toast('Elige el anuncio del lado contrario para conectar el bot', true);

    const ad = {
      id: a.id || undefined,
      type: side, asset, fiat,
      priceType: botWanted ? 'FIXED' : priceType,
      price,
      floatMargin: Number(q('#wMargin').value) || 100,
      amount: Number(q('#wAmount').value) || 0,
      minLimit: minL, maxLimit: maxL,
      methods,
      payTime: Number(q('#wPayTime').value) || 15,
      terms: q('#wTerms').value,
      autoReply: q('#wReply').value,
      kycRequired: q('#wKyc').checked,
      regDays: Number(q('#wRegDays').value) || 0,
      status: box.querySelector('input[name="wStatus"]:checked')?.value || 'offline',
    };
    try {
      const r = await api('/api/ads', { method: 'POST', body: { action: 'save', ad } });
      ADS = r.ads;
      const savedId = ad.id || r.ads[0].id;
      if (botWanted) {
        const cfg = {
          enabled: true, asset, fiat,
          sellAdId: side === 'SELL' ? savedId : counterId,
          buyAdId: side === 'BUY' ? savedId : counterId,
          marginPct: Number(q('#wBotMargin').value) || 0.7,
          stepCop: Number(q('#wBotStep').value) || 1,
          minSell: q('#wBotMin').value ? Number(q('#wBotMin').value) : null,
          maxBuy: q('#wBotMax').value ? Number(q('#wBotMax').value) : null,
          anchor: q('#wBotAnchor').value,
        };
        await api('/api/pricebot', { method: 'POST', body: { cfg } });
      } else if (botOn && inBotPair) {
        await api('/api/pricebot', { method: 'POST', body: { cfg: { enabled: false } } });
      }
      await loadBot();
      const r2 = await api('/api/ads'); // botManaged puede cambiar en el servidor
      ADS = r2.ads;
      renderAds();
      close();
      toast(isEdit ? 'Anuncio actualizado ✔' : 'Anuncio creado ✔');
    } catch (e) {
      toast(e.message, true);
    }
  });
}

function updateBulk() {
  const checks = [...document.querySelectorAll('.ad-check')];
  if (document.activeElement === $('#adCheckAll')) checks.forEach((c) => (c.checked = $('#adCheckAll').checked));
  const n = checks.filter((c) => c.checked).length;
  $('#adCheckCount').textContent = `(${n})`;
  $('#adPublishAll').disabled = n === 0 || SETTINGS.bizPaused;
  $('#adOffAll').disabled = n === 0;
}

$('#adTabs').addEventListener('click', (e) => {
  if (!e.target.dataset.adtab) return;
  ADTAB = e.target.dataset.adtab;
  document.querySelectorAll('#adTabs button').forEach((b) => b.classList.toggle('active', b === e.target));
  renderAds();
});
$('#adSubtabs').addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON') return;
  document.querySelectorAll('#adSubtabs button').forEach((b) => b.classList.toggle('active', b === e.target));
  if (!e.target.textContent.includes('normales')) toast('Por ahora solo hay anuncios normales');
});
['adAsset', 'adFiat', 'adType', 'adState'].forEach((id) => $('#' + id).addEventListener('change', renderAds));
$('#adSearch').addEventListener('input', renderAds);
$('#adReset').addEventListener('click', () => {
  ['adAsset', 'adFiat', 'adType', 'adState'].forEach((id) => ($('#' + id).value = ''));
  $('#adSearch').value = '';
  renderAds();
});
$('#btnNewAd').addEventListener('click', () => adForm());
$('#adResume').addEventListener('click', () => setBizPaused(false));

async function bulkToggle(online) {
  const ids = [...document.querySelectorAll('.ad-check:checked')].map((c) => c.dataset.id);
  for (const id of ids) {
    const r = await api('/api/ads', { method: 'POST', body: { action: 'toggle', id, online } });
    ADS = r.ads;
  }
  renderAds();
  toast(online ? 'Anuncios publicados ✔' : 'Anuncios desconectados');
}
$('#adPublishAll').addEventListener('click', () => bulkToggle(true).catch((e) => toast(e.message, true)));
$('#adOffAll').addEventListener('click', () => bulkToggle(false).catch((e) => toast(e.message, true)));

// ================== Bot de precios ==================
// La configuración vive DENTRO de cada anuncio (✎ Editar → paso 3).
// Aquí solo se muestra el estado y se puede ejecutar un tick manual.

let BOTCFG = null;
let BOTLAST = null;

function renderBotStrip() {
  const on = !!BOTCFG?.enabled;
  $('#botStatus').textContent = on ? '🤖 Bot de precios · activo (cada 5 min)' : '🤖 Bot de precios · inactivo';
  $('#botStatus').className = 'conn-pill ' + (on ? 'on' : 'demo');
  if (BOTLAST) {
    $('#botMini').innerHTML =
      `Última ejecución ${fdate(BOTLAST.at)} — venta <span class="mono red">$${fmt2(BOTLAST.sell)}</span> · ` +
      `compra <span class="mono green">$${fmt2(BOTLAST.buy)}</span> · margen real <span class="mono">${String(BOTLAST.marginReal).replace('.', ',')}%</span>` +
      (BOTLAST.notes || []).map((n) => ` · <span class="bot-note">${escapeHtml(n)}</span>`).join('');
  } else {
    $('#botMini').textContent = 'El bot se configura dentro de cada anuncio: ✎ Editar → paso 3 «Condiciones y bot».';
  }
}

async function loadBot() {
  try {
    const r = await api('/api/pricebot');
    BOTCFG = r.cfg;
    BOTLAST = r.lastRun;
    renderBotStrip();
  } catch (e) {
    toast(e.message, true);
  }
}

$('#botRun').addEventListener('click', async () => {
  try {
    const r = await api('/api/pricebot', { method: 'POST', body: { action: 'run' } });
    BOTLAST = r.lastRun;
    const ads = await api('/api/ads');
    ADS = ads.ads;
    renderAds();
    renderBotStrip();
    toast('Bot ejecutado ✔ — precios actualizados');
  } catch (e) { toast(e.message, true); }
});

// ================== Vista: Chat (Mensaje P2P) ==================

let CTAB = 'todos';
let CHAT_SEL = null;

const lastMsg = (o) => o.local.chat[o.local.chat.length - 1] || null;
const unreadOf = (o) => o.local.chat.filter((m) => m.from === 'them').length;

function chatDate(iso) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })
    : `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function renderChat() {
  const q = ($('#convSearch').value || '').toLowerCase();
  let convs = ORDERS.filter((o) =>
    CTAB === 'curso' ? !['COMPLETADA', 'FACTURADA'].includes(o.stage) : true
  );
  if (q) convs = convs.filter((o) => o.counterparty.nickname.toLowerCase().includes(q) || o.orderNumber.includes(q));
  // Las conversaciones con mensajes más recientes primero
  convs.sort((a, b) => {
    const ma = lastMsg(a)?.at || a.createdAt;
    const mb = lastMsg(b)?.at || b.createdAt;
    return ma < mb ? 1 : -1;
  });

  $('#convList').innerHTML = convs.length
    ? convs
        .map((o) => {
          const m = lastMsg(o);
          const unread = unreadOf(o);
          const prev = m ? (m.from === 'me' ? 'Tú: ' : '') + m.text.split('\n')[0] : 'Sin mensajes aún';
          return `
        <button class="conv-item ${o.orderNumber === CHAT_SEL ? 'sel' : ''}" data-conv="${o.orderNumber}">
          <span class="avatar">${o.counterparty.nickname[0].toUpperCase()}${unread ? `<span class="unread">${unread > 9 ? '9+' : unread}</span>` : ''}</span>
          <span class="conv-main">
            <span class="conv-top"><strong>${o.counterparty.nickname}</strong><time>${chatDate(m?.at || o.createdAt)}</time></span>
            <span class="conv-prev">${escapeHtml(prev)}</span>
          </span>
        </button>`;
        })
        .join('')
    : '<p class="empty">No hay conversaciones</p>';

  document.querySelectorAll('[data-conv]').forEach((b) =>
    b.addEventListener('click', () => {
      CHAT_SEL = b.dataset.conv;
      renderChat();
    })
  );

  if (CHAT_SEL) {
    const o = ORDERS.find((x) => x.orderNumber === CHAT_SEL);
    if (o) renderThread(o);
  }
}

function renderThread(o) {
  const L = o.local;
  $('#threadPanel').innerHTML = `
    <div class="thread-head">
      <div class="thread-who">
        <span class="avatar">${o.counterparty.nickname[0].toUpperCase()}</span>
        <div>
          <strong>${o.counterparty.nickname}${o.counterparty.isNew ? '<span class="badge-new">NUEVO</span>' : ''}</strong>
          <span class="sub">#${o.orderNumber}</span>
        </div>
      </div>
      <div class="thread-order">
        <span class="side ${o.tradeType}">${o.tradeType === 'SELL' ? 'VENTA' : 'COMPRA'}</span>
        <span class="mono">${o.amount} ${o.asset} · $${fmt(o.totalPrice)} ${o.fiat}</span>
        <span class="pill st-${o.stage}">${STAGE_LABEL[o.stage]}</span>
        <button class="btn btn-outline btn-sm" id="threadGreet">🤖 Saludar</button>
        <button class="btn btn-outline btn-sm" id="threadManage">Gestionar orden</button>
      </div>
    </div>
    <div class="thread-msgs" id="threadMsgs">
      ${L.chat.length === 0 ? '<span class="msg system">sin mensajes aún</span>' : ''}
      ${L.chat
        .map(
          (m) =>
            `<div class="msg ${m.from === 'me' ? 'me' : m.from === 'system' ? 'system' : 'them'}">${m.kind === 'bot' ? '<span class="bot-tag">🤖 bot</span>' : ''}${escapeHtml(m.text)}${
              m.from !== 'system' ? `<span class="t">${new Date(m.at).toLocaleTimeString('es-CO')}</span>` : ''
            }</div>`
        )
        .join('')}
    </div>
    <form class="thread-input" id="threadForm">
      <input id="threadText" placeholder="Escribir mensaje..." autocomplete="off">
      <button type="submit" aria-label="Enviar">➤</button>
    </form>
    ${ME.demo.binance ? `
    <form class="thread-input sim" id="simForm" title="Solo en modo demo: escribe como si fueras el cliente y el bot responderá">
      <input id="simText" placeholder="🧪 Simular mensaje del CLIENTE (demo) — el bot responde solo" autocomplete="off">
      <button type="submit">➤</button>
    </form>` : ''}`;

  const msgs = $('#threadMsgs');
  msgs.scrollTop = msgs.scrollHeight;

  $('#threadManage').addEventListener('click', () => {
    showView('panel');
    selectOrder(o.orderNumber);
  });

  $('#threadGreet')?.addEventListener('click', async () => {
    try {
      await api(`/api/orders/${o.orderNumber}/bot-greet`, { method: 'POST', body: {} });
      await refresh(); renderChat();
      toast('El bot saludó al cliente 🤖');
    } catch (e) { toast(e.message, true); }
  });

  $('#simForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#simText').value.trim();
    if (!text) return;
    $('#simText').value = '';
    try {
      await api(`/api/orders/${o.orderNumber}/chat-in`, { method: 'POST', body: { text } });
      await refresh(); renderChat();
    } catch (err) { toast(err.message, true); }
  });

  $('#threadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#threadText').value.trim();
    if (!text || apiPausedBlock()) return;
    $('#threadText').value = '';
    try {
      await api(`/api/orders/${o.orderNumber}/chat`, { method: 'POST', body: { text } });
      await refresh();
      renderChat();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

$('#convTabs').addEventListener('click', (e) => {
  if (!e.target.dataset.ctab) return;
  CTAB = e.target.dataset.ctab;
  document.querySelectorAll('#convTabs button').forEach((b) => b.classList.toggle('active', b === e.target));
  renderChat();
});
$('#convSearch').addEventListener('input', renderChat);

// ================== Vista: Cuenta de fondos ==================

const USDT_RATE = 4170; // tasa de referencia COP/USDT (en real: precio del libro)
const USDT_FREE_DEMO = 2847.53; // saldo demo cuando no hay llaves de Binance

async function renderFondos() {
  const fmt2 = (n) => Number(n).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Saldo real de la billetera de Binance (si hay llaves); demo si no
  let usdtFree = USDT_FREE_DEMO;
  let usdtLockedBinance = 0;
  try {
    const b = await api('/api/balances');
    if (!b.demo && b.usdt) {
      usdtFree = b.usdt.free;
      usdtLockedBinance = b.usdt.locked;
    }
  } catch {}
  // USDT comprometido en ventas activas (aún no liberadas)
  const locked = usdtLockedBinance || ORDERS
    .filter((o) => o.tradeType === 'SELL' && !['COMPLETADA', 'FACTURADA'].includes(o.stage))
    .reduce((s, o) => s + o.amount, 0);
  const usdtTotal = usdtFree + locked;

  // COP según el estado de las órdenes
  const copVerified = ORDERS
    .filter((o) => o.tradeType === 'SELL' && (o.local.paymentVerified || ['COMPLETADA', 'FACTURADA'].includes(o.stage)))
    .reduce((s, o) => s + o.totalPrice, 0);
  const copPending = ORDERS
    .filter((o) => o.tradeType === 'SELL' && o.stage === 'VERIFICAR_PAGO' && !o.local.paymentVerified)
    .reduce((s, o) => s + o.totalPrice, 0);
  const copPaid = ORDERS
    .filter((o) => o.tradeType === 'BUY' && o.local.markedPaid)
    .reduce((s, o) => s + o.totalPrice, 0);
  const copTotal = copVerified - copPaid;

  $('#usdtFree').textContent = fmt2(USDT_FREE_DEMO);
  $('#usdtLocked').textContent = fmt2(locked);
  $('#usdtTotal').textContent = fmt2(usdtTotal);
  $('#usdtCop').textContent = `$${fmt(Math.round(usdtTotal * USDT_RATE))}`;
  $('#copVerified').textContent = `$${fmt(copVerified)}`;
  $('#copPending').textContent = `$${fmt(copPending)}`;
  $('#copPaid').textContent = `$${fmt(copPaid)}`;
  $('#copTotal').textContent = `$${fmt(copTotal)}`;
  $('#fondosTotal').textContent = `COL$ ${fmt(Math.round(usdtTotal * USDT_RATE + copTotal))}`;
  $('#fundUsdtMode').textContent = ME.demo.binance ? '○ modo demo' : '● Binance';
  $('#fundUsdtMode').className = 'conn-pill ' + (ME.demo.binance ? 'demo' : 'on');
}

// ================== Vista: Contabilidad ==================

let CLIENTS = [];
let DAYS = [];

async function loadConta() {
  try {
    const [c, l] = await Promise.all([api('/api/clients'), api('/api/ledger')]);
    CLIENTS = c.clients;
    DAYS = l.days;
    renderClients();
    renderLedger();
  } catch (e) {
    toast(e.message, true);
  }
}

// ---- Clientes ----

function renderClients() {
  const q = ($('#cliSearch').value || '').toLowerCase();
  const rows = CLIENTS.filter(
    (c) =>
      !q ||
      [c.nombre, c.cedula, c.correo, c.llave, c.banco].some((v) => (v || '').toLowerCase().includes(q))
  );
  $('#cliEmpty').hidden = rows.length > 0;
  $('#cliBody').innerHTML = rows
    .map(
      (c) => `
    <tr>
      <td><strong>${escapeHtml(c.nombre)}</strong></td>
      <td class="mono">${escapeHtml(c.cedula || '—')}</td>
      <td>${escapeHtml(c.correo || '—')}</td>
      <td class="mono">${escapeHtml(c.llave || '—')}</td>
      <td>${escapeHtml(c.banco || '—')}</td>
      <td><div class="cell-stack"><span>${escapeHtml(c.origen || 'manual')}</span><span class="sub mono">${new Date(c.createdAt).toLocaleDateString('es-CO')}</span></div></td>
      <td><div class="icon-btns">
        <button title="Editar" data-cli-edit="${c.id}">✎</button>
        <button title="Eliminar" data-cli-del="${c.id}">✕</button>
      </div></td>
    </tr>`
    )
    .join('');

  document.querySelectorAll('[data-cli-edit]').forEach((b) =>
    b.addEventListener('click', () => clientForm(CLIENTS.find((c) => c.id === b.dataset.cliEdit)))
  );
  document.querySelectorAll('[data-cli-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const c = CLIENTS.find((x) => x.id === b.dataset.cliDel);
      const ok = await modal(`
        <h3>Eliminar cliente</h3>
        <p>¿Eliminar a <strong>${escapeHtml(c.nombre)}</strong> del registro?</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-r="no">Cancelar</button>
          <button type="button" class="btn btn-red" data-r="ok">Eliminar</button>
        </div>`);
      if (!ok) return;
      const r = await api('/api/clients', { method: 'POST', body: { action: 'delete', id: c.id } });
      CLIENTS = r.clients;
      renderClients();
      toast('Cliente eliminado');
    })
  );
}

async function clientForm(existing = null) {
  const v = (x) => escapeHtml(existing?.[x] || '');
  const ok = await modal(`
    <h3>${existing ? 'Editar' : 'Agregar'} cliente</h3>
    <div class="ledger-form">
      <label>Nombre completo <input class="f-input" id="cfNombre" value="${v('nombre')}"></label>
      <label>Cédula <input class="f-input" id="cfCedula" value="${v('cedula')}"></label>
      <label>Correo <input class="f-input" id="cfCorreo" type="email" value="${v('correo')}"></label>
      <label>Llave Bre-B <input class="f-input" id="cfLlave" value="${v('llave')}" placeholder="@llave, celular o correo"></label>
      <label>Banco de la llave <input class="f-input" id="cfBanco" value="${v('banco')}" placeholder="Bancolombia, Nequi..."></label>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-outline" data-r="no">Cancelar</button>
      <button type="button" class="btn btn-primary" data-r="ok">Guardar</button>
    </div>`);
  if (!ok) return;
  const client = {
    id: existing?.id,
    nombre: $('#cfNombre').value,
    cedula: $('#cfCedula').value,
    correo: $('#cfCorreo').value,
    llave: $('#cfLlave').value,
    banco: $('#cfBanco').value,
    origen: existing?.origen || 'manual',
  };
  try {
    const r = await api('/api/clients', { method: 'POST', body: { client } });
    CLIENTS = r.clients;
    renderClients();
    toast('Cliente guardado ✔');
  } catch (e) {
    toast(e.message, true);
  }
}

$('#btnAddCli').addEventListener('click', () => clientForm());
$('#cliSearch').addEventListener('input', renderClients);

// ---- Utilidad diaria ----

function utilPct(d) {
  return d.inicial > 0 ? ((d.utilidad / d.inicial) * 100).toFixed(1).replace('.', ',') + '%' : '—';
}

function renderLedger() {
  // Estadísticas: utilidad acumulada, capital actual, rendimiento promedio
  const total = DAYS.reduce((s, d) => s + d.utilidad, 0);
  const last = DAYS[0]; // ordenado desc por fecha
  const avg = DAYS.length
    ? DAYS.reduce((s, d) => s + (d.inicial > 0 ? d.utilidad / d.inicial : 0), 0) / DAYS.length * 100
    : 0;
  $('#utilStats').innerHTML = `
    <div class="stat ${total >= 0 ? 'c-green' : ''}"><strong>${total < 0 ? '-' : ''}$${fmt(Math.abs(total))}</strong><span>utilidad acumulada</span></div>
    <div class="stat mono"><strong>$${fmt(last ? last.final : 0)}</strong><span>capital actual (último cierre)</span></div>
    <div class="stat c-blue"><strong>${avg.toFixed(1).replace('.', ',')}%</strong><span>rendimiento promedio diario</span></div>
    <div class="stat"><strong>${DAYS.length}</strong><span>días registrados</span></div>`;

  $('#ldEmpty').hidden = DAYS.length > 0;
  $('#ldBody').innerHTML = DAYS.map(
    (d) => `
    <tr>
      <td class="mono">${d.fecha}</td>
      <td class="mono">$${fmt(d.inicial)}</td>
      <td class="mono">$${fmt(d.final)}</td>
      <td class="mono ${d.utilidad >= 0 ? 'util-pos' : 'util-neg'}">${d.utilidad >= 0 ? '+' : '-'}$${fmt(Math.abs(d.utilidad))}</td>
      <td class="mono ${d.utilidad >= 0 ? 'util-pos' : 'util-neg'}">${utilPct(d)}</td>
      <td>${escapeHtml(d.nota || '')}</td>
      <td><button class="cli-del" data-ld-del="${d.id}" title="Eliminar registro">✕</button></td>
    </tr>`
  ).join('');

  document.querySelectorAll('[data-ld-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const r = await api('/api/ledger', { method: 'POST', body: { action: 'delete', id: b.dataset.ldDel } });
      DAYS = r.days;
      renderLedger();
    })
  );

  // Prellenar el formulario: fecha hoy y capital inicial = último cierre
  if (!$('#ldFecha').value) $('#ldFecha').value = new Date().toISOString().slice(0, 10);
  if (!$('#ldInicial').value && last) $('#ldInicial').value = last.final;
  updateLedgerPreview();
}

function updateLedgerPreview() {
  const i = Number($('#ldInicial').value);
  const f = Number($('#ldFinal').value);
  if (isFinite(i) && isFinite(f) && $('#ldInicial').value !== '' && $('#ldFinal').value !== '') {
    const u = f - i;
    const pct = i > 0 ? ((u / i) * 100).toFixed(1).replace('.', ',') : '—';
    $('#ldPreview').innerHTML = `Utilidad: <span class="${u >= 0 ? 'util-pos' : 'util-neg'}">${u >= 0 ? '+' : '-'}$${fmt(Math.abs(u))} (${pct}%)</span>`;
  } else {
    $('#ldPreview').textContent = 'Utilidad: —';
  }
}

['ldInicial', 'ldFinal'].forEach((id) => $('#' + id).addEventListener('input', updateLedgerPreview));

$('#btnSaveDay').addEventListener('click', async () => {
  const body = {
    fecha: $('#ldFecha').value,
    inicial: Number($('#ldInicial').value),
    final: Number($('#ldFinal').value),
    nota: $('#ldNota').value,
  };
  if (!body.fecha || $('#ldInicial').value === '' || $('#ldFinal').value === '')
    return toast('Completa fecha, capital inicial y capital final', true);
  try {
    const r = await api('/api/ledger', { method: 'POST', body });
    DAYS = r.days;
    $('#ldFinal').value = '';
    $('#ldNota').value = '';
    $('#ldInicial').value = '';
    renderLedger();
    toast('Día registrado ✔');
  } catch (e) {
    toast(e.message, true);
  }
});

$('#contaTabs').addEventListener('click', (e) => {
  if (!e.target.dataset.cotab) return;
  document.querySelectorAll('#contaTabs button').forEach((b) => b.classList.toggle('active', b === e.target));
  $('#cotab-clientes').hidden = e.target.dataset.cotab !== 'clientes';
  $('#cotab-utilidad').hidden = e.target.dataset.cotab !== 'utilidad';
});

// ================== Vista: Perfil ==================

function renderPerfil() {
  const done = ORDERS.filter((o) => ['COMPLETADA', 'FACTURADA'].includes(o.stage));
  const volUsdt = done.reduce((s, o) => s + o.amount, 0);
  const volCop = done.reduce((s, o) => s + o.totalPrice, 0);
  const rate = ORDERS.length ? Math.round((done.length / ORDERS.length) * 100) : 0;
  const ctps = new Set(ORDERS.map((o) => o.counterparty.nickname)).size;

  $('#reqVol').textContent = `${fmt(volUsdt)} USDT`;
  $('#reqVolBar').style.width = Math.min(100, (volUsdt / 100000) * 100) + '%';
  $('#reqVolBar').style.background = volUsdt >= 100000 ? 'var(--green)' : 'var(--red)';
  $('#reqRate').textContent = `${rate}%`;
  $('#reqRateBar').style.width = rate + '%';
  $('#reqRateBar').style.background = rate >= 98 ? 'var(--green)' : 'var(--red)';
  $('#pRate').textContent = `${rate}%`;
  $('#pOps').textContent = done.length;
  $('#pVol').textContent = `$${fmt(volCop)}`;
  $('#pCtp').textContent = ctps;

  // Método de pago
  $('#payKey').textContent = ME.payment.breBKey;
  $('#payBank').textContent = ME.payment.breBBank;
  $('#payHolder').textContent = ME.payment.accountHolder;

  // Estado de conexiones
  const conns = [
    ['Binance API', 'Órdenes P2P y liberación', !ME.demo.binance],
    ['Supabase', 'Base de datos (chat, KYC, facturas)', !ME.demo.store],
    ['Siigo', 'Facturación electrónica', !ME.demo.siigo],
    ['Didit', 'Verificación KYC', !ME.demo.kyc],
  ];
  $('#connList').innerHTML = conns
    .map(
      ([name, sub, on]) => `
    <div class="conn-row">
      <div><b>${name}</b><span class="sub">${sub}</span></div>
      <span class="conn-pill ${on ? 'on' : 'demo'}">${on ? '● conectada' : '○ modo demo'}</span>
    </div>`
    )
    .join('');

  applyPauseUI();
  api('/api/chatbot').then((r) => { $('#swChatbot').checked = r.enabled; }).catch(() => {});
}

$('#perfilTabs').addEventListener('click', (e) => {
  if (!e.target.dataset.ptab) return;
  document.querySelectorAll('#perfilTabs button').forEach((b) => b.classList.toggle('active', b === e.target));
  ['perfil', 'api', 'pago', 'bloqueados', 'seguridad', 'notif'].forEach(
    (t) => ($('#ptab-' + t).hidden = t !== e.target.dataset.ptab)
  );
});

$('#btnPause').addEventListener('click', () => setBizPaused(!SETTINGS.bizPaused));
$('#swBiz').addEventListener('change', (e) => setBizPaused(e.target.checked));
$('#swApi').addEventListener('change', (e) => {
  SETTINGS.apiPaused = e.target.checked;
  saveSettings();
  toast(SETTINGS.apiPaused ? 'API en pausa — solo lectura' : 'API activa de nuevo ✔');
});
$('#swChatbot').addEventListener('change', async (e) => {
  try {
    await api('/api/chatbot', { method: 'POST', body: { enabled: e.target.checked } });
    toast(e.target.checked ? 'Bot de atención activado 🤖' : 'Bot de atención desactivado');
  } catch (err) { toast(err.message, true); }
});

$('#swAuto').addEventListener('change', (e) => {
  SETTINGS.auto = e.target.checked;
  saveSettings();
  toast(SETTINGS.auto ? 'Refresco automático activado' : 'Refresco automático desactivado');
});

boot()
  .then(() => {
    applyPauseUI();
    const h = location.hash.replace('#', '');
    if (VIEWS[h]) showView(h);
  })
  .catch((e) => toast(e.message, true));
setInterval(() => { if (SETTINGS.auto) refresh(); }, 30000); // refresco automático cada 30 s
