// Recetas basadas en datos: materiales, cantidades, resultado, estación y condición de desbloqueo.
// También la tabla de fundición (horno). No hay cuadrícula de crafteo: las recetas son listas de
// ingredientes, y la interfaz comprueba y consume los materiales reales del inventario.
import { Items, TIER_ORDER, TIER_MATERIAL, TOOL_ORDER, ARMOR_ORDER, ARMOR_TIERS, makeStack, cloneStack } from './items.js';
import { addToSlots, countInSlots, removeFromSlots } from './inventory.js';

/** Etiquetas: un ingrediente '#tag' acepta cualquiera de sus miembros. */
export const TAGS = {
  '#log': ['log_oak', 'log_dark', 'log_jungle', 'log_pine'],
  '#coal': ['coal', 'charcoal'],
};

/** @typedef {{id:string,out:string,n:number,in:[string,number][],station:'hand'|'workbench',unlock:?string,category:string}} Recipe */
/** @type {Recipe[]} */
export const RECIPES = [];
let seq = 0;
function recipe(out, n, inputs, station = 'hand', unlock = null, category = 'Bloques') {
  const id = `${out}#${seq++}`;
  RECIPES.push({ id, out, n, in: inputs, station, unlock, category });
}

// Básicos (a mano)
recipe('planks', 4, [['#log', 1]], 'hand', null, 'Básicos');
recipe('stick', 4, [['planks', 2]], 'hand', null, 'Básicos');
recipe('workbench', 1, [['planks', 4]], 'hand', null, 'Básicos');
recipe('torch', 4, [['#coal', 1], ['stick', 1]], 'hand', null, 'Básicos');
recipe('snow', 1, [['snowball', 4]], 'hand', null, 'Bloques');

// Mesa de trabajo
recipe('chest', 1, [['planks', 8]], 'workbench', null, 'Almacenaje');
recipe('furnace', 1, [['cobble', 8]], 'workbench', null, 'Almacenaje');
recipe('bed', 1, [['planks', 3], ['leather', 3]], 'workbench', 'leather', 'Almacenaje');
recipe('bucket', 1, [['iron_ingot', 3]], 'workbench', 'iron_ingot', 'Recipientes');
recipe('bread', 1, [['wheat', 3]], 'workbench', 'wheat', 'Comida');

// Bloques decorativos y de construcción
recipe('slab_planks', 6, [['planks', 3]], 'workbench', null, 'Bloques');
recipe('slab_stone', 6, [['stone', 3]], 'workbench', 'stone', 'Bloques');
recipe('slab_cobble', 6, [['cobble', 3]], 'workbench', null, 'Bloques');
recipe('slab_bricks', 6, [['bricks', 3]], 'workbench', 'bricks', 'Bloques');
recipe('bricks', 1, [['brick', 4]], 'workbench', 'brick', 'Bloques');
recipe('stonebricks', 4, [['stone', 4]], 'workbench', 'stone', 'Bloques');
recipe('crystal_lamp', 1, [['crystal_shard', 4], ['torch', 1]], 'workbench', 'crystal_shard', 'Bloques');
for (const [block, mat] of [['block_copper', 'copper_ingot'], ['block_iron', 'iron_ingot'], ['block_gold', 'gold_ingot'], ['block_crystal', 'crystal_shard'], ['block_noctisite', 'noctisite_ingot']]) {
  recipe(block, 1, [[mat, 9]], 'workbench', mat, 'Bloques');
  recipe(mat, 9, [[block, 1]], 'workbench', mat, 'Bloques');
}

// ── Fase 2: construcción avanzada, cuerda y comidas ──────────────
for (const [mat, unlock] of [['planks', null], ['cobble', null], ['stonebricks', 'stonebricks'], ['bricks', 'bricks'], ['sandstone', 'sandstone']]) {
  recipe(`stairs_${mat}`, 4, [[mat, 6]], 'workbench', unlock, 'Construcción');
}
recipe('ladder', 3, [['stick', 7]], 'workbench', null, 'Construcción');
recipe('door_wood', 3, [['planks', 6]], 'workbench', null, 'Construcción');
recipe('door_iron', 3, [['iron_ingot', 6]], 'workbench', 'iron_ingot', 'Construcción');
recipe('trapdoor_wood', 2, [['planks', 6]], 'workbench', null, 'Construcción');
recipe('fence_wood', 3, [['planks', 4], ['stick', 2]], 'workbench', null, 'Construcción');
recipe('gate_wood', 1, [['stick', 4], ['planks', 2]], 'workbench', null, 'Construcción');
recipe('wall_cobble', 6, [['cobble', 6]], 'workbench', null, 'Construcción');
recipe('rope', 2, [['reed', 3]], 'hand', 'reed', 'Básicos');
recipe('rope', 1, [['leather', 1]], 'hand', 'leather', 'Básicos');
recipe('bowl', 4, [['planks', 3]], 'workbench', null, 'Comida');
recipe('vegetable_stew', 1, [['bowl', 1], ['carrot', 1], ['baked_potato', 1], ['tomato', 1]], 'workbench', 'tomato', 'Comida');
recipe('mushroom_stew', 1, [['bowl', 1], ['mushroom_dark', 1], ['mushroom_glow', 1]], 'workbench', 'mushroom_dark', 'Comida');
recipe('salad', 1, [['bowl', 1], ['tomato', 1], ['carrot', 1], ['berries', 1]], 'workbench', 'tomato', 'Comida');
recipe('corn_bread', 1, [['corn', 3]], 'workbench', 'corn', 'Comida');

