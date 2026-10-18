// Pruebas de la Fase 4 (efectos, alquimia, santuarios y jefes). node --import ./tests/support/hooks.mjs tests/fase4.mjs
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Blocks, BLOCKS, ID } from '../src/blocks.js';
import { Items } from '../src/items.js';
import { Terrain, seedFromString } from '../src/terrain.js';
import { World } from '../src/world.js';
import { Effects, EFFECTS } from '../src/effects.js';
import { BREWS, BREW_TIME, tickAlchemy, canBrew } from '../src/alchemy.js';
import { Container } from '../src/inventory.js';
import { shrineAt, nearestShrine, shrinesNear, SHRINE_TYPES, SREGION } from '../src/shrines.js';
import { SEA_LEVEL as SEA } from '../src/config.js';
import { villagesNear } from '../src/villages.js';
import { BOSSES, BOSS_KEYS, createBoss, bossForSummon } from '../src/bosses.js';
import { bestiaryEntries, Bestiary } from '../src/bestiary.js';
import { breakSeconds } from '../src/mining.js';
import { missingTilePainters } from '../src/atlas.js';
import { RECIPES, repairMaterial } from '../src/crafting.js';
import { ACHIEVEMENTS } from '../src/achievements.js';
import { MONSTERS } from '../src/monsters.js';
import { segmentBlocked } from '../src/raycast.js';
import { connectMask } from '../src/shapes.js';
import { RandomTicks } from '../src/ticks.js';
import { LEAVES_GRP } from '../src/blocks.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n       ') : e)); process.exitCode = 1; }
};

console.log('Efectos de estado');
test('se queda el efecto más fuerte y caduca a su tiempo', () => {
  const fx = new Effects();
  fx.add('speed', 10, 1); fx.add('speed', 5, 2); fx.add('speed', 60, 1);
  assert.equal(fx.level('speed'), 2);
  assert.ok(Math.abs(fx.speedMul() - 1.4) < 1e-9);
  const ended = fx.update(5.1);
  assert.deepEqual(ended, ['speed']); assert.equal(fx.has('speed'), false);
});
test('modificadores: fuerza/debilidad, resistencia, prisa y lentitud con límites', () => {
  const fx = new Effects();
  fx.add('strength', 9, 2); fx.add('weakness', 9, 1);
  assert.equal(fx.meleeBonus(), 4);
  fx.add('resistance', 9, 9); assert.equal(fx.damageFactor(), 0.2);
  fx.add('slowness', 9, 9); assert.equal(fx.speedMul(), 0.3);
  fx.add('haste', 9, 2); assert.equal(fx.miningMul(), 1.5);
  const t = breakSeconds(Blocks.get('stone'), null, {}), t2 = breakSeconds(Blocks.get('stone'), null, { haste: 1.5 });
  assert.ok(Math.abs(t / t2 - 1.5) < 1e-9);
});
test('clearBad quita solo los negativos y se guardan/cargan', () => {
  const fx = new Effects();
  fx.add('poison', 9); fx.add('darkness', 9); fx.add('regeneration', 9);
  fx.clearBad();
  assert.deepEqual([...fx.list.keys()], ['regeneration']);
  const fx2 = new Effects(); fx2.load(fx.serialize()); fx2.load([...fx.serialize(), ['nope', 1, 1], ['speed', 1, -3]]);
  assert.equal(fx2.has('regeneration'), true); assert.equal(fx2.has('nope'), false); assert.equal(fx2.has('speed'), false);
  for (const id of Object.keys(EFFECTS)) assert.ok(EFFECTS[id].name && EFFECTS[id].desc, id);
});

