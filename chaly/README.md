# Chaly · Portfolio de modelo

Sitio estático de una sola página, en tono oscuro: portada, sobre mí, galería con visor ampliado, servicios y tarifas en pesos, medios de pago y un formulario de contacto que abre WhatsApp.

No necesita build ni dependencias: abrí `index.html` en el navegador o subí la carpeta a cualquier hosting estático (Vercel, Netlify, GitHub Pages).

## Qué personalizar

| Qué | Dónde |
| --- | --- |
| Fotos de la galería | Creá `chaly/fotos/` y reemplazá cada `<div class="ph">…</div>` por `<img src="fotos/01.jpg" alt="…">` |
| Foto de portada | En `<div class="hero-bg">` agregá `style="--hero-img: url('fotos/portada.jpg')"` |
| Retrato de "Sobre mí" | `fotos/retrato.jpg` |
| Altura y datos | Bloque `.stats` |
| Tarifas | Cada `.price` en la sección Servicios |
| Alias, CBU y link de pago | Sección Pagos (texto visible y atributo `data-copy`) |
| WhatsApp | Constante `WHATSAPP` en el `<script>` |
| Mail e Instagram | Pie de página |

Los alias, el CBU, el link de Mercado Pago, el número y el mail son de ejemplo y hay que cambiarlos antes de publicar.