// ── Fase 3: aldeas ───────────────────────────────────────────────
recipe('paper', 3, [['reed', 3]], 'hand', 'reed', 'Básicos');
recipe('book', 1, [['paper', 3], ['leather', 1]], 'hand', 'paper', 'Básicos');
recipe('bookshelf', 1, [['planks', 6], ['book', 3]], 'workbench', 'book', 'Aldea');
recipe('hay_bale', 1, [['wheat', 9]], 'workbench', 'wheat', 'Aldea');
recipe('wheat', 9, [['hay_bale', 1]], 'hand', 'hay_bale', 'Aldea');
recipe('barrel', 1, [['planks', 6], ['slab_planks', 2]], 'workbench', null, 'Aldea');
recipe('anvil', 1, [['block_iron', 3], ['iron_ingot', 4]], 'workbench', 'iron_ingot', 'Aldea');
recipe('lantern', 2, [['iron_ingot', 4], ['torch', 1]], 'workbench', 'iron_ingot', 'Aldea');
recipe('compost_bin', 1, [['slab_planks', 7]], 'workbench', null, 'Aldea');
recipe('lectern', 1, [['slab_planks', 4], ['bookshelf', 1]], 'workbench', 'bookshelf', 'Aldea');
recipe('loom', 1, [['planks', 2], ['rope', 2]], 'workbench', 'rope', 'Aldea');
recipe('alchemy_table', 1, [['cobble', 3], ['crystal_shard', 1], ['glass', 2]], 'workbench', 'crystal_shard', 'Aldea');
recipe('bell', 1, [['gold_ingot', 5], ['stick', 2]], 'workbench', 'gold_ingot', 'Aldea');
recipe('plaster', 4, [['clay_ball', 2], ['sand', 2]], 'workbench', 'clay_ball', 'Aldea');
recipe('bandage', 2, [['paper', 2], ['mushroom_glow', 1]], 'workbench', 'paper', 'Aldea');
recipe('village_compass', 1, [['iron_ingot', 4], ['crystal_shard', 1]], 'workbench', 'iron_ingot', 'Aldea'); // sin moneda: sirve para encontrar la primera aldea

// ── Fase 4: alquimia y jefes ─────────────────────────────────────
recipe('glass_bottle', 3, [['glass', 3]], 'workbench', 'glass', 'Alquimia');
recipe('sun_apple', 1, [['apple', 1], ['gold_ingot', 8]], 'workbench', 'gold_ingot', 'Alquimia');
recipe('ancient_seed', 1, [['sapling_oak', 1], ['sapling_dark', 1], ['sapling_jungle', 1], ['sapling_pine', 1], ['apple', 2], ['fertilizer', 2]], 'workbench', 'fertilizer', 'Ofrendas');
recipe('geode_heart', 1, [['crystal_shard', 6], ['geode', 2], ['gold_ingot', 2]], 'workbench', 'crystal_shard', 'Ofrendas');
recipe('tide_pearl', 1, [['scute', 3], ['raw_fish', 4], ['crystal_shard', 2]], 'workbench', 'scute', 'Ofrendas');
recipe('eternal_ember', 1, [['obsidian', 2], ['coal', 6], ['iron_ingot', 4]], 'workbench', 'obsidian', 'Ofrendas');

