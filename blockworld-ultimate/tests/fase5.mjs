// Pruebas de la Fase 5 (Dimensión Oscura, portales y Soberano). node --import ./tests/support/hooks.mjs tests/fase5.mjs
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Blocks, BLOCKS, ID } from '../src/blocks.js';
import { Items } from '../src/items.js';
import { seedFromString } from '../src/terrain.js';
import { DarkTerrain, FLOOR_TOP, ISLAND_Y } from '../src/darkterrain.js';
import { World } from '../src/world.js';
import { portalFrameOK, activatePortal, deactivatePortal, portalCoreFor, findPortalNear, buildPortal, PORTAL_RING } from '../src/portals.js';
import { BOSSES, createBoss } from '../src/bosses.js';
import { Effects } from '../src/effects.js';
import { BIOMES, BIOME } from '../src/biomes.js';
import { RECIPES } from '../src/crafting.js';
import { MONSTERS } from '../src/monsters.js';
import { ANIMALS } from '../src/animals.js';
import { missingTilePainters } from '../src/atlas.js';
import { rollLoot } from '../src/structures.js';
import { mulberry32 } from '../src/noise.js';
import { ACHIEVEMENTS } from '../src/achievements.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n       ') : e)); process.exitCode = 1; }
};

console.log('Generador de la Dimensión Oscura');
const SEED = seedFromString('oscura');
const D = new DarkTerrain(SEED, {});
const at = (b, x, y, z) => b[(x & 15) | ((z & 15) << 4) | (y << 8)];
test('abismo con roca base y lava, islas de piedra umbría con musgo encima', () => {
  const r = D.generateChunk(0, 0);
  assert.equal(at(r.blocks, 3, 0, 3), ID.BASEROCK);
  let lava = 0, moss = 0, stone = 0, nocti = 0;
  for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
    const b = D.generateChunk(cx, cz).blocks;
    for (let i = 0; i < b.length; i++) { const v = b[i]; if (v === ID.LAVA) lava++; else if (v === ID.UMBRAL_MOSS) moss++; else if (v === ID.UMBRAL_STONE) stone++; else if (v === ID.ORE_NOCTISITE_UMBRAL) nocti++; }
  }
  assert.ok(lava > 100 && moss > 500 && stone > 5000, JSON.stringify({ lava, moss, stone }));
  assert.ok(nocti > 20, 'noctisita abundante: ' + nocti);
  const c = D.column(0, 0);
  assert.ok(c.island && c.h > ISLAND_Y - 20, 'tierra firme junto al origen');
});
test('determinista y sin costuras: mismo resultado con otro generador y en otro orden', () => {
  const D2 = new DarkTerrain(SEED, {});
  D2.generateChunk(2, 1);
  const a = D.generateChunk(1, 1).blocks, b = D2.generateChunk(1, 1).blocks;
  assert.ok(a.every((v, i) => v === b[i]));
  // continuidad del musgo entre chunks vecinos: la cara superior coincide con column()
  for (const [x, z] of [[15, 3], [16, 3], [-1, 7], [0, 7]]) {
    const col = D.column(x, z);
    if (!col.island) continue;
    const bl = D.generateChunk(Math.floor(x / 16), Math.floor(z / 16)).blocks;
    const top = at(bl, x, col.h, z);
    assert.ok([ID.UMBRAL_MOSS, ID.UMBRAL_STONE, 0].includes(top) || Blocks.get(top).key.includes('fungus') || top === ID.UMBRAL_BRICKS, Blocks.get(top).key);
  }
});
test('la Ciudadela del Soberano tiene el trono en lo alto y centinelas', () => {
  const C = D.citadel, A = D.citadelAltar();
  const d = Math.hypot(C.x, C.z);
  assert.ok(d >= 150 && d <= 232, 'distancia ' + d);
  const b = D.generateChunk(Math.floor(A.x / 16), Math.floor(A.z / 16)).blocks;
  assert.equal(at(b, A.x, A.y, A.z), ID.ALTAR_SOVEREIGN);
  assert.equal(Blocks.get(ID.ALTAR_SOVEREIGN).boss, 'sovereign');
  assert.equal(at(b, A.x, A.y - 1, A.z), ID.UMBRAL_BRICKS);
  let mobs = 0;
  for (let cz = Math.floor((C.z - 24) / 16); cz <= Math.floor((C.z + 24) / 16); cz++) for (let cx = Math.floor((C.x - 24) / 16); cx <= Math.floor((C.x + 24) / 16); cx++) mobs += D.generateChunk(cx, cz).mobs.filter((m) => m.type === 'umbral_sentinel').length;
  assert.ok(mobs >= 4, 'centinelas ' + mobs);
});
test('biomas umbríos con criaturas propias y botín de ruinas', () => {
  for (const id of [BIOME.UMBRAL_WASTES, BIOME.UMBRAL_FUNGAL]) {
    const b = BIOMES[id];
    assert.ok(b && b.name && Object.keys(b.monsters).length >= 2, 'bioma ' + id);
    for (const k of Object.keys(b.monsters)) assert.ok(MONSTERS[k], k);
    for (const k of Object.keys(b.animals)) assert.ok(ANIMALS[k], k);
  }
  const loot = rollLoot('umbral', mulberry32(5), 8);
  assert.ok(loot.length > 0 && loot.every((l) => Items.has(l.item)));
});

