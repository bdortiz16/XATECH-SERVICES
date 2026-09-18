'use strict';

// Bot de atención al cliente (chat de órdenes P2P).
//
// FLUJO:
// - Saluda al cliente al iniciar la conversación.
// - COMPRA (nosotros pagamos):
//   1. Pide SOLO nombre completo y cédula del titular.
//   2. Valida que el nombre coincida con el titular del perfil de Binance.
//      Si NO coincide → no procede: bloquea el pago de la orden.
//   3. Si coincide → registra al cliente en Contabilidad y paga a la llave
//      Bre-B del perfil; si el perfil no tiene llave, la pide en el chat.
// - VENTA (recaudo): saluda e indica que se enviarán los datos de pago
//   (la llave se envía con la acción "Enviar llave"; API de recaudo en proceso).
//
// En modo real, los mensajes entrantes llegarán por el webhook del chat de
// comerciante de Binance y las respuestas saldrán por esa misma API; este
// módulo es el cerebro y no cambia.

const store = require('./store');

const CFG_KEY = '_chatbot';
const CLIENTS_KEY = '_registro_clientes';

async function getCfg() {
  const st = await store.getState(CFG_KEY);
  if (typeof st.enabled !== 'boolean') st.enabled = true;
  return st;
}

async function setCfg(patch) {
  const st = await getCfg();
  Object.assign(st, patch);
  await store.setState(CFG_KEY, st);
  return st;
}

// ---------- utilidades de texto ----------

const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-zñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// El nombre dado coincide con el titular si comparten al menos dos palabras
// (o todas las del más corto), en cualquier orden.
function nameMatches(given, holder) {
  const a = norm(given).split(' ').filter((w) => w.length > 2);
  const b = new Set(norm(holder).split(' ').filter((w) => w.length > 2));
  if (!a.length || !b.size) return false;
  const hits = a.filter((w) => b.has(w)).length;
  return hits >= Math.min(2, a.length, b.size);
}

function extractCedula(text) {
  const m = String(text).replace(/[.,]/g, '').match(/\b(\d{6,12})\b/);
  return m ? m[1] : null;
}

function extractLlave(text) {
  const t = String(text);
  const at = t.match(/@[\w.-]{3,}/); // llave tipo @usuario
  if (at) return at[0];
  const mail = t.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (mail) return mail[0];
  const tagged = t.match(/llave[^\w@]{0,4}([\w@.+-]{5,})/i);
  if (tagged) return tagged[1];
  const cel = t.match(/\b(3\d{9})\b/); // celular colombiano como llave
  return cel ? cel[1] : null;
}

const NO_NOMBRE = new Set([
  'hola', 'holaa', 'buenas', 'buenos', 'dias', 'tardes', 'noches', 'gracias', 'ok', 'listo',
  'quiero', 'vender', 'comprar', 'venta', 'compra', 'pago', 'pagar', 'usdt', 'cop', 'pesos',
  'llave', 'banco', 'cuenta', 'orden', 'ayuda', 'amigo', 'hermano', 'señor', 'como', 'estas',
]);

function extractNombre(text) {
  const t = String(text).replace(/\n/g, ' ');
  const tagged = t.match(/(?:soy|me llamo|nombre(?:\s+completo)?\s*(?:es|:)?)\s+([a-zá-úñ\s]{6,60})/i);
  if (tagged) return tagged[1].trim().replace(/\s+/g, ' ');
  // Sin etiqueta: una frase de solo letras con 2+ palabras se toma como nombre,
  // salvo que contenga palabras de conversación (saludos, verbos del negocio...)
  const clean = t.replace(/c[eé]dula|cc|documento|id/gi, '').trim();
  const words = clean.match(/^[a-zá-úñ]+(?:\s+[a-zá-úñ]+){1,5}$/i);
  if (!words) return null;
  const parts = norm(clean).split(' ');
  if (parts.some((w) => NO_NOMBRE.has(w))) return null;
  return clean.replace(/\s+/g, ' ');
}

// ---------- registro automático del cliente ----------

async function registerClient(order, data) {
  const st = await store.getState(CLIENTS_KEY);
  if (!Array.isArray(st.clients)) st.clients = [];
  const ced = (data.cedula || '').trim();
  const dup = st.clients.find((c) => ced && c.cedula.replace(/\D/g, '') === ced.replace(/\D/g, ''));
  const record = {
    nombre: data.nombre || order.counterparty.nickname,
    cedula: ced,
    correo: data.correo || '',
    llave: data.llave || order.payMethod?.key || '',
    banco: data.banco || order.payMethod?.bank || '',
    origen: `bot · orden ${order.orderNumber}`,
  };
  if (dup) Object.assign(dup, record);
  else st.clients.unshift({ id: String(Date.now()), createdAt: new Date().toISOString(), ...record });
  await store.setState(CLIENTS_KEY, st);
}

// ---------- conversación ----------

function botState(st) {
  if (!st.bot) st.bot = { greeted: false, step: 'inicio', data: {} };
  return st.bot;
}

async function say(order, st, text) {
  await store.addChat(order.orderNumber, 'me', text, 'bot', st);
}

