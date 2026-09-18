# XATECH Services

Página web oficial de **XATECH Services** — desarrollo de software, intermediación tecnológica y consultoría TI.

Estética dev oscura con la paleta de la marca: azul índigo `#45518f`, azul `#6592ea`, azul claro `#85aef2` y turquesa `#58bcd1`, sobre fondo `#0b0e14`. Tipografías: Hanken Grotesk (texto) y JetBrains Mono (etiquetas, tags y terminal).

## Contenido

- `plataforma/` + `api/` + `lib/` — **Plataforma XATECH P2P** (Vercel + Supabase): login + módulo de operaciones Binance P2P (órdenes, chat, KYC, verificación de pagos, liberación y facturación Siigo). Despliegue sin terminal: ver `DEPLOY.md`.

- `index.html` — Landing page autocontenida (HTML + CSS + JS en un solo archivo; solo carga las fuentes de Google Fonts).
- `logo.svg` — Logo oficial de XATECH: cuatro pétalos en azul índigo, azul medio, azul claro y turquesa.
- `logos/` — Logos de productos (SVG, 256×256) en la paleta de marca: commerce, bot, erp, analytics, cloud y secure.

## Secciones (01–08)

1. **Hero** — Titular, badge "Disponibles para nuevos proyectos", 2 CTAs, 3 métricas y terminal animada con cursor parpadeante.
2. **Servicios** — Grid 3×2 con tags mono (`dev/software`, `biz/broker`, ...).
3. **Portafolio** — 3 tarjetas con placeholder rayado y chips de stack.
4. **Consultoría** — Split 50/50 con checklist y 3 pasos numerados.
5. **Proceso** — 4 columnas con borde superior.
6. **Testimonios** — 3 tarjetas con cita.
7. **Stack** — Chips mono de tecnologías.
8. **Planes** — Proyecto / Partner tecnológico (destacado) / Consultoría.

Cierra con CTA de contacto centrado (email) y footer minimalista. Nav sticky con blur.

## Cómo verla

Abre `index.html` directamente en el navegador, o sirve el directorio con cualquier servidor estático:

```bash
python3 -m http.server 8000
# luego visita http://localhost:8000
```

La página es responsive (móvil y escritorio) y no requiere instalación ni build.

<!-- Última actualización: 2026-09-18 -->
