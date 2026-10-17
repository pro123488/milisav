// Registro de bloques basado en datos. Sin dependencias del DOM (se puede probar en Node).
// Los IDs son PERSISTENTES (se guardan en los mundos): nunca reutilices ni reordenes, solo añade al final.
// Desde la Fase 2 los chunks guardan IDs de 16 bits (hasta MAX_BLOCKS). Cada ESTADO de un bloque con
// orientación o nivel (escaleras, puertas, fluidos...) es un ID propio dentro de una "familia".
//
// Rangos reservados: 0-100 Fase 1 · 101-299 Fase 2 (construcción, fluidos, cultivos) · 300-499 Fase 3 (aldeas)
// · 500-699 Fase 4 (jefes) · 700-899 Fase 5 (Dimensión Oscura) · 900-1299 Fase 6 (maquinaria y transporte).
//
// Orden de caras en todo el motor: 0:+X 1:-X 2:+Y(arriba) 3:-Y(abajo) 4:+Z 5:-Z
// Orientación horizontal (facing): 0 = Norte (−Z), 1 = Este (+X), 2 = Sur (+Z), 3 = Oeste (−X).

/** @typedef {{id:number,key:string,name:string,tiles:string[],hardness:number,tool:?string,harvest:number,
 *  solid:boolean,opaque:boolean,cull:boolean,shape:string,height:number,light:number,atten:number,drops:any,
 *  sound:string,placeable:boolean,replaceable:boolean,fluid:?string,interact:?string,plantOn:?string,
 *  soil:boolean,gravity:boolean,randomTick:boolean,targetable:boolean,unbreakable:boolean,tint:number}} Block */

export const TOOL_TYPES = ['pickaxe', 'axe', 'shovel', 'hoe', 'sword'];

/** @type {Block[]} */
export const MAX_BLOCKS = 4096;
export const BLOCKS = new Array(MAX_BLOCKS).fill(null);
const byKey = new Map();

