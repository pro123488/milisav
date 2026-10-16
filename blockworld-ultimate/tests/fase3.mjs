// Pruebas de la Fase 3 (aldeas y comercio). node --import ./tests/support/hooks.mjs tests/fase3.mjs
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Blocks, BLOCKS, ID } from '../src/blocks.js';
import { Items } from '../src/items.js';
import { Terrain, seedFromString } from '../src/terrain.js';
import { World } from '../src/world.js';
import { villageAt, nearestVillage, villagesNear, villageFootprints, pieceToWorld, VREGION } from '../src/villages.js';
import { findPath, standable } from '../src/navigation.js';
import { PROFESSIONS, newTradeState, offersFor, canTrade, executeTrade, restock, LEVEL_XP, COIN } from '../src/trading.js';
import { rotateBlockId, renderBoxes, collisionBoxes, B_FAMILY, FAM } from '../src/shapes.js';
import { Building } from '../src/building.js';
import { Villager } from '../src/villagers.js';
import { Inventory } from '../src/inventory.js';
import { missingTilePainters } from '../src/atlas.js';
import { RECIPES } from '../src/crafting.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n       ') : e)); process.exitCode = 1; }
};

console.log('Aldeas');
const SEED = seedFromString('aldea');
const T = new Terrain(SEED, {});
const V = nearestVillage(T, 0, 0, 6);
test('hay aldeas y el plan es determinista (mismo resultado con otro generador)', () => {
  assert.ok(V, 'aldea cerca del origen');
  const T2 = new Terrain(SEED, {});
  const V2 = villageAt(T2, V.rx, V.rz);
  assert.equal(JSON.stringify(V2), JSON.stringify(V));
  assert.ok(V.pieces.length >= 4 && V.villagers.length >= 2, `piezas ${V.pieces.length}, aldeanos ${V.villagers.length}`);
});
test('las parcelas no se solapan y quedan dentro del radio', () => {
  const ps = V.pieces;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j];
    assert.ok(a.x1 < b.x0 || b.x1 < a.x0 || a.z1 < b.z0 || b.z1 < a.z0, `${a.type} y ${b.type} se solapan`);
  }
  for (const p of ps) assert.ok(Math.max(Math.abs(p.x0 - V.x), Math.abs(p.x1 - V.x), Math.abs(p.z0 - V.z), Math.abs(p.z1 - V.z)) <= 46);
});
// Generar los chunks de la aldea en dos órdenes distintos y comparar
const cx0 = Math.floor(V.bounds[0] / 16), cz0 = Math.floor(V.bounds[1] / 16), cx1 = Math.floor(V.bounds[2] / 16), cz1 = Math.floor(V.bounds[3] / 16);
const chunksA = new Map(), info = { chests: [], mobs: [] };
for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) { const r = T.generateChunk(cx, cz); chunksA.set(cx + ',' + cz, r.blocks); info.chests.push(...r.chests); info.mobs.push(...r.mobs); }
const getA = (x, y, z) => { const b = chunksA.get((x >> 4) + ',' + (z >> 4)); return b ? b[(x & 15) | ((z & 15) << 4) | (y << 8)] : 0; };
test('sin costuras: generar los chunks en otro orden y con otro generador da exactamente lo mismo', () => {
  const T3 = new Terrain(SEED, {});
  for (let cz = cz1; cz >= cz0; cz--) for (let cx = cx1; cx >= cx0; cx--) {
    const b = T3.generateChunk(cx, cz).blocks, a = chunksA.get(cx + ',' + cz);
    assert.ok(a.every((v, i) => v === b[i]), `chunk ${cx},${cz} distinto`);
  }
});
test('cada aldeano y el guardián se devuelven una sola vez (en el chunk que los contiene)', () => {
  const vill = info.mobs.filter((m) => m.type === 'villager' && m.data.village === V.id);
  assert.equal(vill.length, V.villagers.length);
  assert.equal(new Set(vill.map((m) => `${m.x},${m.y},${m.z}`)).size, vill.length);
  assert.equal(info.mobs.filter((m) => m.type === 'stone_guardian').length, 1);
  for (const c of info.chests) assert.equal(getA(c.x, c.y, c.z), ID.CHEST);
});
test('las casas tienen puerta completa en la fachada y cama donde dice el plan', () => {
  for (const v of V.villagers) assert.equal(getA(v.bed[0], v.bed[1], v.bed[2]), ID.BED, 'cama de ' + v.name);
  for (const p of V.pieces.filter((q) => q.type.startsWith('house'))) {
    const [x, z] = pieceToWorld(p, p.w >> 1, p.d - 1);
    const lo = Blocks.get(getA(x, p.y + 1, z)), up = Blocks.get(getA(x, p.y + 2, z));
    assert.equal(lo.family, 'door'); assert.equal(up.family, 'door'); assert.equal(up.upper, 1);
    assert.equal(lo.facing, p.facing, 'la hoja mira a la calle');
  }
});
test('no crecen árboles dentro de las parcelas ni sobre las calles', () => {
  for (const p of V.pieces) for (let z = p.z0; z <= p.z1; z++) for (let x = p.x0; x <= p.x1; x++) for (let y = p.y; y < p.y + 12; y++) {
    assert.ok(Blocks.get(getA(x, y, z)).group !== 'leaves', `hojas en ${p.type} ${x},${y},${z}`);
  }
  assert.ok(villageFootprints(T, Math.floor(V.x / 16), Math.floor(V.z / 16)).length > V.pieces.length);
});
test('las estaciones de trabajo dan oficio a los aldeanos', () => {
  const profs = V.villagers.map((v) => v.prof);
  for (const v of V.villagers) if (v.ws) assert.ok(PROFESSIONS[v.prof].station, v.prof);
  assert.ok(profs.every((p) => PROFESSIONS[p]));
});
test('las estructuras de un solo chunk no aparecen dentro de una aldea', () => {
  // en ningún chunk de la aldea hay cofres de botín de cabaña/ruina/templo
  assert.ok(info.chests.every((c) => c.table === 'village' || c.table === 'smithy'), JSON.stringify(info.chests.map((c) => c.table)));
});

