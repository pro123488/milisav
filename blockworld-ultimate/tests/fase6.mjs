// Pruebas de la Fase 6 (energía, automatización y transporte). node --import ./tests/support/hooks.mjs tests/fase6.mjs
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Blocks, BLOCKS, ID } from '../src/blocks.js';
import { Items } from '../src/items.js';
import { seedFromString } from '../src/terrain.js';
import { World } from '../src/world.js';
import { EnergySystem, TICK } from '../src/energy.js';
import { RAIL, railShapeFor, updateRailsAround, nextRailCell, railPoint } from '../src/rails.js';
import { Minecart, Boat } from '../src/vehicles.js';
import { Building } from '../src/building.js';
import { Container } from '../src/inventory.js';
import { renderBoxes, collisionBoxes, connectMask, B_FAMILY, FAM, rotateBlockId } from '../src/shapes.js';
import { missingTilePainters } from '../src/atlas.js';
import { RECIPES } from '../src/crafting.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n       ') : e)); process.exitCode = 1; }
};
globalThis.document = globalThis.document || { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, set fillStyle(v) { void v; } }) }) };

function flatWorld(seed) {
  const w = new World({ seed: seedFromString(seed), type: 'flat', structures: false, renderDistance: 3, useWorker: false });
  for (let i = 0; i < 3000; i++) { w.update(8, 8, 8); if (w.isAreaReady(8, 8, 2) && !w.incoming.length && !w.pending.size) break; }
  return w;
}
const G = 42;
/** Juego mínimo con energía; las celdas cambiadas se notifican como en el juego real. */
function rig(seed) {
  const w = flatWorld(seed);
  const drops = [];
  const game = {
    world: w, scene: new THREE.Scene(), mode: 'survival', difficulty: 'normal', meta: { mobs: 'none' },
    player: { x: 100, y: G, z: 100, w: 0.6, h: 1.8, vx: 0, vy: 0, vz: 0 }, entities: { list: [], add(e) { this.list.push(e); return e; } },
    particles: { emit() {} }, audio: null, ui: { toast() {} }, survival: { dead: false }, lightAt: () => 1,
    dropItem: (st, x, y, z) => { const e = { type: 'item', stack: { ...st }, x, y, z, removed: false }; drops.push(e); game.entities.list.push(e); return e; },
    breakNatural() {},
    getBlockEntity(x, y, z, type, size) { const k = w.beKey(x, y, z); let be = w.blockEntities.get(k); if (!be) { be = new Container(size, type); w.blockEntities.set(k, be); } return be; },
  };
  game.building = new Building(game);
  game.energy = new EnergySystem(game);
  w.onBlockChange = (x, y, z, o, n) => game.energy.onBlockChange(x, y, z, o, n);
  for (const c of w.chunks.values()) game.energy.scanChunk(c);
  game.drops = drops;
  return game;
}
const run = (g, s) => { for (let t = 0; t < s; t += TICK) g.energy.tick(); };