console.log('Alquimia');
test('destilar: agua + cristal = tónico rúnico; rúnico + pluma = velocidad; un ingrediente para tres frascos', () => {
  const be = new Container(4, 'alchemy');
  const S = (k, n = 1) => ({ i: Items.id(k), n, d: 0 });
  be.slots[0] = S('crystal_shard', 2); be.slots[1] = S('water_flask'); be.slots[2] = S('water_flask'); be.slots[3] = S('apple');
  assert.ok(canBrew(be));
  for (let t = 0; t < BREW_TIME - 0.5; t += 0.5) assert.equal(tickAlchemy(be, 0.5), false);
  assert.equal(tickAlchemy(be, 0.6), true);
  assert.equal(Items.get(be.slots[1].i).key, 'tonic_base'); assert.equal(Items.get(be.slots[2].i).key, 'tonic_base');
  assert.equal(Items.get(be.slots[3].i).key, 'apple', 'lo que no es frasco no cambia');
  assert.equal(be.slots[0].n, 1, 'gasta un ingrediente');
  be.slots[0] = S('feather');
  for (let t = 0; t <= BREW_TIME + 0.5; t += 0.5) tickAlchemy(be, 0.5);
  assert.equal(Items.get(be.slots[1].i).key, 'tonic_speed');
  assert.equal(be.slots[0], null);
  assert.equal(canBrew(be), false);
});
test('sin receta válida la destilación no avanza; los frascos apilados no se destilan', () => {
  const be = new Container(4, 'alchemy');
  be.slots[0] = { i: Items.id('feather'), n: 3, d: 0 }; be.slots[1] = { i: Items.id('water_flask'), n: 1, d: 0 };
  tickAlchemy(be, 30);
  assert.equal(be.extra.brew, 0); assert.equal(Items.get(be.slots[1].i).key, 'water_flask');
  be.slots[0] = { i: Items.id('crystal_shard'), n: 1, d: 0 }; be.slots[1].n = 2;
  assert.equal(canBrew(be), false);
});
test('todos los tónicos tienen receta, devuelven el frasco y sus efectos existen', () => {
  for (const it of Items.all().filter((i) => i.key.startsWith('tonic_') && i.key !== 'tonic_base')) {
    assert.ok(BREWS.some((b) => b.out === it.key), 'receta ' + it.key);
    assert.equal(it.drink.returns, 'glass_bottle');
    for (const [id] of it.drink.effects) assert.ok(EFFECTS[id], id);
  }
  const apple = Items.get('sun_apple');
  assert.ok(apple.food.always && apple.food.effects.length === 2);
});

console.log('Santuarios');
const T = new Terrain(seedFromString('aldea'), {});
test('hay santuarios de los cuatro tipos a menos de 1000 bloques y el plan es determinista', () => {
  for (const type of Object.keys(SHRINE_TYPES)) {
    const s = nearestShrine(T, 0, 0, type, 6);
    assert.ok(s, 'santuario ' + type);
    assert.ok(Math.hypot(s.x, s.z) < 1000, `${type} a ${Math.round(Math.hypot(s.x, s.z))}`);
    const s2 = shrineAt(new Terrain(seedFromString('aldea'), {}), s.rx, s.rz);
    assert.equal(JSON.stringify(s2), JSON.stringify(s));
  }
});
test('el altar de cada santuario está en el bloque central y la arena se genera igual en cualquier orden', () => {
  for (const type of Object.keys(SHRINE_TYPES)) {
    const s = nearestShrine(T, 0, 0, type, 6);
    const cx = Math.floor(s.x / 16), cz = Math.floor(s.z / 16);
    const b = T.generateChunk(cx, cz).blocks;
    const at = (x, y, z) => b[(x & 15) | ((z & 15) << 4) | (y << 8)];
    assert.equal(at(s.x, s.y + 1, s.z), ID[SHRINE_TYPES[type].altar], type);
    assert.equal(Blocks.get(ID[SHRINE_TYPES[type].altar]).boss, s.boss);
    // otro generador, chunk vecino primero
    const T2 = new Terrain(seedFromString('aldea'), {});
    T2.generateChunk(cx + 1, cz);
    const b2 = T2.generateChunk(cx, cz).blocks;
    assert.ok(b.every((v, i) => v === b2[i]), 'chunk distinto ' + type);
    if (type === 'mar') { assert.equal(at(s.x, s.y + 2, s.z), ID.WATER, 'el templo está bajo el agua'); }
    if (type === 'fuego') {
      // foso de lava alrededor con cuatro puentes de roca en los ejes
      const cache = new Map();
      const get = (x, y, z) => { const k = (x >> 4) + ',' + (z >> 4); if (!cache.has(k)) cache.set(k, T.generateChunk(x >> 4, z >> 4).blocks); return cache.get(k)[(x & 15) | ((z & 15) << 4) | (y << 8)]; };
      let lava = 0;
      for (let k = 0; k < 16; k++) { const a = (k + 0.5) / 16 * Math.PI * 2; if (get(Math.round(s.x + Math.cos(a) * 10.4), s.y, Math.round(s.z + Math.sin(a) * 10.4)) === ID.LAVA) lava++; }
      assert.ok(lava >= 10, 'foso de lava (' + lava + '/16)');
      for (const [dx, dz] of [[10, 0], [-10, 0], [0, 10], [0, -10]]) assert.equal(get(s.x + dx, s.y, s.z + dz), ID.BASALT, 'puente');
    }
  }
});
test('la gruta de cristal tiene un pozo con escalera de mano hasta la superficie', () => {
  const s = nearestShrine(T, 0, 0, 'cristal', 6);
  const sx = s.x + 9, sz = s.z;
  const b = T.generateChunk(Math.floor(sx / 16), Math.floor(sz / 16)).blocks;
  const at = (x, y, z) => b[(x & 15) | ((z & 15) << 4) | (y << 8)];
  const top = s.shaftTop + 1;
  for (let y = s.y + 1; y <= top - 1; y++) assert.equal(at(sx, y, sz), ID.LADDER_E, 'escalera en y=' + y);
  for (let y = s.y + 1; y <= top; y++) assert.ok(Blocks.get(at(sx + 1, y, sz)).solid, 'soporte de la escalera en y=' + y);
});
test('los santuarios no tocan aldeas y las estructuras de un chunk se apartan', () => {
  for (let rz = -3; rz <= 3; rz++) for (let rx = -3; rx <= 3; rx++) {
    const s = shrineAt(T, rx, rz);
    if (!s) continue;
    assert.equal(villagesNear(T, Math.floor(s.x / 16), Math.floor(s.z / 16), 24).length, 0, s.id);
    assert.ok(shrinesNear(T, Math.floor(s.x / 16), Math.floor(s.z / 16)).includes(s));
  }
  assert.ok(SREGION >= 10);
});

