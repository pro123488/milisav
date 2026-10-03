# Inmobiliaria Bosch · sitio web

Página web de **Inmobiliaria Bosch** (Instagram [@inmobiliariabosch](https://www.instagram.com/inmobiliariabosch/)),
de Mily Bosch, agente inmobiliario: compra, venta y financiamiento de propiedades nacionales e internacionales.

**Es un solo archivo (`index.html`)**: el diseño, el código y las tipografías van incluidos, así que se ve igual en
cualquier lugar (doble clic en tu computador, GitHub Pages, Netlify, Vercel, un visor de archivos…). No necesita
instalar nada ni conexión para las tipografías.

**Secciones:** menú flotante · hero con selector "Comprar / Vender / Financiar / En el exterior" y **simulador de cuota** ·
cinta animada · servicios (cuadrícula bento) · cómo funciona (5 pasos) · sobre Mily · propiedades · testimonios
(opcional) · preguntas frecuentes · contacto (formulario → WhatsApp) · pie.

## Ver el sitio

Abre `index.html` con doble clic. O desde una terminal:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Qué puedes personalizar

### 1. Número de WhatsApp / teléfono

El número está como `573023104354` (302 310 4354 con prefijo de país **57 – Colombia**).
Si el prefijo no es el correcto, busca y reemplaza `573023104354` (WhatsApp) y `+573023104354` (llamadas) en `index.html`.
Los formularios y el simulador toman el número automáticamente de esos enlaces.

### 2. Propiedades, testimonios y simulador

Cerca del final de `index.html` hay un bloque llamado **`DATOS EDITABLES`** con las instrucciones y ejemplos:

- **`PROPIEDADES`**: agrega tus propiedades (las fotos van en la carpeta `images/`). Se crean solas las tarjetas y los
  filtros (Venta, Alquiler, Internacional). Mientras la lista esté vacía, la sección invita a ver las propiedades en Instagram.
- **`TESTIMONIOS`**: agrega testimonios **reales** (con permiso de la persona). Mientras esté vacío, la sección no aparece.
- **`SIM`**: valores iniciales del simulador (moneda, valor, porcentaje, plazo y **tasa de referencia, 12 % E.A.**).
  La tasa es solo un punto de partida editable por quien usa el simulador: **no es una tasa ofrecida**. El simulador
  calcula una cuota fija mensual (sistema francés) y deja claro en pantalla que es indicativa y no una oferta de crédito.

### 3. Foto de Mily

Guarda la foto como `images/mily.jpg` (vertical, 4:5) y aparecerá en la sección "Sobre mí", dentro del arco.

### 4. Colores

Están al inicio de los estilos de `index.html`, en `:root` (`--navy`, `--lime`, `--paper`, …).
Las tipografías (Bricolage Grotesque y Plus Jakarta Sans, licencia OFL) están incrustadas en el archivo.

### 5. Textos

Todos los textos están en `index.html`. Los de servicios, proceso y preguntas frecuentes son una propuesta inicial:
revísalos y ajústalos a cómo trabaja Mily.

## Al publicar con tu dominio

En `index.html`, cambia `og:image` por la URL completa de la imagen
(`https://tudominio.com/assets/og-image.jpg`) para que el enlace se vea bien al compartirlo en WhatsApp y redes.

## Estructura

```
index.html              Todo el sitio (diseño, código, tipografías y datos editables)
assets/og-image.jpg     Imagen al compartir el enlace
assets/apple-touch-icon.png  Ícono para iPhone
assets/favicon.svg      Ícono del sitio (también va incrustado en index.html)
images/                 Tus fotos (mily.jpg, propiedades…)
```
