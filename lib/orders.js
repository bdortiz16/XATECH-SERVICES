'use strict';

// Estado operativo derivado: combina lo que dice Binance con nuestro estado local.

function stageOf(order, st) {
  if (st.invoice?.sentToChat) return 'FACTURADA';
  if (st.released || st.markedPaid || order.binanceStatus === 'COMPLETED') return 'COMPLETADA';
  if (order.tradeType === 'SELL') {
    if (st.paymentVerified) return 'LISTA_PARA_LIBERAR';
    if (order.binanceStatus === 'BUYER_PAID') return 'VERIFICAR_PAGO';
    return 'PENDIENTE_PAGO';
  }
  return st.kyc.status === 'approved' || !order.counterparty.isNew
    ? 'LISTA_PARA_PAGAR'
    : 'REQUIERE_KYC';
}

function viewOrder(order, st) {
  return { ...order, local: st, stage: stageOf(order, st) };
}

module.exports = { stageOf, viewOrder };
