# Fase 6 — Energía, automatización y transporte

Todo el estado visible (palanca encendida, cable con energía, pistón extendido, propulsor activo…) es un **ID de bloque**
propio (estado como variante, IDs 900–969), así que se guarda con el mundo sin formato nuevo. La lógica vive en
`src/energy.js` (energía y máquinas), `src/rails.js` (forma de los raíles y recorrido) y `src/vehicles.js` (vagoneta y barca).

## Energía (`src/energy.js`)
La energía se recalcula en **pulsos de 0,1 s** solo con los nodos de los chunks cargados (fuentes, placas, cables, repetidores,
inversores y tolvas se registran al cargar un chunk y al poner o quitar bloques).

| Bloque | Qué hace |
|---|---|
| **Palanca** | Clic derecho: encendida/apagada. Da energía (15) a los 6 vecinos. |
| **Botón** | Clic derecho: da energía durante 1 s. |
| **Placa de presión** | Da energía mientras el jugador o una criatura está encima. |
| **Bloque de energía** | Siempre encendido (luz 6). |
| **Cable de cobre** | Lleva la energía: empieza en 15 y baja 1 por tramo, así que se agota a los 15 tramos. Se une a los cables vecinos (también un escalón arriba o abajo, si no lo tapa un bloque opaco) y a cualquier bloque de energía. Brilla cuando la lleva. |
| **Repetidor** | Diodo orientado: entrada por detrás, salida por delante con nivel 15 y **2 pulsos** de retardo. |
| **Inversor** | Orientado: salida = NO entrada, con 1 pulso de retardo. Sin nada detrás, da energía. |

Repetidores e inversores se colocan mirando en la dirección en la que mira el jugador (la salida queda lejos de él).

### Consumidores
Se activan si están **junto a** una fuente encendida, un cable con energía o la salida de un repetidor/inversor encendido.

| Consumidor | Efecto |
|---|---|
| **Lámpara de energía** | Luz 15 mientras tiene energía. |
| **Puertas, trampillas y puertas de valla** | Se abren al recibir energía y se cierran al perderla (solo en el cambio, así que las de madera se pueden seguir abriendo a mano). **La puerta de hierro ya no se abre a mano**: necesita energía (la limitación de la Fase 2 queda resuelta). |
| **Pistón** | Empuja hasta **12 bloques** en horizontal y saca su cabeza; al perder la energía la recoge. Empuja también al jugador y a las criaturas. No mueve cofres, hornos, altares, portales, puertas, otros pistones ni bloques irrompibles; las plantas de la celda final sueltan su objeto. |
| **Dispensador** | 9 huecos (clic derecho para abrirlo). En cada pulso nuevo de energía: vacía cubos de agua/lava (y devuelve el cubo), llena cubos vacíos en una fuente, abona cultivos, planta semillas en tierra arada, lanza bolas de nieve o suelta el objeto hacia delante. |
| **Cosechadora** | Cada 2,5 s con energía recoge los cultivos **maduros** de un área de 3×3 situada delante (a 2 bloques) y los vuelve a plantar. Los objetos caen al suelo. |
| **Raíl propulsor** | Encendido acelera la vagoneta; apagado la frena. |

### Tolva
No necesita energía. Cada 0,4 s toma **1 objeto** de arriba (de un cofre, dispensador u otra tolva; de un horno, solo el
resultado) o recoge los objetos sueltos que caen sobre ella, y entrega 1 objeto al contenedor de abajo (a un horno: lo que se
funde va a la entrada y el combustible a su hueco). Tiene 5 huecos y se abre con clic derecho.

**Granja automática:** cultivos sobre tierra arada regada + cosechadora con un reloj o una palanca + tolvas debajo del campo
(o al final del canal de agua que arrastra las cosechas) que llenan un cofre.

## Raíles y vehículos (`src/rails.js`, `src/vehicles.js`)
- **Raíl**: al colocarlo toma la forma que piden sus vecinos — recto Norte-Sur o Este-Oeste, **curva** (4 variantes) o
  **rampa** (4 variantes) si el siguiente raíl está un bloque más arriba. Al poner o quitar uno se recalculan los de alrededor.
  Un raíl que ya tiene sus dos extremos unidos no se tuerce hacia un raíl nuevo que no apunta a él.
