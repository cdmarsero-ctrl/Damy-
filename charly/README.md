# Charly · Portfolio de modelo

Sitio estático de una sola página, en tono oscuro: portada, sobre mí, carrusel de fotos con visor ampliado, servicios y tarifas en pesos, medios de pago y un formulario de contacto que abre WhatsApp.

No necesita build ni dependencias: abrí `index.html` en el navegador o subí la carpeta a cualquier hosting estático (Vercel, Netlify, GitHub Pages).

## Qué personalizar

| Qué | Dónde |
| --- | --- |
| Fotos del carrusel | Copialas a `charly/fotos/` y agregá un `<figure><img src="fotos/…" alt="…"></figure>` dentro de `#gallery` |
| Foto de portada | `--hero-img` en `<div class="hero-bg">` (hoy `fotos/02-silueta.jpg`) |
| Retrato de "Sobre mí" | `.about-photo` (hoy `fotos/01-sillon.jpg`) |
| Altura y datos | Bloque `.stats` |
| Tarifas | Cada `.price` en la sección Servicios |
| Alias, CBU y link de pago | Sección Pagos (texto visible y atributo `data-copy`) |
| WhatsApp | Constante `WHATSAPP` en el `<script>` |
| Mail e Instagram | Pie de página |

Los alias, el CBU, el link de Mercado Pago, el número y el mail son de ejemplo y hay que cambiarlos antes de publicar.
