// Registro de objetos. Los bloques colocables son objetos con id = id del bloque (1..255);
// el resto empieza en 256. IDs persistentes: solo añadir al final de cada grupo.
import { BLOCKS, Blocks } from './blocks.js';

/** Materiales de herramientas y armaduras originales. level = nivel de cosecha. */
export const TIERS = {
  wood:      { key: 'wood',      adj: 'de madera',    level: 1, speed: 2.0,  durability: 60,   attack: 0,   color: '#a97c45', dark: '#6e4d27', light: '#c9a063' },
  stone:     { key: 'stone',     adj: 'de piedra',    level: 2, speed: 3.5,  durability: 132,  attack: 1,   color: '#8d9096', dark: '#5d6066', light: '#b3b6bb' },
  copper:    { key: 'copper',    adj: 'de cobre',     level: 2, speed: 4.5,  durability: 190,  attack: 1.5, color: '#d9814b', dark: '#9a4f27', light: '#f0a878' },
  iron:      { key: 'iron',      adj: 'de hierro',    level: 3, speed: 6.0,  durability: 250,  attack: 2,   color: '#d6d9de', dark: '#8d929c', light: '#f3f5f8' },
  gold:      { key: 'gold',      adj: 'de oro',       level: 2, speed: 10.0, durability: 34,   attack: 0.5, color: '#f5cd3b', dark: '#b58a14', light: '#fff0a0' },
  crystal:   { key: 'crystal',   adj: 'de cristal',   level: 4, speed: 8.0,  durability: 1100, attack: 3,   color: '#58d6e8', dark: '#2a8aa6', light: '#c4f7ff' },
  noctisite: { key: 'noctisite', adj: 'de noctisita', level: 5, speed: 9.5,  durability: 2300, attack: 4,   color: '#8f5be0', dark: '#4e2a8c', light: '#cdb0ff' },
};
export const TIER_ORDER = ['wood', 'stone', 'copper', 'iron', 'gold', 'crystal', 'noctisite'];

/** Material con el que se fabrica cada nivel (cabeza de herramienta). */
export const TIER_MATERIAL = {
  wood: 'planks', stone: 'cobble', copper: 'copper_ingot', iron: 'iron_ingot',
  gold: 'gold_ingot', crystal: 'crystal_shard', noctisite: 'noctisite_ingot',
};

const TOOL_BASE = {
  pickaxe: { name: 'Pico', damage: 2, cooldown: 0.6, cost: 3 },
  axe:     { name: 'Hacha', damage: 3, cooldown: 0.95, cost: 3 },
  shovel:  { name: 'Pala', damage: 1.5, cooldown: 0.65, cost: 1 },
  sword:   { name: 'Espada', damage: 4, cooldown: 0.45, cost: 2 },
  hoe:     { name: 'Azada', damage: 1, cooldown: 0.4, cost: 2 },
};
export const TOOL_ORDER = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'];

export const ARMOR_TIERS = {
  leather:   { key: 'leather',   adj: 'de cuero',    defense: [1, 2, 2, 1],  mult: 5,  color: '#a8672d', dark: '#6b3d17', light: '#c88b4a', material: 'leather' },
  copper:    { key: 'copper',    adj: 'de cobre',    defense: [2, 4, 3, 1],  mult: 8,  color: '#d9814b', dark: '#9a4f27', light: '#f0a878', material: 'copper_ingot' },
  gold:      { key: 'gold',      adj: 'de oro',      defense: [2, 5, 3, 1],  mult: 7,  color: '#f5cd3b', dark: '#b58a14', light: '#fff0a0', material: 'gold_ingot' },
  iron:      { key: 'iron',      adj: 'de hierro',   defense: [2, 6, 5, 2],  mult: 15, color: '#d6d9de', dark: '#8d929c', light: '#f3f5f8', material: 'iron_ingot' },
  crystal:   { key: 'crystal',   adj: 'de cristal',  defense: [3, 8, 6, 3],  mult: 28, color: '#58d6e8', dark: '#2a8aa6', light: '#c4f7ff', material: 'crystal_shard' },
  noctisite: { key: 'noctisite', adj: 'de noctisita', defense: [4, 9, 7, 4], mult: 38, color: '#8f5be0', dark: '#4e2a8c', light: '#cdb0ff', material: 'noctisite_ingot' },
};
export const ARMOR_ORDER = ['leather', 'copper', 'gold', 'iron', 'crystal', 'noctisite'];
export const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet'];
const ARMOR_NAMES = ['Casco', 'Peto', 'Grebas', 'Botas'];
const ARMOR_BASE_DUR = [55, 80, 75, 65];
/** Cada punto de defensa reduce el daño un 3,2 % (máximo 80 %). */
export const DEFENSE_PER_POINT = 0.032;