console.log('Energía');
test('palanca → cable → lámpara: se enciende, el cable baja 1 por tramo y se apaga al quitar la energía', () => {
  const g = rig('e1'), w = g.world;
  w.setBlock(2, G, 8, ID.LEVER);
  for (let x = 3; x <= 8; x++) w.setBlock(x, G, 8, ID.CABLE);
  w.setBlock(9, G, 8, ID.ENERGY_LAMP);
  run(g, 0.3);
  assert.equal(w.getBlock(9, G, 8), ID.ENERGY_LAMP, 'apagada al principio');
  g.energy.toggleLever(2, G, 8);
  run(g, 0.3);
  assert.equal(w.getBlock(9, G, 8), ID.ENERGY_LAMP_ON);
  assert.equal(w.getBlock(5, G, 8), ID.CABLE_ON);
  assert.equal(g.energy.levels.get(`3,${G},8`), 15); assert.equal(g.energy.levels.get(`8,${G},8`), 10);
  g.energy.toggleLever(2, G, 8);
  run(g, 0.3);
  assert.equal(w.getBlock(9, G, 8), ID.ENERGY_LAMP); assert.equal(w.getBlock(5, G, 8), ID.CABLE);
});
test('el nivel se agota a los 15 tramos; un repetidor lo devuelve a 15 con retardo', () => {
  const g = rig('e2'), w = g.world;
  w.setBlock(0, G, 4, ID.POWER_BLOCK);
  for (let x = 1; x <= 18; x++) w.setBlock(x, G, 4, ID.CABLE);
  w.setBlock(19, G, 4, ID.ENERGY_LAMP);
  run(g, 0.5);
  assert.equal(w.getBlock(19, G, 4), ID.ENERGY_LAMP, 'demasiado lejos');
  assert.equal(g.energy.levels.get(`15,${G},4`), 1); assert.equal(g.energy.levels.get(`16,${G},4`), undefined);
  w.setBlock(12, G, 4, ID.REPEATER + 1); // repetidor mirando al Este
  g.energy.tick(); g.energy.tick();
  assert.equal(w.getBlock(19, G, 4), ID.ENERGY_LAMP, 'el repetidor tarda');
  run(g, 0.5);
  assert.equal(w.getBlock(12, G, 4), ID.REPEATER_ON + 1);
  assert.equal(g.energy.levels.get(`13,${G},4`), 15);
  assert.equal(w.getBlock(19, G, 4), ID.ENERGY_LAMP_ON);
});
test('inversor: sin entrada da energía; con entrada, no', () => {
  const g = rig('e3'), w = g.world;
  w.setBlock(4, G, 4, ID.LEVER); w.setBlock(5, G, 4, ID.CABLE); w.setBlock(6, G, 4, ID.INVERTER + 1); w.setBlock(7, G, 4, ID.ENERGY_LAMP);
  run(g, 0.4);
  assert.equal(w.getBlock(7, G, 4), ID.ENERGY_LAMP_ON);
  g.energy.toggleLever(4, G, 4); run(g, 0.4);
  assert.equal(w.getBlock(7, G, 4), ID.ENERGY_LAMP);
});
test('botón: energía durante un segundo; placa de presión: mientras alguien la pisa', () => {
  const g = rig('e4'), w = g.world;
  w.setBlock(4, G, 4, ID.BUTTON); w.setBlock(5, G, 4, ID.ENERGY_LAMP);
  g.energy.press(4, G, 4); run(g, 0.3);
  assert.equal(w.getBlock(5, G, 4), ID.ENERGY_LAMP_ON);
  run(g, 1.2);
  assert.equal(w.getBlock(4, G, 4), ID.BUTTON); assert.equal(w.getBlock(5, G, 4), ID.ENERGY_LAMP);
  w.setBlock(8, G, 4, ID.PRESSURE_PLATE); w.setBlock(9, G, 4, ID.ENERGY_LAMP);
  g.player.x = 8.5; g.player.y = G; g.player.z = 4.5; run(g, 0.3);
  assert.equal(w.getBlock(9, G, 4), ID.ENERGY_LAMP_ON);
  g.player.x = 30; run(g, 0.3);
  assert.equal(w.getBlock(9, G, 4), ID.ENERGY_LAMP);
});
test('una puerta de hierro se abre y se cierra con la energía', () => {
  const g = rig('e5'), w = g.world;
  w.setBlock(6, G, 8, ID.DOOR_IRON_N); w.setBlock(6, G + 1, 8, ID.DOOR_IRON_N_SUP);
  w.setBlock(5, G, 8, ID.LEVER_ON);
  run(g, 0.3);
  assert.equal(Blocks.get(w.getBlock(6, G, 8)).open, 1); assert.equal(Blocks.get(w.getBlock(6, G + 1, 8)).open, 1);
  g.energy.toggleLever(5, G, 8); run(g, 0.3);
  assert.equal(Blocks.get(w.getBlock(6, G, 8)).open, 0);
});
test('pistón: empuja una fila de bloques y la cabeza; al quitar la energía la recoge', () => {
  const g = rig('e6'), w = g.world;
  w.setBlock(4, G, 8, ID.PISTON + 1); // mira al Este
  w.setBlock(5, G, 8, ID.STONE); w.setBlock(6, G, 8, ID.BRICKS);
  w.setBlock(3, G, 8, ID.LEVER_ON);
  run(g, 0.3);
  assert.equal(w.getBlock(4, G, 8), ID.PISTON_EXT + 1);
  assert.equal(w.getBlock(5, G, 8), ID.PISTON_HEAD + 1);
  assert.equal(w.getBlock(6, G, 8), ID.STONE); assert.equal(w.getBlock(7, G, 8), ID.BRICKS);
  g.energy.toggleLever(3, G, 8); run(g, 0.3);
  assert.equal(w.getBlock(4, G, 8), ID.PISTON + 1); assert.equal(w.getBlock(5, G, 8), 0);
  // no empuja bloques indestructibles ni contenedores
  w.setBlock(5, G, 8, ID.CHEST); g.energy.toggleLever(3, G, 8); run(g, 0.3);
  assert.equal(w.getBlock(4, G, 8), ID.PISTON + 1); assert.equal(w.getBlock(5, G, 8), ID.CHEST);
});
test('dispensador: un pulso suelta o usa un objeto (cubo de agua → agua delante)', () => {
  const g = rig('e7'), w = g.world;
  w.setBlock(4, G, 8, ID.DISPENSER + 1);
  const be = g.getBlockEntity(4, G, 8, 'dispenser', 9);
  be.slots[0] = { i: Items.id('water_bucket'), n: 1, d: 0 }; be.slots[1] = { i: Items.id('apple'), n: 2, d: 0 };
  w.setBlock(3, G, 8, ID.BUTTON);
  g.energy.press(3, G, 8); run(g, 0.3);
  assert.equal(w.getBlock(5, G, 8), ID.WATER);
  assert.equal(Items.get(be.slots[0].i).key, 'bucket');
  run(g, 1.2); w.setBlock(5, G, 8, ID.STONE); be.slots[0] = null;
  g.energy.press(3, G, 8); run(g, 0.3);
  assert.equal(be.slots[1].n, 1, 'suelta una manzana');
  assert.equal(Items.get(g.drops[0].stack.i).key, 'apple');
});
test('tolva: recoge objetos sueltos encima y los pasa al cofre de abajo', () => {
  const g = rig('e8'), w = g.world;
  w.setBlock(4, G, 8, ID.CHEST); w.setBlock(4, G + 1, 8, ID.HOPPER);
  g.dropItem({ i: Items.id('wheat'), n: 3, d: 0 }, 4.5, G + 2.1, 8.5);
  run(g, 3);
  const chest = w.blockEntities.get(w.beKey(4, G, 8));
  const n = chest.slots.reduce((a, s) => a + (s && Items.get(s.i).key === 'wheat' ? s.n : 0), 0);
  assert.equal(n, 3);
});
test('cosechadora: recoge los cultivos maduros de delante y vuelve a plantar', () => {
  const g = rig('e9'), w = g.world;
  for (let x = 5; x <= 7; x++) for (let z = 7; z <= 9; z++) { w.setBlock(x, G - 1, z, ID.FARMLAND_WET); w.setBlock(x, G, z, Blocks.id('crop_wheat_3')); }
  w.setBlock(6, G, 8, Blocks.id('crop_wheat_1')); // uno sin madurar
  w.setBlock(4, G, 8, ID.HARVESTER + 1); w.setBlock(3, G, 8, ID.LEVER_ON);
  w.setBlock(5, G, 8, Blocks.id('crop_wheat_3'));
  run(g, 0.3);
  assert.equal(w.getBlock(6, G, 8), Blocks.id('crop_wheat_1'), 'no toca lo que no está maduro');
  assert.equal(w.getBlock(7, G, 9), Blocks.id('crop_wheat_0'));
  assert.ok(g.drops.some((d) => Items.get(d.stack.i).key === 'wheat'));
});

