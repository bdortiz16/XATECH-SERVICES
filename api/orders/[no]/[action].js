'use strict';

// Acciones sobre una orden: chat, send-key, kyc, kyc-result, verify-payment,
// release, mark-paid, invoice, invoice-send.
// Las reglas del negocio viven aquí (servidor), no en los botones.

const config = require('../../../lib/config');
const { requireSession } = require('../../../lib/auth');
const binance = require('../../../lib/binance');
const siigo = require('../../../lib/siigo');
const kyc = require('../../../lib/kyc');
const store = require('../../../lib/store');
const { viewOrder, stageOf } = require('../../../lib/orders');
const chatbot = require('../../../lib/chatbot');
const rc = require('../../../lib/runtime-config');

module.exports = async (req, res) => {
  await rc.apply();
  if (!requireSession(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { no, action } = req.query;
  try {
    const order = await binance.getOrder(no);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    const st = await store.getState(order.orderNumber);
    const body = req.body || {};
    const reply = (extra = {}) =>
      res.status(200).json({ ...extra, order: viewOrder(order, st) });

    switch (action) {
      // Mensaje ENTRANTE del cliente (webhook real o simulador demo): el bot responde
      case 'chat-in': {
        const text = (body.text || '').trim();
        if (!text) return res.status(400).json({ error: 'Mensaje vacío' });
        const r = await chatbot.onIncoming(order, st, text);
        return reply({ bot: r });
      }

      case 'bot-greet': {
        const greeted = await chatbot.greet(order, st);
        if (!greeted) return res.status(409).json({ error: 'El bot ya saludó en esta orden' });
        return reply();
      }

      case 'chat': {
        const text = (body.text || '').trim();
        if (!text) return res.status(400).json({ error: 'Mensaje vacío' });
        // En modo real, aquí también se envía por la API de chat del comerciante.
        const { msg } = await store.addChat(order.orderNumber, 'me', text, 'text', st);
        return reply({ message: msg });
      }

      case 'send-key': {
        if (order.tradeType !== 'SELL')
          return res.status(400).json({ error: 'La llave solo se envía en ventas (recaudo)' });
        const p = config.payment;
        st.keySent = true;
        const text = `Para completar tu pago usa nuestra llave Bre-B:\n🔑 Llave: ${p.breBKey}\n🏦 Banco: ${p.breBBank}\n👤 Titular: ${p.accountHolder}\n💵 Monto exacto: ${order.totalPrice.toLocaleString('es-CO')} ${order.fiat}\nCuando pagues, marca "Pagado" en Binance. Verificamos en cuenta y liberamos de inmediato.`;
        const { msg } = await store.addChat(order.orderNumber, 'me', text, 'payment-key', st);
        return reply({ message: msg });
      }

      case 'kyc': {
        const session = await kyc.createSession(order);
        st.kyc = { status: 'pending', link: session.url, sessionId: session.sessionId };
        const { msg } = await store.addChat(
          order.orderNumber,
          'me',
          `Hola 👋 Por políticas de cumplimiento, antes de operar necesitamos una verificación de identidad rápida (2 min). Complétala aquí: ${session.url}`,
          'kyc',
          st
        );
        return reply({ kyc: st.kyc, message: msg });
      }

      case 'kyc-result': {
        // Registro manual del resultado (en producción llega por el webhook).
        if (!['approved', 'rejected'].includes(body.status))
          return res.status(400).json({ error: 'status inválido' });
        st.kyc.status = body.status;
        await store.setState(order.orderNumber, st);
        return reply();
      }

      case 'verify-payment': {
        if (order.tradeType !== 'SELL') return res.status(400).json({ error: 'Solo aplica a ventas' });
        if (!body.confirmed)
          return res.status(400).json({ error: 'Debes confirmar que revisaste la cuenta y el dinero llegó' });
        st.paymentVerified = true;
        await store.addChat(order.orderNumber, 'system', 'Pago verificado en cuenta bancaria ✔', 'system', st);
        return reply();
      }

      case 'release': {
        if (order.tradeType !== 'SELL') return res.status(400).json({ error: 'Solo aplica a ventas' });
        // Regla de oro: NUNCA liberar sin verificación de pago en cuenta.
        if (!st.paymentVerified)
          return res.status(409).json({ error: 'Bloqueado: primero verifica en la cuenta que el dinero llegó' });
        const result = await binance.releaseOrder(order.orderNumber);
        st.released = true;
        await store.addChat(order.orderNumber, 'system', 'Cripto liberada al comprador ✔', 'system', st);
        return reply({ result });
      }

      case 'mark-paid': {
        if (order.tradeType !== 'BUY') return res.status(400).json({ error: 'Solo aplica a compras' });
        if (order.counterparty.isNew && st.kyc.status !== 'approved')
          return res.status(409).json({ error: 'Bloqueado: la contraparte es nueva y no ha aprobado el KYC' });
        if (st.bot?.step === 'blocked')
          return res.status(409).json({ error: 'Bloqueado por el bot: el nombre no coincide con el titular del perfil' });
        st.markedPaid = true;
        await store.addChat(
          order.orderNumber,
          'system',
          'Pago realizado a los datos del perfil de Binance y marcado como pagado ✔',
          'system',
          st
        );
        return reply();
      }

      case 'invoice': {
        const stage = stageOf(order, st);
        if (!['COMPLETADA', 'FACTURADA'].includes(stage))
          return res
            .status(409)
            .json({ error: 'La factura se genera cuando la orden está completada (liberada o pagada)' });
        if (!st.invoice) {
          st.invoice = await siigo.createInvoice(order, {
            identification: st.kyc.identification || '222222222222', // consumidor final si no hay KYC
          });
          st.invoice.sentToChat = false;
          await store.setState(order.orderNumber, st);
        }
        return reply({ invoice: st.invoice });
      }

      case 'invoice-send': {
        if (!st.invoice) return res.status(409).json({ error: 'Primero genera la factura en Siigo' });
        st.invoice.sentToChat = true;
        const { msg } = await store.addChat(
          order.orderNumber,
          'me',
          `🧾 Factura electrónica ${st.invoice.number} (Siigo) por ${order.totalPrice.toLocaleString('es-CO')} ${order.fiat}. ¡Gracias por operar con XATECH!`,
          'invoice',
          st
        );
        return reply({ message: msg });
      }

      default:
        return res.status(404).json({ error: 'Acción no encontrada' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
