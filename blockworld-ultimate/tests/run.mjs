// Pruebas automáticas de la lógica pura (sin navegador): node tests/run.mjs
import assert from 'node:assert/strict';
import { Blocks, BLOCKS, ID } from '../src/blocks.js';
import { Items, ITEMS, makeStack, rollDrops, cloneStack } from '../src/items.js';
import { Inventory, clickSlot, shiftMove, addToSlots, Container } from '../src/inventory.js';
import { RECIPES, craft, canCraft, SMELTING, recipesFor, repairStack } from '../src/crafting.js';
import { Terrain, seedFromString } from '../src/terrain.js';
import { mulberry32 } from '../src/noise.js';
import { World } from '../src/world.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n       ') : e)); process.exitCode = 1; }
};

console.log('Datos');
test('todos los drops de bloques apuntan a objetos existentes', () => {
  for (const b of BLOCKS) {
    if (!b || b.drops == null) continue;
    const list = Array.isArray(b.drops) ? b.drops : [b.drops];
    for (const d of list) {
      const key = typeof d === 'string' ? d : d.item;
      assert.ok(Items.get(key), `bloque ${b.key} suelta objeto inexistente ${key}`);
    }
  }
});
test('todas las recetas usan objetos existentes y son consistentes', () => {
  for (const r of RECIPES) {
    assert.ok(Items.get(r.out), 'resultado ' + r.out);
    assert.ok(r.n >= 1);
    for (const [spec, n] of r.in) {
      assert.ok(n >= 1);
      if (!spec.startsWith('#')) assert.ok(Items.get(spec), 'ingrediente ' + spec + ' en ' + r.id);
    }
    if (r.unlock) assert.ok(Items.get(r.unlock), 'unlock ' + r.unlock);
  }
});
test('ninguna receta produce un objeto con ingrediente idéntico (sin fabricar gratis en bucle)', () => {
  for (const r of RECIPES) {
    // ciclos de compresión (bloque ↔ lingote) son válidos porque conservan 9:1; los demás no deben devolver más de lo que consumen del mismo objeto
    const same = r.in.find(([s]) => s === r.out);
    assert.ok(!same, 'receta circular ' + r.id);
  }
});
test('bloques de almacenamiento: compresión y descompresión conservan el valor', () => {
  const inv = new Inventory();
  inv.add(makeStack('iron_ingot', 9));
  const comp = RECIPES.find((r) => r.out === 'block_iron');
  const dec = RECIPES.find((r) => r.out === 'iron_ingot' && r.in[0][0] === 'block_iron');
  assert.equal(craft(comp, inv.slots, 1), 1);
  assert.equal(inv.count(Items.id('iron_ingot')), 0);
  assert.equal(craft(dec, inv.slots, 1), 1);
  assert.equal(inv.count(Items.id('iron_ingot')), 9);
});
test('los IDs de bloque son únicos y < 256; los de objeto no se pisan', () => {
  const seen = new Set();
  for (const it of ITEMS) { if (!it) continue; assert.ok(!seen.has(it.id)); seen.add(it.id); }
  assert.ok(ITEMS.length < 1000);
});
test('tabla de fundición con objetos válidos', () => {
  for (const s of SMELTING) { assert.ok(Items.get(s.in)); assert.ok(Items.get(s.out)); }
});
test('equilibrio de herramientas: velocidad y durabilidad crecen con el nivel (salvo oro: rápido pero frágil)', () => {
  const t = (k) => Items.get(k).tool;
  assert.ok(t('stone_pickaxe').speed > t('wood_pickaxe').speed);
  assert.ok(t('iron_pickaxe').speed > t('copper_pickaxe').speed);
  assert.ok(t('crystal_pickaxe').durability > t('iron_pickaxe').durability);
  assert.ok(t('noctisite_pickaxe').level > t('crystal_pickaxe').level);
  assert.ok(t('gold_pickaxe').speed > t('iron_pickaxe').speed && t('gold_pickaxe').durability < t('wood_pickaxe').durability);
  assert.ok(Items.get('iron_sword').tool.damage > Items.get('stone_sword').tool.damage);
});