console.log('Correcciones de la revisión de la Fase 6');
test('el pistón no empuja hornos ni hacia un chunk sin cargar', () => {
  const g = rig('x1'), w = g.world;
  w.setBlock(4, G, 8, ID.PISTON + 1); w.setBlock(5, G, 8, ID.FURNACE); w.setBlock(3, G, 8, ID.LEVER_ON);
  const be = g.getBlockEntity(5, G, 8, 'furnace', 3); be.slots[2] = { i: Items.id('iron_ingot'), n: 30, d: 0 };
  run(g, 0.3);
  assert.equal(w.getBlock(5, G, 8), ID.FURNACE); assert.equal(w.getBlock(4, G, 8), ID.PISTON + 1); assert.equal(g.drops.length, 0);
  // fila que llega al borde de la zona cargada: no se mueve (antes se perdía el último bloque)
  let ex = 8; while (w.isLoaded(ex + 1, 8)) ex++;
  w.setBlock(ex - 3, G, 8, ID.PISTON + 1); w.setBlock(ex - 2, G, 8, ID.STONE); w.setBlock(ex - 1, G, 8, ID.STONE); w.setBlock(ex, G, 8, ID.BRICKS);
  w.setBlock(ex - 4, G, 8, ID.LEVER_ON); run(g, 0.3);
  assert.equal(w.getBlock(ex, G, 8), ID.BRICKS); assert.equal(w.getBlock(ex - 3, G, 8), ID.PISTON + 1);
});
test('tolva → horno: lo que no cabe no atasca a lo demás (mineral a la entrada, carbón al combustible)', () => {
  const g = rig('x2'), w = g.world;
  w.setBlock(4, G, 8, ID.FURNACE); w.setBlock(4, G + 1, 8, ID.HOPPER);
  const f = g.getBlockEntity(4, G, 8, 'furnace', 3); f.slots[0] = { i: Items.id('cobble'), n: 8, d: 0 };
  const h = g.getBlockEntity(4, G + 1, 8, 'hopper', 5);
  h.slots[0] = { i: Items.id('raw_iron'), n: 4, d: 0 }; h.slots[1] = { i: Items.id('coal'), n: 3, d: 0 };
  run(g, 2.5);
  assert.ok(f.slots[1] && Items.get(f.slots[1].i).key === 'coal', 'el carbón llega al hueco de combustible');
  assert.equal(h.slots[0].n, 4, 'el mineral espera (la entrada tiene adoquín)');
});
test('tolva → mesa de alquimia: ingrediente arriba y frascos de uno en uno; no recoge a través de un bloque', () => {
  const g = rig('x3'), w = g.world;
  w.setBlock(4, G, 8, ID.ALCHEMY_TABLE); w.setBlock(4, G + 1, 8, ID.HOPPER);
  const h = g.getBlockEntity(4, G + 1, 8, 'hopper', 5);
  h.slots[0] = { i: Items.id('water_flask'), n: 2, d: 0 }; h.slots[1] = { i: Items.id('crystal_shard'), n: 2, d: 0 };
  run(g, 4);
  const a = w.blockEntities.get(w.beKey(4, G, 8));
  assert.equal(Items.get(a.slots[0].i).key, 'crystal_shard');
  assert.ok(a.slots[1] && a.slots[1].n === 1 && a.slots[2] && a.slots[2].n === 1, 'un frasco por hueco');
  w.setBlock(8, G, 8, ID.HOPPER); w.setBlock(8, G + 1, 8, ID.STONE);
  g.dropItem({ i: Items.id('wheat'), n: 1, d: 0 }, 8.5, G + 2.05, 8.5); run(g, 1);
  assert.equal(g.getBlockEntity(8, G, 8, 'hopper', 5).slots.filter(Boolean).length, 0);
});
test('una puerta de hierro que no pudo cerrarse por alguien en medio se cierra al apartarse', () => {
  const g = rig('x4'), w = g.world;
  w.setBlock(6, G, 8, ID.DOOR_IRON_N); w.setBlock(6, G + 1, 8, ID.DOOR_IRON_N_SUP); w.setBlock(5, G, 8, ID.LEVER_ON);
  run(g, 0.3); assert.equal(Blocks.get(w.getBlock(6, G, 8)).open, 1);
  g.player.x = 6.5; g.player.y = G; g.player.z = 8.15; // en el hueco de la puerta
  g.energy.toggleLever(5, G, 8); run(g, 0.5);
  assert.equal(Blocks.get(w.getBlock(6, G, 8)).open, 1, 'no se cierra encima del jugador');
  g.player.x = 30; run(g, 0.3);
  assert.equal(Blocks.get(w.getBlock(6, G, 8)).open, 0, 'se cierra al apartarse');
});
test('al cargar la partida (sistema nuevo) se apaga lo que no tiene energía y se suelta un botón pulsado', () => {
  const g = rig('x5'), w = g.world;
  w.setBlock(4, G, 4, ID.ENERGY_LAMP_ON); w.setBlock(8, G, 4, ID.PISTON_EXT + 1); w.setBlock(9, G, 4, ID.PISTON_HEAD + 1);
  w.setBlock(12, G, 4, ID.BUTTON_ON); w.setBlock(13, G, 4, ID.ENERGY_LAMP);
  g.energy = new EnergySystem(g);
  w.onBlockChange = (x, y, z, o, n) => g.energy.onBlockChange(x, y, z, o, n);
  for (const c of w.chunks.values()) g.energy.scanChunk(c);
  run(g, 0.3);
  assert.equal(w.getBlock(4, G, 4), ID.ENERGY_LAMP); assert.equal(w.getBlock(8, G, 4), ID.PISTON + 1); assert.equal(w.getBlock(9, G, 4), 0);
  assert.equal(w.getBlock(13, G, 4), ID.ENERGY_LAMP_ON, 'el botón sigue pulsado un momento');
  run(g, 1.3);
  assert.equal(w.getBlock(12, G, 4), ID.BUTTON); assert.equal(w.getBlock(13, G, 4), ID.ENERGY_LAMP);
});
test('una lámpara encendida que un pistón saca de la energía se apaga', () => {
  const g = rig('x6'), w = g.world;
  w.setBlock(5, G, 9, ID.POWER_BLOCK); w.setBlock(5, G, 8, ID.ENERGY_LAMP); w.setBlock(4, G, 8, ID.PISTON + 1); w.setBlock(3, G, 8, ID.BUTTON);
  run(g, 0.3); assert.equal(w.getBlock(5, G, 8), ID.ENERGY_LAMP_ON);
  g.energy.press(3, G, 8); run(g, 0.4);
  assert.equal(w.getBlock(5, G, 8), ID.PISTON_HEAD + 1); assert.equal(w.getBlock(6, G, 8), ID.ENERGY_LAMP);
});

