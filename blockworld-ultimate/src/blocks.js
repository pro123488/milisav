// Registro de bloques basado en datos. Sin dependencias del DOM (se puede probar en Node).
// Los IDs son PERSISTENTES (se guardan en los mundos): nunca reutilices ni reordenes, solo añade al final.
//
// Orden de caras en todo el motor: 0:+X 1:-X 2:+Y(arriba) 3:-Y(abajo) 4:+Z 5:-Z

/** @typedef {{id:number,key:string,name:string,tiles:string[],hardness:number,tool:?string,harvest:number,
 *  solid:boolean,opaque:boolean,cull:boolean,shape:string,height:number,light:number,atten:number,drops:any,
 *  sound:string,placeable:boolean,replaceable:boolean,fluid:?string,interact:?string,plantOn:?string,
 *  soil:boolean,gravity:boolean,randomTick:boolean,targetable:boolean,unbreakable:boolean,tint:number}} Block */

export const TOOL_TYPES = ['pickaxe', 'axe', 'shovel', 'hoe', 'sword'];

/** @type {Block[]} */
export const BLOCKS = new Array(256).fill(null);
const byKey = new Map();

function def(id, key, name, o = {}) {
  if (BLOCKS[id]) throw new Error('ID de bloque duplicado: ' + id + ' ' + key);
  if (byKey.has(key)) throw new Error('Clave de bloque duplicada: ' + key);
  let tiles = o.tiles ?? key;
  if (typeof tiles === 'string') tiles = [tiles, tiles, tiles, tiles, tiles, tiles];
  else if (!Array.isArray(tiles)) {
    const side = tiles.side ?? key, top = tiles.top ?? side, bottom = tiles.bottom ?? side;
    tiles = [tiles.east ?? side, tiles.west ?? side, top, bottom, tiles.south ?? side, tiles.north ?? side];
  }
  const shape = o.shape ?? 'cube';
  const solid = o.solid ?? (shape === 'cube' || shape === 'slab' || shape === 'farmland');
  const opaque = o.opaque ?? (shape === 'cube');
  const b = {
    id, key, name, tiles,
    hardness: o.hardness ?? 1,
    tool: o.tool ?? null,
    harvest: o.harvest ?? 0,
    solid, opaque,
    cull: o.cull ?? opaque,           // ¿se oculta la cara contra un vecino idéntico?
    shape,
    height: o.height ?? (shape === 'slab' ? 0.5 : shape === 'farmland' ? 0.9375 : 1),
    light: o.light ?? 0,
    atten: o.atten ?? (opaque ? 15 : 0), // atenuación de luz al atravesar el bloque
    drops: o.drops === undefined ? key : o.drops,
    sound: o.sound ?? 'stone',
    placeable: o.placeable ?? true,
    replaceable: o.replaceable ?? false,
    fluid: o.fluid ?? null,
    interact: o.interact ?? null,
    plantOn: o.plantOn ?? null,       // 'soil' | 'sand' | 'any'
    soil: o.soil ?? false,
    gravity: o.gravity ?? false,
    randomTick: o.randomTick ?? false,
    targetable: o.targetable ?? true,
    unbreakable: o.unbreakable ?? false,
    tint: o.tint ?? 0,
    dir: o.dir ?? 0,                  // variantes de antorcha de pared: 1:+X 2:-X 3:+Z 4:-Z (soporte en esa dirección)
    stage: o.stage ?? 0,
    next: o.next ?? null,             // siguiente etapa de crecimiento
    group: o.group ?? null,
  };
  BLOCKS[id] = b;
  byKey.set(key, b);
  return b;
}

// Dureza base (segundos con mano/herramienta incorrecta ×5, con la correcta ×1.5, dividido por velocidad).
const PICK = 'pickaxe', AXE = 'axe', SHOVEL = 'shovel';

def(0, 'air', 'Aire', { shape: 'none', solid: false, opaque: false, atten: 0, placeable: false, replaceable: true, targetable: false, drops: null, hardness: 0 });