/** @typedef {{id:number,key:string,name:string,stack:number,kind:string,block?:number,tool?:object,armor?:object,food?:object,fuel?:number,plants?:string,icon:string}} Item */
/** @type {Item[]} */
export const ITEMS = [];
const byKey = new Map();

// 1) Bloques colocables
for (const b of BLOCKS) {
  if (!b || b.id === 0 || !b.placeable) continue;
  const it = { id: b.id, key: b.key, name: b.name, stack: b.key === 'bed' ? 16 : 64, kind: 'block', block: b.id, icon: 'block:' + b.key };
  ITEMS[b.id] = it;
  byKey.set(it.key, it);
}

let nextId = 256;
function item(key, name, o = {}) {
  if (byKey.has(key)) throw new Error('Objeto duplicado: ' + key);
  const it = { id: nextId++, key, name, stack: o.stack ?? 64, kind: o.kind ?? 'material', icon: o.icon ?? 'sprite:' + key, ...o };
  ITEMS[it.id] = it;
  byKey.set(key, it);
  return it;
}

// 2) Materiales
item('stick', 'Palo', { fuel: 5 });
item('coal', 'Carbón', { fuel: 80 });
item('charcoal', 'Carbón vegetal', { fuel: 80 });
item('flint', 'Pedernal');
item('snowball', 'Bola de nieve', { stack: 16 });
item('clay_ball', 'Bola de arcilla');
item('brick', 'Ladrillo');
item('raw_copper', 'Cobre en bruto');
item('raw_iron', 'Hierro en bruto');
item('raw_gold', 'Oro en bruto');
item('raw_noctisite', 'Noctisita en bruto');
item('copper_ingot', 'Lingote de cobre');
item('iron_ingot', 'Lingote de hierro');
item('gold_ingot', 'Lingote de oro');
item('noctisite_ingot', 'Lingote de noctisita');
item('crystal_shard', 'Fragmento de cristal');
item('leather', 'Cuero');
item('feather', 'Pluma');
item('scute', 'Caparazón de río');

// 3) Semillas y cultivos
item('seed_wheat', 'Semillas de trigo', { plants: 'crop_wheat_0' });
item('wheat', 'Trigo');
item('carrot', 'Zanahoria', { plants: 'crop_carrot_0', food: { hunger: 3, sat: 3.6 }, kind: 'food' });
item('potato', 'Papa', { plants: 'crop_potato_0', food: { hunger: 1, sat: 0.6 }, kind: 'food' });

// 4) Comida
item('berries', 'Bayas', { food: { hunger: 2, sat: 0.4 }, kind: 'food' });
item('apple', 'Manzana', { food: { hunger: 4, sat: 2.4 }, kind: 'food' });
item('bread', 'Pan', { food: { hunger: 5, sat: 6 }, kind: 'food' });
item('baked_potato', 'Papa asada', { food: { hunger: 5, sat: 6 }, kind: 'food' });
item('raw_beef', 'Carne de bóvido cruda', { food: { hunger: 3, sat: 1.8 }, kind: 'food' });
item('cooked_beef', 'Filete de bóvido', { food: { hunger: 8, sat: 12.8 }, kind: 'food' });
item('raw_pork', 'Carne de jabalí cruda', { food: { hunger: 3, sat: 1.8 }, kind: 'food' });
item('cooked_pork', 'Chuleta de jabalí', { food: { hunger: 8, sat: 12.8 }, kind: 'food' });
item('raw_bird', 'Carne de ave cruda', { food: { hunger: 2, sat: 1.2 }, kind: 'food' });
item('cooked_bird', 'Ave asada', { food: { hunger: 6, sat: 7.2 }, kind: 'food' });
item('raw_fish', 'Pez luminoso crudo', { food: { hunger: 2, sat: 0.4 }, kind: 'food' });
item('cooked_fish', 'Pez luminoso asado', { food: { hunger: 5, sat: 6 }, kind: 'food' });
item('raw_venison', 'Carne de ciervo cruda', { food: { hunger: 3, sat: 1.8 }, kind: 'food' });
item('cooked_venison', 'Asado de ciervo', { food: { hunger: 8, sat: 12.8 }, kind: 'food' });