console.log('Raíles y vehículos');
test('la vagoneta sigue la nueva forma si el raíl cambia bajo ella, y nunca queda fuera de su celda', () => {
  const g = rig('x7'), w = g.world;
  w.setBlock(5, G, 5, ID.RAIL);
  const c = new Minecart(g); c.placeOn(5, G, 5, 0); g.entities.add(c);
  for (let x = 6; x <= 9; x++) { w.setBlock(x, G, 5, ID.RAIL); updateRailsAround(w, x, G, 5); }
  assert.equal(RAIL[w.getBlock(5, G, 5)].a % 2, 1, 'la celda pasa a Este-Oeste');
  c.rider = { push: true, look: 1 };
  for (let i = 0; i < 100; i++) c.update(0.05);
  assert.ok(c.cell[0] > 5, 'sale hacia el Este: ' + c.cell.join(','));
  // final de vía en la última columna de un chunk: la vagoneta se queda dentro de su chunk
  for (let x = 6; x <= 15; x++) { w.setBlock(x, G, 12, ID.RAIL); updateRailsAround(w, x, G, 12); }
  const d = new Minecart(g); d.placeOn(14, G, 12, 1); d.speed = 0.6; g.entities.add(d);
  for (let i = 0; i < 400; i++) { d.update(0.05); assert.ok(Math.floor(d.x) <= 15, 'x = ' + d.x); }
});
test('los raíles se orientan solos: rectas, curvas y rampas', () => {
  const g = rig('r1'), w = g.world;
  const put = (x, y, z) => { w.setBlock(x, y, z, ID.RAIL); updateRailsAround(w, x, y, z); };
  put(4, G, 4); put(5, G, 4); put(6, G, 4);
  assert.equal(RAIL[w.getBlock(5, G, 4)].a % 2, 1, 'recta Este-Oeste');
  put(6, G, 5);
  const r = RAIL[w.getBlock(6, G, 4)];
  assert.deepEqual([r.a, r.b].sort(), [2, 3], 'curva Sur-Oeste');
  w.setBlock(4, G, 6, ID.STONE); put(4, G + 1, 6); put(4, G, 5);
  assert.equal(RAIL[w.getBlock(4, G, 5)].asc, 2, 'rampa que sube hacia el Sur');
});
test('una vagoneta recorre un circuito cerrado sin salirse y vuelve al inicio', () => {
  const g = rig('r2'), w = g.world;
  const pts = [];
  for (let x = 2; x <= 8; x++) pts.push([x, 2], [x, 8]);
  for (let z = 3; z <= 7; z++) pts.push([2, z], [8, z]);
  for (const [x, z] of pts) w.setBlock(x, G, z, ID.RAIL);
  for (const [x, z] of pts) updateRailsAround(w, x, G, z);
  w.setBlock(5, G, 2, ID.BOOSTER_ON_EW);
  const c = new Minecart(g); c.placeOn(4, G, 2, 1); c.speed = 4; g.entities.add(c);
  const seen = new Set();
  for (let i = 0; i < 1200; i++) { c.update(0.05); seen.add(c.cell.join(',')); }
  assert.ok(!c.removed, 'sigue en la vía');
  assert.equal(seen.size, pts.length, `pasa por todas las celdas (${seen.size}/${pts.length})`);
  assert.ok(c.speed > 1, 'el propulsor la mantiene en marcha');
  const s = c.serialize(); assert.equal(s.t, 'minecart'); assert.ok(s.vd.cell);
});
test('la vagoneta sube una rampa con impulso y se para al final de la vía', () => {
  const g = rig('r3'), w = g.world;
  for (let x = 2; x <= 6; x++) w.setBlock(x, G, 4, ID.RAIL);
  w.setBlock(7, G, 4, ID.STONE); w.setBlock(7, G + 1, 4, ID.RAIL); w.setBlock(8, G + 1, 4, ID.STONE); w.setBlock(8, G + 2, 4, ID.RAIL);
  for (const [x, y] of [[2, G], [3, G], [4, G], [5, G], [6, G], [7, G + 1], [8, G + 2]]) updateRailsAround(w, x, y, 4);
  const c = new Minecart(g); c.placeOn(2, G, 4, 1); c.speed = 7; g.entities.add(c);
  let maxY = 0;
  for (let i = 0; i < 400; i++) { c.update(0.05); maxY = Math.max(maxY, c.y); }
  assert.ok(maxY > G + 1.5, 'subió: ' + maxY.toFixed(2));
  assert.ok(c.speed < 0.1, 'acaba parada');
});
test('la barca flota en el agua y avanza con el remo', () => {
  const g = rig('b1'), w = g.world;
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { w.setBlock(x, G - 1, z, ID.WATER); w.setBlock(x, G - 2, z, ID.WATER); }
  const b = new Boat(g); b.setPos(8, G, 8); b.yaw = 0; g.entities.add(b);
  for (let i = 0; i < 60; i++) b.update(0.05);
  assert.ok(Math.abs(b.y - (G - 1 + 0.875 - 0.3)) < 0.25, 'flota: ' + b.y.toFixed(2));
  b.rider = { ctl: { fwd: 1, turn: 0 } };
  const z0 = b.z;
  for (let i = 0; i < 30; i++) b.update(0.05);
  assert.ok(z0 - b.z > 2, 'avanza hacia el Norte: ' + (z0 - b.z).toFixed(2));
  // una barca hundida hasta el fondo vuelve a la superficie
  b.rider = null; b.setPos(8, G - 2, 8); b.vy = 0;
  for (let i = 0; i < 80; i++) b.update(0.05);
  assert.ok(Math.abs(b.y - (G - 1 + 0.875 - 0.3)) < 0.25, 'sale a flote: ' + b.y.toFixed(2));
});