// ── Terreno básico ────────────────────────────────────────────────
def(1, 'stone', 'Piedra', { hardness: 1.5, tool: PICK, harvest: 1, drops: 'cobble', sound: 'stone' });
def(2, 'cobble', 'Adoquín', { hardness: 2, tool: PICK, harvest: 1, sound: 'stone' });
def(3, 'dirt', 'Tierra', { hardness: 0.5, tool: SHOVEL, sound: 'dirt', soil: true });
def(4, 'grass', 'Césped', { tiles: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, hardness: 0.6, tool: SHOVEL, drops: 'dirt', sound: 'grass', soil: true, randomTick: true });
def(5, 'grass_lush', 'Césped frondoso', { tiles: { top: 'grass_lush_top', side: 'grass_lush_side', bottom: 'dirt' }, hardness: 0.6, tool: SHOVEL, drops: 'dirt', sound: 'grass', soil: true, randomTick: true });
def(6, 'grass_dry', 'Césped seco', { tiles: { top: 'grass_dry_top', side: 'grass_dry_side', bottom: 'dirt' }, hardness: 0.6, tool: SHOVEL, drops: 'dirt', sound: 'grass', soil: true, randomTick: true });
def(7, 'grass_swamp', 'Césped de pantano', { tiles: { top: 'grass_swamp_top', side: 'grass_swamp_side', bottom: 'mud' }, hardness: 0.6, tool: SHOVEL, drops: 'mud', sound: 'grass', soil: true });
def(8, 'grass_snow', 'Césped nevado', { tiles: { top: 'snow', side: 'grass_snow_side', bottom: 'dirt' }, hardness: 0.6, tool: SHOVEL, drops: 'dirt', sound: 'snow', soil: true });
def(9, 'sand', 'Arena', { hardness: 0.5, tool: SHOVEL, sound: 'sand', gravity: true });
def(10, 'gravel', 'Grava', { hardness: 0.6, tool: SHOVEL, sound: 'gravel', gravity: true, drops: [{ item: 'gravel', chance: 0.85 }, { item: 'flint', chance: 0.15 }] });
def(11, 'clay', 'Arcilla', { hardness: 0.6, tool: SHOVEL, sound: 'dirt', drops: { item: 'clay_ball', min: 3, max: 4 } });
def(12, 'mud', 'Barro', { hardness: 0.5, tool: SHOVEL, sound: 'dirt', soil: true });
def(13, 'snow', 'Nieve', { hardness: 0.3, tool: SHOVEL, sound: 'snow', drops: { item: 'snowball', min: 2, max: 4 } });
def(14, 'ice', 'Hielo', { hardness: 0.5, tool: PICK, sound: 'glass', opaque: false, cull: true, atten: 1, drops: null });
def(15, 'deepstone', 'Roca profunda', { hardness: 3.2, tool: PICK, harvest: 2, drops: 'deepstone', sound: 'stone' });
def(16, 'baserock', 'Roca base', { hardness: 1000, unbreakable: true, sound: 'stone', placeable: false, drops: null });

// ── Fluidos ───────────────────────────────────────────────────────
def(17, 'water', 'Agua', { shape: 'fluid', fluid: 'water', solid: false, opaque: false, cull: true, atten: 1, hardness: 1000, drops: null, placeable: false, replaceable: true, targetable: false, sound: 'water' });
def(18, 'lava', 'Lava', { shape: 'fluid', fluid: 'lava', solid: false, opaque: false, cull: true, atten: 1, light: 15, hardness: 1000, drops: null, placeable: false, replaceable: true, targetable: false, sound: 'water' });