console.log('Jefes');
// Mínimo de DOM para construir modelos en Node
globalThis.document = globalThis.document || { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, set fillStyle(v) { void v; } }) }) };
function flatWorld(seed) {
  const w = new World({ seed: seedFromString(seed), type: 'flat', structures: false, renderDistance: 3, useWorker: false });
  for (let i = 0; i < 3000; i++) { w.update(8, 8, 8); if (w.isAreaReady(8, 8, 2) && !w.incoming.length && !w.pending.size) break; }
  return w;
}
const G = 42;
function fakeGame(w, extra = {}) {
  const scene = new THREE.Scene();
  const drops = [];
  const toasts = [];
  const game = {
    world: w, scene, time: 0.3, mode: 'survival', difficulty: 'normal', meta: { mobs: 'all' }, shake: 0,
    player: { x: 8.5, y: G, z: 14.5, w: 0.6, h: 1.8, vx: 0, vy: 0, vz: 0, onGround: true, eyeY: G + 1.6, lookDir: () => ({ x: 0, y: 0, z: -1 }) },
    entities: { list: [], add(e) { this.list.push(e); return e; } }, particles: { emit() {} }, audio: null,
    ui: { toast: (t) => toasts.push(t), centerMessage() {} },
    inventory: { getSelected: () => game.held || null },
    survival: { dead: false, health: 20, fire: 0, effects: new Effects(), damage(n) { this.health -= n; return true; } },
    lightAt: () => 1, dropItem: (st) => drops.push(st), bossKills: {},
    spawnMob(key, x, y, z) { const m = BOSSES[key] ? createBoss(game, key) : null; if (m) { m.setPos(x, y, z); game.entities.add(m); } return m; },
    ...extra,
  };
  game.drops = drops; game.toasts = toasts;
  return game;
}
const W = flatWorld('jefes');
test('cada jefe tiene historia, arena, invocación, fases, ataques, debilidad, recompensa y objetos válidos', () => {
  for (const k of BOSS_KEYS) {
    const d = BOSSES[k];
    for (const f of ['historia', 'arena', 'invocacion', 'debilidad', 'recompensa']) assert.ok(d.lore[f] && d.lore[f].length > 30, `${k}.${f}`);
    assert.equal(d.lore.fases.length, 3); assert.ok(d.lore.ataques.length >= 3);
    assert.equal(d.phaseNames.length, d.phases.length + 1);
    assert.equal(bossForSummon(d.summon), k);
    assert.ok(RECIPES.some((r) => r.out === d.summon), 'receta de la ofrenda ' + d.summon);
    assert.ok(ACHIEVEMENTS.some((a) => a.id === d.achievement));
    assert.ok(BLOCKS.some((b) => b && b.boss === k), 'altar de ' + k);
    assert.ok(repairMaterial(Items.get(d.unique)), 'el objeto único se repara');
  }
});
test('el Guardián del Bosque: aparece, persigue, golpea, cambia de fase y las hachas hacen el doble', () => {
  const g = fakeGame(W);
  const b = g.spawnMob('forest_guardian', 8.5, G, 4.5);
  b.home = { x: 8, y: G - 1, z: 8 };
  assert.equal(b.hurt(50, 0, 0, 1, g.player), false, 'invulnerable al aparecer');
  for (let i = 0; i < 400; i++) b.update(0.05);
  assert.ok(g.survival.health < 20, 'golpea al jugador (salud ' + g.survival.health + ')');
  // daño con y sin hacha
  b.hurtTime = 0; const hp0 = b.hp;
  g.held = { i: Items.id('iron_sword'), n: 1, d: 0 }; b.hurt(10, 0, 0, 1, g.player);
  const dSword = hp0 - b.hp;
  b.hurtTime = 0; const hp1 = b.hp;
  g.held = { i: Items.id('iron_axe'), n: 1, d: 0 }; b.hurt(10, 0, 0, 1, g.player);
  assert.ok(Math.abs((hp1 - b.hp) - 2 * dSword) < 1e-6, 'hacha ×2');
  // fase 2 al 50 %
  b.hurtTime = 0; b.transition = 0; b.hp = b.maxHp * 0.52; b.hurt(10, 0, 0, 1, null);
  assert.equal(b.phase, 2);
  assert.equal(b.hurt(10, 0, 0, 1, null), false, 'pausa invulnerable al cambiar de fase');
});
test('el Coloso levanta pilares en la fase 2: con escudo apenas recibe daño; sin pilares, normal; el pico hace el doble', () => {
  const g = fakeGame(W);
  const b = g.spawnMob('crystal_colossus', 8.5, G, 4.5);
  b.home = { x: 8, y: G - 1, z: 8 }; b.intro = 0;
  b.hp = b.maxHp * 0.62; b.hurt(10, 0, 0, 1, null);
  assert.equal(b.phase, 2);
  const pylons = g.entities.list.filter((e) => e.isPylon);
  assert.equal(pylons.length, 4);
  b.transition = 0; b.update(0.05);
  assert.equal(b.shield, true);
  b.hurtTime = 0; let h = b.hp; b.hurt(10, 0, 0, 1, null);
  assert.ok(h - b.hp < 1.0, 'escudo: ' + (h - b.hp));
  for (const p of pylons) { p.hurtTime = 0; p.hurt(20, 0, 0, 1, null); }
  assert.ok(pylons.every((p) => p.deathTime >= 0));
  for (const p of pylons) p.removed = true;
  b.update(0.05);
  assert.equal(b.shield, false);
  b.hurtTime = 0; h = b.hp; g.held = { i: Items.id('iron_pickaxe'), n: 1, d: 0 }; b.hurt(10, 0, 0, 1, g.player);
  assert.ok(Math.abs((h - b.hp) - 10 * 2 * (1 - BOSSES.crystal_colossus.armor)) < 1e-6, 'pico ×2 con armadura');
});
test('el Titán se enfría con una bola de nieve (doble daño) y suelta sus recompensas al morir', () => {
  const g = fakeGame(W);
  const b = g.spawnMob('volcanic_titan', 8.5, G, 4.5);
  b.home = { x: 8, y: G - 1, z: 8 }; b.intro = 0;
  let h = b.hp; b.hurt(10, 0, 0, 1, null); const normal = h - b.hp;
  b.onSnowball(); assert.ok(b.cool > 0);
  b.hurtTime = 0; h = b.hp; b.hurt(10, 0, 0, 1, null);
  assert.ok(Math.abs((h - b.hp) - normal * 2) < 1e-6);
  let killed = null; g.onBossDefeated = (x) => { killed = x; };
  b.hurtTime = 0; b.transition = 0; b.hp = 1; b.hurt(10, 0, 0, 1, g.player);
  assert.ok(b.deathTime >= 0);
  // la victoria y las recompensas llegan al morir (guardar durante la animación no las pierde)
  assert.equal(killed, b);
  assert.equal(b.persistent, false);
  const keys = g.drops.map((d) => Items.get(d.i).key);
  for (const k of ['heart_crystal', 'essence_ember', 'titan_hammer', 'sun_coin']) assert.ok(keys.includes(k), 'suelta ' + k);
  for (let i = 0; i < 60; i++) b.update(0.05);
  assert.ok(b.removed);
  assert.equal(g.drops.filter((d) => Items.get(d.i).key === 'heart_crystal').length, 1, 'sin recompensas dobles');
});
test('si el jugador se aleja, el jefe vuelve a dormir y deja la ofrenda en el altar', () => {
  const g = fakeGame(W);
  const b = g.spawnMob('forest_guardian', 8.5, G, 4.5);
  b.home = { x: 8, y: G - 1, z: 8 }; b.intro = 0;
  g.player.x = 200;
  for (let i = 0; i < 230; i++) b.update(0.05);
  assert.ok(b.removed);
  assert.equal(Items.get(g.drops[0].i).key, 'ancient_seed');
});
test('la Reina queda aturdida al chocar contra un muro en plena embestida', () => {
  const w = flatWorld('reina');
  for (let y = G; y <= G + 6; y++) for (let x = 0; x <= 16; x++) w.setBlock(x, y, 1, ID.STONE);
  const g = fakeGame(w);
  const q = g.spawnMob('deep_queen', 8.5, G + 1, 8.5);
  q.home = { x: 8, y: G - 1, z: 8 }; q.intro = 0;
  g.player.x = 8.5; g.player.z = 2.5; g.player.y = G;
  q.action = { id: 'charge', t: 0, dur: 2.2, tele: 0.9 };
  for (let i = 0; i < 80 && q.stun <= 0; i++) q.update(0.05);
  assert.ok(q.stun > 0, 'aturdida (z=' + q.z.toFixed(2) + ')');
  q.hurtTime = 0; const h = q.hp; q.hurt(10, 0, 0, 1, null);
  assert.ok(h - q.hp >= 15, 'doble daño aturdida (' + (h - q.hp) + ')');
});
test('serializa y restaura (vida, fase y altar)', () => {
  const g = fakeGame(W);
  const b = g.spawnMob('crystal_colossus', 8.5, G, 4.5);
  b.home = { x: 1, y: 2, z: 3 }; b.phase = 2; b.hp = 99;
  const s = b.serialize();
  const c = createBoss(g, 'crystal_colossus'); c.hp = s.hp; c.initFromData(s.vd);
  assert.deepEqual(c.home, { x: 1, y: 2, z: 3 }); assert.equal(c.phase, 2); assert.equal(c.hp, 99);
  assert.equal(b.persistent, true);
});