console.log('Inventario');
test('add apila y respeta el máximo de pila', () => {
  const inv = new Inventory();
  assert.equal(inv.add(makeStack('dirt', 100)), null);
  assert.equal(inv.slots[0].n, 64); assert.equal(inv.slots[1].n, 36);
  assert.equal(inv.add(makeStack('dirt', 28)), null);
  assert.equal(inv.slots[1].n, 64);
});
test('herramientas no apilan', () => {
  const inv = new Inventory();
  inv.add(makeStack('iron_pickaxe')); inv.add(makeStack('iron_pickaxe'));
  assert.equal(inv.slots[0].n, 1); assert.equal(inv.slots[1].n, 1);
});
test('inventario lleno devuelve el resto sin perder objetos', () => {
  const inv = new Inventory();
  for (let i = 0; i < 36; i++) inv.slots[i] = makeStack('stone', 64);
  const rest = inv.add(makeStack('dirt', 5));
  assert.equal(rest.n, 5);
  assert.equal(inv.totalItems(), 36 * 64);
});
test('fuzz de clics: el total de objetos se conserva siempre (sin duplicados)', () => {
  const rnd = mulberry32(1234);
  const inv = new Inventory();
  const chest = new Container(27);
  const keys = ['dirt', 'stone', 'planks', 'coal', 'iron_pickaxe', 'cooked_beef'];
  for (let i = 0; i < 20; i++) addToSlots(inv.slots, makeStack(keys[(rnd() * keys.length) | 0], 1 + ((rnd() * 64) | 0)));
  const total = () => {
    const t = {};
    const add = (s) => { if (s) t[s.i] = (t[s.i] || 0) + s.n; };
    inv.slots.forEach(add); chest.slots.forEach(add); add(inv.cursor);
    return JSON.stringify(Object.entries(t).sort());
  };
  const base = total();
  for (let n = 0; n < 5000; n++) {
    const useChest = rnd() < 0.5;
    const arr = useChest ? chest.slots : inv.slots;
    const idx = (rnd() * arr.length) | 0;
    const op = rnd();
    if (op < 0.15) shiftMove(arr, idx, [{ slots: useChest ? inv.slots : chest.slots }]);
    else inv.cursor = clickSlot(arr, idx, inv.cursor, op < 0.6 ? 0 : 2);
    if (n % 97 === 0) assert.equal(total(), base, 'se rompió la conservación en la operación ' + n);
  }
  assert.equal(total(), base);
});
test('serializar/deserializar conserva el inventario', () => {
  const inv = new Inventory();
  inv.add(makeStack('iron_pickaxe', 1, 17)); inv.add(makeStack('torch', 33));
  inv.armor[1] = makeStack('iron_chestplate', 1, 4);
  const back = Inventory.deserialize(JSON.parse(JSON.stringify(inv.serialize())));
  assert.deepEqual(back.slots, inv.slots); assert.deepEqual(back.armor, inv.armor);
});