// ── Fase 5: Dimensión Oscura ─────────────────────────────────────
recipe('portal_core', 1, [['noctisite_ingot', 4], ['crystal_shard', 4], ['obsidian', 1]], 'workbench', 'noctisite_ingot', 'Dimensión Oscura');
recipe('umbral_key', 1, [['essence_forest', 1], ['essence_crystal', 1], ['essence_tide', 1], ['essence_ember', 1], ['noctisite_ingot', 2]], 'workbench', 'essence_forest', 'Dimensión Oscura');
recipe('sovereign_sigil', 1, [['shadow_shard', 6], ['noctisite_ingot', 2], ['heart_crystal', 1]], 'workbench', 'shadow_shard', 'Dimensión Oscura');
recipe('umbral_bricks', 4, [['umbral_stone', 4]], 'workbench', 'umbral_stone', 'Dimensión Oscura');
recipe('umbral_brick_carved', 2, [['umbral_bricks', 2], ['shadow_shard', 1]], 'workbench', 'umbral_bricks', 'Dimensión Oscura');
recipe('planks', 3, [['fungus_stem', 1]], 'hand', 'fungus_stem', 'Básicos');

// ── Fase 6: energía, automatización y transporte ─────────────────
recipe('lever', 1, [['stick', 1], ['cobble', 1]], 'workbench', 'copper_ingot', 'Energía');
recipe('button', 1, [['stone', 1]], 'workbench', 'copper_ingot', 'Energía');
recipe('pressure_plate', 1, [['stone', 2]], 'workbench', 'copper_ingot', 'Energía');
recipe('cable', 8, [['copper_ingot', 2]], 'workbench', 'copper_ingot', 'Energía');
recipe('power_block', 1, [['copper_ingot', 6], ['crystal_shard', 2], ['cable', 1]], 'workbench', 'copper_ingot', 'Energía');
recipe('repeater', 1, [['cable', 2], ['stone', 3], ['crystal_shard', 1]], 'workbench', 'cable', 'Energía');
recipe('inverter', 1, [['cable', 2], ['stone', 3], ['gold_ingot', 1]], 'workbench', 'cable', 'Energía');
recipe('energy_lamp', 1, [['glass', 4], ['crystal_shard', 2], ['cable', 1]], 'workbench', 'cable', 'Energía');
recipe('piston', 1, [['planks', 3], ['cobble', 4], ['iron_ingot', 1], ['cable', 1]], 'workbench', 'cable', 'Automatización');
recipe('dispenser', 1, [['cobble', 7], ['cable', 1], ['rope', 1]], 'workbench', 'cable', 'Automatización');
recipe('hopper', 1, [['iron_ingot', 5], ['chest', 1]], 'workbench', 'iron_ingot', 'Automatización');
recipe('harvester', 1, [['iron_ingot', 3], ['iron_hoe', 1], ['cable', 1], ['planks', 3]], 'workbench', 'cable', 'Automatización');
recipe('rail', 16, [['iron_ingot', 6], ['stick', 1]], 'workbench', 'iron_ingot', 'Transporte');
recipe('booster', 6, [['gold_ingot', 6], ['stick', 1], ['cable', 1]], 'workbench', 'gold_ingot', 'Transporte');
recipe('minecart', 1, [['iron_ingot', 5]], 'workbench', 'iron_ingot', 'Transporte');
recipe('boat', 1, [['planks', 5]], 'workbench', null, 'Transporte');

// Herramientas: cabeza + palos
const HEAD_COST = { pickaxe: [3, 2], axe: [3, 2], shovel: [1, 2], sword: [2, 1], hoe: [2, 2] };
for (const tier of TIER_ORDER) {
  const mat = TIER_MATERIAL[tier];
  for (const type of TOOL_ORDER) {
    const [heads, sticks] = HEAD_COST[type];
    recipe(`${tier}_${type}`, 1, [[mat, heads], ['stick', sticks]], 'workbench', tier === 'wood' || tier === 'stone' ? null : mat, 'Herramientas');
  }
}

// Armaduras
const ARMOR_COST = [5, 8, 7, 4];
for (const a of ARMOR_ORDER) {
  const mat = ARMOR_TIERS[a].material;
  ['helmet', 'chestplate', 'leggings', 'boots'].forEach((piece, i) => {
    recipe(`${a}_${piece}`, 1, [[mat, ARMOR_COST[i]]], 'workbench', mat, 'Armaduras');
  });
}