console.log('Correcciones de la revisión de la Fase 4');
test('la Reina deja de embestir si cambia de fase a mitad de la carga', () => {
  const g = fakeGame(W);
  const q = g.spawnMob('deep_queen', 8.5, G + 3, 8.5);
  q.home = { x: 8, y: G - 1, z: 8 }; q.intro = 0;
  q.action = { id: 'charge', t: 1.0, dur: 2.2, tele: 0.9, dir: [0, 1, 0] }; q.dashing = true; q.vy = 15;
  q.hp = q.maxHp * 0.52; q.hurt(10, 0, 0, 1, null);
  assert.equal(q.phase, 2); assert.equal(q.dashing, false); assert.equal(q.vy, 0);
});
test('un Coloso guardado en fase 2 vuelve con sus pilares y su escudo', () => {
  const g = fakeGame(W);
  const b = g.spawnMob('crystal_colossus', 8.5, G, 4.5);
  b.home = { x: 8, y: G - 1, z: 8 }; b.intro = 0;
  b.hp = b.maxHp * 0.62; b.hurt(10, 0, 0, 1, null);
  const s = b.serialize(); assert.equal(s.vd.py, 4);
  const g2 = fakeGame(W);
  const c = createBoss(g2, 'crystal_colossus'); c.setPos(8.5, G, 4.5); g2.entities.add(c); c.hp = s.hp; c.initFromData(s.vd);
  c.intro = 0; c.update(0.05);
  assert.equal(g2.entities.list.filter((e) => e.isPylon).length, 4); assert.equal(c.shield, true);
});
test('la bola de nieve enfría al Titán en fase 3 sin prender fuego al jugador; el cuerpo a cuerpo sí quema', () => {
  const g = fakeGame(W);
  const b = g.spawnMob('volcanic_titan', 8.5, G, 4.5);
  b.home = { x: 8, y: G - 1, z: 8 }; b.intro = 0; b.phase = 3;
  g.player.x = 8.5; g.player.z = 20.5;
  b.onSnowball(); b.onBossHurt(0, g.player);
  assert.equal(g.survival.fire, 0);
  b.cool = 0; g.player.z = 6.5; b.onBossHurt(5, g.player);
  assert.ok(g.survival.fire > 0);
});
test('las recompensas caen sobre el altar y en Pacífico el jefe vuelve a dormir', () => {
  const g = fakeGame(W);
  const b = g.spawnMob('forest_guardian', 3.5, G, 3.5);
  b.home = { x: 8, y: G - 1, z: 8 }; b.intro = 0;
  const pos = []; g.dropItem = (st, x, y, z) => { pos.push([x, y, z]); g.drops.push(st); };
  b.hp = 1; b.hurt(5, 0, 0, 1, g.player);
  assert.ok(pos.length && pos.every(([x, , z]) => x === 8.5 && z === 8.5));
  const g2 = fakeGame(W);
  const c = g2.spawnMob('forest_guardian', 8.5, G, 4.5); c.home = { x: 8, y: G - 1, z: 8 }; c.intro = 0;
  g2.difficulty = 'peaceful'; c.update(0.05);
  assert.ok(c.removed); assert.equal(Items.get(g2.drops[0].i).key, 'ancient_seed');
});
test('las ofrendas se pueden fabricar con objetos que existen en el mundo', () => {
  assert.equal(Blocks.get('geode').drops, 'geode');
  for (const k of ['ancient_seed', 'geode_heart', 'tide_pearl', 'eternal_ember']) {
    const r = RECIPES.find((x) => x.out === k);
    for (const [ing] of r.in) assert.ok(!['cave_crystal'].includes(ing), k + ' usa ' + ing);
  }
});
test('santuarios: caldera sin lava natural, templo lejos de la costa y salida del pozo despejada', () => {
  const T2 = new Terrain(seedFromString('lava'), {});
  for (let rz = -4; rz <= 4; rz++) for (let rx = -4; rx <= 4; rx++) {
    const s = shrineAt(T2, rx, rz);
    if (!s) continue;
    if (s.type === 'fuego') for (let a = 0; a < 16; a++) { const c = T2.column(Math.round(s.x + Math.cos(a) * 12), Math.round(s.z + Math.sin(a) * 12)); assert.equal(c.lavaTop, 0, 'lava junto a la caldera ' + s.id); }
    if (s.type === 'mar') for (let a = 0; a < 16; a++) { const c = T2.column(Math.round(s.x + Math.cos(a) * (s.r + 1)), Math.round(s.z + Math.sin(a) * (s.r + 1))); assert.ok(c.h < SEA - 2, 'templo en la costa ' + s.id); }
    if (s.type === 'cristal') {
      const sx = s.x + 9;
      const b = T2.generateChunk(Math.floor((sx - 3) / 16), Math.floor(s.z / 16)).blocks;
      if (Math.floor((sx - 3) / 16) === Math.floor((sx - 1) / 16)) for (let dx = 1; dx <= 3; dx++) for (let k = 0; k <= 1; k++) assert.equal(b[((sx - dx) & 15) | ((s.z & 15) << 4) | ((s.shaftTop + k) << 8)], 0, 'salida tapada ' + s.id);
    }
  }
});

