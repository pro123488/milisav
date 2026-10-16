# Plan de fases de BLOCKWORLD ULTIMATE

El usuario pidió hacer **todas las fases seguidas** (estará inactivo una semana). Este archivo es la fuente
de verdad del plan y del estado; se actualiza al terminar cada fase. Cada fase termina con pruebas unitarias,
pruebas E2E en Chromium, revisión adversarial, commit y push en la rama `claude/intelligent-faraday-e2adff`.

## Fase 2.0 — Base técnica para el resto de fases
- IDs de bloque de 16 bits (`Uint16Array`, hasta 4096 bloques) para poder representar estados como variantes
  (orientaciones, niveles de fluido, energía...). Objetos de bloques con ID ≥ 256 usan `16384 + id`.
- Formato de guardado v2 (RLE de 16 bits) con migración automática de los chunks v1 (8 bits).
- Atlas de 32×32 tiles (1024 texturas).
- Módulo `shapes.js`: formas compuestas de cajas compartidas por mallado, física y raycast.
- Física por cajas (incluye cajas de 1,5 de alto) y subida de escalones de hasta 0,6.

## Fase 2 — Construcción avanzada y mundo vivo
- Escaleras de bloque (5 materiales, normales e invertidas), escaleras de mano trepables.
- Puertas de madera y hierro (2 bloques, se abren), trampillas, vallas, muros y puertas de valla.
- Fluidos que fluyen (agua y lava con niveles, presupuesto limitado de actualizaciones), lava + agua → piedra/vidrio volcánico.
- Nuevos cultivos (tomate, maíz) y comidas (cuenco, estofado, ensalada, pan de maíz, mazorca asada).
- Transporte de animales: cuerda (llevar animales y atarlos a vallas).

## Fase 3 — Aldeas y comercio
- Estructuras de varios chunks (planificador determinista por región).
- Aldeas en llanuras, desiertos, regiones nevadas y junglas: casas con camas y puertas, granjas, pozo, caminos, faroles, herrería.
- Aldeanos con profesiones, rutinas día/noche, huida de monstruos; pantalla de comercio con ofertas que se reponen; moneda propia.
- Guardián de aldea (defensor) contra monstruos nocturnos.

## Fase 4 — Jefes
- Sistema de efectos de estado (regeneración, fuerza, velocidad, resistencia al fuego, respiración acuática, lentitud, oscuridad).
- Barra de vida de jefe, música de combate y bestiario con la historia de cada criatura.
- Cinco jefes con historia, arena, invocación, fases, ataques, debilidades y recompensas únicas:
  Guardián del Bosque Antiguo, Coloso de Cristal, Reina de las Profundidades, Titán Volcánico, Soberano de la Dimensión Oscura.

## Fase 5 — Dimensiones
- Dimensión Oscura con generador propio (islas y cavernas de piedra umbría, hongos luminosos, más noctisita), cielo propio y criaturas propias.
- Portal de vidrio volcánico activado con una llave; portal de vuelta enlazado; guardado por dimensión.
- Ciudadela del Soberano (arena del jefe final).

## Fase 6 — Maquinaria, automatización y transporte
- Energía: palanca, botón, placa de presión, bloque de energía, cable de cobre (niveles 0–15), repetidor, inversor.
- Consumidores: lámparas, puertas/trampillas/puertas de valla automáticas, pistones, dispensadores, tolvas, cosechadora.
- Granjas automáticas (agua que fluye + cosechadora + tolvas).
- Raíles (rectos, curvas, rampas, propulsores), vagonetas montables y barcos.

## Fuera de alcance (se documenta)
- Multijugador (necesita servidor), soporte táctil completo.

## Estado
- [x] Fase 1 — juego jugable (commit 11072e3).
- [x] Fase 2.0 — IDs de 16 bits, guardado v2, atlas 32×32 (commit 79c938e).
- [x] Fase 2 — escaleras, puertas, vallas, muros, trampillas, fluidos, cuerda, cultivos (commit 79c938e).
- [x] Fase 3 — aldeas, aldeanos, comercio, guardián.
- [ ] Fase 4
- [ ] Fase 5
- [ ] Fase 6