// ── Fundición ────────────────────────────────────────────────────
/** entrada → salida. time = segundos por unidad. */
export const SMELTING = [
  { in: 'cobble', out: 'stone', time: 8 },
  { in: 'sand', out: 'glass', time: 8 },
  { in: 'clay_ball', out: 'brick', time: 8 },
  { in: 'raw_copper', out: 'copper_ingot', time: 10 },
  { in: 'raw_iron', out: 'iron_ingot', time: 10 },
  { in: 'raw_gold', out: 'gold_ingot', time: 10 },
  { in: 'raw_noctisite', out: 'noctisite_ingot', time: 16 },
  { in: 'log_oak', out: 'charcoal', time: 8 },
  { in: 'log_dark', out: 'charcoal', time: 8 },
  { in: 'log_jungle', out: 'charcoal', time: 8 },
  { in: 'log_pine', out: 'charcoal', time: 8 },
  { in: 'raw_beef', out: 'cooked_beef', time: 8 },
  { in: 'raw_pork', out: 'cooked_pork', time: 8 },
  { in: 'raw_bird', out: 'cooked_bird', time: 8 },
  { in: 'raw_fish', out: 'cooked_fish', time: 8 },
  { in: 'raw_venison', out: 'cooked_venison', time: 8 },
  { in: 'potato', out: 'baked_potato', time: 8 },
  { in: 'corn', out: 'roasted_corn', time: 8 },
  { in: 'fungus_slice', out: 'roasted_fungus', time: 8 },
  { in: 'umbral_stone', out: 'umbral_bricks', time: 8 },
];
const SMELT_BY_ID = new Map();
for (const s of SMELTING) SMELT_BY_ID.set(Items.id(s.in), s);
export const smeltRecipe = (itemId) => SMELT_BY_ID.get(itemId) || null;
export const fuelTime = (itemId) => { const it = Items.get(itemId); return it && it.fuel ? it.fuel : 0; };

// ── Lógica de fabricación ────────────────────────────────────────
function tagMembers(spec) {
  return spec.startsWith('#') ? TAGS[spec].map((k) => Items.id(k)) : [Items.id(spec)];
}
export function countIngredient(slots, spec) {
  let c = 0;
  for (const id of tagMembers(spec)) c += countInSlots(slots, id);
  return c;
}
function consumeIngredient(slots, spec, n) {
  for (const id of tagMembers(spec)) {
    const have = countInSlots(slots, id);
    const take = Math.min(have, n);
    if (take > 0) { removeFromSlots(slots, id, take); n -= take; }
    if (n <= 0) return true;
  }
  return n <= 0;
}

export function canCraft(r, slots) {
  return r.in.every(([spec, n]) => countIngredient(slots, spec) >= n);
}

/** Máximo de veces que se puede fabricar con los materiales actuales. */
export function maxCrafts(r, slots) {
  let m = Infinity;
  for (const [spec, n] of r.in) m = Math.min(m, Math.floor(countIngredient(slots, spec) / n));
  return Number.isFinite(m) ? m : 0;
}

/**
 * Fabrica `times` veces. Solo consume si todo cabe en el inventario. Devuelve cuántas veces se fabricó.
 * `slots` es el array de huecos del inventario (jugador).
 */
export function craft(r, slots, times = 1) {
  const outItem = Items.get(r.out);
  if (!outItem) return 0;
  let done = 0;
  for (let k = 0; k < times; k++) {
    if (!canCraft(r, slots)) break;
    // Simula primero: el resultado debe caber DESPUÉS de consumir los ingredientes (que liberan huecos)
    const sim = slots.map(cloneStack);
    for (const [spec, n] of r.in) consumeIngredient(sim, spec, n);
    if (addToSlots(sim, makeStack(outItem.id, r.n))) break;
    for (const [spec, n] of r.in) consumeIngredient(slots, spec, n);
    const rest = addToSlots(slots, makeStack(outItem.id, r.n));
    if (rest) throw new Error('Inconsistencia al fabricar (no debería ocurrir)');
    done++;
  }
  return done;
}

/** Recetas visibles en una estación. `discovered` = Set de claves de objeto ya obtenidos. */
export function recipesFor(station, discovered, creative = false) {
  return RECIPES.filter((r) => {
    if (station === 'hand' && r.station !== 'hand') return false;
    if (!creative && r.unlock && !(discovered && discovered.has(r.unlock))) return false;
    return true;
  });
}

// ── Reparación ───────────────────────────────────────────────────
/** Material de reparación de una herramienta/armadura, o null. */
export function repairMaterial(it) {
  if (it.repair) return it.repair; // objetos únicos de los jefes
  if (it.tool) return TIER_MATERIAL[it.tool.tier];
  if (it.armor) return ARMOR_TIERS[it.armor.tier].material;
  return null;
}
/** Repara un 30 % de la durabilidad máxima por unidad de material (consume 1). */
export function repairStack(stack, slots) {
  const it = Items.get(stack.i);
  const matKey = it && repairMaterial(it);
  if (!matKey || !stack.d) return { ok: false, reason: stack.d ? 'Este objeto no se puede reparar.' : 'No está dañado.' };
  const mat = Items.id(matKey);
  if (countInSlots(slots, mat) < 1) return { ok: false, reason: `Necesitas: ${Items.get(mat).name}` };
  const max = it.tool ? it.tool.durability : it.armor.durability;
  removeFromSlots(slots, mat, 1);
  stack.d = Math.max(0, stack.d - Math.ceil(max * 0.3));
  return { ok: true };
}