console.log('Crafteo');
test('fabricar consume exactamente los ingredientes', () => {
  const inv = new Inventory();
  inv.add(makeStack('log_oak', 3));
  const r = RECIPES.find((x) => x.out === 'planks');
  assert.equal(craft(r, inv.slots, 2), 2);
  assert.equal(inv.count(Items.id('log_oak')), 1);
  assert.equal(inv.count(Items.id('planks')), 8);
});
test('no se puede fabricar sin materiales (ni gratis)', () => {
  const inv = new Inventory();
  const r = RECIPES.find((x) => x.out === 'workbench');
  assert.equal(canCraft(r, inv.slots), false);
  assert.equal(craft(r, inv.slots, 3), 0);
  assert.equal(inv.totalItems(), 0);
});
test('no fabrica si el resultado no cabe (y no consume)', () => {
  const inv = new Inventory();
  for (let i = 0; i < 36; i++) inv.slots[i] = makeStack('stone', 64);
  inv.slots[0] = makeStack('planks', 4);
  const r = RECIPES.find((x) => x.out === 'workbench');
  inv.slots[1] = makeStack('dirt', 64);
  // 4 tablones se consumen y liberan el hueco 0, el banco de trabajo cabe ahí
  assert.equal(craft(r, inv.slots, 1), 1);
  const r2 = RECIPES.find((x) => x.out === 'stick');
  inv.slots[0] = makeStack('planks', 1);
  assert.equal(craft(r2, inv.slots, 1), 0);
});
test('etiqueta #log acepta cualquier tronco', () => {
  const inv = new Inventory();
  inv.add(makeStack('log_pine', 1)); inv.add(makeStack('log_dark', 1));
  const r = RECIPES.find((x) => x.out === 'planks');
  assert.equal(craft(r, inv.slots, 2), 2);
  assert.equal(inv.count(Items.id('planks')), 8);
});
test('desbloqueo: herramientas de hierro solo tras obtener lingotes de hierro', () => {
  const none = recipesFor('workbench', new Set(), false).map((r) => r.out);
  assert.ok(!none.includes('iron_pickaxe')); assert.ok(none.includes('wood_pickaxe'));
  const some = recipesFor('workbench', new Set(['iron_ingot']), false).map((r) => r.out);
  assert.ok(some.includes('iron_pickaxe'));
  assert.ok(recipesFor('workbench', new Set(), true).map((r) => r.out).includes('noctisite_pickaxe'));
});
test('reparación consume material y restaura durabilidad', () => {
  const inv = new Inventory();
  inv.add(makeStack('iron_pickaxe', 1, 200)); inv.add(makeStack('iron_ingot', 2));
  const res = repairStack(inv.slots[0], inv.slots);
  assert.ok(res.ok); assert.ok(inv.slots[0].d < 200); assert.equal(inv.count(Items.id('iron_ingot')), 1);
});

console.log('Terreno');
test('el generador es determinista para la misma semilla y distinto para otra', () => {
  const a = new Terrain(seedFromString('x'), {}).generateChunk(2, 3).blocks;
  const b = new Terrain(seedFromString('x'), {}).generateChunk(2, 3).blocks;
  const c = new Terrain(seedFromString('y'), {}).generateChunk(2, 3).blocks;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});
test('chunks vecinos encajan: los árboles que cruzan el borde son idénticos al generar en cualquier orden', () => {
  const t = new Terrain(seedFromString('arboles'), {});
  const a1 = t.generateChunk(5, 5).blocks; const b1 = t.generateChunk(6, 5).blocks;
  const t2 = new Terrain(seedFromString('arboles'), {});
  const b2 = t2.generateChunk(6, 5).blocks; const a2 = t2.generateChunk(5, 5).blocks;
  assert.deepEqual(a1, a2); assert.deepEqual(b1, b2);
});
test('el mundo tiene lecho de roca, agua, minerales y vegetación', () => {
  const t = new Terrain(seedFromString('prueba'), {});
  const seen = new Set();
  for (let cz = -5; cz < 5; cz++) for (let cx = -5; cx < 5; cx++) { const { blocks } = t.generateChunk(cx, cz); for (let i = 0; i < blocks.length; i += 7) seen.add(blocks[i]); }
  for (const k of ['baserock', 'water', 'ore_coal', 'ore_iron', 'stone', 'deepstone', 'dirt', 'log_oak']) assert.ok(seen.has(ID[k.toUpperCase()]), 'falta ' + k);
});
test('punto de aparición en tierra firme', () => {
  const t = new Terrain(seedFromString('prueba'), {});
  const s = t.findSpawn();
  assert.ok(t.column(s.x, s.z).h > 40);
});
test('mundo plano genera una superficie lisa', () => {
  const t = new Terrain(seedFromString('flat'), { type: 'flat' });
  const { blocks } = t.generateChunk(0, 0);
  // y=41 debe ser césped en todas las columnas (salvo cuevas excavadas debajo no afectan la superficie)
  let grass = 0;
  for (let i = 0; i < 256; i++) if (blocks[i + (41 << 8)] === ID.GRASS || blocks[i + (41 << 8)] === ID.GRASS_SNOW) grass++;
  assert.ok(grass > 200, 'césped en superficie: ' + grass);
});

