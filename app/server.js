'use strict';

// XATECH P2P — servidor de la plataforma.
// Sin dependencias externas: Node >= 18 (http, crypto, fs, fetch nativos).
//
//   node server.js        → http://localhost:3000
//
// Rutas:
//   /            login (única puerta de entrada; no existe registro)
//   /app         módulo P2P (requiere sesión)
//   /api/...     API JSON (requiere sesión salvo /api/login)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const config = require('./config');
const store = require('./services/store');
const binance = require('./services/binance');
const siigo = require('./services/siigo');
const kyc = require('./services/kyc');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// ---------- Sesión (token HMAC en cookie httpOnly) ----------

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

function getSession(req) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim().split('=').map(decodeURIComponent))
      .filter((p) => p.length === 2)
  );
  return cookies.xatech_session && checkToken(cookies.xatech_session);
}

function passwordOk(password) {
  if (config.adminPasswordSha256) {
    const h = crypto.createHash('sha256').update(password).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(config.adminPasswordSha256.toLowerCase()));
  }
  return password === config.adminPassword;
}

// ---------- Utilidades HTTP ----------

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function serveFile(res, file) {
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('No encontrado');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}

// ---------- Lógica de órdenes ----------

// Estado operativo derivado: combina lo que dice Binance con nuestro estado local.
function viewOrder(order) {
  const os = store.orderState(order.orderNumber);
  let stage;
  if (os.invoice?.sentToChat) stage = 'FACTURADA';
  else if (os.released || os.markedPaid || order.binanceStatus === 'COMPLETED') stage = 'COMPLETADA';
  else if (order.tradeType === 'SELL') {
    if (os.paymentVerified) stage = 'LISTA_PARA_LIBERAR';
    else if (order.binanceStatus === 'BUYER_PAID') stage = 'VERIFICAR_PAGO';
    else stage = 'PENDIENTE_PAGO';
  } else {
    stage = os.kyc.status === 'approved' || !order.counterparty.isNew ? 'LISTA_PARA_PAGAR' : 'REQUIERE_KYC';
  }
  return { ...order, local: os, stage };
}