console.log('Rotación de bloques');
test('rotateBlockId: 4 giros vuelven al original; puertas, escaleras, antorchas y yunques giran', () => {
  for (const id of [ID.DOOR_WOOD_S, ID.DOOR_WOOD_S_SUP, ID.STAIRS_PLANKS + 4, ID.LADDER, ID.TORCH_N, ID.ANVIL, ID.GATE_WOOD + 5, ID.TRAPDOOR_WOOD + 9]) {
    let r = id; for (let k = 0; k < 4; k++) r = rotateBlockId(r, 1);
    assert.equal(r, id, Blocks.get(id).key);
  }
  assert.equal(Blocks.get(rotateBlockId(ID.DOOR_WOOD_S, 1)).facing, 3);
  assert.equal(rotateBlockId(ID.TORCH_N, 1), ID.TORCH_E); // soporte al Norte → al Este
  assert.equal(rotateBlockId(ID.FENCE_WOOD, 1), ID.FENCE_WOOD);
  assert.equal(rotateBlockId(ID.STONE, 2), ID.STONE);
});
test('modelos propios (yunque, farol, atril...) con cajas dentro de la celda', () => {
  for (const b of BLOCKS) {
    if (!b || B_FAMILY[b.id] !== FAM.CUSTOM) continue;
    const bx = renderBoxes(b.id);
    assert.ok(bx.length > 0, b.key);
    for (const q of bx) for (let i = 0; i < 3; i++) assert.ok(q[i] >= 0 && q[i + 3] <= 1 && q[i] < q[i + 3], b.key);
    if (b.solid) assert.ok(collisionBoxes(b.id).length > 0, b.key);
  }
});

