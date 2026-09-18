# Desplegar XATECH P2P en Vercel + Supabase (sin terminal)

Todo se hace desde el navegador, con clics.

## 1. Supabase (base de datos y llaves)

1. Entra a [supabase.com](https://supabase.com) → **New project** (nombre: `xatech-p2p`).
2. Cuando el proyecto cargue, ve a **SQL Editor** → **New query**, pega esto y pulsa **Run**:

```sql
-- Estado de las órdenes, clientes, anuncios, bot y contabilidad
create table if not exists p2p_order_state (
  order_number text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table p2p_order_state enable row level security;

-- Llaves y ajustes de la plataforma (se gestionan desde Supabase,
-- sin necesidad de Redeploy en Vercel; el servidor las relee cada minuto)
create table if not exists app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table app_config enable row level security;
```

3. Ve a **Table Editor → app_config → Insert row** y agrega tus llaves como
   filas `key` / `value` (solo las que tengas; el resto queda en modo demo):

| key | value |
|---|---|
| `BINANCE_API_KEY` | tu API Key de Binance |
| `BINANCE_API_SECRET` | tu Secret Key de Binance |
| `ADMIN_EMAIL` | correo de acceso a la plataforma |
| `ADMIN_PASSWORD` | contraseña de acceso |
| `BREB_KEY` | tu llave Bre-B de recaudo |
| `BREB_BANK` | banco de la llave |
| `ACCOUNT_HOLDER` | titular de la cuenta |
| `SIIGO_USERNAME`, `SIIGO_ACCESS_KEY`, ... | cuando tengas Siigo |
| `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` | cuando tengas Didit |

   Gracias al RLS sin políticas, esas filas SOLO puede leerlas el servidor
   con la service_role key — ni la clave `anon` ni el navegador las ven.
   Los cambios se aplican solos en máximo 1 minuto.

4. Ve a **Project Settings → API** y copia dos valores:
   - **Project URL** (algo como `https://xxxx.supabase.co`)
   - **service_role key** (la secreta, NO la `anon`)

## 2. Vercel (frontend + API)

1. Entra a [vercel.com](https://vercel.com) → **Add New → Project** → **Import** el repositorio `bdortiz16/XATECH-SERVICES` (conéctalo con GitHub si es la primera vez). Si el repo sigue en la rama `claude/xatech-page-4y4qsp`, en la pantalla de importación elige esa rama (o haz merge a `main` primero).
2. Framework preset: **Other** (no hay build; déjalo todo por defecto).
3. Antes de darle **Deploy**, abre **Environment Variables** y agrega SOLO
   estas tres (todas las demás llaves viven en la tabla `app_config` de
   Supabase, ver arriba):

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | el Project URL de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | la service_role key de Supabase |
| `SESSION_SECRET` | una cadena larga aleatoria (inventa 40+ caracteres) |

4. **Deploy**. Al terminar tendrás la URL, por ejemplo `https://xatech-services.vercel.app`:
   - `/` → landing page de XATECH
   - `/plataforma` → login de la plataforma P2P
   - `/plataforma/panel.html` → módulo de órdenes (requiere sesión)

Sin las variables de Binance/Siigo/Didit la plataforma corre en **modo demo**
(órdenes de ejemplo) — perfecta para probar. Con Supabase configurado, el
estado (chat, KYC, verificaciones, facturas) queda guardado de verdad.

## 3. Conectar los servicios reales (cuando tengas las credenciales)

Agrega estas variables en Vercel (**Settings → Environment Variables**) y haz
**Redeploy**:

| Servicio | Variables | Dónde se consiguen |
|---|---|---|
| Binance | `BINANCE_API_KEY`, `BINANCE_API_SECRET` | Binance → API Management. Permisos mínimos, **sin retiros**, restringida por IP. Chat y liberación por API requieren el programa de comerciante verificado de Binance P2P. |
| Siigo | `SIIGO_USERNAME`, `SIIGO_ACCESS_KEY`, `SIIGO_DOCUMENT_ID`, `SIIGO_SELLER_ID` | Siigo Nube → Configuración → Credenciales API. |
| Didit (KYC) | `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` | Consola de Didit. Configura el webhook: `https://TU-PROYECTO.vercel.app/api/webhooks/didit`. |

## Seguridad

- Las llaves viven **solo** en las variables de entorno de Vercel: nunca en el
  código, el repositorio o el navegador.
- El servidor bloquea **liberar cripto** sin verificar el pago en cuenta y
  **marcar pagado** a contrapartes nuevas sin KYC aprobado.
- La `service_role` de Supabase solo se usa desde las funciones del servidor;
  la tabla tiene RLS activado para que nadie más la lea.
- Cambia `ADMIN_PASSWORD` por una contraseña fuerte antes de compartir la URL.
