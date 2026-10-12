# BLOCKWORLD ULTIMATE — Fase 1 (jugable)

Videojuego **original** de bloques, supervivencia, construcción y exploración que se ejecuta en el navegador
(HTML + CSS + JavaScript + three.js/WebGL). Todo el contenido —texturas, iconos, modelos, sonidos, música,
criaturas, nombres— se **genera por código** y es propio: no hay recursos, código ni nombres de otros juegos.

> Esto es la **Fase 1**: un videojuego funcional de punta a punta (menú → crear mundo → jugar → guardar → continuar),
> no una maqueta. Más abajo hay una tabla **honesta** de lo que está implementado y de lo que queda para fases posteriores.

## Cómo ejecutarlo

Necesitas servir la carpeta por HTTP (los módulos ES y los Web Workers no funcionan abriendo `index.html` con doble clic).
No hay que instalar nada de pago ni dependencias: three.js r160 (licencia MIT) ya está incluido en `vendor/`.

```bash
cd blockworld-ultimate
node tools/serve.mjs            # http://localhost:8080   (Node 18+, sin dependencias)
# alternativas:
python3 -m http.server 8080     # y abrir http://localhost:8080
npx serve .                     # si prefieres serve
```

Abre `http://localhost:8080` en Chrome, Edge, Firefox o Safari recientes (necesita **WebGL 2** y Workers de módulo).
Para mejor rendimiento activa la aceleración por hardware del navegador.

Opciones de depuración por URL: `?autostart=survival|creative|adventure|peaceful&seed=texto&type=normal|flat|islands|amplified&rd=4&worker=0`.

### Pruebas automáticas

```bash
node tests/run.mjs              # 41 pruebas de lógica: terreno, luz, inventario, crafteo, física, raycast, mallado, guardado
node tests/e2e/save-load.mjs    # pruebas E2E en Chromium (requieren Playwright: npm i -D playwright, o PW_MODULES=ruta/node_modules)
npm run test:e2e                # ciclo completo: menú→mundo→crafteo→horno→cofre→muerte→guardar→continuar, cultivos, criaturas
node tools/mapdump.mjs semilla normal mapa.png 4096 16   # PNG de biomas + estadísticas del generador
node tools/chunkstats.mjs semilla normal 6               # tiempos de generación y distribución de bloques
```

## Controles

| Acción | Tecla |
|---|---|
| Mover / correr / saltar | `W A S D` (o flechas) / `Shift` / `Espacio` (doble toque = volar en Creativo) |
| Agacharse (no caes de los bordes) / bajar al volar | `C` |
| Mirar | Ratón (la sensibilidad se ajusta en Opciones) |
| Romper / atacar | Clic izquierdo (mantener) |
| Colocar / usar / abrir / comer (mantener) | Clic derecho |
| Copiar el bloque apuntado (Creativo) | Clic central |
| Ranura de la barra rápida | `1`–`9` o rueda |
| Inventario y fabricación | `E` |
| Soltar objeto (`Mayús+Q` = pila entera) | `Q` |
| Cámara 1ª / 3ª persona | `V` |
| Depuración / ocultar interfaz | `F3` / `F1` |
| Chat y comandos (`/ayuda`) | `T` o `/` |
| Pausa | `Esc` |

## Qué está implementado en la Fase 1

Leyenda: ✅ hecho y probado · 🟡 hecho de forma simplificada · ❌ no implementado todavía.