console.log('Contenido');
test('formas, rotación, recetas y texturas de la Fase 6', () => {
  assert.deepEqual(missingTilePainters().filter((m) => !/^(air|dandelion_dummy):/.test(m)), []);
  for (const k of ['lever', 'button', 'pressure_plate', 'cable', 'power_block', 'repeater', 'inverter', 'energy_lamp', 'piston', 'dispenser', 'hopper', 'harvester', 'rail', 'booster', 'minecart', 'boat']) assert.ok(RECIPES.some((r) => r.out === k), 'receta ' + k);
  assert.equal(collisionBoxes(ID.CABLE).length, 0); assert.equal(collisionBoxes(ID.RAIL).length, 0);
  assert.equal(renderBoxes(ID.RAIL_ASC_N).length, 4);
  const get = (m) => (x, y, z) => m[`${x},${z}`] || 0;
  assert.equal(connectMask(get({ '1,0': ID.CABLE, '0,1': ID.LEVER }), 0, 0, 0, ID.CABLE), 2 | 4);
  assert.equal(rotateBlockId(ID.REPEATER, 1), ID.REPEATER + 1);
  assert.equal(rotateBlockId(ID.RAIL_EW, 1), ID.RAIL_EW, 'los raíles no cambian al girar estructuras');
  assert.equal(B_FAMILY[ID.DISPENSER], FAM.FACING);
  void BLOCKS; void railShapeFor; void nextRailCell; void railPoint;
});

console.log(`\n${passed} pruebas correctas`);