console.log('Bestiario y contenido');
test('el bestiario tiene una ficha por criatura (jefes primero) y cuenta vistas y muertes', () => {
  const e = bestiaryEntries();
  assert.equal(e[0].cat, 'Jefe');
  assert.equal(new Set(e.map((x) => x.key)).size, e.length);
  for (const x of e) if (!x.boss) assert.ok(x.lore && x.lore.length > 20, 'historia de ' + x.key);
  const b = new Bestiary(); assert.equal(b.see('cave_bat'), true); assert.equal(b.see('cave_bat'), false); b.kill('cave_bat'); b.kill('cave_bat');
  const b2 = Bestiary.load(JSON.parse(JSON.stringify(b.serialize())));
  assert.equal(b2.kills.cave_bat, 2); assert.ok(b2.seen.has('cave_bat'));
  for (const k of ['thorn_sprout', 'tide_jelly', 'ember_imp']) assert.ok(MONSTERS[k].minion);
});
test('texturas de bloques nuevos, recetas y logros de la Fase 4', () => {
  assert.deepEqual(missingTilePainters().filter((m) => !/^(air|dandelion_dummy):/.test(m)), []);
  for (const k of ['glass_bottle', 'sun_apple', 'ancient_seed', 'geode_heart', 'tide_pearl', 'eternal_ember']) assert.ok(RECIPES.some((r) => r.out === k), k);
  assert.equal(Blocks.get('alchemy_table').container, 4);
  for (const id of ['alquimia', 'santuario', 'cazajefes', 'vitalidad']) assert.ok(ACHIEVEMENTS.some((a) => a.id === id), id);
  for (const b of BLOCKS) if (b && b.interact === 'altar') { assert.ok(b.unbreakable && BOSSES[b.boss], b.key); }
});