// ── Árboles ───────────────────────────────────────────────────────
def(19, 'log_oak', 'Tronco de roble', { tiles: { top: 'log_top', side: 'log_oak' }, hardness: 2, tool: AXE, sound: 'wood', group: 'log' });
def(20, 'log_dark', 'Tronco de umbría', { tiles: { top: 'log_top_dark', side: 'log_dark' }, hardness: 2.2, tool: AXE, sound: 'wood', group: 'log' });
def(21, 'log_jungle', 'Tronco de selva', { tiles: { top: 'log_top_jungle', side: 'log_jungle' }, hardness: 2, tool: AXE, sound: 'wood', group: 'log' });
def(22, 'log_pine', 'Tronco de pino', { tiles: { top: 'log_top_pine', side: 'log_pine' }, hardness: 2, tool: AXE, sound: 'wood', group: 'log' });
def(23, 'planks', 'Tablones', { hardness: 2, tool: AXE, sound: 'wood' });
const leafDrops = (sap) => [{ item: sap, chance: 0.06 }, { item: 'stick', chance: 0.08 }, { item: 'apple', chance: sap === 'sapling_oak' ? 0.03 : 0 }];
def(24, 'leaves_oak', 'Hojas de roble', { hardness: 0.2, sound: 'leaf', opaque: false, cull: true, atten: 1, drops: leafDrops('sapling_oak'), group: 'leaves' });
def(25, 'leaves_dark', 'Hojas de umbría', { hardness: 0.2, sound: 'leaf', opaque: false, cull: true, atten: 1, drops: leafDrops('sapling_dark'), group: 'leaves' });
def(26, 'leaves_jungle', 'Hojas de selva', { hardness: 0.2, sound: 'leaf', opaque: false, cull: true, atten: 1, drops: leafDrops('sapling_jungle'), group: 'leaves' });
def(27, 'leaves_pine', 'Agujas de pino', { hardness: 0.2, sound: 'leaf', opaque: false, cull: true, atten: 1, drops: leafDrops('sapling_pine'), group: 'leaves' });
def(28, 'leaves_swamp', 'Hojas de pantano', { hardness: 0.2, sound: 'leaf', opaque: false, cull: true, atten: 1, drops: leafDrops('sapling_oak'), group: 'leaves' });
def(29, 'cactus', 'Cacto', { tiles: { top: 'cactus_top', side: 'cactus_side', bottom: 'cactus_top' }, hardness: 0.4, sound: 'plant', opaque: false, cull: false, atten: 0, plantOn: 'sand' });

// ── Minerales ─────────────────────────────────────────────────────
def(30, 'ore_coal', 'Mineral de carbón', { hardness: 3, tool: PICK, harvest: 1, drops: 'coal', sound: 'stone' });
def(31, 'ore_copper', 'Mineral de cobre', { hardness: 3, tool: PICK, harvest: 2, drops: { item: 'raw_copper', min: 1, max: 2 }, sound: 'stone' });
def(32, 'ore_iron', 'Mineral de hierro', { hardness: 3.2, tool: PICK, harvest: 2, drops: 'raw_iron', sound: 'stone' });
def(33, 'ore_gold', 'Mineral de oro', { hardness: 3.4, tool: PICK, harvest: 3, drops: 'raw_gold', sound: 'stone' });
def(34, 'ore_crystal', 'Mineral de cristal', { hardness: 3.6, tool: PICK, harvest: 3, drops: { item: 'crystal_shard', min: 1, max: 3 }, sound: 'glass' });
def(35, 'ore_noctisite', 'Mineral de noctisita', { hardness: 5, tool: PICK, harvest: 4, drops: 'raw_noctisite', sound: 'stone' });
def(36, 'basalt', 'Roca volcánica', { hardness: 2.2, tool: PICK, harvest: 1, sound: 'stone' });
def(37, 'obsidian', 'Vidrio volcánico', { hardness: 25, tool: PICK, harvest: 4, sound: 'glass' });
def(38, 'ash', 'Ceniza', { hardness: 0.4, tool: SHOVEL, sound: 'sand' });
def(39, 'sandstone', 'Arenisca', { tiles: { top: 'sandstone_top', side: 'sandstone', bottom: 'sandstone_top' }, hardness: 0.8, tool: PICK, harvest: 1, sound: 'stone' });
def(40, 'red_sandstone', 'Arenisca roja', { tiles: { top: 'red_sandstone_top', side: 'red_sandstone', bottom: 'red_sandstone_top' }, hardness: 0.9, tool: PICK, harvest: 1, sound: 'stone' });
def(41, 'red_sand', 'Arena roja', { hardness: 0.5, tool: SHOVEL, sound: 'sand', gravity: true });
def(42, 'cave_crystal', 'Cristal de cueva', { hardness: 1.5, tool: PICK, harvest: 1, light: 9, drops: { item: 'crystal_shard', min: 1, max: 2 }, sound: 'glass' });

