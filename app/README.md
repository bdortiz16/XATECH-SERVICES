# XATECH P2P — Plataforma de operaciones

Módulo interno para operar Binance P2P vía API: recibir órdenes de compra/venta,
responder el chat, hacer KYC a contrapartes nuevas, verificar pagos, liberar/marcar
pagado, facturar en Siigo y enviar la factura al chat.

**Solo login** (no existe registro): el acceso es exclusivo del equipo autorizado.

## Ejecutar

```bash
cd app
node server.js
# → http://localhost:3000
```

Sin credenciales configuradas la app arranca en **modo demo** con órdenes de
ejemplo para probar todo el flujo. Credenciales de acceso demo:
`admin@xatech.services` / `xatech2026` (cámbialas con `ADMIN_EMAIL` y
`ADMIN_PASSWORD`; ver `.env.example`).

Requiere Node.js ≥ 18. **Cero dependencias** (solo librerías nativas de Node).

## Flujo de operación

### VENTA (recaudo: el comprador nos paga)

1. Llega la orden → **Enviar llave** publica en el chat nuestra llave Bre-B,
   banco, titular y monto exacto (`BREB_KEY`, `BREB_BANK`, `ACCOUNT_HOLDER`).
2. El comprador paga y marca "Pagado" en Binance.
3. **Confirmar que el dinero llegó**: el operador entra a la cuenta bancaria y
   verifica la acreditación real (modal con casilla de confirmación obligatoria).
4. **Liberar cripto** — bloqueado por el servidor hasta que el pago esté
   verificado (regla de oro: jamás liberar por un comprobante).
5. **Generar factura en Siigo** y **enviarla al chat**.

### COMPRA (nosotros pagamos)

1. Contraparte **nueva** → **Enviar KYC (Didit)**: se crea la sesión de
   verificación y el enlace se publica en el chat. El resultado llega por el
   webhook `POST /api/webhooks/didit`.
2. Pagar **únicamente a los datos del perfil verificado de Binance** (la
   plataforma los muestra y lo recuerda; si piden otra cuenta → no pagar).
3. **Marcar como pagado** — bloqueado si la contraparte es nueva y el KYC no
   está aprobado.
4. Recibida la cripto → factura Siigo + envío al chat.

## Arquitectura

```
app/
├── server.js            servidor HTTP + API JSON + sesiones (HMAC, cookie httpOnly)
├── config.js            configuración por variables de entorno
├── services/
│   ├── binance.js       API firmada de Binance (SAPI) + órdenes demo
│   ├── siigo.js         autenticación y facturas en Siigo (+ PDF base64)
│   ├── kyc.js           sesiones de verificación Didit
│   └── store.js         estado local por orden (chat, kyc, pagos, factura) en JSON
├── public/              frontend (login + módulo de órdenes, vanilla JS)
└── data/                estado local (no se versiona)
```

## Integraciones reales — qué falta configurar

| Servicio | Variables | Nota |
|---|---|---|
| Binance | `BINANCE_API_KEY/SECRET` | El historial P2P usa `GET /sapi/v1/c2c/orderMatch/listUserOrderHistory`. Responder chat, ver métodos de pago del detalle y **liberar por API** requieren el programa de **comerciante verificado** de Binance P2P; hasta tenerlo, esas acciones se ejecutan en Binance y aquí se registran. |
| Siigo | `SIIGO_USERNAME`, `SIIGO_ACCESS_KEY`, `SIIGO_DOCUMENT_ID`, `SIIGO_SELLER_ID` | Autentica en `/auth`, factura con `POST /v1/invoices`, PDF con `GET /v1/invoices/{id}/pdf`. Consulta en Siigo el id del comprobante FV y del medio de pago. |
| Didit (KYC) | `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` | Crea sesión de verificación y envía el enlace al chat; configura el webhook hacia `/api/webhooks/didit`. |

## Seguridad (importante)

- Las llaves de API viven **solo en el servidor** (variables de entorno). Nunca
  en el navegador ni en el repositorio.
- La API key de Binance: permisos mínimos, **sin retiros**, restringida por IP.
- El servidor **bloquea liberar** sin verificación de pago y **bloquea pagar**
  a contrapartes nuevas sin KYC aprobado — las reglas están en el backend, no
  solo en los botones.
- En producción: servir tras HTTPS (proxy), definir `SESSION_SECRET` y
  `ADMIN_PASSWORD_SHA256`, y reemplazar el almacenamiento JSON por una base de
  datos.
- El webhook de Didit debe validarse con la firma HMAC que Didit envía
  (pendiente al configurar credenciales reales).
