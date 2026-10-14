# Fase 2 — Escaleras, puertas y vallas (especificación)

Objetivo: añadir al juego (carpeta `blockworld-ultimate/`) bloques con **forma y orientación**:
escaleras (de bloque) y escaleras de mano, puertas (madera y hierro) que se abren, vallas de madera,
muros de adoquín y puertas de valla. Deben verse, colisionar, poder apuntarse, colocarse orientadas,
abrirse/cerrarse, romperse correctamente, fabricarse, guardarse y aparecer en algunas estructuras.

## Decisión clave: estados como IDs de variante (sin capa de metadatos)

El motor guarda un `Uint8Array` de IDs por chunk y todas las tablas calientes (`B_SOLID`, `B_SHAPE`,
`B_OPAQUE`, `B_TILE`...) se indexan por ID. En vez de añadir una capa de metadatos por chunk (afectaría
guardado, worker, mallado con relleno, luz...), cada estado es **un ID propio** dentro de una "familia":

| Familia | Variantes | IDs | Fórmula |
|---|---|---|---|
| Escaleras (5 materiales: tablones, adoquín, piedra tallada, ladrillos, arenisca) | 4 orientaciones × 2 (normal / invertida) | 101–140 | `base + facing + 4*top` |
| Escalera de mano | 4 orientaciones (lado del muro) | 141–144 | `base + dir` |
| Puerta de madera / de hierro | 4 orientaciones × abierta/cerrada × mitad inferior/superior | 145–160 / 161–176 | `base + facing + 4*open + 8*upper` |
| Valla de madera | 1 (las conexiones se calculan con los vecinos) | 177 | — |
| Muro de adoquín | 1 (conexiones por vecinos) | 178 | — |
| Puerta de valla (madera) | 4 orientaciones × abierta/cerrada | 179–186 | `base + facing + 4*open` |

Quedan 69 IDs libres (máx. 255). Los IDs se añaden al final (compatibles con los mundos guardados).
Si en el futuro faltan IDs se migrará a `Uint16Array`.

Convención de orientación (`facing`): 0 = Norte (−Z), 1 = Este (+X), 2 = Sur (+Z), 3 = Oeste (−X).
Rotación de cajas: girar 90° = `(x, z) → (1 − z, x)` alrededor del centro aplicado `facing` veces
sobre la caja definida para Norte (comprobado: N→E→S→W).

## Nuevos campos en `blocks.js`

`family` (`stairs|ladder|door|fence|wall|gate`), `famBase` (ID de la variante base), `facing`, `top`
(escalera invertida), `open`, `upper` (mitad de puerta), `material` (clave del bloque de origen de las
texturas/sonido). Solo la variante base es `placeable` (tiene objeto); las demás sueltan el objeto
base (`drops`). La mitad superior de la puerta no suelta nada (lo hace la inferior). Tabla nueva
`B_FAMILY` (Uint8) y ampliación de `SHAPE_ID`: `stairs 7, ladder 8, door 9, fence 10, wall 11, gate 12`.
Todas estas formas son `solid` (salvo puerta de valla abierta) y **no opacas** (`atten 0`, no tapan caras
vecinas ni hacen AO).

## Nuevo módulo `src/shapes.js` (sin DOM, compartido por mallado, física y raycast)

Cajas en coordenadas locales del bloque `[x0,y0,z0,x1,y1,z1]` (en 1/16 → /16):

- Escalera (Norte, normal): losa `[0,0,0,1,.5,1]` + medio bloque `[0,.5,0,1,1,.5]` (la parte alta
  hacia `facing`). Invertida: losa superior `[0,.5,0,1,1,1]` + `[0,0,0,1,.5,.5]`.
- Escalera de mano (muro al Norte): `[0,0,0,1,1,3/16]` (render y selección); colisión igual.
- Puerta (Norte, cerrada): `[0,0,0,1,1,3/16]`; abierta: `[0,0,0,3/16,1,1]` (bisagra en el lado oeste).
- Valla: poste `[6,0,6,10,16,10]/16` + por conexión dos travesaños `[7,6,0,9,9,6]` y `[7,12,0,9,15,6]`/16.
  Colisión: poste y brazos de **1,5 de alto** (no se puede saltar, sirve de corral).
  Selección: poste+brazos de altura 1.
- Muro: poste `[4,0,4,12,16,12]/16` + brazos `[5,0,0,11,13,8]/16`; colisión 1,5.
- Puerta de valla cerrada (Norte: atraviesa el eje X): postes `[0,5,7,2,16,9]`, `[14,5,7,16,16,9]`
  y travesaños `[2,6,7,14,9,9]`, `[2,12,7,14,15,9]`/16; colisión `[0,0,7/16,1,1.5,9/16]`.
  Abierta: postes + hojas giradas 90° pegadas a los postes; **sin colisión**.

