# Fase 5 — Dimensión Oscura, portales y el Soberano

## Cómo se llega
1. Derrota a los cuatro jefes del mundo (o consigue sus cuatro esencias) y fabrica la **Llave umbría** (4 esencias + 2 lingotes
   de noctisita).
2. Fabrica un **Núcleo de portal** (4 lingotes de noctisita, 4 fragmentos de cristal y 1 de vidrio volcánico).
3. Pon el núcleo y rodéalo, **en el mismo nivel**, con 8 bloques de vidrio volcánico (un anillo de 3×3). Deja libres los dos
   bloques de encima.
4. Clic derecho en el núcleo con la Llave umbría (no se gasta): se enciende y levanta el **Velo umbrío** (2 bloques).
5. Quédate 1,6 s dentro del velo para viajar. Al llegar se busca un portal activo a menos de 20 bloques; si no hay, se
   construye uno de vuelta con una plataforma de 5×5 (sobre el abismo queda flotando a la altura de las islas).

Romper el núcleo o cualquier bloque del anillo cierra el velo. Las coordenadas son 1:1 entre dimensiones.

## Guardado por dimensión
- Los chunks de la Dimensión Oscura se guardan en otro espacio de claves (`<idMundo>~dark/cx,cz`); borrar un mundo borra
  los dos.
- Criaturas dormidas, cofres/hornos y estructuras ya pobladas se guardan por dimensión (`meta.dark` para la oscura; la raíz
  de `meta` para el mundo normal). `meta.dim` dice en qué dimensión está el jugador y `meta.portals` el último portal usado
  en cada una.
- Al viajar se guarda la dimensión que se deja, se cambia de `World` (otro generador, otro almacén) y se cargan los datos de
  la de destino. Al continuar una partida guardada en la Dimensión Oscura se aparece allí.
- Morir en la Dimensión Oscura devuelve al punto de reaparición del mundo normal. No se puede dormir allí.

## Generador (`src/darkterrain.js`)
- Abismo: roca base, piedra umbría ondulada y lagos de lava hasta y = 5.
- Islas flotantes: máscara 2D de ruido (siempre hay tierra junto al origen y bajo la ciudadela), cara superior alrededor de
  y = 64 con colinas, espesor variable (fondos en cono), cavernas 3D dentro; musgo umbrío encima, piedra umbría debajo;
  noctisita (mucho más común que en el mundo normal), cristal y cristales del vacío (luz 12).
- Biomas: **Páramo umbrío** y **Bosque de hongos umbríos** (hongos gigantes con tallo y sombrero luminoso, hierba umbría,
  hongos luminosos).
- Ruinas umbrías: cuatro columnas de ladrillo umbrío, cofre con botín propio y un centinela.
- **Ciudadela del Soberano**: a 150–230 bloques del origen (dirección según la semilla), zigurat de tres pisos con escalinatas
  en los cuatro lados, almenas, columnas con cristales del vacío y el **Trono del Soberano** en lo alto; 4 centinelas.
  `/localizar ciudadela` da su posición.
- Cielo: penumbra violeta permanente con estrellas, sin sol, luna ni nubes; cuenta como noche para las reglas de aparición.

## Criaturas
| Criatura | Tipo | Detalle |
|---|---|---|
| Espectro umbrío | volador | ataque que causa Debilidad; fragmentos de sombra |
| Reptador del vacío | terrestre | rápido; fragmentos de sombra y noctisita |
| Centinela umbrío | guardián | no se aleja de su puesto (ruinas y ciudadela) |
| Polilla lumínica | animal volador | pasiva, brilla |

## Soberano de la Dimensión Oscura (`bosses.js`)
Vida 600, armadura 20 %, vuela sobre la arena. Se despierta con el **Sello del Soberano** (6 fragmentos de sombra, 2 lingotes de
noctisita y un Cristal vital) en su Trono.

| Fase | Ataques |
|---|---|
| Crepúsculo | proyectiles de sombra que persiguen un poco y causan Debilidad; invoca espectros |
| Eclipse (60 %) | se teletransporta por la arena; **rayo del eclipse** anunciado con una línea de partículas (9 + Oscuridad) |
| Colapso (30 %) | columnas de vacío anunciadas con círculos (8, lanzan por los aires); anillo de proyectiles |

**Debilidad:** la luz (×1,5 si hay luz de bloque ≥ 10 donde está: antorchas, faroles…) y la Hoja prismática (×2).
**Recompensa:** Cetro del eclipse (dispara proyectiles de sombra, 500 usos, se repara con fragmentos de sombra), 2 Cristales
vitales, noctisita, fragmentos de sombra y un epílogo en el chat. Logros: «Al otro lado», «Torres en la penumbra», «Fin de la noche».

## Pruebas
`tests/fase5.mjs` (Node): generador (abismo, islas, noctisita, determinismo, ciudadela con trono y centinelas, biomas y botín),
portales (marco, activación, velo, cierre, construcción y búsqueda) y debilidades del Soberano. `tests/e2e/fase5.mjs`
(Chromium): portal real con la llave, viaje y vuelta por el velo, guardado separado por dimensión, salir y continuar en la
Dimensión Oscura, ciudadela, invocación y derrota del Soberano, Cetro del eclipse.