// ── Construcción y decoración ─────────────────────────────────────
def(43, 'bricks', 'Ladrillos', { hardness: 2, tool: PICK, harvest: 1, sound: 'stone' });
def(44, 'stonebricks', 'Piedra tallada', { hardness: 1.8, tool: PICK, harvest: 1, sound: 'stone' });
def(45, 'stonebricks_mossy', 'Piedra tallada musgosa', { hardness: 1.8, tool: PICK, harvest: 1, sound: 'stone' });
def(46, 'glass', 'Vidrio', { hardness: 0.3, sound: 'glass', opaque: false, cull: true, atten: 0, drops: null });
def(47, 'workbench', 'Mesa de trabajo', { tiles: { top: 'workbench_top', side: 'workbench_side', bottom: 'planks' }, hardness: 2.5, tool: AXE, sound: 'wood', interact: 'workbench' });
def(48, 'furnace', 'Horno', { tiles: { top: 'furnace_top', side: 'furnace_side', south: 'furnace_front', bottom: 'furnace_top' }, hardness: 3.5, tool: PICK, harvest: 1, sound: 'stone', interact: 'furnace' });
def(49, 'furnace_lit', 'Horno encendido', { tiles: { top: 'furnace_top', side: 'furnace_side', south: 'furnace_front_lit', bottom: 'furnace_top' }, hardness: 3.5, tool: PICK, harvest: 1, light: 13, drops: 'furnace', sound: 'stone', interact: 'furnace', placeable: false });
def(50, 'chest', 'Cofre', { tiles: { top: 'chest_top', side: 'chest_side', south: 'chest_front', bottom: 'chest_top' }, hardness: 2.5, tool: AXE, sound: 'wood', interact: 'chest' });
def(51, 'bed', 'Cama', { tiles: { top: 'bed_top', side: 'bed_side', bottom: 'planks' }, shape: 'slab', height: 0.5625, hardness: 0.3, sound: 'wood', interact: 'bed', opaque: false, atten: 0 });
def(52, 'torch', 'Antorcha', { shape: 'torch', tiles: 'torch', solid: false, opaque: false, atten: 0, light: 14, hardness: 0.05, sound: 'wood', plantOn: 'torch' });
def(53, 'torch_e', 'Antorcha de pared (+X)', { shape: 'torch', tiles: 'torch', solid: false, opaque: false, atten: 0, light: 14, hardness: 0.05, sound: 'wood', dir: 1, drops: 'torch', placeable: false, plantOn: 'torch' });
def(54, 'torch_w', 'Antorcha de pared (-X)', { shape: 'torch', tiles: 'torch', solid: false, opaque: false, atten: 0, light: 14, hardness: 0.05, sound: 'wood', dir: 2, drops: 'torch', placeable: false, plantOn: 'torch' });
def(55, 'torch_s', 'Antorcha de pared (+Z)', { shape: 'torch', tiles: 'torch', solid: false, opaque: false, atten: 0, light: 14, hardness: 0.05, sound: 'wood', dir: 3, drops: 'torch', placeable: false, plantOn: 'torch' });
def(56, 'torch_n', 'Antorcha de pared (-Z)', { shape: 'torch', tiles: 'torch', solid: false, opaque: false, atten: 0, light: 14, hardness: 0.05, sound: 'wood', dir: 4, drops: 'torch', placeable: false, plantOn: 'torch' });
def(57, 'slab_planks', 'Losa de tablones', { tiles: 'planks', shape: 'slab', opaque: false, atten: 0, hardness: 2, tool: AXE, sound: 'wood' });
def(58, 'slab_stone', 'Losa de piedra', { tiles: 'stone', shape: 'slab', opaque: false, atten: 0, hardness: 1.5, tool: PICK, harvest: 1, sound: 'stone' });
def(59, 'slab_cobble', 'Losa de adoquín', { tiles: 'cobble', shape: 'slab', opaque: false, atten: 0, hardness: 2, tool: PICK, harvest: 1, sound: 'stone' });
def(60, 'slab_bricks', 'Losa de ladrillo', { tiles: 'bricks', shape: 'slab', opaque: false, atten: 0, hardness: 2, tool: PICK, harvest: 1, sound: 'stone' });
def(61, 'block_copper', 'Bloque de cobre', { hardness: 4, tool: PICK, harvest: 2, sound: 'metal' });
def(62, 'block_iron', 'Bloque de hierro', { hardness: 5, tool: PICK, harvest: 2, sound: 'metal' });
def(63, 'block_gold', 'Bloque de oro', { hardness: 4, tool: PICK, harvest: 2, sound: 'metal' });
def(64, 'block_crystal', 'Bloque de cristal', { hardness: 5, tool: PICK, harvest: 3, sound: 'glass' });
def(65, 'block_noctisite', 'Bloque de noctisita', { hardness: 12, tool: PICK, harvest: 4, sound: 'metal' });
def(66, 'crystal_lamp', 'Lámpara de cristal', { hardness: 0.8, light: 15, sound: 'glass' });
def(67, 'bookshelf_dummy', 'Reservado', { placeable: false, drops: null, hardness: 1 }); // reservado para fases futuras