function def(id, key, name, o = {}) {
  if (!(id >= 0 && id < MAX_BLOCKS)) throw new Error('ID de bloque fuera de rango: ' + id + ' ' + key);
  if (BLOCKS[id]) throw new Error('ID de bloque duplicado: ' + id + ' ' + key);
  if (byKey.has(key)) throw new Error('Clave de bloque duplicada: ' + key);
  let tiles = o.tiles ?? key;
  if (typeof tiles === 'string') tiles = [tiles, tiles, tiles, tiles, tiles, tiles];
  else if (!Array.isArray(tiles)) {
    const side = tiles.side ?? key, top = tiles.top ?? side, bottom = tiles.bottom ?? side;
    tiles = [tiles.east ?? side, tiles.west ?? side, top, bottom, tiles.south ?? side, tiles.north ?? side];
  }
  const shape = o.shape ?? 'cube';
  const solid = o.solid ?? (shape === 'cube' || shape === 'slab' || shape === 'farmland' || shape === 'box');
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
    // ── Fase 2: formas de cajas, orientación y estados ──
    family: o.family ?? null,         // stairs | ladder | door | fence | wall | gate | trapdoor (ver shapes.js)
    famBase: o.famBase ?? id,         // ID de la variante base de la familia
    facing: o.facing ?? 0,            // 0 N, 1 E, 2 S, 3 O
    top: o.top ?? 0,                  // escalera/trampilla en la mitad superior
    open: o.open ?? 0,                // puerta/trampilla/puerta de valla abierta
    upper: o.upper ?? 0,              // mitad superior de una puerta
    level: o.level ?? 0,              // fluidos: 0 fuente, 1..7 corriente, 8 cayendo
    climbable: o.climbable ?? false,  // escaleras de mano
    pick: o.pick ?? null,             // objeto que da "copiar bloque" (clic central) si no es el propio bloque
    // ── Fase 3 ──
    boxes: o.boxes ?? null,           // modelo propio (family 'custom'): cajas en 1/16 orientadas al Norte
    colBoxes: o.colBoxes ?? null,     // cajas de colisión del modelo propio (si difieren)
    oriented: o.oriented ?? false,    // el modelo propio se gira según facing
    container: o.container ?? 0,      // huecos de contenedor (cofre, barril)
    // ── Fase 4 ──
    boss: o.boss ?? null,             // altares: jefe que despierta su ofrenda
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
def(50, 'chest', 'Cofre', { tiles: { top: 'chest_top', side: 'chest_side', south: 'chest_front', bottom: 'chest_top' }, hardness: 2.5, tool: AXE, sound: 'wood', interact: 'chest', container: 27 });
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
def(67, 'bookshelf', 'Librería', { tiles: { side: 'bookshelf', top: 'planks', bottom: 'planks' }, hardness: 1.5, tool: AXE, sound: 'wood', drops: { item: 'book', min: 1, max: 3 } }); // (Fase 3; antes reservado)

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
plant(82, 'tall_grass', 'Hierba alta', { drops: [{ item: 'seed_wheat', chance: 0.12 }, { item: 'carrot', chance: 0.015 }, { item: 'potato', chance: 0.015 }, { item: 'tomato', chance: 0.012 }, { item: 'corn', chance: 0.012 }] });
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

// ══════════════════════ FASE 2: construcción avanzada y mundo vivo ══════════════════════
const DIR_SUFFIX = ['n', 'e', 's', 'o'];
const copyOf = (key) => { const b = byKey.get(key); return { tiles: b.tiles.slice(), hardness: b.hardness, tool: b.tool, harvest: b.harvest, sound: b.sound }; };

// Escaleras de bloque: 5 materiales × 4 orientaciones × (normal | invertida). ID = base + facing + 4·top.
// La parte alta queda hacia `facing` (lejos del jugador que la coloca).
export const STAIRS = [
  ['planks', 'Escalera de tablones', 101], ['cobble', 'Escalera de adoquín', 109], ['stonebricks', 'Escalera de piedra tallada', 117],
  ['bricks', 'Escalera de ladrillo', 125], ['sandstone', 'Escalera de arenisca', 133],
];
for (const [mat, name, base] of STAIRS) {
  const baseKey = `stairs_${mat}`;
  for (let top = 0; top < 2; top++) for (let f = 0; f < 4; f++) {
    const id = base + f + 4 * top;
    def(id, id === base ? baseKey : `${baseKey}_${DIR_SUFFIX[f]}${top ? '_inv' : ''}`, id === base ? name : `${name} (${DIR_SUFFIX[f].toUpperCase()}${top ? ', invertida' : ''})`, {
      ...copyOf(mat), shape: 'box', family: 'stairs', famBase: base, facing: f, top, atten: 15, // dan sombra (techos)
      placeable: id === base, drops: baseKey, pick: baseKey,
    });
  }
}

// Escalera de mano: facing = lado donde está el muro que la sujeta.
for (let f = 0; f < 4; f++) {
  def(141 + f, f === 0 ? 'ladder' : `ladder_${DIR_SUFFIX[f]}`, f === 0 ? 'Escalera de mano' : `Escalera de mano (${DIR_SUFFIX[f].toUpperCase()})`, {
    tiles: 'ladder', shape: 'box', family: 'ladder', famBase: 141, facing: f, hardness: 0.4, tool: AXE, sound: 'wood',
    climbable: true, plantOn: 'wall', placeable: f === 0, drops: 'ladder', pick: 'ladder',
  });
}

// Puertas (2 bloques de alto). ID = base + facing + 4·abierta + 8·mitad superior.
// facing = lado de la celda donde queda la hoja cerrada. El objeto que las coloca es door_wood / door_iron.
for (const [kind, name, base, o] of [
  ['wood', 'Puerta de madera', 145, { hardness: 3, tool: AXE, sound: 'wood' }],
  ['iron', 'Puerta de hierro', 161, { hardness: 5, tool: PICK, harvest: 1, sound: 'metal' }],
]) {
  for (let upper = 0; upper < 2; upper++) for (let open = 0; open < 2; open++) for (let f = 0; f < 4; f++) {
    const id = base + f + 4 * open + 8 * upper;
    def(id, `door_${kind}_${DIR_SUFFIX[f]}${open ? '_abierta' : ''}${upper ? '_sup' : ''}`, `${name}${upper ? ' (mitad superior)' : ''}`, {
      ...o, tiles: `door_${kind}_${upper ? 'upper' : 'lower'}`, shape: 'box', family: 'door', famBase: base, facing: f, open, upper,
      interact: 'door', plantOn: upper ? 'door_upper' : 'door_lower', placeable: false, drops: upper ? null : `door_${kind}`, pick: `door_${kind}`,
    });
  }
}

// Vallas y muros (las conexiones con los vecinos se calculan al mallar y en la física).
def(177, 'fence_wood', 'Valla de madera', { ...copyOf('planks'), shape: 'box', family: 'fence' });
def(178, 'wall_cobble', 'Muro de adoquín', { ...copyOf('cobble'), shape: 'box', family: 'wall' });

// Puerta de valla. ID = base + facing + 4·abierta (facing: hacia dónde se abren las hojas).
for (let open = 0; open < 2; open++) for (let f = 0; f < 4; f++) {
  const id = 179 + f + 4 * open;
  def(id, id === 179 ? 'gate_wood' : `gate_wood_${DIR_SUFFIX[f]}${open ? '_abierta' : ''}`, 'Puerta de valla', {
    ...copyOf('planks'), shape: 'box', family: 'gate', famBase: 179, facing: f, open, interact: 'gate',
    placeable: id === 179, drops: 'gate_wood', pick: 'gate_wood', solid: !open,
  });
}

// Trampilla de madera. ID = base + facing + 4·abierta + 8·arriba (facing: lado de la bisagra).
for (let top = 0; top < 2; top++) for (let open = 0; open < 2; open++) for (let f = 0; f < 4; f++) {
  const id = 187 + f + 4 * open + 8 * top;
  def(id, id === 187 ? 'trapdoor_wood' : `trapdoor_wood_${DIR_SUFFIX[f]}${open ? '_abierta' : ''}${top ? '_arriba' : ''}`, 'Trampilla de madera', {
    tiles: 'trapdoor_wood', hardness: 3, tool: AXE, sound: 'wood', shape: 'box', family: 'trapdoor', famBase: 187, facing: f, open, top,
    interact: 'trapdoor', placeable: id === 187, drops: 'trapdoor_wood', pick: 'trapdoor_wood',
  });
}

// Fluidos que fluyen: nivel 1..7 (agua) o 1..3 (lava) = distancia a la fuente; 8 = cayendo.
const fluidBase = (fluid) => ({
  shape: 'fluid', fluid, solid: false, opaque: false, cull: true, atten: 1, hardness: 1000, drops: null, placeable: false,
  replaceable: true, targetable: false, sound: 'water', tiles: fluid, light: fluid === 'lava' ? 15 : 0,
});
for (let L = 1; L <= 7; L++) def(202 + L, `water_flow_${L}`, 'Agua (corriente)', { ...fluidBase('water'), level: L });
def(210, 'water_fall', 'Agua (cascada)', { ...fluidBase('water'), level: 8 });
for (let L = 1; L <= 3; L++) def(210 + L, `lava_flow_${L}`, 'Lava (corriente)', { ...fluidBase('lava'), level: L });
def(214, 'lava_fall', 'Lava (cascada)', { ...fluidBase('lava'), level: 8 });

// Nuevos cultivos (4 etapas): tomate y maíz.
for (const [k, name, base, harvest] of [['tomato', 'Tomatera', 215, 'tomato'], ['corn', 'Maíz', 219, 'corn']]) {
  for (let s = 0; s < 4; s++) {
    const key = `crop_${k}_${s}`, ripe = s === 3;
    def(base + s, key, `${name} (etapa ${s + 1}/4)`, {
      shape: 'cross', tiles: key, solid: false, opaque: false, atten: 0, hardness: 0, sound: 'plant', placeable: false,
      plantOn: 'farmland', drops: ripe ? { item: harvest, min: 2, max: 4 } : harvest, randomTick: !ripe, stage: s,
      next: ripe ? null : `crop_${k}_${s + 1}`, group: 'crop', pick: harvest,
    });
  }
}

// ══════════════════════ FASE 3: aldeas y comercio ══════════════════════
def(300, 'path', 'Camino de tierra', { tiles: { top: 'path_top', side: 'path_side', bottom: 'dirt' }, shape: 'farmland', height: 0.9375, opaque: false, atten: 0, hardness: 0.6, tool: SHOVEL, drops: 'dirt', sound: 'dirt' });
def(301, 'hay_bale', 'Paca de heno', { tiles: { top: 'hay_top', side: 'hay_side' }, hardness: 0.5, sound: 'plant' });
def(302, 'barrel', 'Barril', { tiles: { top: 'barrel_top', side: 'barrel_side', bottom: 'barrel_bottom' }, hardness: 2.5, tool: AXE, sound: 'wood', interact: 'chest', container: 27 });
// Modelos propios (cajas en 1/16, orientadas al Norte)
const custom = (o) => ({ shape: 'box', family: 'custom', opaque: false, atten: 0, ...o });
for (let f = 0; f < 4; f++) {
  def(303 + f, f ? `anvil_${DIR_SUFFIX[f]}` : 'anvil', 'Yunque', custom({
    tiles: { side: 'anvil', top: 'anvil_top' }, boxes: [[2, 0, 3, 14, 4, 13], [4, 4, 5, 12, 10, 11], [0, 10, 3, 16, 16, 13]],
    oriented: true, facing: f, famBase: 303, hardness: 5, tool: PICK, harvest: 1, sound: 'metal', interact: 'anvil',
    placeable: f === 0, drops: 'anvil', pick: 'anvil',
  }));
}
def(307, 'lantern', 'Farol', custom({ tiles: { side: 'lantern', top: 'lantern_top' }, boxes: [[5, 0, 5, 11, 7, 11], [6, 7, 6, 10, 9, 10]], light: 15, hardness: 0.6, tool: PICK, sound: 'metal', plantOn: 'any' }));
def(308, 'lantern_hanging', 'Farol colgante', custom({ tiles: { side: 'lantern', top: 'lantern_top' }, boxes: [[5, 1, 5, 11, 8, 11], [6, 8, 6, 10, 10, 10], [7, 10, 7, 9, 16, 9]], light: 15, hardness: 0.6, tool: PICK, sound: 'metal', plantOn: 'hang', placeable: false, drops: 'lantern', pick: 'lantern' }));
def(309, 'compost_bin', 'Compostador', custom({ tiles: { side: 'compost_side', top: 'compost_top', bottom: 'planks' }, boxes: [[0, 0, 0, 16, 16, 2], [0, 0, 14, 16, 16, 16], [0, 0, 2, 2, 16, 14], [14, 0, 2, 16, 16, 14], [2, 0, 2, 14, 3, 14]], colBoxes: [[0, 0, 0, 16, 16, 16]], hardness: 0.6, tool: AXE, sound: 'wood', interact: 'compost' }));
for (let f = 0; f < 4; f++) {
  def(310 + f, f ? `lectern_${DIR_SUFFIX[f]}` : 'lectern', 'Atril', custom({
    tiles: { side: 'lectern_side', top: 'lectern_top', bottom: 'planks' }, boxes: [[0, 0, 0, 16, 2, 16], [5, 2, 5, 11, 12, 11], [1, 12, 2, 15, 15, 14]],
    oriented: true, facing: f, famBase: 310, hardness: 2.5, tool: AXE, sound: 'wood', interact: 'lectern', placeable: f === 0, drops: 'lectern', pick: 'lectern',
  }));
}
def(314, 'loom', 'Telar', { tiles: { top: 'loom_top', side: 'loom_side', south: 'loom_front', bottom: 'planks' }, hardness: 2.5, tool: AXE, sound: 'wood' });
def(315, 'alchemy_table', 'Mesa de alquimia', custom({
  tiles: { side: 'alchemy_side', top: 'alchemy_top', bottom: 'cobble' }, light: 6,
  boxes: [[0, 10, 0, 16, 14, 16], [1, 0, 1, 4, 10, 4], [12, 0, 1, 15, 10, 4], [1, 0, 12, 4, 10, 15], [12, 0, 12, 15, 10, 15], [6, 14, 6, 10, 16, 10]],
  colBoxes: [[0, 0, 0, 16, 14, 16]], hardness: 2.5, tool: PICK, harvest: 1, sound: 'stone', interact: 'alchemy', container: 4,
}));
def(316, 'bell', 'Campana', custom({ tiles: { side: 'bell', top: 'bell_top', bottom: 'bell_top' }, boxes: [[7, 0, 7, 9, 3, 9], [5, 3, 5, 11, 11, 11], [6, 11, 6, 10, 13, 10]], hardness: 3, tool: PICK, sound: 'metal', interact: 'bell' }));
def(317, 'plaster', 'Yeso blanco', { hardness: 1.2, tool: PICK, harvest: 1, sound: 'stone' });

// ══════════════════════ FASE 4: jefes ══════════════════════
// Altares de invocación (indestructibles en supervivencia para que las arenas no se pierdan).
const altar = (id, key, name, boss, top, side, light) => def(id, key, name, custom({
  tiles: { side, top, bottom: side }, boxes: [[1, 0, 1, 15, 4, 15], [3, 4, 3, 13, 11, 13], [2, 11, 2, 14, 14, 14]], colBoxes: [[0, 0, 0, 16, 14, 16]],
  light, hardness: 60, tool: PICK, harvest: 4, unbreakable: true, sound: 'stone', interact: 'altar', boss, drops: null,
}));
altar(500, 'altar_forest', 'Altar del bosque', 'forest_guardian', 'altar_forest_top', 'altar_forest_side', 7);
altar(501, 'altar_crystal', 'Altar de cristal', 'crystal_colossus', 'altar_crystal_top', 'altar_crystal_side', 10);
altar(502, 'altar_tide', 'Altar de las mareas', 'deep_queen', 'altar_tide_top', 'altar_tide_side', 9);
altar(503, 'altar_ember', 'Altar de brasas', 'volcanic_titan', 'altar_ember_top', 'altar_ember_side', 11);
// Bloques de las arenas
def(504, 'ancient_bark', 'Corteza ancestral', { tiles: { top: 'ancient_bark_top', side: 'ancient_bark' }, hardness: 3, tool: AXE, sound: 'wood', group: 'log' });
def(505, 'geode', 'Bloque de geoda', { hardness: 4, tool: PICK, harvest: 2, sound: 'glass' });
def(506, 'sea_stone', 'Piedra marina', { hardness: 1.8, tool: PICK, harvest: 1, sound: 'stone' });
def(507, 'sea_lantern', 'Farol marino', { hardness: 0.6, light: 15, sound: 'glass' });
def(508, 'magma_brick', 'Ladrillo de magma', { hardness: 2.5, tool: PICK, harvest: 1, light: 6, sound: 'stone' });
def(509, 'runestone', 'Piedra rúnica', { hardness: 2.2, tool: PICK, harvest: 1, light: 3, sound: 'stone' });

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
export const B_SOLID = new Uint8Array(MAX_BLOCKS);
export const B_OPAQUE = new Uint8Array(MAX_BLOCKS);
export const B_ATTEN = new Uint8Array(MAX_BLOCKS);
export const B_LIGHT = new Uint8Array(MAX_BLOCKS);
export const B_HEIGHT = new Float32Array(MAX_BLOCKS);
export const B_FLUID = new Uint8Array(MAX_BLOCKS); // 0 no, 1 agua, 2 lava
export const B_FLUIDLVL = new Uint8Array(MAX_BLOCKS); // 0 fuente, 1..7 corriente, 8 cayendo
export const B_SHAPE = new Uint8Array(MAX_BLOCKS); // ver SHAPE_ID
export const B_REPLACEABLE = new Uint8Array(MAX_BLOCKS);
export const B_TARGET = new Uint8Array(MAX_BLOCKS);
export const B_TRANS = new Uint8Array(MAX_BLOCKS);   // se dibuja en la pasada translúcida (agua, hielo, vidrio)
export const B_CULLGRP = new Uint16Array(MAX_BLOCKS); // bloques con el mismo grupo ocultan sus caras entre sí
/** Grupo de ocultación de las hojas: fuera del rango de IDs para que nunca coincida con un bloque real. */
export const LEAVES_GRP = MAX_BLOCKS;
export const B_CLIMB = new Uint8Array(MAX_BLOCKS);   // trepable (escalera de mano)
export const B_SOUND = new Array(MAX_BLOCKS).fill('stone');
export const SHAPE_ID = { none: 0, cube: 1, cross: 2, fluid: 3, torch: 4, slab: 5, farmland: 6, box: 7 };
for (const b of BLOCKS) {
  if (!b) continue;
  B_SOLID[b.id] = b.solid ? 1 : 0;
  B_OPAQUE[b.id] = b.opaque ? 1 : 0;
  B_ATTEN[b.id] = b.atten;
  B_LIGHT[b.id] = b.light;
  B_HEIGHT[b.id] = b.height;
  B_FLUID[b.id] = b.fluid === 'water' ? 1 : b.fluid === 'lava' ? 2 : 0;
  B_FLUIDLVL[b.id] = b.level;
  B_CLIMB[b.id] = b.climbable ? 1 : 0;
  B_SHAPE[b.id] = SHAPE_ID[b.shape] ?? 1;
  B_REPLACEABLE[b.id] = b.replaceable ? 1 : 0;
  B_TARGET[b.id] = b.targetable ? 1 : 0;
  B_TRANS[b.id] = (b.fluid === 'water' || b.key === 'ice' || b.key === 'glass') ? 1 : 0;
  B_CULLGRP[b.id] = b.group === 'leaves' ? LEAVES_GRP : b.id;
  B_SOUND[b.id] = b.sound;
}
// Bloques vacíos (sin definir) se comportan como aire.
B_ATTEN[0] = 0;

// IDs usados con frecuencia
export const ID = {};
for (const b of BLOCKS) if (b) ID[b.key.toUpperCase()] = b.id;
