// DOS RUEDAS — checkout (Stripe) + fulfillment automático (Gelato)
// Desplegar:  cd backend && npx wrangler deploy
// Secretos (NO en el código):  npx wrangler secret put STRIPE_SECRET / STRIPE_WEBHOOK_SECRET / GELATO_API_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature',
};
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });

// ---------- Catálogo de prendas: precio de venta + UID de Gelato ----------
// Tallas: s m l xl 2xl 3xl (negro). Recargo de talla grande: +3,00 €.
const RECARGO_XXL = 300;
const PRENDAS = {
  camiseta_classic: {
    nombre: 'Camiseta Classic', precio: 2495,
    uid: (s) => `apparel_product_gca_t-shirt_gsc_crewneck_gcu_unisex_gqa_heavy-weight_gsi_${s}_gco_black_gpr_4-0-dtf_gildan_5000`,
  },
  camiseta_premium: {
    nombre: 'Camiseta Premium (etiqueta DOS RUEDAS en el cuello)', precio: 2995,
    uid: (s) => `apparel_product_gca_t-shirt_gsc_crewneck_gcu_unisex_gqa_heavy-weight_gsi_${s}_gco_black_gpr_4-0-dtf_inlbl-dtf_gildan_5000`,
  },
  sudadera_classic: {
    nombre: 'Sudadera Classic', precio: 4495,
    uid: (s) => `apparel_product_gca_sweatshirt_gsc_crewneck_gcu_unisex_gqa_classic_gsi_${s}_gco_black_gpr_4-0`,
  },
  hoodie_classic: {
    nombre: 'Hoodie con capucha', precio: 4995,
    uid: (s) => `apparel_product_gca_hoodie_gsc_pullover_gcu_unisex_gqa_classic_gsi_${s}_gco_black_gpr_4-0`,
  },
};
const TALLAS = ['s', 'm', 'l', 'xl', '2xl', '3xl'];
const GRANDES = ['2xl', '3xl'];

// 18 diseños: slug -> nombre. Los archivos de impresión viven en assets/print-ready/<slug>.png
const DISENOS = {
  '01-calavera-llamas': 'Calavera en Llamas',
  '02-rider-atardecer': 'Rider al Atardecer',
  '03-motor-alado': 'Motor Alado',
  '04-calavera-gafas': 'Calavera con Gafas',
  '05-calavera-motero': 'Calavera Motero',
  '06-motera-vintage': 'Motera Vintage',
  '07-lobo-gafas': 'Lobo con Gafas',
  '08-serpiente-llaves': 'Serpiente y Llaves',
  '09-moto-clasica': 'Moto Clásica',
  '10-motor-llamas': 'Motor en Llamas',
  '11-carretera-atardecer': 'Carretera al Atardecer',
  '12-perro-sidecar': 'Perro en Sidecar',
  '13-chopper-negro': 'Chopper Negro',
  '14-rider-chopper': 'Rider Chopper',
  '15-rider-bosque': 'Rider en el Bosque',
  '16-moto-montanas': 'Moto en las Montañas',
  '17-emblema-taller': 'Emblema del Taller',
  '18-aguila-motor': 'Águila Motor',
};
const ASSETS = 'https://magodago.github.io/dos-ruedas/assets/print-ready/';
const LOGO_CUELLO = 'https://magodago.github.io/dos-ruedas/assets/print-ready/logo-cuello.png';

const precioDe = (prenda, talla) => PRENDAS[prenda].precio + (GRANDES.includes(talla) ? RECARGO_XXL : 0);

