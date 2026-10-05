# Inmobiliaria Bosch · sitio web

Página web de **Inmobiliaria Bosch** (Instagram [@inmobiliariabosch](https://www.instagram.com/inmobiliariabosch/)):
compra, venta y financiamiento de propiedades en Colombia, con atención de un ejecutivo.
Lema de la página: **«Tómate tu tiempo»**.

**`index.html` es el sitio final**: un solo archivo con el diseño, el código y las tipografías incluidos, así que se ve
igual en cualquier lugar (doble clic en tu computador, GitHub Pages, Netlify, Vercel…). No necesita instalar nada ni
conexión para las tipografías. Usa el estilo **Nebulosa** (azul noche con magenta y turquesa).

**Secciones:** menú flotante · inicio con selector «Comprar / Vender / Financiar» (abre WhatsApp) · cinta animada ·
servicios (lista) · **simulador de cuota con las 3 mejores tasas de banco** · cómo funciona (5 pasos) · tu ejecutivo ·
propiedades · testimonios (opcional) · preguntas frecuentes · contacto (formulario → WhatsApp) · pie (con botón
«Pausar animaciones»).

## Para Google Sites

Google Sites solo permite pegar código dentro de bloques (*Insertar → Incorporar → Código para insertar*), así que el sitio
también está separado **por partes** en la carpeta [`google-sites/`](google-sites/): un archivo por parte (inicio, servicios,
simulador, cómo funciona, tu ejecutivo, propiedades, preguntas, contacto, pie…), cada uno con su diseño, código y datos.
Las instrucciones paso a paso, los altos de cada bloque y qué se puede editar están en
[`google-sites/LEEME.md`](google-sites/LEEME.md). Si publicas en otro lado (tu dominio, Netlify, GitHub Pages…), usa `index.html`.

## Ver el sitio

Abre `index.html` con doble clic. O desde una terminal:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Simulador y tasas de banco

- Campos: **valor del inmueble**, **valor exacto a financiar** (el cliente escribe el monto; debajo se muestra a qué
  porcentaje del inmueble equivale), plazo y tasa.
- **Las 3 mejores tasas de banco**: la página elige sola las 3 con la tasa «desde» más baja **en pesos** para el tipo de crédito
  (Hipotecario, Compra de cartera, Leasing, Remodelación) y la vivienda (VIS / No VIS) que se escoja. Al tocar un banco,
  su tasa se usa en la simulación y se ve la cuota estimada con cada banco.
- **Todos los bancos van guardados dentro de la página** (bloque `BANCOS`, ver abajo), con las tasas del consolidado de
  **septiembre de 2026** (pesos y UVR). Solo se muestran las 3 mejores.
- Si un tipo de crédito lo ofrecen menos de 3 bancos (por ejemplo, Leasing VIS), se muestran los que haya y la página lo avisa.
- La tasa se puede escribir con coma o con punto (12,74 o 12.74). Si escribes tu propia tasa, la página la respeta al cambiar de tipo de crédito.
- Las tasas son **de referencia**: sujetas a estudio crediticio y a los términos y condiciones de cada banco. La cuota
  calculada es indicativa (cuota fija mensual, sistema francés), no incluye seguros ni otros costos y no es una oferta.

### Actualizar las tasas cada mes

Cerca del final de `index.html`, en `DATOS EDITABLES`, está `window.BANCOS`. Cambia la `fecha`, la `fuente` (texto que se muestra bajo la lista, p. ej. «Consolidado de tasas, octubre de 2026»), la `nota` y los números
de cada banco. Cada tasa es `[desde, hasta]` en % E.A. (en UVR es el margen: UVR + x %); `null` significa que el banco no
ofrece esa modalidad. Puedes agregar bancos copiando un bloque `{ banco: "…", hipotecario: {…}, … }`.

## Qué puedes personalizar (en `index.html`)

### 1. Número de WhatsApp / teléfono

El número está como `573023104354` (302 310 4354 con prefijo de país **57 – Colombia**).
Si el prefijo no es el correcto, busca y reemplaza `573023104354` (WhatsApp) y `+573023104354` (llamadas).
Los formularios y el simulador toman el número automáticamente de esos enlaces.

### 2. Propiedades, testimonios y simulador

En el bloque **`DATOS EDITABLES`** (cerca del final de `index.html`) hay instrucciones y ejemplos:

- **`PROPIEDADES`**: agrega tus propiedades (las fotos van en la carpeta `images/`). Se crean solas las tarjetas y los
  filtros (Venta, Alquiler). Mientras la lista esté vacía, la sección invita a ver las propiedades en Instagram.
  El servicio «Propiedades en Colombia y exterior» también lleva directo al Instagram.
- **`TESTIMONIOS`**: agrega testimonios **reales** (con permiso de la persona). Mientras esté vacío, la sección no aparece.
- **`SIM`**: valores iniciales del simulador (moneda, valor, porcentaje y plazo).
- **`BANCOS`**: las tasas de los bancos (ver arriba).

### 3. Foto del ejecutivo

Guarda la foto como `images/ejecutivo.jpg` (vertical, 4:5) y aparecerá en la sección «Tu ejecutivo».

### 4. Colores

Al final de los estilos de `index.html`, en el bloque **`ESTILO FIJO: Nebulosa`**, están las variables de color
(`--dk`, `--ac`, `--ac-2`, …). Cámbialas ahí. Las tipografías (Syne y Manrope, licencia OFL) van incrustadas.

### 5. Textos

Todos los textos están en `index.html` (la mayoría escritos como si hablara el ejecutivo; algunos, como «Conectamos con los compradores indicados», en plural).
Los de servicios, proceso y preguntas frecuentes son una propuesta inicial: revísalos y ajústalos.

## Otros estilos de diseño: `estilos.html`

`estilos.html` es una versión anterior de la página (con la estructura de antes; ya con los textos de Colombia y «ejecutivo», pero **sin** el campo «Valor a financiar» ni el panel de tasas de banco, que solo están en `index.html`) que trae **51 estilos** para
probar. Ábrela y pulsa el botón **«Estilos»**. Sirve solo para comparar colores y tipografías; **Nebulosa** es uno de ellos.

## Al publicar con tu dominio

En `index.html`, cambia `og:image` por la URL completa de la imagen
(`https://tudominio.com/assets/og-image.jpg`) para que el enlace se vea bien al compartirlo en WhatsApp y redes.

## Estructura

```
google-sites/          El sitio separado por partes para pegar en Google Sites (ver LEEME.md)
index.html              Sitio final (estilo Nebulosa: diseño, código, tipografías, tasas y datos editables)
estilos.html            51 estilos para probar (versión anterior, selector «Estilos»)
assets/og-image.jpg     Imagen al compartir el enlace
assets/apple-touch-icon.png  Ícono para iPhone
assets/favicon.svg      Ícono del sitio (también va incrustado en los HTML)
images/                 Fotos (ejecutivo.jpg, propiedades…)
```