console.log('Navegación');
function flatWorld(seed) {
  const w = new World({ seed: seedFromString(seed), type: 'flat', structures: false, renderDistance: 3, useWorker: false });
  for (let i = 0; i < 3000; i++) { w.update(8, 8, 8); if (w.isAreaReady(8, 8, 2) && !w.incoming.length && !w.pending.size) break; }
  return w;
}
const W = flatWorld('nav');
const G = 42;
test('A* rodea un muro y no atraviesa bloques', () => {
  for (let z = 2; z <= 14; z++) { W.setBlock(8, G, z, ID.STONE); W.setBlock(8, G + 1, z, ID.STONE); }
  const path = findPath(W, 4, G, 8, 12, G, 8);
  assert.ok(path && path.length > 8, 'camino encontrado');
  const last = path[path.length - 1];
  assert.deepEqual(last, [12, G, 8]);
  for (const [x, y, z] of path) assert.ok(standable(W, x, y, z), `paso ${x},${y},${z}`);
});
test('A* cruza una puerta de madera cerrada (la abrirá) pero no una de hierro', () => {
  for (let z = 2; z <= 14; z++) { W.setBlock(8, G, z, 0); W.setBlock(8, G + 1, z, 0); }
  // habitación cerrada con una única salida (la puerta, al Este)
  for (let x = 3; x <= 7; x++) for (let z = 6; z <= 10; z++) for (let y = G; y <= G + 2; y++) {
    const edge = x === 3 || x === 7 || z === 6 || z === 10;
    W.setBlock(x, y, z, edge || y === G + 2 ? ID.STONE : 0);
  }
  W.setBlock(7, G, 8, ID.DOOR_WOOD_E); W.setBlock(7, G + 1, 8, ID.DOOR_WOOD_E_SUP);
  const p1 = findPath(W, 5, G, 8, 11, G, 8, { maxNodes: 600, partial: false });
  assert.ok(p1 && p1.some(([x, , z]) => x === 7 && z === 8), 'pasa por la puerta');
  W.setBlock(7, G, 8, ID.DOOR_IRON_E); W.setBlock(7, G + 1, 8, ID.DOOR_IRON_E_SUP);
  const p2 = findPath(W, 5, G, 8, 11, G, 8, { maxNodes: 600, partial: false });
  assert.equal(p2, null);
});
test('A* sube un escalón de 1 bloque y baja desniveles', () => {
  for (let x = 3; x <= 7; x++) for (let z = 6; z <= 10; z++) for (let y = G; y <= G + 2; y++) W.setBlock(x, y, z, 0);
  for (let x = 9; x <= 14; x++) for (let z = 5; z <= 11; z++) W.setBlock(x, G, z, ID.STONE);
  const up = findPath(W, 5, G, 8, 12, G + 1, 8);
  assert.ok(up && up[up.length - 1][1] === G + 1);
  const down = findPath(W, 12, G + 1, 8, 4, G, 8);
  assert.ok(down && down[down.length - 1][0] === 4);
});

console.log('Comercio');
test('ofertas por nivel, trato que consume y da, experiencia y subida de nivel', () => {
  const st = newTradeState('farmer');
  assert.equal(offersFor(st).length, 3);
  const inv = new Inventory();
  inv.add({ i: Items.id('wheat'), n: 64 * 4, d: 0 });
  const sell = offersFor(st).find((o) => o.give[0][0] === 'wheat');
  assert.ok(canTrade(sell, inv.slots));
  const r = executeTrade(st, sell, inv.slots);
  assert.ok(r.ok);
  assert.equal(inv.count(Items.id('wheat')), 64 * 4 - sell.give[0][1]);
  assert.equal(inv.count(Items.id(COIN)), 1);
  for (let k = 0; k < 7; k++) executeTrade(st, offersFor(st).find((o) => o.key === sell.key), inv.slots);
  assert.ok(st.level >= 2 || st.xp >= LEVEL_XP[1], 'sube de nivel con la experiencia');
  assert.equal(offersFor(st).length, 6);
});
test('las ofertas se agotan y se reponen; sin espacio no se pierde nada', () => {
  const st = newTradeState('blacksmith');
  const inv = new Inventory();
  inv.add({ i: Items.id('coal'), n: 64 * 4, d: 0 });
  const o = () => offersFor(st).find((x) => x.give[0][0] === 'coal');
  let n = 0; while (executeTrade(st, o(), inv.slots).ok) n++;
  assert.equal(n, o().max);
  assert.ok(!canTrade(o(), inv.slots));
  restock(st);
  assert.ok(canTrade(o(), inv.slots));
  // inventario lleno: el trato se rechaza sin consumir
  const full = new Inventory();
  for (let i = 0; i < 36; i++) full.slots[i] = { i: Items.id('stone'), n: 64, d: 0 };
  full.slots[0] = { i: Items.id('coal'), n: 15, d: 0 };
  const r = executeTrade(newTradeState('blacksmith'), offersFor(newTradeState('blacksmith')).find((x) => x.give[0][0] === 'coal'), full.slots);
  assert.ok(r.ok, 'al gastar el carbón queda hueco para la moneda');
  const full2 = new Inventory();
  for (let i = 0; i < 36; i++) full2.slots[i] = { i: Items.id('stone'), n: 64, d: 0 };
  full2.slots[0] = { i: Items.id(COIN), n: 64, d: 0 };
  const buy = offersFor(newTradeState('farmer')).find((x) => x.get[0] === 'bread');
  const r2 = executeTrade(newTradeState('farmer'), buy, full2.slots);
  assert.ok(!r2.ok && full2.count(Items.id(COIN)) === 64, 'sin espacio no se cobra');
});
test('la mala reputación encarece las compras con monedas', () => {
  const st = newTradeState('farmer');
  const normal = offersFor(st, 0).find((o) => o.get[0] === 'bread').give[0][1];
  const angry = offersFor(st, -40).find((o) => o.get[0] === 'bread').give[0][1];
  assert.ok(angry > normal);
});
test('todos los objetos de las ofertas existen; todas las estaciones son bloques', () => {
  for (const [k, P] of Object.entries(PROFESSIONS)) {
    if (P.station) assert.ok(Blocks.get(P.station), k + ' estación');
    for (const L of P.levels) for (const o of L) { for (const [it] of o.give) assert.ok(Items.get(it), it); assert.ok(Items.get(o.get[0]), o.get[0]); }
  }
});