async function greet(order, st) {
  const b = botState(st);
  if (b.greeted) return false;
  b.greeted = true;
  if (order.tradeType === 'BUY') {
    b.step = 'datos';
    await say(
      order,
      st,
      `¡Hola ${order.counterparty.nickname}! 👋 Soy el asistente de XATECH.\nPara procesar tu orden de forma segura necesito confirmar la titularidad:\n1️⃣ Nombre completo del titular de la cuenta\n2️⃣ Número de cédula\n⚠️ Por políticas de seguridad SOLO pagamos al titular verificado del perfil de Binance.`
    );
  } else {
    b.step = 'venta';
    await say(
      order,
      st,
      `¡Hola ${order.counterparty.nickname}! 👋 Soy el asistente de XATECH. Gracias por tu compra.\nEn un momento te enviaremos los datos de pago (llave Bre-B). Cuando pagues, marca "Pagado" en Binance; verificamos en cuenta y liberamos de inmediato. 🙌`
    );
  }
  await store.setState(order.orderNumber, st);
  return true;
}

// Procesa un mensaje entrante del cliente y responde según el flujo.
async function onIncoming(order, st, text) {
  await store.addChat(order.orderNumber, 'them', text, 'text', st);
  const cfg = await getCfg();
  if (!cfg.enabled) return { replied: false };

  const b = botState(st);

  if (!b.greeted) await greet(order, st);
  if (order.tradeType !== 'BUY') {
    await store.setState(order.orderNumber, st);
    return { replied: true };
  }

  if (b.step === 'blocked') {
    await say(order, st, 'Esta orden quedó detenida por seguridad: el nombre no coincide con el titular del perfil. Un operador la revisará. 🙏');
    await store.setState(order.orderNumber, st);
    return { replied: true, blocked: true };
  }

  // Capturar datos del mensaje
  const nombre = extractNombre(text);
  const cedula = extractCedula(text);
  const llave = extractLlave(text);
  if (nombre) b.data.nombre = nombre;
  if (cedula) b.data.cedula = cedula;
  if (llave) b.data.llave = llave;

  if (b.step === 'datos' || b.step === 'inicio') {
    if (!b.data.nombre || !b.data.cedula) {
      const falta = [!b.data.nombre && 'el nombre completo', !b.data.cedula && 'la cédula'].filter(Boolean).join(' y ');
      await say(order, st, `Gracias 🙌 Me falta ${falta} para continuar.`);
      await store.setState(order.orderNumber, st);
      return { replied: true };
    }

    // Validación de titularidad contra el perfil de Binance
    const holder = order.counterparty.realName || order.counterparty.nickname;
    if (!nameMatches(b.data.nombre, holder)) {
      b.step = 'blocked';
      await say(
        order,
        st,
        `❌ El nombre "${b.data.nombre}" no coincide con el titular del perfil de Binance.\nPor seguridad NO podemos proceder con el pago: solo pagamos al titular verificado de la cuenta.\nSi crees que es un error, un operador revisará la orden.`
      );
      await store.addChat(order.orderNumber, 'system', 'Bot: titularidad NO válida — pago bloqueado', 'system', st);
      await store.setState(order.orderNumber, st);
      return { replied: true, blocked: true };
    }

    // Titular válido → registrar cliente y definir la llave de pago
    await registerClient(order, b.data);
    await store.addChat(order.orderNumber, 'system', `Bot: titularidad verificada ✔ (${b.data.nombre}, CC ${b.data.cedula}) — cliente registrado`, 'system', st);

    const profileKey = order.payMethod?.key;
    if (profileKey) {
      b.step = 'listo';
      await say(
        order,
        st,
        `✅ Titularidad verificada, ${b.data.nombre}.\nPagaremos a la llave Bre-B registrada en tu perfil:\n🔑 ${profileKey}${order.payMethod.bank ? ` · 🏦 ${order.payMethod.bank}` : ''}\nSi esa llave no es correcta, dime la llave correcta a nombre del titular.`
      );
    } else if (b.data.llave) {
      b.step = 'listo';
      await say(order, st, `✅ Titularidad verificada. Pagaremos a tu llave Bre-B: 🔑 ${b.data.llave}\nRecuerda: la cuenta debe estar a nombre del titular verificado.`);
    } else {
      b.step = 'llave';
      await say(order, st, `✅ Titularidad verificada, ${b.data.nombre}.\nTu perfil no tiene llave Bre-B registrada: envíame por aquí tu llave (y el banco) para hacerte el pago. Debe estar a tu nombre.`);
    }
    await store.setState(order.orderNumber, st);
    return { replied: true, verified: true };
  }

  if (b.step === 'llave') {
    if (b.data.llave) {
      b.step = 'listo';
      await registerClient(order, b.data);
      await say(order, st, `Perfecto 🙌 Pagaremos a la llave: 🔑 ${b.data.llave}\nUn operador ejecuta el pago y marcamos la orden como pagada en Binance.`);
    } else {
      await say(order, st, 'No logré leer la llave 🤔 Envíamela así: "llave: @tullave" o el celular/correo asociado, junto con el banco.');
    }
    await store.setState(order.orderNumber, st);
    return { replied: true };
  }

  // step 'listo' o 'venta': respuesta genérica
  await say(order, st, 'Recibido 🙌 Un operador está atento a tu orden. Si necesitas algo más, escríbeme.');
  await store.setState(order.orderNumber, st);
  return { replied: true };
}

module.exports = { getCfg, setCfg, greet, onIncoming };