| Área (sección del encargo) | Estado | Detalle |
|---|---|---|
| **3. Menú principal** | ✅ | Jugar, Crear mundo, Continuar mundo, Seleccionar mundo, 4 modos de inicio rápido (Supervivencia, Creativo, Aventura, Pacífico), Opciones, Controles, Créditos; panorama 3D de fondo. Todos los botones hacen algo real. |
| Creación de mundos | ✅ | Nombre, semilla (texto o número), tipo (Normal, Montañoso, Archipiélago, Superplano), dificultad, tamaño/límites (infinito, 1024, 512, 256), estructuras sí/no, criaturas (todas/solo animales/ninguna), modo de juego, comandos, conservar inventario. Lista de mundos guardados con borrado. |
| **4. Bloques** | ✅ | ~100 bloques originales con datos (dureza, herramienta, nivel de cosecha, sonido, luz, drops…) y texturas procedurales 16×16 propias: tierra, 5 céspedes, piedra, arena, grava, arcilla, barro, nieve, hielo, 4 troncos, hojas, roca profunda, 6 minerales (carbón, cobre, hierro, oro, **cristal**, **noctisita** rara), basalto, vidrio volcánico, arenisca, ladrillos, losas, bloques de metal, lámpara de cristal, cristales de cueva… |
| **5. Terreno procedural** | ✅ | Ruido simplex con semilla: océanos, costas/playas, llanuras, colinas, montañas (crestas), valles, **ríos**, **lagos**, **cuevas** (cuevas amplias + túneles), **barrancos**, **mesetas y cañones** áridos, bosques, desiertos, regiones heladas con lagos congelados, pantanos, junglas, **volcanes con lava**. Mismo mundo con la misma semilla y versión del generador (`GENERATOR_VERSION`). |
| **6. Chunks y optimización** | ✅ | Chunks 16×16×128; terreno generado en un **Web Worker** (con alternativa por tiempo si no hay Workers); mallas combinadas con caras ocultas, **AO** y **luz suave por vértice**; mallado con presupuesto de tiempo por fotograma; carga progresiva por distancia, descarga conservando cambios, remallado local al editar; partículas instanciadas; frustum culling. |
| Iluminación | ✅ | Luz de cielo + luz de bloque (0–15) con propagación entre chunks y actualización incremental al poner/quitar bloques; antorchas y cristales iluminan. |
| **7. Movimiento** | ✅ | Primera persona, gravedad, salto (altura independiente de los FPS), correr, agacharse con protección de bordes, natación, vuelo creativo, autosalto, daño por caída, colisiones AABB sin atravesar terreno ni quedar atrapado, sensibilidad/FOV ajustables, **cámara en 3ª persona** (`V`). |
| **8. Romper bloques** | ✅ | Raycast de vóxeles con cajas reales (losas, antorchas, plantas), alcance limitado, progreso con grietas, tiempo según dureza/herramienta/nivel de cosecha (p. ej. piedra: 7,5 s a mano, 1,1 s pico de madera, 0,4 s pico de hierro), desgaste, drops. |
| **9. Colocar bloques** | ✅ | Cara apuntada, comprobaciones (alcance, hueco libre, no dentro del jugador, soporte), vista previa, antorchas de pared, losas, gravedad de arena/grava. |
| **10. Inventario** | ✅ | Barra de 9 + 27 huecos + 4 de armadura, pilas, mover/dividir/mayús+clic/doble clic, soltar y recoger del suelo, cursor con objeto. La lógica es pura y está probada con una prueba de "no se duplican objetos". |
| **11. Crafteo** | ✅/🟡 | Recetas basadas en datos (ingredientes, cantidades, resultado, estación, condición de desbloqueo), mesa de trabajo, horno con combustible y tiempo. ❌ **Puertas y escaleras** (aún no hay bloques con orientación). |
| **12. Herramientas/armas/armaduras** | ✅ | 7 materiales (madera, piedra, cobre, hierro, oro, cristal, noctisita) × pico/hacha/pala/espada/azada; 6 conjuntos de armadura; estadísticas distintas (oro: rápido y frágil); **reparación** en la mesa de trabajo. |
| **13–14. Supervivencia y día/noche** | ✅ | Salud, hambre/saturación, recuperación, caída, ahogamiento, lava/fuego, cactus, vacío, armadura, muerte y reaparición (regla de conservar inventario configurable); ciclo de 20 min con amanecer/mañana/mediodía/tarde/atardecer/noche, sol, luna, estrellas, nubes y reloj; la noche siempre es jugable. |
| **15. Biomas** | ✅ | 12 biomas con aspecto, flora, árboles y criaturas propios (bosque templado y oscuro, desierto, mesetas, montañas, nevada, jungla, pantano, costa, océano, llanura, volcánica). |
| **16. Fluidos** | 🟡 | Agua y lava **estáticas** (sin propagación): nadar, ahogarse, lava dañina, cubos para recoger/colocar. Sin flujo para no gastar rendimiento (se podrá añadir con límite de actualizaciones). |
| **17. Plantas y árboles** | ✅ | 6 tipos de árbol, flores, helechos, hongos (incl. luminosos), cactos, arbustos de bayas; **replantar** brotes que crecen en árboles. |
| **18. Animales** | ✅ | 7 especies originales (bóvido de pradera, cerdo de bosque, ave de montaña, zorro de cristal, tortuga de río, pez luminoso, ciervo de niebla) con modelos animados, hábitat, vagar/pastar/descansar/huir/seguir. |
| **19. Agricultura** | ✅ | Azada → tierra arada, semillas, hidratación por agua cercana, 4 etapas de crecimiento (solo con luz), cosecha, replantado; trigo, zanahoria, papa, bayas. Los cultivos se guardan. 🟡 Crecen solo con el chunk cargado. |
| **20. Cría y domesticación** | ✅/🟡 | Alimentar, modo "amor", crías que crecen, enfriamiento y topes de población; domesticar al zorro con pescado; los animales criados/domesticados persisten. ❌ Objetos para transportar animales; los corrales se hacen con bloques (aún no hay vallas). |
| **21. Monstruos y combate** | ✅ | 7 criaturas hostiles originales (acechador nocturno, murciélago cavernario, gólem de barro, guardián de ruinas, esqueleto de obsidiana —ataque a distancia—, devorador de arena —emboscada—, bestia volcánica), persecución, ataques, retroceso, recompensas, aparición controlada por bioma/luz/dificultad, se queman con el sol. |
| **22. Jefes** | ❌ | **No implementados** (ver nota al final). |
| Estructuras | ✅ | Cabañas abandonadas, ruinas del bosque/jungla con guardián, templos del desierto enterrados con obelisco, mazmorras subterráneas; cofres con botín. |
| Guardado | ✅ | IndexedDB (chunks modificados comprimidos con RLE, inventario, cofres/hornos, criaturas persistentes, hora, posición, logros) + autoguardado cada 30 s; opciones en localStorage. |
| Audio | ✅ | 100 % procedural (WebAudio): sonidos por material, criaturas, interfaz y música ambiental generativa; volúmenes ajustables. |
| Logros | 🟡 | 16 logros básicos. |
| Dimensiones, aldeas, comercio, jefes, maquinaria/automatización, transporte, multijugador, móvil/táctil | ❌ | Fases posteriores. |