console.log('Aldeano (entidad)');
// Mínimo de DOM para construir modelos de criaturas en Node (textura de ruido en un canvas falso)
globalThis.document = globalThis.document || { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, set fillStyle(v) { void v; } }) }) };
test('de noche el aldeano vuelve a su cama abriendo la puerta y la cierra al pasar', () => {
  const w = flatWorld('casa');
  // casa: muros de piedra 5x5 con puerta al Sur
  for (let x = 4; x <= 8; x++) for (let z = 4; z <= 8; z++) for (let y = G; y <= G + 2; y++) {
    const edge = x === 4 || x === 8 || z === 4 || z === 8;
    w.setBlock(x, y, z, edge ? ID.STONE : 0);
  }
  w.setBlock(6, G, 8, ID.DOOR_WOOD_S); w.setBlock(6, G + 1, 8, ID.DOOR_WOOD_S_SUP);
  w.setBlock(5, G, 5, ID.BED);
  const scene = new THREE.Scene();
  const game = {
    world: w, scene, time: 0.75, playTime: 100, mode: 'survival', difficulty: 'normal', meta: { mobs: 'all' },
    player: { x: 30, y: G, z: 30, w: 0.6, h: 1.8 }, entities: { list: [] }, particles: { emit() {} }, audio: null, ui: { toast() {} },
    survival: { dead: false }, lightAt: () => 1, villageInfo: () => null, villageAlarm: () => false,
  };
  game.building = new Building(game);
  const v = new Villager(game);
  v.initFromData({ prof: 'farmer', name: 'Prueba', village: null, bed: [5, G, 5], ws: null });
  v.setPos(6.5, G, 13.5);
  game.entities.list.push(v);
  let opened = false;
  for (let i = 0; i < 1200; i++) {
    v.update(0.05);
    if (Blocks.get(w.getBlock(6, G, 8)).open) opened = true;
    if (v.mode === 'sleep' && i > 40 && !Blocks.get(w.getBlock(6, G, 8)).open) break;
  }
  assert.ok(opened, 'abrió la puerta');
  assert.equal(v.mode, 'sleep', 'llegó a la cama (x=' + v.x.toFixed(2) + ' z=' + v.z.toFixed(2) + ')');
  assert.ok(Math.hypot(v.x - 5.5, v.z - 5.5) < 1.7);
  assert.equal(Blocks.get(w.getBlock(6, G, 8)).open, 0, 'cerró la puerta');
  const ser = v.serialize();
  assert.equal(ser.vd.prof, 'farmer'); assert.deepEqual(ser.vd.bed, [5, G, 5]);
});

console.log('Contenido');
test('pintores de texturas y recetas de la Fase 3', () => {
  assert.deepEqual(missingTilePainters().filter((m) => !/^(air|dandelion_dummy):/.test(m)), []);
  for (const k of ['bookshelf', 'barrel', 'anvil', 'lantern', 'compost_bin', 'lectern', 'loom', 'alchemy_table', 'bell', 'plaster', 'paper', 'book', 'bandage', 'village_compass', 'hay_bale']) {
    assert.ok(RECIPES.some((r) => r.out === k), 'receta de ' + k);
  }
  assert.ok(Items.get('sun_coin') && Items.get('fertilizer'));
});

console.log(`\n${passed} pruebas correctas${process.exitCode ? ' — HAY FALLOS' : ''}`);
void villagesNear; void VREGION;
