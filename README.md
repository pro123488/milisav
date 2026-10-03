# Inmobiliaria Bosch · sitio web

Página web de **Inmobiliaria Bosch** (Instagram [@inmobiliariabosch](https://www.instagram.com/inmobiliariabosch/)),
de Mily Bosch, agente inmobiliario: compra, venta y financiamiento de propiedades nacionales e internacionales.

Sitio estático (HTML + CSS + JS, sin dependencias ni proceso de compilación). Funciona en cualquier hosting estático
(GitHub Pages, Netlify, Vercel, etc.).

## Ver el sitio en tu computador

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Qué puedes personalizar

### 1. Número de WhatsApp / teléfono

El número está como `573023104354` (302 310 4354 con prefijo de país **57 – Colombia**).
Si el prefijo no es el correcto, busca y reemplaza `573023104354` (WhatsApp) y `+573023104354` (llamadas) en `index.html`.
El formulario toma el número automáticamente de esos enlaces.

### 2. Propiedades

Abre `assets/properties.js` y agrega tus propiedades (hay un ejemplo comentado). Las fotos van en la carpeta `images/`.
Se crean solas las tarjetas y los filtros (Venta, Alquiler, Internacional).
Mientras la lista esté vacía, la sección invita a ver las propiedades en Instagram.

### 3. Foto de Mily

Guarda la foto como `images/mily.jpg` (formato vertical, 4:5) y aparecerá en la sección "Sobre mí".

### 4. Colores y tipografías

Están al inicio de `assets/styles.css`, en `:root` (`--forest`, `--gold`, `--ivory`, …).

### 5. Textos

Todos los textos están en `index.html`. Los textos de servicios, proceso y preguntas frecuentes son una propuesta inicial:
revísalos y ajústalos a cómo trabaja Mily.

## Al publicar con tu dominio

En `index.html`, cambia `og:image` por la URL completa de la imagen
(`https://tudominio.com/assets/og-image.jpg`) para que el enlace se vea bien al compartirlo en WhatsApp y redes.

## Estructura

```
index.html              Página
assets/styles.css       Estilos
assets/main.js          Menú, animaciones, formulario → WhatsApp, propiedades
assets/properties.js    Lista de propiedades (editable)
assets/favicon.svg      Ícono del sitio
assets/og-image.jpg     Imagen al compartir el enlace
images/                 Tus fotos (mily.jpg, propiedades…)
```
