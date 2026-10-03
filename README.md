# Inmobiliaria Bosch · sitio web

Página web de **Inmobiliaria Bosch** (Instagram [@inmobiliariabosch](https://www.instagram.com/inmobiliariabosch/)),
de Mily Bosch, agente inmobiliario: compra, venta y financiamiento de propiedades nacionales e internacionales.

Sitio estático (HTML + CSS + JS, sin dependencias ni proceso de compilación). Funciona en cualquier hosting estático
(GitHub Pages, Netlify, Vercel, etc.).

**Secciones:** encabezado fijo · hero con **simulador de cuota** · servicios · cómo funciona (5 pasos) · sobre Mily ·
propiedades · testimonios (opcional) · preguntas frecuentes · contacto (formulario → WhatsApp) · pie.

## Ver el sitio en tu computador

Descarga el repositorio y abre `index.html` con doble clic, o desde una terminal:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Qué puedes personalizar

### 1. Número de WhatsApp / teléfono

El número está como `573023104354` (302 310 4354 con prefijo de país **57 – Colombia**).
Si el prefijo no es el correcto, busca y reemplaza `573023104354` (WhatsApp) y `+573023104354` (llamadas) en `index.html`.
Los formularios y el simulador toman el número automáticamente de esos enlaces.

### 2. Simulador de cuota

Al inicio de `assets/main.js`, el bloque `SIM` define los valores de partida: moneda (`COP`), valor del inmueble,
porcentaje a financiar, plazo y **tasa de referencia (12 % E.A.)**.

La tasa es solo un punto de partida editable por quien usa el simulador: **no es una tasa ofrecida**. Ajústala a un valor
de referencia que consideres razonable. El simulador calcula una cuota fija mensual (sistema francés) y deja claro en
pantalla que es indicativa y no una oferta de crédito.

### 3. Propiedades

Abre `assets/properties.js` y agrega tus propiedades (hay un ejemplo comentado). Las fotos van en la carpeta `images/`.
Se crean solas las tarjetas y los filtros (Venta, Alquiler, Internacional).
Mientras la lista esté vacía, la sección invita a ver las propiedades en Instagram.

### 4. Testimonios

Abre `assets/testimonios.js` y agrega testimonios **reales** (con permiso de la persona). Mientras la lista esté vacía,
la sección no aparece.

### 5. Foto de Mily

Guarda la foto como `images/mily.jpg` (cuadrada) y aparecerá en la sección "Sobre mí".

### 6. Colores y tipografía

Están al inicio de `assets/styles.css`, en `:root` (`--navy`, `--lime`, `--ash-50`, …). La tipografía es Garet
(Fontshare, cargada desde `index.html`).

### 7. Textos

Todos los textos están en `index.html`. Los de servicios, proceso y preguntas frecuentes son una propuesta inicial:
revísalos y ajústalos a cómo trabaja Mily.

## Al publicar con tu dominio

En `index.html`, cambia `og:image` por la URL completa de la imagen
(`https://tudominio.com/assets/og-image.jpg`) para que el enlace se vea bien al compartirlo en WhatsApp y redes.

## Estructura

```
index.html              Página
assets/styles.css       Estilos
assets/main.js          Menú, simulador, formulario → WhatsApp, propiedades, testimonios
assets/properties.js    Lista de propiedades (editable)
assets/testimonios.js   Lista de testimonios (editable, opcional)
assets/favicon.svg      Ícono del sitio
assets/og-image.jpg     Imagen al compartir el enlace
images/                 Tus fotos (mily.jpg, propiedades…)
```