console.log('Correcciones de la revisión de la Fase 2');
test('la línea de visión choca con la parte alta (1,5) de vallas y muros', () => {
  const w = flatWorld('vallas');
  w.setBlock(8, G, 8, ID.FENCE_WOOD); w.setBlock(8, G, 9, ID.FENCE_WOOD);
  assert.equal(segmentBlocked(w, 6.5, G + 1.3, 8.5, 10.5, G + 1.3, 8.5), true, 'por encima del bloque pero por debajo de 1,5');
  assert.equal(segmentBlocked(w, 6.5, G + 1.7, 8.5, 10.5, G + 1.7, 8.5), false, 'por encima de 1,5 no tapa');
});
test('una valla no se une al costado de una puerta de valla perpendicular', () => {
  const get = (m) => (x, y, z) => m[`${x},${z}`] || 0;
  const gate = ID.GATE_WOOD; // orientada al Norte: atraviesa el eje X
  assert.equal(connectMask(get({ '0,1': gate }), 0, 0, 0, ID.FENCE_WOOD) & 4, 0, 'al Sur, de costado: no');
  assert.equal(connectMask(get({ '1,0': gate }), 0, 0, 0, ID.FENCE_WOOD) & 2, 2, 'al Este, alineada: sí');
});
test('el agua que corre también hidrata la tierra arada', () => {
  const w = flatWorld('arada');
  w.setBlock(8, G - 1, 8, ID.FARMLAND); w.setBlock(10, G - 1, 8, ID.WATER_FLOW_2 || Blocks.id('water_flow_2'));
  const ticks = new RandomTicks({ world: w, mode: 'survival' });
  for (let i = 0; i < 20; i++) ticks.tickBlock(8, G - 1, 8, w.getBlock(8, G - 1, 8));
  assert.equal(w.getBlock(8, G - 1, 8), ID.FARMLAND_WET);
});
test('el grupo de ocultación de las hojas no coincide con ningún ID de bloque', () => {
  assert.ok(LEAVES_GRP >= BLOCKS.length - 0 || !BLOCKS[LEAVES_GRP]);
});

console.log(`\n${passed} pruebas correctas`);