- **Raíl propulsor**: solo recto o en rampa. Con energía acelera la vagoneta hasta la velocidad máxima (8 bloques/s) y la saca
  de parada; sin energía la frena.
- **Vagoneta**: clic derecho sobre un raíl para ponerla (sale hacia donde miras), clic derecho para subir y `C` para bajar.
  Sigue la vía por curvas y rampas (cuesta arriba pierde velocidad, cuesta abajo gana), tiene rozamiento, rebota al final de
  la vía y, si el pasajero pulsa `W`, empuja hasta 4 bloques/s (en parado arranca hacia donde mira). Si le quitan el raíl se
  suelta como objeto.
- **Barca**: clic derecho sobre el agua (o sobre un bloque) para ponerla, clic derecho para subir y `C` para bajar. Flota, rema
  con `W`/`S` (hasta 6 bloques/s), gira con `A`/`D`; en tierra apenas se arrastra.
- Los dos vehículos se recogen con **dos golpes** (uno en Creativo), se guardan con el mundo como entidades y el pasajero se
  baja en un hueco libre al lado.

## Recetas (mesa de trabajo)
| Resultado | Ingredientes |
|---|---|
| Palanca | 1 palo + 1 adoquín |
| Botón | 1 piedra |
| Placa de presión | 2 piedras |
| Cable de cobre ×8 | 2 lingotes de cobre |
| Bloque de energía | 6 lingotes de cobre + 2 fragmentos de cristal + 1 cable |
| Repetidor | 2 cables + 3 piedras + 1 fragmento de cristal |
| Inversor | 2 cables + 3 piedras + 1 lingote de oro |
| Lámpara de energía | 4 vidrios + 2 fragmentos de cristal + 1 cable |
| Pistón | 3 tablones + 4 adoquines + 1 lingote de hierro + 1 cable |
| Dispensador | 7 adoquines + 1 cable + 1 cuerda |
| Tolva | 5 lingotes de hierro + 1 cofre |
| Cosechadora | 3 lingotes de hierro + 1 azada de hierro + 1 cable + 3 tablones |
| Raíl ×16 | 6 lingotes de hierro + 1 palo |
| Raíl propulsor ×6 | 6 lingotes de oro + 1 palo + 1 cable |
| Vagoneta | 5 lingotes de hierro |
| Barca | 5 tablones |

## Límites conocidos
- Los pistones empujan solo en horizontal (no hay pistones hacia arriba o abajo) y no tiran de los bloques al recogerse
  (no hay pistones pegajosos).
- La energía no atraviesa bloques sólidos (no hay "bloques cargados"); un cable solo alimenta a lo que tiene al lado.
- La energía solo se calcula en chunks cargados; un circuito partido por el borde de la zona cargada se detiene allí.
- Las vagonetas no chocan entre sí ni empujan criaturas, no hay vagonetas con cofre ni con horno y no se pueden enganchar.
- Las barcas no chocan con las criaturas y solo llevan al jugador.
- No hay comparadores, observadores, raíles detectores ni raíles de activación.

## Pruebas
`tests/fase6.mjs` (Node, 14 pruebas): palanca → cable → lámpara y caída del nivel por tramo, agotamiento a los 15 tramos y
repetidor con retardo, inversor, botón y placa de presión, puerta de hierro con energía, pistón (empuja y recoge),
dispensador, tolva hacia un cofre, cosechadora que replanta, forma automática de los raíles (rectas, curvas y rampas),
vagoneta que recorre un circuito cerrado, vagoneta en rampa y final de vía, barca que flota y avanza, y formas/rotación/
recetas/texturas de los bloques nuevos.
`tests/e2e/fase6.mjs` (Chromium): clic derecho real en la palanca que enciende el cable, la lámpara y la puerta de hierro;
apagado y puerta de hierro que no se abre a mano; raíles colocados que forman una recta y una curva; vagoneta puesta, montada,
empujada con `W` y bajada con `C`; barca puesta en el agua, montada y navegando; guardado de los dos vehículos.