Conexiones de vallas/muros (máscara N/E/S/W): con la misma familia (valla↔valla, muro↔muro), con
puertas de valla y con cubos opacos sólidos. Se calculan con una función `connectMask(getId, x,y,z)`
que usan el mallador (con los arrays rellenos) y la física/raycast (con `world.getBlock`).

API: `renderBoxes(id, mask)`, `collisionBoxes(id, mask)`, `selectionBoxes(id, mask)`,
`boxesBounds(boxes)`, `rotateBox(box, k)`, `connectMask(get, x, y, z)`, `isBoxShape(id)`.

## Cambios por archivo

- **physics.js**: `world.collisionHeight` → `world.collisionBoxes(x,y,z)` (lista de cajas; cubo y aire
  devuelven constantes compartidas). El barrido revisa también la capa inferior (cajas de 1,5).
  **Subida de escalones**: si el movimiento horizontal choca estando en el suelo, se intenta subir
  hasta `stepHeight` (jugador y criaturas 0,6): subir, mover en horizontal, bajar; se acepta si avanza
  más. Así escaleras y losas se suben andando y los bloques completos siguen exigiendo saltar.
  El jugador suaviza la cámara al subir un escalón (`stepOffset`).
- **world.js**: `collisionBoxes(x,y,z)`; chunk no cargado = cubo sólido; `collisionHeight` se elimina.
- **raycast.js**: prueba todas las cajas de selección y se queda con la más cercana; devuelve también
  el punto de impacto (`px,py,pz`) para decidir escaleras invertidas.
- **mesher.js**: rama genérica "modelo de cajas" para las formas 7–12: cada caja emite sus caras con UV
  tomadas de su posición (se ve un trozo coherente de la textura), luz de la celda vecina si la cara está
  en el borde del bloque y de la propia celda si es interior, sombreado por cara sin AO, y ocultación solo
  de caras en el borde contra vecinos opacos. Puertas y escaleras de mano usan tiles con transparencia
  (alpha test).
- **atlas.js**: tiles `door_wood_lower/upper`, `door_iron_lower/upper`, `ladder`; iconos isométricos para
  bloques de cajas (escaleras, vallas, muros, puertas de valla) y sprites para puertas y escalera de mano.
- **items.js**: objetos no-bloque nuevos al final: `door_wood`, `door_iron` (kind `door`). Iconos.
- **crafting.js**: escaleras 6 → 4 (cada material), puerta de madera 6 tablones → 3, puerta de hierro
  6 lingotes → 3, valla 4 tablones + 2 palos → 3, muro 6 adoquines → 6, puerta de valla 4 palos + 2
  tablones → 1, escalera de mano 7 palos → 3. Desbloqueos coherentes con los existentes.
- **building.js**: colocación orientada: escaleras según hacia dónde mira el jugador (la parte alta
  lejos de él) e invertidas si se apunta a la mitad superior de una cara lateral o a la cara inferior;
  escalera de mano solo sobre caras laterales de un bloque sólido; puerta de 2 bloques (ambas celdas
  libres, suelo sólido, no dentro del jugador); puerta de valla orientada. Clic derecho abre/cierra
  puertas (ambas mitades) y puertas de valla (Aventura también puede). `supportOk` nuevas reglas:
  mitades de puerta mutuamente dependientes + suelo sólido; escalera de mano necesita su muro.
- **game.js**: copiar bloque (clic central) da el objeto base; sonido de puerta; logro "Hogar, dulce hogar".
- **player.js**: trepar escaleras de mano (avanzar/espacio sube ~2,4 b/s, Agacharse se sujeta, caída
  lenta, sin daño por caída).
- **structures.js**: puerta en la cabaña, escalera de mano en el pozo del templo del desierto.
- **audio.js**: sonido `door` (abrir/cerrar).
- **README**: tabla de estado actualizada.

## Pruebas

Unitarias (Node): rotación de cajas, máscaras de conexión, colisión de escalera (se sube andando),
valla (no se puede saltar), puerta cerrada bloquea / abierta deja pasar, escalera de mano (sube y baja),
raycast a una escalera devuelve la caja correcta, mallado sin NaN y con caras esperadas, recetas
válidas, pintores de tiles presentes, colocación orientada y apertura de puertas con el mundo real.
E2E (Chromium): colocar y abrir una puerta con el ratón, subir escaleras andando, valla que detiene
al jugador, captura de pantalla.