// ── Agricultura ───────────────────────────────────────────────────
def(68, 'farmland', 'Tierra arada', { tiles: { top: 'farmland_dry', side: 'dirt', bottom: 'dirt' }, shape: 'farmland', opaque: false, atten: 0, hardness: 0.6, tool: SHOVEL, drops: 'dirt', sound: 'dirt', soil: true, randomTick: true, placeable: false });
def(69, 'farmland_wet', 'Tierra arada húmeda', { tiles: { top: 'farmland_wet', side: 'dirt', bottom: 'dirt' }, shape: 'farmland', opaque: false, atten: 0, hardness: 0.6, tool: SHOVEL, drops: 'dirt', sound: 'dirt', soil: true, randomTick: true, placeable: false });

// Cultivos: 4 etapas cada uno (bloques 70-81). Cada etapa es un bloque distinto → se guarda solo con el mundo.
const CROPS = [
  ['wheat', 'Trigo', 70, 'seed_wheat', 'wheat'],
  ['carrot', 'Zanahoria', 74, 'carrot', 'carrot'],
  ['potato', 'Papa', 78, 'potato', 'potato'],
];
for (const [k, name, base, seedItem, harvestItem] of CROPS) {
  for (let s = 0; s < 4; s++) {
    const key = `crop_${k}_${s}`;
    const ripe = s === 3;
    let drops;
    if (!ripe) drops = seedItem;
    else if (k === 'wheat') drops = [{ item: 'wheat', min: 1, max: 1 }, { item: 'seed_wheat', min: 1, max: 3 }];
    else drops = { item: harvestItem, min: 2, max: 4 };
    def(base + s, key, `${name} (etapa ${s + 1}/4)`, {
      shape: 'cross', tiles: key, solid: false, opaque: false, atten: 0, hardness: 0, sound: 'plant', placeable: false,
      plantOn: 'farmland', drops, randomTick: !ripe, stage: s, next: ripe ? null : `crop_${k}_${s + 1}`, group: 'crop',
    });
  }
}

// ── Vegetación ────────────────────────────────────────────────────
const plant = (id, key, name, o = {}) => def(id, key, name, {
  shape: 'cross', tiles: key, solid: false, opaque: false, atten: 0, hardness: 0, sound: 'plant', replaceable: true, plantOn: 'soil', group: 'plant', ...o,
});
plant(82, 'tall_grass', 'Hierba alta', { drops: [{ item: 'seed_wheat', chance: 0.12 }, { item: 'carrot', chance: 0.015 }, { item: 'potato', chance: 0.015 }] });
plant(83, 'fern', 'Helecho', { drops: [{ item: 'seed_wheat', chance: 0.08 }] });
plant(84, 'flower_red', 'Amapola roja');
plant(85, 'flower_yellow', 'Flor dorada');
plant(86, 'flower_blue', 'Campanilla azul');
plant(87, 'flower_moon', 'Flor lunar', { light: 6 });
plant(88, 'mushroom_glow', 'Hongo fosfórico', { light: 7, plantOn: 'any' });
plant(89, 'mushroom_dark', 'Hongo umbrío', { plantOn: 'any' });
plant(90, 'dead_bush', 'Arbusto seco', { plantOn: 'dry', drops: [{ item: 'stick', min: 0, max: 2 }] });
plant(91, 'reed', 'Junco', { plantOn: 'soil' });
plant(92, 'sapling_oak', 'Brote de roble', { randomTick: true, replaceable: false, placeable: true });
plant(93, 'sapling_dark', 'Brote de umbría', { randomTick: true, replaceable: false, placeable: true });
plant(94, 'sapling_jungle', 'Brote de selva', { randomTick: true, replaceable: false, placeable: true });
plant(95, 'sapling_pine', 'Brote de pino', { randomTick: true, replaceable: false, placeable: true });
plant(96, 'berry_bush', 'Arbusto de bayas', { replaceable: false, interact: 'berry', drops: { item: 'berries', min: 1, max: 3 }, randomTick: false });
plant(97, 'berry_bush_empty', 'Arbusto de bayas (sin frutos)', { replaceable: false, randomTick: true, drops: 'stick', placeable: false });
plant(98, 'dandelion_dummy', 'Reservado', { placeable: false, drops: null });
plant(99, 'flower_pink', 'Peonía rosa');

