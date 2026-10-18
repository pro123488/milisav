# Teléfonos y tabletas (controles táctiles)

El juego se puede jugar con el dedo en teléfonos y tabletas (Android con Chrome, iPhone/iPad con Safari, que necesitan
WebGL 2: iOS 15 o posterior). Los controles táctiles se activan solos en dispositivos sin ratón; en **Opciones →
Controles táctiles** se pueden forzar (*Siempre*) o quitar (*Nunca*), y con `?touch=1` o `?touch=0` en la URL.

## Cómo se juega
| Acción | Gesto |
|---|---|
| Moverse | Joystick: poner el pulgar en la mitad izquierda y deslizarlo (aparece donde se toca). Empujarlo hasta el borde hacia delante = correr |
| Mirar | Arrastrar el dedo por la mitad derecha |
| Usar / colocar / abrir / comerciar | Tocar la pantalla (se usa lo que hay en la mira) o el botón ✋ |
| Romper / atacar | Mantener el dedo quieto sobre la pantalla (se puede seguir girando) o mantener ⛏ |
| Comer, beber, colocar seguido | Mantener ✋ |
| Saltar (doble toque: volar en Creativo) | ⤒ |
| Agacharse / bajar de un vehículo / bajar volando | ⤓ (un toque lo deja fijo, otro lo quita; manteniéndolo, dura mientras se mantiene) |
| Ranura de la barra rápida | Tocarla |
| Pausa · inventario · bestiario · cámara · soltar objeto · chat | Fila de botones de arriba a la izquierda: ⏸ 🎒 📖 👁 ⇩ 💬 |
| Cerrar el inventario, un cofre, el comercio… o el chat | ✕ (arriba a la derecha) |

**Inventario y pantallas con huecos:** tocar = coger o dejar (como el clic); mantener ≈ 0,4 s = la mitad de la pila o de
uno en uno (como el clic derecho); el interruptor **⇄ Mover rápido** hace que cada toque pase la pila a la otra zona (como
Mayús+clic). En las recetas, mantener fabrica todo lo posible. En un teléfono en horizontal las pantallas se dividen en dos
columnas (lo del bloque a un lado y el inventario al otro) y se desplazan con el dedo si no caben.

## Ajustes para móviles
- La primera vez en un teléfono o tableta la distancia de visión empieza en 4 chunks y la resolución interna es la de la
  pantalla sin multiplicar por la densidad (pantallas de densidad 2–3 con GPU modesta).
- **Sensibilidad táctil** (giro de cámara por el arrastre) y **Pantalla completa al jugar** en Opciones. La pantalla completa
  y el bloqueo en horizontal solo funcionan donde el navegador lo permite (Android sí; en iPhone Safari no hay pantalla
  completa para páginas: se puede añadir a la pantalla de inicio).
- En vertical se puede jugar (la barra rápida se encoge y los botones suben), pero el juego recomienda girar el teléfono.

## Cómo está hecho
- `src/touch.js` (`TouchControls`): capa de gestos con Pointer Events (joystick, mirar, tocar, mantener) y los botones.
  No hay un "modo móvil" del juego: el modo táctil de `Controls` emula el bloqueo del puntero y llena los mismos estados que
  el teclado y el ratón (teclas, giro, botones), así que la lógica del juego es la misma.
- `src/screens.js`: `onTap()` convierte toques en clics (y evita los eventos de ratón sintéticos que mandan los
  navegadores después de un toque); `split()` reparte las pantallas en dos zonas.
- `styles.css`: capa táctil, márgenes de la muesca (`env(safe-area-inset-*)`) y reglas para pantallas bajas o estrechas.

## Pruebas
`tests/e2e/movil.mjs` (Chromium emulando un teléfono de 844×390 con pantalla táctil, gestos reales por CDP): detección
automática, empezar tocando, joystick, mirar arrastrando, tocar para colocar, mantener para romper, saltar, agacharse fijo,
barra rápida, inventario (coger la mitad, dejar, mover rápido, que quepa en horizontal), ✕, pausa y continuar; y en
vertical (390×844) que la barra rápida quepa y los botones no la tapen.

## Límites conocidos
- No hay vibración ni botones reconfigurables; el tamaño de los botones es fijo.
- Doble clic (juntar en la mano todas las unidades de un objeto) no tiene gesto táctil.
- No se probó en dispositivos reales, solo con emulación de Chromium; el rendimiento depende mucho del teléfono.
