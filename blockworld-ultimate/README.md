# BLOCKWORLD ULTIMATE — Fase 6 (energía, automatización y transporte) · también en el teléfono

Videojuego **original** de bloques, supervivencia, construcción y exploración que se ejecuta en el navegador
(HTML + CSS + JavaScript + three.js/WebGL). Todo el contenido —texturas, iconos, modelos, sonidos, música,
criaturas, nombres— se **genera por código** y es propio: no hay recursos, código ni nombres de otros juegos.

> La **Fase 1** dejó un videojuego funcional de punta a punta (menú → crear mundo → jugar → guardar → continuar).
> La **Fase 2** añade bloques con forma y orientación (escaleras, puertas, vallas…), fluidos que fluyen, cultivos y
> comidas nuevas y la cuerda para llevar animales. La **Fase 3** añade aldeas generadas con aldeanos que trabajan,
> duermen y comercian con una moneda propia, y un guardián que las defiende. La **Fase 4** añade efectos de estado, la
> mesa de alquimia con tónicos, cuatro santuarios generados con sus **jefes** (historia, arena, invocación, fases, ataques,
> debilidad y recompensas únicas), música de combate y un bestiario. La **Fase 5** abre la **Dimensión Oscura**: portales
> que se construyen y activan con una llave hecha con las esencias de los jefes, islas flotantes con generador propio, criaturas
> nuevas, guardado separado por dimensión y la Ciudadela del **Soberano**, el jefe final. La **Fase 6** añade **energía**
(palancas, botones, placas de presión, cables de cobre con niveles, repetidores e inversores), máquinas (lámparas, puertas
automáticas, pistones, dispensadores, tolvas y cosechadoras para granjas automáticas) y **transporte** (raíles que se orientan
solos con curvas, rampas y propulsores, vagonetas montables y barcas). Más abajo hay una tabla **honesta** de lo que está implementado y de
> lo que queda para fases posteriores; el plan completo está en [`docs/PLAN.md`](docs/PLAN.md).

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
npm test                        # 43 + 32 + 19 + 29 + 9 + 22 pruebas de lógica: terreno, luz, inventario, crafteo, física, raycast, mallado,
                                #   guardado, formas, fluidos, colocación, aldeas sin costuras, A*, comercio, aldeanos, efectos,
                                #   alquimia, santuarios sin costuras, combates de jefes simulados, Dimensión Oscura y portales,
                                #   energía (cables, repetidores, inversores, pistones, dispensador, tolva, cosechadora),
                                #   raíles automáticos, vagonetas y barcas
node tests/e2e/save-load.mjs    # pruebas E2E en Chromium (requieren Playwright: npm i -D playwright, o PW_MODULES=ruta/node_modules)
npm run test:e2e                # ciclo completo: menú→mundo→crafteo→horno→cofre→muerte→guardar→continuar, cultivos, criaturas,
                                #   la Fase 2 con ratón/teclado reales (puerta, escaleras, agua, cuerda, iconos) y la Fase 3
                                #   (aldea, aldeanos, comercio con la interfaz, campana, guardián, brújula) y la Fase 4 (tónicos,
                                #   alquimia, santuario, invocación, barra de jefe, los 4 jefes, bola de nieve, bestiario) y la
                                #   Fase 5 (portal con llave, viaje y vuelta, guardado por dimensión, ciudadela, Soberano) y la
                                #   Fase 6 (circuito con palanca real, puerta de hierro, raíles, vagoneta y barca montadas) y
                                #   los controles táctiles emulando un teléfono (node tests/e2e/movil.mjs)
