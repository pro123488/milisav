# Inmobiliaria Bosch · sitio web

Página web de **Inmobiliaria Bosch** (Instagram [@inmobiliariabosch](https://www.instagram.com/inmobiliariabosch/)),
de Mily Bosch, agente inmobiliario: compra, venta y financiamiento de propiedades nacionales e internacionales.
Lema de la página: **«Tómate tu tiempo»**.

**`index.html` es el sitio final**: un solo archivo con el diseño, el código y las tipografías incluidos, así que se ve
igual en cualquier lugar (doble clic en tu computador, GitHub Pages, Netlify, Vercel…). No necesita instalar nada ni
conexión para las tipografías. Usa el estilo **Nebulosa** (azul noche con magenta y turquesa).

**Secciones:** menú flotante · inicio con selector «Comprar / Vender / Financiar / En el exterior» (abre WhatsApp) ·
cinta animada · servicios (lista) · **simulador de cuota** · cómo funciona (5 pasos) · sobre Mily · propiedades ·
testimonios (opcional) · preguntas frecuentes · contacto (formulario → WhatsApp) · pie (con botón «Pausar animaciones»).

> La página de referencia (monetraglobal.com) se usó solo como guía de ideas. La estructura, los textos y el estilo
> de esta página son propios.

## Ver el sitio

Abre `index.html` con doble clic. O desde una terminal:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Otros estilos de diseño: `estilos.html`

`estilos.html` es una versión anterior de la página con **51 estilos** para probar (paletas, tipografías, formas y
estructura distintas). Ábrela y pulsa el botón **«Estilos»** (abajo a la izquierda); también puedes cambiar con las
flechas ← → del teclado y copiar un enlace de cada estilo (`estilos.html#estilo=ID`). **Nebulosa** es uno de ellos.
Sirve para comparar y elegir colores; el sitio final es `index.html`.

## Qué puedes personalizar (en `index.html`)

### 1. Número de WhatsApp / teléfono

El número está como `573023104354` (302 310 4354 con prefijo de país **57 – Colombia**).
Si el prefijo no es el correcto, busca y reemplaza `573023104354` (WhatsApp) y `+573023104354` (llamadas).
Los formularios y el simulador toman el número automáticamente de esos enlaces.

### 2. Propiedades, testimonios y simulador

Cerca del final de `index.html` hay un bloque llamado **`DATOS EDITABLES`** con las instrucciones y ejemplos:

- **`PROPIEDADES`**: agrega tus propiedades (las fotos van en la carpeta `images/`). Se crean solas las tarjetas y los
  filtros (Venta, Alquiler, Internacional). Mientras la lista esté vacía, la sección invita a ver las propiedades en Instagram.
- **`TESTIMONIOS`**: agrega testimonios **reales** (con permiso de la persona). Mientras esté vacío, la sección no aparece.
- **`SIM`**: valores iniciales del simulador (moneda, valor, porcentaje, plazo y **tasa de ejemplo, 12 % E.A.**).
  La tasa es solo un punto de partida editable por quien usa el simulador: **no es una tasa ofrecida**. El simulador
  calcula una cuota fija mensual (sistema francés) y deja claro en pantalla que es indicativa y no una oferta de crédito.

### 3. Foto de Mily

Guarda la foto como `images/mily.jpg` (vertical, 4:5) y aparecerá en la sección «Sobre mí».

### 4. Colores

Al final de los estilos de `index.html`, en el bloque **`ESTILO FIJO: Nebulosa`**, están las variables de color
(`--dk`, `--ac`, `--ac-2`, …). Cámbialas ahí. Las tipografías (Syne y Manrope, licencia OFL) van incrustadas.
Si prefieres otro estilo completo, dime cuál (o míralos en `estilos.html`) y lo dejo listo.

### 5. Textos

Todos los textos están en `index.html`. Los de servicios, proceso y preguntas frecuentes son una propuesta inicial, escrita en primera persona (como si hablara Mily):
revísalos y ajústalos a cómo trabaja Mily.

## Al publicar con tu dominio

En `index.html`, cambia `og:image` por la URL completa de la imagen
(`https://tudominio.com/assets/og-image.jpg`) para que el enlace se vea bien al compartirlo en WhatsApp y redes.

## Estructura

```
index.html              Sitio final (estilo Nebulosa: diseño, código, tipografías y datos editables)
estilos.html            51 estilos para probar (selector «Estilos»)
assets/og-image.jpg     Imagen al compartir el enlace
assets/apple-touch-icon.png  Ícono para iPhone
assets/favicon.svg      Ícono del sitio (también va incrustado en los HTML)
images/                 Tus fotos (mily.jpg, propiedades…)
```