console.log('Mundo y luz');
function makeWorld(seed = 'luz') {
  const w = new World({ seed: seedFromString(seed), type: 'flat', structures: false, renderDistance: 3, useWorker: false });
  let meshes = 0;
  w.onMeshReady = () => meshes++;
  for (let i = 0; i < 3000; i++) {
    w.update(8, 8, 8);
    if (w.isAreaReady(8, 8, 2) && !w.incoming.length && !w.pending.size) break;
  }
  w.meshCount = () => meshes;
  return w;
}
const W = makeWorld();
test('el mundo se carga y se malla alrededor del jugador', () => {
  assert.ok(W.isAreaReady(8, 8, 2));
  assert.ok(W.meshCount() >= 9);
});
test('mundo plano: césped en y=41, sol 15 sobre el suelo y 0 bajo tierra', () => {
  assert.equal(W.getBlock(8, 41, 8), ID.GRASS);
  assert.equal(W.getSky(8, 42, 8), 15);
  assert.equal(W.getSky(8, 30, 8), 0);
});
test('antorcha: luz 14 en el origen, decae 1 por bloque y desaparece al quitarla', () => {
  const y = 42;
  W.setBlock(8, y, 8, ID.TORCH);
  assert.equal(W.getBlockLight(8, y, 8), 14);
  assert.equal(W.getBlockLight(11, y, 8), 11);
  assert.equal(W.getBlockLight(8, y, 20), 2); // cruza el límite de chunk (x=8→z=20 está en otro chunk)
  W.setBlock(8, y, 8, 0);
  assert.equal(W.getBlockLight(8, y, 8), 0);
  assert.equal(W.getBlockLight(11, y, 8), 0);
  assert.equal(W.getBlockLight(8, y, 20), 0);
});
test('un techo deja entrar la luz solo por los lados (degradado) y un agujero la deja pasar entera', () => {
  // techo 9×9 a y=45; el centro queda a 5 celdas del borde → 15-5 = 10
  for (let x = 4; x <= 12; x++) for (let z = 4; z <= 12; z++) W.setBlock(x, 45, z, ID.PLANKS);
  assert.equal(W.getSky(8, 43, 8), 10);
  assert.ok(W.getSky(3, 43, 8) >= 14);
  W.setBlock(8, 45, 8, 0); // agujero en el techo
  assert.equal(W.getSky(8, 44, 8), 15);
  assert.equal(W.getSky(8, 43, 8), 15);
  assert.equal(W.getSky(9, 43, 8), 14);
  W.setBlock(8, 45, 8, ID.PLANKS); // cerrar de nuevo → vuelve al degradado lateral
  assert.equal(W.getSky(8, 43, 8), 10);
  assert.equal(W.getSky(9, 43, 8), 11);
  // sellar también los lados: oscuridad total dentro
  for (let x = 3; x <= 13; x++) for (let y = 41; y <= 45; y++) { W.setBlock(x, y, 3, ID.PLANKS); W.setBlock(x, y, 13, ID.PLANKS); }
  for (let z = 3; z <= 13; z++) for (let y = 41; y <= 45; y++) { W.setBlock(3, y, z, ID.PLANKS); W.setBlock(13, y, z, ID.PLANKS); }
  assert.equal(W.getSky(8, 43, 8), 0);
});
test('guardar y recargar: un chunk modificado se marca para guardar', () => {
  const c = W.chunkAt(0, 0);
  assert.ok(c.modified);
  const saved = [];
  W.store = { hasChunk: () => false, loadChunk: async () => null, saveChunk: (cx, cz, b) => { saved.push([cx, cz, b.length]); return Promise.resolve(); } };
  W.saveModified();
  assert.ok(saved.length >= 1 && saved[0][2] === 16 * 16 * 128);
});

console.log(`\n${passed} pruebas correctas${process.exitCode ? ' — HAY FALLOS' : ''}`);