// 5) Recipientes
item('bucket', 'Cubo', { stack: 16, kind: 'bucket', icon: 'bucket:empty' });
item('water_bucket', 'Cubo de agua', { stack: 1, kind: 'bucket', fluid: 'water', icon: 'bucket:water' });
item('lava_bucket', 'Cubo de lava', { stack: 1, kind: 'bucket', fluid: 'lava', icon: 'bucket:lava', fuel: 1000 });

// 6) Herramientas (7 materiales × 5 tipos)
for (const t of TIER_ORDER) {
  const T = TIERS[t];
  for (const type of TOOL_ORDER) {
    const B = TOOL_BASE[type];
    item(`${t}_${type}`, `${B.name} ${T.adj}`, {
      stack: 1, kind: 'tool', icon: `tool:${type}:${t}`,
      tool: {
        type, tier: t, level: T.level, speed: T.speed, durability: T.durability,
        damage: B.damage + (type === 'sword' || type === 'axe' ? T.attack : T.attack * 0.5), cooldown: B.cooldown,
      },
    });
  }
}

// 7) Armaduras (6 materiales × 4 piezas)
for (const a of ARMOR_ORDER) {
  const A = ARMOR_TIERS[a];
  ARMOR_SLOTS.forEach((slot, i) => {
    item(`${a}_${['helmet', 'chestplate', 'leggings', 'boots'][i]}`, `${ARMOR_NAMES[i]} ${A.adj}`, {
      stack: 1, kind: 'armor', icon: `armor:${slot}:${a}`,
      armor: { slot, slotIndex: i, tier: a, defense: A.defense[i], durability: ARMOR_BASE_DUR[i] * A.mult },
    });
  });
}

// Combustibles de bloques
const blockFuel = { planks: 15, log_oak: 15, log_dark: 15, log_jungle: 15, log_pine: 15, workbench: 15, chest: 15, slab_planks: 7, sapling_oak: 5, sapling_dark: 5, sapling_jungle: 5, sapling_pine: 5 };
for (const [k, v] of Object.entries(blockFuel)) if (byKey.has(k)) byKey.get(k).fuel = v;

// ─────────────────────────────────────────────────────────────────
export const Items = {
  /** @returns {Item|null} */
  get(idOrKey) {
    if (typeof idOrKey === 'number') return ITEMS[idOrKey] || null;
    return byKey.get(idOrKey) || null;
  },
  id(key) {
    const it = byKey.get(key);
    if (!it) throw new Error('Objeto desconocido: ' + key);
    return it.id;
  },
  has(key) { return byKey.has(key); },
  all() { return ITEMS.filter(Boolean); },
  forBlock(blockId) { return ITEMS[blockId] && ITEMS[blockId].block === blockId ? ITEMS[blockId] : null; },
};

/** Pila de objetos: {i:id, n:cantidad, d:desgaste usado} */
export function makeStack(idOrKey, n = 1, damage = 0) {
  const it = Items.get(idOrKey);
  if (!it) throw new Error('Objeto desconocido: ' + idOrKey);
  return { i: it.id, n, d: damage };
}
export const cloneStack = (s) => (s ? { i: s.i, n: s.n, d: s.d || 0 } : null);
export const maxDurability = (it) => (it.tool ? it.tool.durability : it.armor ? it.armor.durability : 0);

/** Resuelve la especificación de drops de un bloque a una lista [{id, n}]. */
export function rollDrops(spec, rng = Math.random) {
  const out = [];
  if (spec == null) return out;
  const list = Array.isArray(spec) ? spec : [spec];
  for (const d of list) {
    if (typeof d === 'string') { const it = Items.get(d); if (it) out.push({ id: it.id, n: 1 }); continue; }
    const chance = d.chance ?? 1;
    if (chance < 1 && rng() >= chance) continue;
    if (chance <= 0) continue;
    const min = d.min ?? 1, max = d.max ?? min;
    const n = min + Math.floor(rng() * (max - min + 1));
    const it = Items.get(d.item);
    if (it && n > 0) out.push({ id: it.id, n });
  }
  return out;
}

/** Objetos que aparecen en el inventario creativo (todos los colocables y no colocables). */
export function creativeCatalog() {
  const hidden = new Set(['air', 'bookshelf_dummy', 'dandelion_dummy']);
  return Items.all().filter((it) => !hidden.has(it.key));
}

export { Blocks };
