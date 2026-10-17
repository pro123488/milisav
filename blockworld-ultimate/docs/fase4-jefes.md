# Fase 4 — Jefes, efectos de estado, alquimia y bestiario

## Efectos de estado (`src/effects.js`)
Cada efecto guarda nivel y segundos; al aplicar uno que ya existe se queda el de mayor nivel (o, a igual nivel, el más largo).
Se muestran en el HUD, se guardan con el jugador y se consultan en:

| Efecto | Dónde actúa |
|---|---|
| Regeneración | `survival.update`: +1 de vida cada 2,5 s / nivel |
| Veneno | −1 de vida cada 1,25 s / nivel, nunca por debajo de medio corazón |
| Fuerza / Debilidad | `game.tryAttack`: +3 / −2 de daño por nivel |
| Velocidad / Lentitud | `player.speedMul` (+20 % / −15 % por nivel, mínimo 30 %) |
| Prisa minera | `breakSeconds(..., {haste})`: +25 % por nivel |
| Resistencia | `survival.damage`: −20 % de daño por nivel (máximo −80 %) |
| Resistencia al fuego | inmune a lava y fuego |
| Respiración acuática | no se gasta el aire (también con la Corona de coral puesta) |
| Visión nocturna / Oscuridad | `game._atmosphere`: luz ambiente mínima alta / niebla negra a 11 bloques |

## Alquimia (`src/alchemy.js`)
Frasco de vidrio (3 vidrios → 3 frascos) → clic derecho sobre agua → Frasco de agua. La mesa de alquimia tiene 1 hueco de
ingrediente y 3 de frasco (de una unidad). En 10 s cada frasco válido se transforma y se gasta un ingrediente.

| Base | Ingrediente | Resultado |
|---|---|---|
| Frasco de agua | Fragmento de cristal | Tónico rúnico |
| Tónico rúnico | Manzana · Bayas · Pedernal · Pluma · Cobre en bruto · Ceniza · Pez luminoso · Hongo luminoso · Caparazón de río | Curación · Regeneración · Fuerza · Velocidad · Prisa minera · Ignífugo · Branquias · Visión nocturna · Piel pétrea |

Los tónicos se beben manteniendo el clic derecho (1,2 s) y devuelven el frasco. Manzana solar: manzana + 8 lingotes de oro.

## Santuarios (`src/shrines.js`)
Regiones de 14×14 chunks; en cada una, como mucho un santuario. La región prefiere un tipo (por hash) y busca hasta 10 sitios
cuyo bioma encaje; si no, prueba los otros tipos y por último la gruta de cristal (cabe casi en cualquier sitio). Nunca a menos
de 40 bloques de una aldea, y las estructuras de un solo chunk se apartan. Se construyen recortados por chunk (sin costuras).

| Tipo | Biomas | Arena |
|---|---|---|
| Santuario del Bosque | bosques, bosque oscuro, jungla | claro de radio 12, suelo de piedra musgosa, 8 pilares de corteza ancestral con copa, piedras rúnicas |
| Gruta de cristal | resto de tierra (o costa poco profunda) | elipsoide de geoda a ~26 bloques bajo la superficie con cristales y faroles; pozo con escalera de mano y torre de geoda |
| Templo sumergido | océano de 8+ bloques de profundidad | plataforma de piedra marina con anillo de faroles marinos y 6 pilares, todo bajo el agua |
| Caldera volcánica | desierto, mesetas, región volcánica | plataforma de roca volcánica con foso de lava, 4 puentes, 6 pilares y muro de ladrillo de magma |

## Jefes (`src/bosses.js`)
Base común `Boss` (sobre `Mob`): aparición de 2,6 s (invulnerable), pausa de 1,4 s al cambiar de fase, ataques como
acciones con aviso (`tele`) y efecto, daño de área (`aoe`), proyectiles (`Missile`), esbirros, correa a la arena y vuelta
a dormir si el jugador se aleja más de 44 bloques o muere durante 10 s (devuelve la ofrenda). Se guardan con su vida, fase
y altar. Multiplicador de daño = (1 − armadura) × debilidad del arma × escudo (0,1) × aturdido (2) × enfriado (2).

| Jefe | Vida | Fases (umbral) | Ataques | Debilidad | Recompensa única |
|---|---|---|---|---|---|
| Guardián del Bosque Antiguo | 300 | 50 %: brotes y raíces triples · 25 %: más rápido, los brotes lo curan | golpe de rama, raíces, brotes espinosos | hachas ×2 | Báculo de raíces (inmoviliza 4 s a los enemigos a 8 bloques, regeneración II) |
| Coloso de Cristal | 360 (armadura 25 %) | 60 %: 4 pilares de resonancia (escudo) · 25 %: 3 pilares más y esquirlas en anillo | pisotón (saltar lo esquiva), ráfaga de esquirlas | picos ×2, espadas ×0,6 | Hoja prismática (cada 4 golpes, anillo de esquirlas) |
| Reina de las Profundidades | 280 | 50 %: tinta (oscuridad) y medusas · 25 %: remolino | embestida, escupitajo venenoso, tinta, remolino | aturdida tras chocar ×2; fuera del agua ×1,5 y pierde vida | Corona de coral (respirar bajo el agua) |
| Titán Volcánico | 440 (armadura 20 %) | 50 %: meteoritos y diablillos · 20 %: coraza de magma | martillazo, bola de fuego, meteoritos | enfriado (bola de nieve/cubo de agua) ×2 y más lento | Martillo del Titán (rompe 3×3) |

Todos sueltan además Cristal vital (+2 de vida máxima, hasta 40), su esencia (para la llave del portal de la Fase 5),
monedas de sol y botín propio. La ofrenda se fabrica en la mesa de trabajo (categoría «Ofrendas»).

## Interfaz y sonido
Barra de jefe con nombre y fase (o «Escudo», «Enfriado», «Aturdida»); música de combate procedural (bombo, caja, bajo
ostinato y frases) con tema propio por jefe; sonidos de rugido, explosión, invocación, beber y magia. Bestiario con la `B`.

## Comandos
`/localizar santuario [bosque|cristal|mar|fuego]`, `/jefe <tipo>` (invoca junto al jugador), `/efecto <efecto> [s] [nivel]`,
`/efecto limpiar`, `/bestiario`.

## Pruebas
`tests/fase4.mjs` (Node): efectos, destilación, santuarios deterministas y sin costuras, altar central, pozo con escalera,
combates simulados de los cuatro jefes (fases, escudo, debilidades, enfriamiento, aturdimiento, recompensas, vuelta a dormir,
guardado) y regresiones de la revisión de la Fase 2. `tests/e2e/fase4.mjs` (Chromium): todo el recorrido con la interfaz real.