const err = (res, code, message) => json(res, code, { error: message });

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  // --- login / logout (sin sesión) ---
  if (url.pathname === '/api/login' && req.method === 'POST') {
    const { email, password } = await readBody(req);
    if (email?.toLowerCase() === config.adminEmail.toLowerCase() && passwordOk(password || '')) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `xatech_session=${makeToken()}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${config.sessionHours * 3600}`,
      });
      return res.end(JSON.stringify({ ok: true }));
    }
    return err(res, 401, 'Correo o contraseña incorrectos');
  }

  if (!getSession(req)) return err(res, 401, 'Sesión requerida');

  if (url.pathname === '/api/logout' && req.method === 'POST') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'xatech_session=; HttpOnly; Path=/; Max-Age=0',
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (url.pathname === '/api/me') {
    return json(res, 200, {
      email: config.adminEmail,
      demo: { binance: config.demoBinance, siigo: config.demoSiigo, kyc: config.demoKyc },
      payment: config.payment,
    });
  }

  // --- órdenes ---
  if (url.pathname === '/api/orders' && req.method === 'GET') {
    const orders = (await binance.listOrders()).map(viewOrder);
    orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return json(res, 200, { orders });
  }

  if (parts[0] === 'api' && parts[1] === 'orders' && parts[2]) {
    const order = await binance.getOrder(parts[2]);
    if (!order) return err(res, 404, 'Orden no encontrada');
    const os = store.orderState(order.orderNumber);
    const action = parts[3];

    if (!action && req.method === 'GET') return json(res, 200, { order: viewOrder(order) });

    if (action === 'chat' && req.method === 'POST') {
      const { text } = await readBody(req);
      if (!text?.trim()) return err(res, 400, 'Mensaje vacío');
      // En modo real, aquí se envía además por la API de chat del comerciante.
      const msg = store.addChat(order.orderNumber, 'me', text.trim());
      return json(res, 200, { message: msg });
    }

    if (action === 'send-key' && req.method === 'POST') {
      if (order.tradeType !== 'SELL') return err(res, 400, 'La llave solo se envía en ventas (recaudo)');
      const p = config.payment;
      const text = `Para completar tu pago usa nuestra llave Bre-B:\n🔑 Llave: ${p.breBKey}\n🏦 Banco: ${p.breBBank}\n👤 Titular: ${p.accountHolder}\n💵 Monto exacto: ${order.totalPrice.toLocaleString('es-CO')} ${order.fiat}\nCuando pagues, marca "Pagado" en Binance. Verificamos en cuenta y liberamos de inmediato.`;
      os.keySent = true;
      const msg = store.addChat(order.orderNumber, 'me', text, 'payment-key');
      return json(res, 200, { message: msg, order: viewOrder(order) });
    }

    if (action === 'kyc' && req.method === 'POST') {
      const session = await kyc.createSession(order);
      os.kyc = { status: 'pending', link: session.url, sessionId: session.sessionId };
      const msg = store.addChat(
        order.orderNumber,
        'me',
        `Hola 👋 Por políticas de cumplimiento, antes de operar necesitamos una verificación de identidad rápida (2 min). Complétala aquí: ${session.url}`,
        'kyc'
      );
      return json(res, 200, { kyc: os.kyc, message: msg, order: viewOrder(order) });
    }

    // Resultado del KYC (en producción llega por webhook de Didit).
    if (action === 'kyc-result' && req.method === 'POST') {
      const { status } = await readBody(req);
      if (!['approved', 'rejected'].includes(status)) return err(res, 400, 'status inválido');
      os.kyc.status = status;
      store.save();
      return json(res, 200, { order: viewOrder(order) });
    }

    if (action === 'verify-payment' && req.method === 'POST') {
      const { confirmed } = await readBody(req);
      if (order.tradeType !== 'SELL') return err(res, 400, 'Solo aplica a ventas');
      if (!confirmed) return err(res, 400, 'Debes confirmar que revisaste la cuenta y el dinero llegó');
      os.paymentVerified = true;
      store.save();
      store.addChat(order.orderNumber, 'system', 'Pago verificado en cuenta bancaria ✔', 'system');
      return json(res, 200, { order: viewOrder(order) });
    }

    if (action === 'release' && req.method === 'POST') {
      if (order.tradeType !== 'SELL') return err(res, 400, 'Solo aplica a ventas');
      // Regla de oro: NUNCA liberar sin verificación de pago en cuenta.
      if (!os.paymentVerified) return err(res, 409, 'Bloqueado: primero verifica en la cuenta que el dinero llegó');
      const result = await binance.releaseOrder(order.orderNumber);
      os.released = true;
      store.save();
      store.addChat(order.orderNumber, 'system', 'Cripto liberada al comprador ✔', 'system');
      return json(res, 200, { result, order: viewOrder(order) });
    }

    if (action === 'mark-paid' && req.method === 'POST') {
      if (order.tradeType !== 'BUY') return err(res, 400, 'Solo aplica a compras');
      if (order.counterparty.isNew && os.kyc.status !== 'approved')
        return err(res, 409, 'Bloqueado: la contraparte es nueva y no ha aprobado el KYC');
      os.markedPaid = true;
      store.save();
      store.addChat(order.orderNumber, 'system', 'Pago realizado a los datos del perfil de Binance y marcado como pagado ✔', 'system');
      return json(res, 200, { order: viewOrder(order) });
    }

    if (action === 'invoice' && req.method === 'POST') {
      const stage = viewOrder(order).stage;
      if (!['COMPLETADA', 'FACTURADA'].includes(stage))
        return err(res, 409, 'La factura se genera cuando la orden está completada (liberada o pagada)');
      if (!os.invoice) {
        os.invoice = await siigo.createInvoice(order, {
          identification: os.kyc.identification || '222222222222', // consumidor final si no hay KYC
        });
        os.invoice.sentToChat = false;
        store.save();
      }
      return json(res, 200, { invoice: os.invoice, order: viewOrder(order) });
    }

    if (action === 'invoice-send' && req.method === 'POST') {
      if (!os.invoice) return err(res, 409, 'Primero genera la factura en Siigo');
      os.invoice.sentToChat = true;
      const msg = store.addChat(
        order.orderNumber,
        'me',
        `🧾 Factura electrónica ${os.invoice.number} (Siigo) por ${order.totalPrice.toLocaleString('es-CO')} ${order.fiat}. ¡Gracias por operar con XATECH!`,
        'invoice'
      );
      store.save();
      return json(res, 200, { message: msg, order: viewOrder(order) });
    }
  }

  return err(res, 404, 'Ruta no encontrada');
}

// ---------- Webhook de Didit (resultado del KYC en producción) ----------

async function handleWebhook(req, res) {
  const body = await readBody(req);
  // vendor_data lleva el número de orden; status llega como Approved/Declined.
  const orderNumber = body.vendor_data;
  if (orderNumber) {
    const os = store.orderState(orderNumber);
    const s = (body.status || '').toLowerCase();
    if (s.includes('approv')) os.kyc.status = 'approved';
    else if (s.includes('declin') || s.includes('reject')) os.kyc.status = 'rejected';
    store.save();
  }
  return json(res, 200, { ok: true });
}

// ---------- Servidor ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/webhooks/didit' && req.method === 'POST')
      return await handleWebhook(req, res);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);

    if (url.pathname === '/' || url.pathname === '/login') {
      if (getSession(req)) {
        res.writeHead(302, { Location: '/app' });
        return res.end();
      }
      return serveFile(res, 'login.html');
    }
    if (url.pathname === '/app') {
      if (!getSession(req)) {
        res.writeHead(302, { Location: '/' });
        return res.end();
      }
      return serveFile(res, 'app.html');
    }
    return serveFile(res, url.pathname.slice(1));
  } catch (e) {
    console.error(e);
    return err(res, 500, e.message || 'Error interno');
  }
});

server.listen(config.port, () => {
  console.log(`XATECH P2P listo en http://localhost:${config.port}`);
  console.log(
    `Modo: Binance=${config.demoBinance ? 'DEMO' : 'REAL'} · Siigo=${config.demoSiigo ? 'DEMO' : 'REAL'} · KYC=${config.demoKyc ? 'DEMO' : 'REAL'}`
  );
});