// ── Bloques de relleno para futuras fases ─────────────────────────
def(100, 'lava_rock_bricks', 'Ladrillos volcánicos', { tiles: 'basalt_bricks', hardness: 3, tool: PICK, harvest: 2, sound: 'stone' });

// ─────────────────────────────────────────────────────────────────
export const Blocks = {
  list: BLOCKS,
  /** @returns {Block} */
  get(idOrKey) {
    if (typeof idOrKey === 'number') return BLOCKS[idOrKey] || BLOCKS[0];
    return byKey.get(idOrKey) || null;
  },
  id(key) {
    const b = byKey.get(key);
    if (!b) throw new Error('Bloque desconocido: ' + key);
    return b.id;
  },
  all() { return BLOCKS.filter(Boolean); },
};

/** Tablas planas para acceso rápido en bucles calientes (mesher, físicas, luz). */
export const B_SOLID = new Uint8Array(256);
export const B_OPAQUE = new Uint8Array(256);
export const B_ATTEN = new Uint8Array(256);
export const B_LIGHT = new Uint8Array(256);
export const B_HEIGHT = new Float32Array(256);
export const B_FLUID = new Uint8Array(256); // 0 no, 1 agua, 2 lava
export const B_SHAPE = new Uint8Array(256); // 0 none,1 cube,2 cross,3 fluid,4 torch,5 slab,6 farmland
export const B_REPLACEABLE = new Uint8Array(256);
export const B_TARGET = new Uint8Array(256);
export const B_TRANS = new Uint8Array(256);   // se dibuja en la pasada translúcida (agua, hielo, vidrio)
export const B_CULLGRP = new Uint16Array(256); // bloques con el mismo grupo ocultan sus caras entre sí
export const B_SOUND = new Array(256).fill('stone');
export const SHAPE_ID = { none: 0, cube: 1, cross: 2, fluid: 3, torch: 4, slab: 5, farmland: 6 };
for (const b of BLOCKS) {
  if (!b) continue;
  B_SOLID[b.id] = b.solid ? 1 : 0;
  B_OPAQUE[b.id] = b.opaque ? 1 : 0;
  B_ATTEN[b.id] = b.atten;
  B_LIGHT[b.id] = b.light;
  B_HEIGHT[b.id] = b.height;
  B_FLUID[b.id] = b.fluid === 'water' ? 1 : b.fluid === 'lava' ? 2 : 0;
  B_SHAPE[b.id] = SHAPE_ID[b.shape] ?? 1;
  B_REPLACEABLE[b.id] = b.replaceable ? 1 : 0;
  B_TARGET[b.id] = b.targetable ? 1 : 0;
  B_TRANS[b.id] = (b.fluid === 'water' || b.key === 'ice' || b.key === 'glass') ? 1 : 0;
  B_CULLGRP[b.id] = b.group === 'leaves' ? 1000 : b.id;
  B_SOUND[b.id] = b.sound;
}
// Bloques vacíos (sin definir) se comportan como aire.
B_ATTEN[0] = 0;

// IDs usados con frecuencia
export const ID = {};
for (const b of BLOCKS) if (b) ID[b.key.toUpperCase()] = b.id;