## Estructura del proyecto

```
index.html · styles.css          Página y estilos
vendor/three.module.min.js       three.js r160 (MIT)
src/main.js                      Arranque, menús ↔ partidas
src/game.js                      Orquestador: bucle, interacción, guardado, estados
src/world.js · chunk.js          Chunks, streaming, mallado con presupuesto, físicas de acceso
src/terrain.js · biomes.js       Generador procedural y definición de biomas
src/structures.js                Estructuras y botines
src/terrain.worker.js            Generación fuera del hilo principal
src/mesher.js · lighting.js      Caras ocultas + AO + luz suave; propagación de luz
src/render.js · sky.js           Shaders de mundo, niebla, agua animada; cielo y día/noche
src/atlas.js                     Texturas e iconos procedurales
src/blocks.js · items.js         Bloques y objetos basados en datos
src/crafting.js · inventory.js   Recetas, fundición, inventario (lógica pura y probada)
src/player.js · physics.js · controls.js
src/mining.js · building.js · raycast.js
src/survival.js · ticks.js       Supervivencia; cultivos, hierba, hornos
src/entities.js · animals.js · monsters.js · spawner.js
src/ui.js · screens.js · menus.js
src/save.js · audio.js · commands.js · achievements.js · hand.js · config.js · noise.js
tools/                           Servidor, benchmarks, generador de mapas, utilidades de pruebas
tests/run.mjs                    Pruebas automáticas
```

## Decisiones de diseño y límites conocidos

- **Los chunks sin modificar no se guardan**: se regeneran desde la semilla; solo se guardan los editados. Si cambia `GENERATOR_VERSION`, el terreno aún no explorado puede diferir y el juego avisa.
- Los **ticks aleatorios** (crecimiento) y los hornos solo avanzan en chunks cargados cerca del jugador.
- Los **monstruos de estructuras** aparecen una vez por estructura (se recuerda en el guardado).
- El audio necesita un gesto del usuario (el primer clic) por política de los navegadores.
- Pensado para **ratón y teclado** en escritorio; sin soporte táctil.

## Nota sobre el encargo

El texto del encargo llegaba **cortado en la sección 22 (Jefes: «Cada jefe debe tener: Historia. Arena…»)**. Las secciones posteriores
(dimensiones, aldeas, comercio, maquinaria, logros avanzados, etc.) no se han recibido, así que no se han implementado ni se afirma nada sobre ellas.
Hoja de ruta propuesta: **Fase 2** (escaleras/puertas/vallas, flujo de fluidos limitado, más cultivos y comida, transporte de animales),
**Fase 3** (aldeas y comercio), **Fase 4** (jefes y arenas), **Fase 5** (dimensiones), **Fase 6** (maquinaria/automatización).

## Licencias

Código del juego: original (sin licencia pública definida). `vendor/three.module.min.js`: three.js, licencia MIT (`vendor/THREE-LICENSE.txt`).