export default {
  async fetch(request, env) {
    // Endpoint auxiliar: recibe el codigo de autorizacion OAuth (Pinterest)
    if (new URL(request.url).pathname === '/callback') {
      const q = new URL(request.url).searchParams;
      const c = q.get('code') || q.get('error') || 'sin codigo';
      return new Response('<html><body style="font-family:sans-serif;background:#0a0a14;color:#f2ede4;text-align:center;padding:60px"><h2>Codigo de autorizacion</h2><p style="font-size:1.05rem;word-break:break-all">' + c + '</p></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    // Endpoint auxiliar: recibe el codigo de autorizacion OAuth (Pinterest)
    if (new URL(request.url).pathname === '/callback') {
      const q = new URL(request.url).searchParams;
      const c = q.get('code') || q.get('error') || 'sin codigo';
      return new Response('<html><body style="font-family:sans-serif;background:#0a0a14;color:#f2ede4;text-align:center;padding:60px"><h2>Codigo de autorizacion</h2><p style="font-size:1.05rem;word-break:break-all">' + c + '</p></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/' || url.pathname === '/health') {
      return j({ ok: true, tienda: 'DOS RUEDAS', prendas: Object.keys(PRENDAS), disenos: Object.keys(DISENOS).length });
    }

    // ---------- 1. Crear sesión de pago (Stripe) ----------
    if (url.pathname === '/create-checkout' && request.method === 'POST') {
      try {
        const body = await request.json();
        const items = Array.isArray(body.items) ? body.items : [];
        if (!items.length) return j({ error: 'Carrito vacío' }, 400);

        const params = [];
        let total = 0;
        const limpios = [];
        items.forEach((it, i) => {
          const bruto = String(it.prenda || '').toLowerCase();
          const ALIAS = { camiseta: 'camiseta_classic', basica: 'camiseta_classic', 'camiseta-classic': 'camiseta_classic',
                          premium: 'camiseta_premium', sudadera: 'sudadera_classic', hoodie: 'hoodie_classic' };
          const prenda = ALIAS[bruto] || bruto;
          const talla = String(it.talla || '').toLowerCase();
          const slug = String(it.diseno || '');
          const cant = Math.max(1, Math.min(10, parseInt(it.cantidad) || 1));
          if (!PRENDAS[prenda] || !TALLAS.includes(talla) || !DISENOS[slug]) return;
          const precio = precioDe(prenda, talla);
          total += precio * cant;
          limpios.push({ prenda, talla, slug, cant, precio });
          params.push(`line_items[${i}][price_data][currency]=eur`);
          params.push(`line_items[${i}][price_data][unit_amount]=${precio}`);
          params.push(`line_items[${i}][price_data][product_data][name]=${encodeURIComponent(PRENDAS[prenda].nombre + ' · ' + DISENOS[slug] + ' · Talla ' + talla.toUpperCase())}`);
          params.push(`line_items[${i}][price_data][product_data][images][0]=${encodeURIComponent('https://magodago.github.io/dos-ruedas/assets/preview/' + slug + '.jpg')}`);
          params.push(`line_items[${i}][quantity]=${cant}`);
        });
        if (!limpios.length) return j({ error: 'Artículos no válidos' }, 400);

        params.push('mode=payment');
        params.push(`success_url=${encodeURIComponent('https://magodago.github.io/dos-ruedas/gracias.html')}`);
        params.push(`cancel_url=${encodeURIComponent('https://magodago.github.io/dos-ruedas/#coleccion')}`);
        params.push('locale=es');
        params.push('shipping_address_collection[allowed_countries][0]=ES');
        params.push(`metadata[carrito]=${encodeURIComponent(JSON.stringify(limpios).slice(0, 480))}`);

        const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.join('&'),
        });
        const s = await r.json();
        if (!r.ok) return j({ error: 'Stripe', detalle: s.error && s.error.message }, 500);
        return j({ url: s.url, id: s.id, total });
      } catch (e) { return j({ error: e.message }, 500); }
    }

    // ---------- 2. Webhook de Stripe -> pedido a Gelato ----------
    if (url.pathname === '/webhook/stripe' && request.method === 'POST') {
      const raw = await request.text();
      const firma = request.headers.get('Stripe-Signature') || '';
      if (!(await firmaValida(raw, firma, env.STRIPE_WEBHOOK_SECRET))) return j({ error: 'Firma no válida' }, 400);

      let evento;
      try { evento = JSON.parse(raw); } catch (e) { return j({ error: 'JSON inválido' }, 400); }
      if (evento.type !== 'checkout.session.completed') return j({ ok: true, ignorado: evento.type });

      const ses = evento.data.object;
      const dir = ses.shipping_details || ses.customer_details || {};
      const addr = dir.address || {};
      let carrito = [];
      try { carrito = JSON.parse(ses.metadata.carrito || '[]'); } catch (e) { return j({ error: 'Carrito ilegible' }, 400); }

      const pedidos = [];
      for (const it of carrito) {
        const prenda = PRENDAS[it.prenda];
        if (!prenda) continue;
        const uid = prenda.uid(it.talla);
        const files = [{ type: 'default', url: ASSETS + it.slug + '.png' }];
        if (it.prenda === 'camiseta_premium') files.push({ type: 'inner_label', url: LOGO_CUELLO });
        const cuerpo = {
          orderType: 'order',
          orderReferenceId: 'DR-' + (ses.id || '').slice(-10) + '-' + it.slug.slice(0, 2) + it.talla,
          customerReferenceId: dir.email || ses.customer_details?.email || 'dosruedas',
          currency: 'EUR',
          items: [{
            itemReferenceId: it.slug + '-' + it.talla,
            productUid: uid,
            quantity: it.cant,
            files,
          }],
          shippingAddress: {
            firstName: dir.name || 'Cliente',
            lastName: '',
            addressLine1: addr.line1 || '',
            addressLine2: addr.line2 || '',
            city: addr.city || '',
            postCode: addr.postal_code || '',
            state: addr.state || '',
            country: addr.country || 'ES',
            email: dir.email || ses.customer_details?.email || '',
            phone: dir.phone || '',
          },
        };
        const r = await fetch('https://order.gelatoapis.com/v4/orders', {
          method: 'POST',
          headers: { 'X-API-KEY': env.GELATO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo),
        });
        const res = await r.json();
        pedidos.push({ slug: it.slug, talla: it.talla, ok: r.ok, gelato: res.id || res.message || res });
      }
      return j({ ok: true, pedidos });
    }

    return j({ error: 'Ruta no encontrada' }, 404);
  },
};

// Verificación de la firma de Stripe (HMAC SHA-256 sobre el cuerpo crudo)
async function firmaValida(payload, cabecera, secreto) {
  if (!secreto) return false;
  const partes = Object.fromEntries(cabecera.split(',').map(p => p.split('=')));
  if (!partes.t || !partes.v1) return false;
  const enc = new TextEncoder();
  const clave = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', clave, enc.encode(partes.t + '.' + payload));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === partes.v1;
}
