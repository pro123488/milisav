// Definición de biomas: apariencia, flora, recursos y criaturas. Datos puros.
// IDs persistentes (se usan en el generador y en el HUD).

export const BIOME = {
  OCEAN: 0, COAST: 1, PLAINS: 2, FOREST: 3, DARK_FOREST: 4, DESERT: 5, MESA: 6,
  MOUNTAINS: 7, SNOW: 8, JUNGLE: 9, SWAMP: 10, VOLCANIC: 11,
};

/**
 * top/filler: bloques de superficie y subsuelo. trees: tipos de árbol con peso.
 * treeDensity: probabilidad aprox. de árbol por columna. flora: [bloque, probabilidad por columna].
 * animals/monsters: pesos de aparición en superficie.
 * sky: tinte de niebla de día (el cielo cambia con la hora, esto lo modula suavemente).
 */
export const BIOMES = [
  {
    id: BIOME.OCEAN, key: 'ocean', name: 'Océano', color: '#1d4f9c',
    top: 'sand', filler: 'sand', fillerDepth: 3, trees: [], treeDensity: 0, flora: [],
    animals: {}, monsters: {}, fog: [0.62, 0.78, 0.95],
    desc: 'Aguas profundas con fondos de arena, grava y arcilla.',
  },
  {
    id: BIOME.COAST, key: 'coast', name: 'Costa', color: '#e2d49a',
    top: 'sand', filler: 'sand', fillerDepth: 3, trees: [], treeDensity: 0,
    flora: [['dead_bush', 0.002]],
    animals: { river_turtle: 4, mountain_bird: 2 }, monsters: { night_stalker: 6 }, fog: [0.7, 0.82, 0.95],
    desc: 'Playas de arena, tortugas y aguas poco profundas.',
  },
  {
    id: BIOME.PLAINS, key: 'plains', name: 'Llanura', color: '#8bc34a',
    top: 'grass', filler: 'dirt', fillerDepth: 3, trees: [['oak', 1]], treeDensity: 0.004,
    flora: [['tall_grass', 0.22], ['flower_red', 0.012], ['flower_yellow', 0.014], ['flower_blue', 0.006], ['flower_pink', 0.008], ['berry_bush', 0.0015]],
    animals: { prairie_bovid: 10, forest_boar: 3, mist_deer: 2, mountain_bird: 1 }, monsters: { night_stalker: 10 }, fog: [0.66, 0.8, 0.96],
    desc: 'Terreno abierto y fértil, ideal para granjas.',
  },
  {
    id: BIOME.FOREST, key: 'forest', name: 'Bosque templado', color: '#4f9d3a',
    top: 'grass', filler: 'dirt', fillerDepth: 4, trees: [['oak', 1]], treeDensity: 0.055,
    flora: [['tall_grass', 0.12], ['fern', 0.03], ['flower_red', 0.006], ['flower_yellow', 0.006], ['flower_blue', 0.004], ['mushroom_dark', 0.002], ['berry_bush', 0.003]],
    animals: { forest_boar: 8, prairie_bovid: 3, mist_deer: 4, crystal_fox: 0.4 }, monsters: { night_stalker: 12 }, fog: [0.64, 0.8, 0.95],
    desc: 'Robles frondosos, caza y bayas.',
  },
  {
    id: BIOME.DARK_FOREST, key: 'dark_forest', name: 'Bosque oscuro', color: '#2e5d2a',
    top: 'grass_lush', filler: 'dirt', fillerDepth: 4, trees: [['dark', 1]], treeDensity: 0.085,
    flora: [['fern', 0.05], ['tall_grass', 0.06], ['mushroom_dark', 0.012], ['mushroom_glow', 0.004], ['flower_moon', 0.004]],
    animals: { mist_deer: 6, forest_boar: 3, crystal_fox: 1 }, monsters: { night_stalker: 16, ruin_guardian: 0 }, fog: [0.5, 0.64, 0.7],
    desc: 'Árboles enormes, poca luz y ruinas ocultas.',
  },
  {
    id: BIOME.DESERT, key: 'desert', name: 'Desierto', color: '#e8c872',
    top: 'sand', filler: 'sandstone', fillerDepth: 4, trees: [['cactus', 1]], treeDensity: 0.006,
    flora: [['dead_bush', 0.01]],
    animals: { crystal_fox: 0.2 }, monsters: { sand_devourer: 9, night_stalker: 4 }, fog: [0.85, 0.82, 0.7],
    desc: 'Dunas, cactos, escasez de agua y templos enterrados.',
  },
  {
    id: BIOME.MESA, key: 'mesa', name: 'Mesetas áridas', color: '#c4693a',
    top: 'red_sand', filler: 'red_sandstone', fillerDepth: 5, trees: [['cactus', 1]], treeDensity: 0.002,
    flora: [['dead_bush', 0.012]],
    animals: {}, monsters: { sand_devourer: 7, night_stalker: 4 }, fog: [0.86, 0.76, 0.66],
    desc: 'Mesetas escalonadas y barrancos de arenisca roja.',
  },
  {
    id: BIOME.MOUNTAINS, key: 'mountains', name: 'Montañas', color: '#8a8f99',
    top: 'stone', filler: 'stone', fillerDepth: 1, trees: [['pine', 1]], treeDensity: 0.012,
    flora: [['fern', 0.01], ['flower_blue', 0.002]],
    animals: { mountain_bird: 8, mist_deer: 2, crystal_fox: 1 }, monsters: { night_stalker: 8 }, fog: [0.7, 0.8, 0.92],
    desc: 'Picos, pendientes, minerales a la vista y cuevas.',
  },
  {
    id: BIOME.SNOW, key: 'snow', name: 'Región nevada', color: '#e8f1f8',
    top: 'grass_snow', filler: 'dirt', fillerDepth: 3, trees: [['pine', 1]], treeDensity: 0.022,
    flora: [],
    animals: { crystal_fox: 4, mountain_bird: 2, mist_deer: 2 }, monsters: { night_stalker: 9 }, fog: [0.8, 0.88, 0.96],
    desc: 'Nieve, hielo, lagos congelados y pinos.',
  },
  {
    id: BIOME.JUNGLE, key: 'jungle', name: 'Jungla', color: '#1f8f3a',
    top: 'grass_lush', filler: 'dirt', fillerDepth: 4, trees: [['jungle', 1]], treeDensity: 0.07,
    flora: [['tall_grass', 0.2], ['fern', 0.07], ['flower_yellow', 0.01], ['flower_pink', 0.01], ['berry_bush', 0.01], ['mushroom_dark', 0.002]],
    animals: { forest_boar: 6, mountain_bird: 5, river_turtle: 3 }, monsters: { night_stalker: 12 }, fog: [0.55, 0.78, 0.7],
    desc: 'Árboles altísimos, frutos y ruinas cubiertas de musgo.',
  },
  {
    id: BIOME.SWAMP, key: 'swamp', name: 'Pantano', color: '#4d6b3c',
    top: 'grass_swamp', filler: 'mud', fillerDepth: 3, trees: [['swamp', 1]], treeDensity: 0.03,
    flora: [['reed', 0.05], ['tall_grass', 0.08], ['mushroom_dark', 0.01], ['flower_blue', 0.004]],
    animals: { river_turtle: 6, forest_boar: 2 }, monsters: { mud_golem: 6, night_stalker: 8 }, fog: [0.5, 0.6, 0.5],
    desc: 'Agua poco profunda, barro y criaturas del lodo.',
  },
  {
    id: BIOME.VOLCANIC, key: 'volcanic', name: 'Región volcánica', color: '#3a2a2a',
    top: 'basalt', filler: 'basalt', fillerDepth: 4, trees: [['dead', 1]], treeDensity: 0.002,
    flora: [],
    animals: {}, monsters: { volcano_beast: 5, obsidian_skeleton: 6 }, fog: [0.55, 0.42, 0.38],
    desc: 'Roca oscura, lagos de lava y minerales raros.',
  },
];

export const BIOME_BY_ID = new Array(BIOMES.length);
for (const b of BIOMES) BIOME_BY_ID[b.id] = b;
export const biomeName = (id) => (BIOME_BY_ID[id] ? BIOME_BY_ID[id].name : '?');
