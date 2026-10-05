# Inmobiliaria Bosch en Google Sites

Google Sites no permite subir páginas web completas: solo deja **pegar código dentro de bloques**
(*Insertar → Incorporar*). Cada bloque funciona aislado de los demás. Por eso el sitio está separado en
**partes**: cada archivo de esta carpeta es una parte lista para pegar en un bloque, con su diseño, su código
y sus datos adentro. Se ven igual que en `index.html` (el sitio en un solo archivo, para otros alojamientos).

## Las partes (de arriba hacia abajo)

| N.º | Archivo | Parte | Alto del bloque (celular · computador) | Color de fondo |
|---|---|---|---|---|
| 01 | `01-encabezado.html` | Encabezado *(opcional)* | 110 px · 110 px | `#080a24` |
| 02 | `02-inicio.html` | Inicio | 1190 px · 830 px | `#080a24` |
| 03 | `03-cinta.html` | Cinta animada *(opcional)* | 80 px · 100 px | `#ff7ddd` |
| 04 | `04-servicios.html` | Servicios | 1890 px · 1530 px | `#f3f2ff` |
| 05 | `05-simulador.html` | Simulador y tasas de banco | 2940 px · 1830 px | `#101338` |
| 06 | `06-como-funciona.html` | Cómo funciona | 1550 px · 1110 px | `#ffffff` |
| 07 | `07-tu-ejecutivo.html` | Tu ejecutivo | 1650 px · 1050 px | `#f3f2ff` |
| 08 | `08-propiedades.html` | Propiedades | 1150 px · 950 px | `#ffffff` |
| 09 | `09-testimonios.html` | Testimonios *(opcional)* | según el contenido | `#101338` |
| 10 | `10-preguntas.html` | Preguntas frecuentes | 1160 px · 870 px | `#f3f2ff` |
| 11 | `11-contacto.html` | Contacto | 1680 px · 1080 px | `#080a24` |
| 12 | `12-pie.html` | Pie de página | 1160 px · 670 px | `#04051a` |

- Las partes *opcionales* puedes omitirlas. Si no pegas la parte 09 (testimonios), no hace falta tocar nada más.
- **Alto del bloque:** Google Sites usa un alto fijo para cada bloque. Usa el número de **celular** (el mayor) para que nada se
  corte en ningún aparato: en computador sobrará un poco de espacio, pero tiene el mismo color y no se nota. Si prefieres que se
  vea más ajustado en computador, usa el de computador (en celular aparecerá una barra para bajar dentro del bloque).
- **Color de fondo:** si ves franjas de otro color a los lados de un bloque, ponle a esa sección de Google Sites el color de la tabla
  (en la sección: ícono de pintura → *Personalizado* → pega el código `#...`).

## Cómo pegar cada parte (paso a paso)

1. Abre el archivo de la parte (por ejemplo `04-servicios.html`) con el Bloc de notas o desde GitHub (botón **Raw**).
   Selecciona **todo** (Ctrl + A) y copia (Ctrl + C).
2. En Google Sites, en el panel de la derecha, pulsa **Insertar → Incorporar** y elige la pestaña
   **Código para insertar** (en inglés: *Insert → Embed → Embed code*).
3. Pega (Ctrl + V), pulsa **Siguiente** y luego **Insertar**.
4. Estira el bloque a todo lo ancho y ajusta el alto según la tabla (arrastra el borde inferior).
5. Repite con la siguiente parte, **en el orden de la tabla**, una debajo de otra.
6. Revisa con la **Vista previa** (ícono del ojo), también en celular, y cuando todo esté bien pulsa **Publicar**.

## Qué puedes cambiar (dentro de cada archivo)

- **Número de WhatsApp:** busca `573023104354` y reemplázalo en **todos** los archivos (en el Bloc de notas: Ctrl + H).
  Hazlo igual con `+573023104354` (el enlace para llamar, en las partes 11 y 12). Es el 302 310 4354 con el 57 de Colombia.
- **Tasas de banco (parte 05):** al principio del código está `BANCOS`. Cambia los números cada mes y la `fecha`.
  Cada tasa es `[desde, hasta]` en % E.A.; `null` = el banco no ofrece esa modalidad. La página muestra las 3 más bajas.
- **Propiedades (parte 08):** al principio del código está `PROPIEDADES`, con un ejemplo. Las fotos deben ser una dirección
  completa (`https://...`), porque aquí no hay carpeta de imágenes. Al agregar propiedades, aumenta el alto del bloque.
- **Testimonios (parte 09):** solo testimonios reales y con permiso. Si la usas, en la parte 10 (Preguntas) cambia
  `--parte-anterior` a `#101338` para que la diagonal encaje.
- **Foto del ejecutivo (parte 07):** pega la dirección completa de la imagen en `FOTO_EJECUTIVO`.
- **Enlaces entre partes (`ENLACES`):** las partes no se pueden «ver» entre sí. Si quieres que el menú, «Simular» o «Hablemos»
  lleven a otra página de tu sitio, pega la dirección de esa página en `ENLACES` (al final del código de la parte).
  Si lo dejas vacío, los botones abren WhatsApp (o se ocultan si no tienen sentido sin enlace).
  Si un enlace no abre, cambia `ABRIR_EN` de `"_top"` a `"_blank"` (se abrirá en una pestaña nueva).
- **Textos:** son HTML sencillo; busca el texto y cámbialo (sin borrar las etiquetas `<...>`).

## Lo que cambia respecto a `index.html` (por cómo funciona Google Sites)

- Sin menú flotante ni botón redondo de WhatsApp flotante: usa el menú de Google Sites (o la parte 01) y los botones de cada parte.
- Sin la animación de aparición al bajar; el resto de animaciones se mantiene. El botón «Pausar animaciones» (pie) intenta pausarlas también en las demás partes (depende de que Google Sites lo permita).
- Las tipografías (Syne y Manrope) se cargan desde Google Fonts; hace falta internet.
- Lo que va dentro de un bloque incorporado **no aparece en el buscador de Google Sites**. Para que Google encuentre tu página,
  escribe el título y una descripción en cuadros de texto normales de Google Sites.
- Las simulaciones y tasas son de referencia, no una oferta ni aprobación de crédito.