node tools/mapdump.mjs semilla normal mapa.png 4096 16   # PNG de biomas + estadísticas del generador
node tools/chunkstats.mjs semilla normal 6               # tiempos de generación y distribución de bloques
```

## Controles

En **teléfonos y tabletas** hay controles táctiles (joystick a la izquierda, arrastrar para mirar, tocar para usar, mantener
para romper y botones); ver [`docs/movil.md`](docs/movil.md). Con teclado y ratón:

| Acción | Tecla |
|---|---|
| Mover / correr / saltar | `W A S D` (o flechas) / `Shift` / `Espacio` (doble toque = volar en Creativo) |
| Agacharse (no caes de los bordes) / bajar al volar | `C` |
| Mirar | Ratón (la sensibilidad se ajusta en Opciones) |
| Romper / atacar | Clic izquierdo (mantener) |
| Colocar / usar / abrir puertas / comer (mantener) | Clic derecho (las puertas cambian solo con un clic nuevo) |
| Escalera de mano: subir / sujetarse | Avanzar contra ella o `Espacio` / `C` |
| Cuerda: atar un animal / atarlo a una valla / soltarlo | Clic derecho al animal con la cuerda / a la valla / al animal atado |
| Comerciar con un aldeano | Clic derecho al aldeano y clic en una oferta |
| Beber un tónico | Mantener clic derecho (como comer) |
| Llenar un frasco / lanzar una bola de nieve | Clic derecho sobre el agua / clic derecho al aire |
| Despertar a un jefe | Clic derecho al altar del santuario con su ofrenda en la mano |
| Bestiario | `B` (o desde la pausa) |
| Abrir un portal umbrío / viajar | Clic derecho al Núcleo de portal con la Llave umbría / quedarse dentro del velo |
| Palanca / botón / abrir dispensador o tolva | Clic derecho |
| Poner una vagoneta / barca · subir · bajar | Clic derecho al raíl / al agua · clic derecho al vehículo · `C` |
| Vagoneta: empujar · Barca: remar / girar | `W` · `W`/`S` y `A`/`D` |
| Recoger un vehículo | Dos golpes (clic izquierdo) |
| Copiar el bloque apuntado (Creativo) | Clic central |
| Ranura de la barra rápida | `1`–`9` o rueda |
| Inventario y fabricación | `E` |
| Soltar objeto (`Mayús+Q` = pila entera) | `Q` |
| Cámara 1ª / 3ª persona | `V` |
| Depuración / ocultar interfaz | `F3` / `F1` |
| Chat y comandos (`/ayuda`) | `T` o `/` |
| Pausa | `Esc` |

## Qué está implementado (Fases 1 a 6)

Leyenda: ✅ hecho y probado · 🟡 hecho de forma simplificada · ❌ no implementado todavía.

| Área (sección del encargo) | Estado | Detalle |
|---|---|---|
| **3. Menú principal** | ✅ | Jugar, Crear mundo, Continuar mundo, Seleccionar mundo, 4 modos de inicio rápido (Supervivencia, Creativo, Aventura, Pacífico), Opciones, Controles, Créditos; panorama 3D de fondo. Todos los botones hacen algo real. |
| Creación de mundos | ✅ | Nombre, semilla (texto o número), tipo (Normal, Montañoso, Archipiélago, Superplano), dificultad, tamaño/límites (infinito, 1024, 512, 256), estructuras sí/no, criaturas (todas/solo animales/ninguna), modo de juego, comandos, conservar inventario. Lista de mundos guardados con borrado. |
| **4. Bloques** | ✅ | ~170 bloques originales (334 IDs contando orientaciones y estados) con datos (dureza, herramienta, nivel de cosecha, sonido, luz, drops…) y texturas procedurales 16×16 propias: tierra, 5 céspedes, piedra, arena, grava, arcilla, barro, nieve, hielo, 4 troncos, hojas, roca profunda, 6 minerales (carbón, cobre, hierro, oro, **cristal**, **noctisita** rara), basalto, vidrio volcánico, arenisca, ladrillos, losas, bloques de metal, lámpara de cristal, cristales de cueva… **Fase 2:** escaleras de 5 materiales (4 orientaciones, normales e invertidas), escalera de mano, puertas de madera y de hierro (2 bloques), trampilla, valla de madera, muro de adoquín y puerta de valla, con modelos de cajas, iconos isométricos y texturas propias. **Fases 4–6:** altares, bloques de santuario, piedra y ladrillo umbríos, hongos umbríos, núcleo y velo de portal, palanca, botón, placa de presión, cables, repetidores, inversores, lámpara de energía, pistón, dispensador, tolva, cosechadora y raíles. |
| **5. Terreno procedural** | ✅ | Ruido simplex con semilla: océanos, costas/playas, llanuras, colinas, montañas (crestas), valles, **ríos**, **lagos**, **cuevas** (cuevas amplias + túneles), **barrancos**, **mesetas y cañones** áridos, bosques, desiertos, regiones heladas con lagos congelados, pantanos, junglas, **volcanes con lava**. Mismo mundo con la misma semilla y versión del generador (`GENERATOR_VERSION`). |
| **6. Chunks y optimización** | ✅ | Chunks 16×16×128 con **IDs de 16 bits** (hasta 4096 bloques; los mundos de la Fase 1 se migran solos al cargarlos); terreno generado en un **Web Worker** (con alternativa por tiempo si no hay Workers); mallas combinadas con caras ocultas, **AO** y **luz suave por vértice**; mallado con presupuesto de tiempo por fotograma; carga progresiva por distancia, descarga conservando cambios, remallado local al editar; partículas instanciadas; frustum culling. |
| Iluminación | ✅ | Luz de cielo + luz de bloque (0–15) con propagación entre chunks y actualización incremental al poner/quitar bloques; antorchas y cristales iluminan. |
| **7. Movimiento** | ✅ | Primera persona, gravedad, salto (altura independiente de los FPS), correr, agacharse con protección de bordes, natación, vuelo creativo, autosalto, daño por caída, colisiones con las cajas reales de cada bloque sin atravesar terreno ni quedar atrapado, sensibilidad/FOV ajustables, **cámara en 3ª persona** (`V`). **Fase 2:** se suben escaleras y losas andando (escalones de 0,6, con la cámara suavizada), escaleras de mano trepables sin daño por caída, vallas y muros de 1,5 que no se saltan, corrientes de agua que arrastran. |
| **8. Romper bloques** | ✅ | Raycast de vóxeles con cajas reales (losas, antorchas, plantas), alcance limitado, progreso con grietas, tiempo según dureza/herramienta/nivel de cosecha (p. ej. piedra: 7,5 s a mano, 1,1 s pico de madera, 0,4 s pico de hierro), desgaste, drops. |
| **9. Colocar bloques** | ✅ | Cara apuntada, comprobaciones (alcance, hueco libre, no dentro del jugador ni de criaturas con las cajas reales, soporte), vista previa con la forma real, antorchas de pared, losas, gravedad de arena/grava. **Fase 2:** orientación según la mirada, escaleras invertidas al apuntar a la mitad superior, escaleras de mano solo en paredes completas, puertas que abren/cierran sus dos mitades y no se cierran sobre nadie. |
| **10. Inventario** | ✅ | Barra de 9 + 27 huecos + 4 de armadura, pilas, mover/dividir/mayús+clic/doble clic, soltar y recoger del suelo, cursor con objeto. La lógica es pura y está probada con una prueba de "no se duplican objetos". |
| **11. Crafteo** | ✅ | Recetas basadas en datos (ingredientes, cantidades, resultado, estación, condición de desbloqueo), mesa de trabajo, horno con combustible y tiempo. **Fase 2:** escaleras, puertas, trampillas, vallas, muros, puertas de valla, escaleras de mano, cuerda, cuenco y comidas. |
| **12. Herramientas/armas/armaduras** | ✅ | 7 materiales (madera, piedra, cobre, hierro, oro, cristal, noctisita) × pico/hacha/pala/espada/azada; 6 conjuntos de armadura; estadísticas distintas (oro: rápido y frágil); **reparación** en la mesa de trabajo. |
| **13–14. Supervivencia y día/noche** | ✅ | Salud, hambre/saturación, recuperación, caída, ahogamiento, lava/fuego, cactus, vacío, armadura, muerte y reaparición (regla de conservar inventario configurable); ciclo de 20 min con amanecer/mañana/mediodía/tarde/atardecer/noche, sol, luna, estrellas, nubes y reloj; la noche siempre es jugable. |
| **15. Biomas** | ✅ | 12 biomas con aspecto, flora, árboles y criaturas propios (bosque templado y oscuro, desierto, mesetas, montañas, nevada, jungla, pantano, costa, océano, llanura, volcánica). |
| **16. Fluidos** | ✅ | **Fase 2:** agua (7 bloques) y lava (3 bloques) que fluyen con niveles y superficie inclinada, cascadas, se secan al quitar la fuente, agua "infinita" entre dos fuentes, lava + agua → vidrio volcánico/adoquín/piedra, arrastran plantas y antorchas (que sueltan su objeto) y se detienen en puertas; presupuesto de actualizaciones por fotograma. Nadar, ahogarse, lava dañina, cubos (solo recogen fuentes). |
| **17. Plantas y árboles** | ✅ | 6 tipos de árbol, flores, helechos, hongos (incl. luminosos), cactos, arbustos de bayas; **replantar** brotes que crecen en árboles. |
| **18. Animales** | ✅ | 7 especies originales (bóvido de pradera, cerdo de bosque, ave de montaña, zorro de cristal, tortuga de río, pez luminoso, ciervo de niebla) con modelos animados, hábitat, vagar/pastar/descansar/huir/seguir. |
| **19. Agricultura** | ✅ | Azada → tierra arada, semillas, hidratación por agua cercana, 4 etapas de crecimiento (solo con luz), cosecha, replantado; trigo, zanahoria, papa, bayas y (Fase 2) **tomate y maíz**, con comidas nuevas: mazorca asada, pan de maíz, estofado de verduras, sopa de hongos y ensalada (devuelven el cuenco). Los cultivos se guardan. 🟡 Crecen solo con el chunk cargado. |
| **20. Cría y domesticación** | ✅/🟡 | Alimentar, modo "amor", crías que crecen, enfriamiento y topes de población; domesticar al zorro con pescado; los animales criados/domesticados persisten. **Fase 2:** la **cuerda** lleva animales (te siguen, tiran y se rompe a 14 bloques) y los ata a vallas; los animales atados o alimentados no desaparecen. |
| **21. Monstruos y combate** | ✅ | 7 criaturas hostiles originales (acechador nocturno, murciélago cavernario, gólem de barro, guardián de ruinas, esqueleto de obsidiana —ataque a distancia—, devorador de arena —emboscada—, bestia volcánica), persecución, ataques, retroceso, recompensas, aparición controlada por bioma/luz/dificultad, se queman con el sol. |
| **22. Jefes** (Fase 4) | ✅ | Cuatro jefes originales, cada uno con **historia, arena, invocación, tres fases, ataques anunciados, debilidad y recompensas**: **Guardián del Bosque Antiguo** (raíces que lanzan por los aires, brotes que lo curan; débil a las hachas), **Coloso de Cristal** (pisotones que se esquivan saltando, ráfagas de esquirlas, pilares de resonancia que le dan escudo; débil a los picos), **Reina de las Profundidades** (nada, embiste, envenena, tinta que oscurece, remolino; queda aturdida si choca contra un muro) y **Titán Volcánico** (martillazos que queman, bolas de fuego, lluvia de meteoritos, diablillos; se enfría con bolas de nieve o agua). Barra de vida con fase, música de combate procedural, esbirros propios, recompensas únicas (Báculo de raíces, Hoja prismática, Corona de coral, Martillo del Titán que rompe 3×3), **Cristal vital** (+1 corazón, hasta 20) y esencias. Si te alejas o mueres, el jefe vuelve a dormir y devuelve la ofrenda al altar. |
| **Santuarios** (Fase 4) | ✅ | Arenas generadas sin costuras en varios chunks: claro del bosque con pilares de corteza ancestral, gruta de geoda subterránea con pozo y escalera de mano, templo sumergido con faroles marinos y caldera volcánica con foso de lava y puentes. `/localizar santuario [bosque\|cristal\|mar\|fuego]`. Las ofrendas se fabrican en la mesa de trabajo. |
| **Efectos de estado** (Fase 4) | ✅ | 12 efectos con nivel y duración, visibles en el HUD y guardados: regeneración, fuerza, velocidad, prisa minera, resistencia, resistencia al fuego, respiración acuática, visión nocturna, lentitud, veneno, oscuridad y debilidad. Afectan de verdad a la vida, el daño, el movimiento, el minado, el ahogo, la lava y la niebla. |
| **Alquimia** (Fase 4) | ✅ | Frascos de vidrio que se llenan en el agua; la mesa de alquimia destila hasta 3 frascos a la vez con un ingrediente (10 recetas: tónico rúnico de base y 9 tónicos), con libro de recetas en la pantalla. Manzana solar con efectos. |
| **Bestiario** (Fase 4) | ✅ | Ficha de cada criatura (23) con su historia; las de los jefes incluyen arena, invocación, fases, ataques, debilidad y recompensa. Se desbloquean al ver a la criatura de cerca y cuentan cuántas has derrotado. |
| Estructuras | ✅ | Cabañas abandonadas (Fase 2: con puerta y alero de escaleras), ruinas del bosque/jungla con guardián, templos del desierto enterrados con obelisco y pozo con escalera de mano, mazmorras subterráneas; cofres con botín. |
| Guardado | ✅ | IndexedDB (chunks modificados comprimidos con RLE de 16 bits —formato 2, con migración del formato 1—, inventario, cofres/hornos, criaturas persistentes, hora, posición, logros) + autoguardado cada 30 s; opciones en localStorage. |
| Audio | ✅ | 100 % procedural (WebAudio): sonidos por material, criaturas, interfaz y música ambiental generativa; volúmenes ajustables. |
| **Aldeas** (Fase 3) | ✅ | Generadas en llanuras, bosques, desiertos/mesetas, regiones nevadas y junglas (estilo propio por bioma), ocupan varios chunks sin costuras: pozo con campana y farol, calles de camino con farolas, casas con puerta, camas y tejado a cuatro aguas, granjas con riego, corrales con animales, herrerías con botín, bibliotecas, talleres y torres de vigía con escalera de mano. Los mundos nuevos empiezan **junto a una aldea** (opción «Empezar junto a una aldea» al crear el mundo; el inicio rápido siempre). Para encontrar más: `/localizar aldea` y la **brújula de aldeas** (4 lingotes de hierro + 1 fragmento de cristal, en la mesa de trabajo; con ella en la mano se ve la dirección y la distancia). |
| **Aldeanos** (Fase 3) | ✅ | Seis oficios según su estación de trabajo (granjero/compostador, herrero/yunque, erudito/atril, tejedor/telar, pescador/barril, curandero/mesa de alquimia); de día trabajan y pasean, de noche vuelven a su cama abriendo y cerrando puertas (A*), huyen de los monstruos y se refugian al sonar la campana. Un aldeano sin oficio adopta la estación libre que coloques cerca. |
| **Comercio** (Fase 3) | ✅ | Moneda propia (**Moneda de sol**); 3 niveles de ofertas por oficio que se desbloquean con experiencia, se agotan y se reponen al amanecer; la mala reputación (golpear o matar aldeanos) sube los precios y enfada al guardián. |
| **Guardián de piedra** (Fase 3) | ✅ | Uno por aldea: patrulla, ataca a los monstruos cercanos y se vuelve contra el jugador si este ataca a la aldea. Los monstruos nocturnos persiguen también a los aldeanos. |
| Logros | 🟡 | 34 logros (Fase 2: puerta, atar un animal, estofado; Fase 3: aldea, comercio, maestro, abono; Fase 4: tónico, santuario, un logro por jefe, los cuatro jefes, Cristal vital; Fase 5: portal, ciudadela, Soberano). |
| **Dimensión Oscura** (Fase 5) | ✅ | Generador propio (islas flotantes de piedra umbría sobre un abismo de lava, cavernas, bosques de hongos gigantes luminosos, mucha noctisita, ruinas con cofres), cielo de penumbra permanente, 2 biomas, 4 criaturas propias (espectro umbrío, reptador del vacío, centinela umbrío, polilla lumínica). Ver [`docs/fase5-dimension-oscura.md`](docs/fase5-dimension-oscura.md). |
| **Portales** (Fase 5) | ✅ | Núcleo de portal + anillo de 8 bloques de vidrio volcánico + Llave umbría (con las 4 esencias de los jefes) → velo; 1,6 s dentro del velo para viajar; portal de vuelta automático (con plataforma si hace falta); romper el marco lo cierra. Guardado por dimensión (chunks, criaturas, cofres) y se continúa la partida en la dimensión donde se dejó. |
| **Soberano** (Fase 5) | ✅ | Quinto jefe, en lo alto de la Ciudadela: vuela, proyectiles de sombra que persiguen, espectros, teletransporte, rayo del eclipse anunciado, columnas de vacío; débil a la luz y a la Hoja prismática; suelta el Cetro del eclipse (arma a distancia) y cierra la historia con un epílogo. |
| **Energía** (Fase 6) | ✅ | Palanca, botón (1 s), placa de presión (jugador o criaturas), bloque de energía; **cable de cobre** que se une solo y pierde 1 nivel por tramo (de 15 a 0, también subiendo y bajando escalones); **repetidor** (vuelve a 15, 2 pulsos de retardo) e **inversor** (NO lógico). Pulsos de 0,1 s; el estado se guarda como IDs de bloque. Ver [`docs/fase6-energia-transporte.md`](docs/fase6-energia-transporte.md). |
| **Automatización** (Fase 6) | ✅/🟡 | Lámpara de energía (luz 15); puertas, trampillas y puertas de valla automáticas (la **puerta de hierro** ya solo se abre con energía); **pistón** que empuja hasta 12 bloques, al jugador y a las criaturas; **dispensador** (cubos, abono, semillas, bolas de nieve o soltar objetos); **tolva** que recoge objetos sueltos y los pasa entre cofres, dispensadores, tolvas y hornos; **cosechadora** que recoge y replanta 3×3 cultivos maduros → granjas automáticas. 🟡 Pistones solo horizontales y no pegajosos. |
| **Raíles y vehículos** (Fase 6) | ✅ | Raíles que toman solos su forma (rectos, 4 curvas, 4 rampas), raíles propulsores que aceleran con energía y frenan sin ella; **vagoneta** montable que sigue la vía por curvas y rampas con inercia, rozamiento y empuje del pasajero; **barca** que flota, rema y gira. Se recogen con dos golpes y se guardan con el mundo. |
| **Teléfonos y tabletas** | ✅/🟡 | Controles táctiles que se activan solos sin ratón: joystick, arrastrar para mirar, tocar para usar, mantener para romper, botones de saltar/agacharse/romper/usar y de menú, inventario con toques (la mitad, mover rápido), pantallas en dos columnas en horizontal, pantalla completa y ajustes de rendimiento. Ver [`docs/movil.md`](docs/movil.md). 🟡 Probado con emulación de Chromium, no en teléfonos reales. |
| Multijugador | ❌ | Fuera de alcance (necesita un servidor; ver `docs/PLAN.md`). |

## Estructura del proyecto

```
index.html · styles.css          Página y estilos
vendor/three.module.min.js       three.js r160 (MIT)
src/main.js                      Arranque, menús ↔ partidas
src/game.js                      Orquestador: bucle, interacción, guardado, estados
src/world.js · chunk.js          Chunks, streaming, mallado con presupuesto, físicas de acceso
src/shapes.js                    Formas de cajas (render/colisión/selección) de escaleras, puertas, vallas…
src/fluids.js                    Agua y lava que fluyen
src/villages.js · villagers.js   Aldeas (plan de varios chunks), aldeanos y guardián
src/navigation.js · trading.js   Búsqueda de caminos A*; oficios, ofertas y comercio
src/bosses.js · shrines.js       Jefes (fases, ataques, recompensas) y santuarios generados
src/effects.js · alchemy.js      Efectos de estado; destilación de tónicos
src/bestiary.js                  Fichas e historia de las criaturas
src/darkterrain.js · portals.js  Generador de la Dimensión Oscura y ciudadela; portales umbríos
src/energy.js                    Energía (cables, repetidores, inversores) y máquinas (pistón, dispensador, tolva, cosechadora)
src/rails.js · vehicles.js       Forma automática y recorrido de los raíles; vagoneta y barca
src/touch.js                     Controles táctiles para teléfonos y tabletas
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
tests/run.mjs · tests/fase*.mjs  Pruebas automáticas (Node); tests/e2e/ en Chromium
docs/                            Plan de fases y especificaciones
```

## Decisiones de diseño y límites conocidos

- **Los chunks sin modificar no se guardan**: se regeneran desde la semilla; solo se guardan los editados. Si cambia `GENERATOR_VERSION`, el terreno aún no explorado puede diferir y el juego avisa.
- Los **ticks aleatorios** (crecimiento) y los hornos solo avanzan en chunks cargados cerca del jugador.
- Los **monstruos de estructuras** aparecen una vez por estructura (se recuerda en el guardado).
- El audio necesita un gesto del usuario (el primer clic) por política de los navegadores.
- Se juega con **ratón y teclado** o, en teléfonos y tabletas, con **controles táctiles** ([`docs/movil.md`](docs/movil.md)).
- **Fase 2 — límites conocidos:** las puertas tienen la bisagra siempre en el mismo lado (sin puertas dobles); los fluidos solo avanzan en chunks cargados y un flujo a medias
  se queda quieto al recargar el mundo hasta que cambia un bloque vecino; el agua se extiende igual en todas direcciones
  (no busca el hueco más cercano); desde una losa se puede saltar encima de una valla (1,27 + 0,5 > 1,5); la luz del cielo
  atraviesa losas, puertas y vallas, pero no las escaleras (dan sombra).
- **Fase 3 — límites conocidos:** los aldeanos no se reproducen; solo aparecen una vez por aldea (al acercarse) y se guardan
  con el mundo; los mundos creados antes de la Fase 3 avisan de que el generador cambió (las aldeas solo aparecen en
  terreno no guardado y pueden quedar cortadas junto a zonas ya modificadas).
- **Fase 4 — límites conocidos:** los jefes no rompen
  bloques (sus explosiones solo dañan); la Reina no persigue fuera de su templo y fuera del agua se debilita; no hay tónicos
  "potenciados" ni "prolongados" ni tónicos arrojadizos; los santuarios, como las aldeas, solo aparecen en terreno no guardado
  de mundos creados antes de la Fase 4; con poca potencia gráfica los combates grandes pueden bajar de fotogramas.
- **Fase 5 — límites conocidos:** las coordenadas de las dos dimensiones son 1:1; los portales solo enlazan con el portal
  activo más cercano (20 bloques) y si no hay se construye uno; las entidades no cruzan los portales (solo el jugador); en la
  Dimensión Oscura el tiempo del mundo normal sigue corriendo; el velo no tiene animación propia.
- **Fase 6 — límites conocidos:** los pistones empujan solo en horizontal y no tiran de los bloques al recogerse; la energía no
  atraviesa bloques sólidos (un cable solo alimenta lo que toca) y solo se calcula en chunks cargados; las vagonetas no chocan
  entre sí ni con criaturas y no hay vagonetas con cofre o enganchadas; las barcas solo llevan al jugador; no hay comparadores,
  observadores ni raíles detectores.
- **Revisión de las Fases 5 y 6 (corregido):** ver la lista en [`docs/fase6-energia-transporte.md`](docs/fase6-energia-transporte.md);
  además, una pantalla abierta al cruzar un portal ya no permite duplicar objetos, morir en la Dimensión Oscura ya no construye
  un portal donde se murió, guardar y salir a mitad de viaje ya no deja al jugador en el aire, en mundos con límites el portal
  de llegada queda dentro y el punto de aparición se conserva al continuar una partida dejada en la Dimensión Oscura.
- **Revisión de la Fase 4 (corregido en la Fase 6):** las recompensas de un jefe se dan en el momento de su muerte y caen sobre
  su altar (nunca en la lava ni en el vacío; guardar durante la animación ya no las pierde ni las duplica); un Coloso guardado
  en fase 2 vuelve con sus pilares y su escudo, y los jefes guardan su rabia; la Reina deja de embestir si cambia de fase a
  mitad de la carga; la coraza de magma del Titán solo quema a quien le golpea cuerpo a cuerpo (no al lanzar bolas de nieve);
  las bolas de nieve no hieren a aldeanos ni guardianes; en Pacífico los jefes vuelven a dormir y devuelven la ofrenda; el
  Corazón de geoda se fabrica con bloques de geoda (ya no pide cristales de cueva, que no se pueden obtener); las calderas
  volcánicas ya no se generan dentro de lagos de lava, los templos sumergidos quedan lejos de la costa y la salida del pozo
  de la gruta de cristal queda despejada a la altura real del terreno (`GENERATOR_VERSION` 4: los mundos anteriores avisan).
- **Revisión de la Fase 2 (corregido en la Fase 4):** las escaleras ya no oscurecen ni ponen negras las caras vecinas y su techo
  no ilumina salas cerradas; la línea de visión tiene en cuenta la parte alta de vallas y muros (y los murciélagos la respetan);
  mantener el clic derecho en una puerta ya no coloca bloques delante; el agua que corre hidrata la tierra arada; las vallas no
  se unen al costado de una puerta de valla; vaciar un cubo sobre una fuente de otro fluido vuelve a funcionar; los animales
  atados no rompen la cuerda al asustarse ni la sueltan si la valla está en un chunk sin cargar, y la cuerda se recupera si
  muere el animal o el jugador; ya no se pierden animales persistentes al descargar chunks muy poblados; la arena que cae sobre
  una puerta de valla abierta se suelta como objeto; el rayo de selección sale de la cámara al subir escalones; y (Fase 6) el
  pomo de la puerta queda lejos de la bisagra en las dos caras.

## Nota sobre el encargo

El texto del encargo llegaba **cortado en la sección 22 (Jefes: «Cada jefe debe tener: Historia. Arena…»)**. Las secciones posteriores
no se recibieron; las fases siguientes se basan en la hoja de ruta propuesta (`docs/PLAN.md`): **Fase 3** (aldeas y comercio),
**Fase 4** (jefes y arenas), **Fase 5** (dimensiones), **Fase 6** (maquinaria, automatización y transporte). Las seis
fases están hechas, y además se puede jugar en teléfonos y tabletas; lo que no se hizo (multijugador) y las
simplificaciones de cada fase están descritos arriba.

## Licencias

Código del juego: original (sin licencia pública definida). `vendor/three.module.min.js`: three.js, licencia MIT (`vendor/THREE-LICENSE.txt`).
