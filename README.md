# DOS RUEDAS — tienda de ropa motera (print on demand)

Marca: **DOS RUEDAS** · *"Dos ruedas. Una vida."* · firma **D.O.S.** (David Ortiz Serrano)
Web: https://magodago.github.io/dos-ruedas/ · Repo: magodago/dos-ruedas

## Estructura
- `index.html` — tienda: 18 diseños, filtros, modal de prenda/talla, carrito, checkout Stripe, FAQ, legales.
- `gracias.html` — post-compra.
- `aviso-legal.html`, `politica-privacidad.html`, `politica-cookies.html`, `declaracion-accesibilidad.html`, `terminos.html`
- `assets/preview/` — imagen de cada diseño para la web (JPG ligero).
- `assets/print-ready/` — archivos de impresión 5400x5400 a 300 DPI con transparencia (DTF) + `logo-cuello.png`.
- `backend/index.js` + `backend/wrangler.toml` — Worker de Cloudflare: Stripe Checkout + webhook que crea el pedido en Gelato.
- `data/productos.json` — catálogo y precios de coste de Gelato (ES/EUR).
- `docs/01-PRECIOS.md` … `04-MARKETING-SEO-AEO.md` — precios, tallas/etiqueta, cobro, marketing.
- `scripts/` — `gelato_ficha.py` (verifica precios y tallas), `paypal_links.py`, `pedido_gelato.py`.

## Precios de venta (envío incluido)
| Prenda | PVP | 2XL/3XL |
|---|---|---|
| Camiseta Classic | 24,95 € | 27,95 € |
| Camiseta Premium (etiqueta en el cuello) | 29,95 € | 32,95 € |
| Sudadera Classic | 44,95 € | 47,95 € |
| Hoodie con capucha | 49,95 € | 52,95 € |

Tallas: S · M · L · XL · 2XL · 3XL · color negro · impresión DTF frontal 4-0.

## Puesta en marcha (una sola vez)
1. `cd backend && npx wrangler login` (cuenta Cloudflare del usuario).
2. Secretos: `npx wrangler secret put STRIPE_SECRET` · `put STRIPE_WEBHOOK_SECRET` · `put GELATO_API_KEY`.
3. `npx wrangler deploy` y copiar la URL del Worker.
4. En Stripe: Developers → Webhooks → añadir endpoint `<url-worker>/webhook/stripe` con el evento `checkout.session.completed`, y copiar el signing secret al paso 2.
5. En `index.html`, poner la URL del Worker en `const API_URL`.

## Verificación antes de vender
- `python3 scripts/gelato_ficha.py --todo` → precios reales y tallas válidas en Gelato.
- Abrir la web en móvil y de escritorio: 18 imágenes cargadas, carrito, checkout.
- Pedido de prueba real a una dirección propia para validar impresión y envío.