console.log('Portales');
function memWorld() {
  const m = new Map();
  return { getBlock: (x, y, z) => m.get(`${x},${y},${z}`) || 0, setBlock: (x, y, z, id) => { if (id) m.set(`${x},${y},${z}`, id); else m.delete(`${x},${y},${z}`); }, m };
}
test('el núcleo solo se activa con el marco completo de vidrio volcánico y hueco encima', () => {
  const w = memWorld();
  w.setBlock(0, 10, 0, ID.PORTAL_CORE);
  for (const [dx, dz] of PORTAL_RING.slice(1)) w.setBlock(dx, 10, dz, ID.OBSIDIAN);
  assert.equal(portalFrameOK(w, 0, 10, 0), false);
  assert.equal(activatePortal(w, 0, 10, 0), false);
  w.setBlock(-1, 10, -1, ID.OBSIDIAN);
  w.setBlock(0, 12, 0, ID.STONE);
  assert.equal(activatePortal(w, 0, 10, 0), false, 'sin hueco encima');
  w.setBlock(0, 12, 0, 0);
  assert.equal(activatePortal(w, 0, 10, 0), true);
  assert.equal(w.getBlock(0, 10, 0), ID.PORTAL_CORE_ACTIVE);
  assert.equal(w.getBlock(0, 11, 0), ID.PORTAL_VEIL); assert.equal(w.getBlock(0, 12, 0), ID.PORTAL_VEIL);
  assert.deepEqual(portalCoreFor(w, 0, 12, 0), [0, 10, 0]);
  assert.deepEqual(portalCoreFor(w, 1, 10, -1), [0, 10, 0]);
  deactivatePortal(w, 0, 10, 0);
  assert.equal(w.getBlock(0, 11, 0), 0); assert.equal(w.getBlock(0, 10, 0), ID.PORTAL_CORE);
});
test('buildPortal construye un portal activo con plataforma y findPortalNear lo encuentra', () => {
  const w = memWorld();
  buildPortal(w, 5, 70, -3, ID.UMBRAL_STONE);
  assert.equal(w.getBlock(5, 70, -3), ID.PORTAL_CORE_ACTIVE);
  assert.equal(w.getBlock(7, 69, -1), ID.UMBRAL_STONE);
  assert.deepEqual(findPortalNear(w, 0, 0, 12), [5, 70, -3]);
  assert.equal(findPortalNear(w, 100, 100, 12), null);
});

console.log('Soberano');
globalThis.document = globalThis.document || { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, set fillStyle(v) { void v; } }) }) };
test('el Soberano tiene ficha completa, ofrenda fabricable y altar en la ciudadela', () => {
  const d = BOSSES.sovereign;
  for (const f of ['historia', 'arena', 'invocacion', 'debilidad', 'recompensa']) assert.ok(d.lore[f].length > 30, f);
  assert.equal(d.lore.fases.length, 3);
  assert.ok(RECIPES.some((r) => r.out === d.summon));
  assert.ok(RECIPES.some((r) => r.out === 'umbral_key'));
  assert.ok(ACHIEVEMENTS.some((a) => a.id === d.achievement));
});
test('la luz y la Hoja prismática le hacen más daño', () => {
  const w = new World({ seed: seedFromString('sob'), type: 'flat', structures: false, renderDistance: 2, useWorker: false });
  for (let i = 0; i < 3000; i++) { w.update(8, 8, 6); if (w.isAreaReady(8, 8, 1) && !w.incoming.length && !w.pending.size) break; }
  let held = null;
  const game = {
    world: w, scene: new THREE.Scene(), mode: 'survival', difficulty: 'normal', meta: { mobs: 'all' }, shake: 0,
    player: { x: 8, y: 50, z: 8, w: 0.6, h: 1.8, vx: 0, vy: 0, vz: 0, onGround: true },
    entities: { list: [], add(e) { this.list.push(e); return e; } }, particles: { emit() {} }, audio: null,
    ui: { toast() {}, centerMessage() {} }, inventory: { getSelected: () => held },
    survival: { dead: false, health: 20, fire: 0, effects: new Effects(), damage() { return true; } }, lightAt: () => 1, dropItem() {}, bossKills: {},
  };
  const b = createBoss(game, 'sovereign'); b.setPos(8.5, 46, 8.5); b.intro = 0; b.home = { x: 8, y: 45, z: 8 };
  let h = b.hp; b.hurt(10, 0, 0, 1, null); const base = h - b.hp;
  b.hurtTime = 0; held = { i: Items.id('prism_blade'), n: 1, d: 0 }; h = b.hp; b.hurt(10, 0, 0, 1, game.player);
  assert.ok(Math.abs((h - b.hp) - base * 2) < 1e-6, 'hoja prismática ×2');
  held = null; w.setBlock(8, 47, 8, ID.LANTERN); b.hurtTime = 0; h = b.hp; b.hurt(10, 0, 0, 1, null);
  assert.ok(h - b.hp > base * 1.4, 'la luz lo quema');
});

console.log('Contenido');
test('texturas, recetas y criaturas de la Fase 5', () => {
  assert.deepEqual(missingTilePainters().filter((m) => !/^(air|dandelion_dummy):/.test(m)), []);
  for (const k of ['portal_core', 'umbral_key', 'sovereign_sigil', 'umbral_bricks']) assert.ok(RECIPES.some((r) => r.out === k), 'receta ' + k);
  for (const k of ['shade_wraith', 'void_crawler', 'umbral_sentinel']) assert.ok(MONSTERS[k], k);
  assert.ok(ANIMALS.lumen_moth);
  assert.equal(Blocks.get('portal_veil').solid, false);
  assert.ok(FLOOR_TOP < ISLAND_Y);
  void BLOCKS;
});

console.log(`\n${passed} pruebas correctas`);
