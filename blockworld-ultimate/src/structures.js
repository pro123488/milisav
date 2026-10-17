// Estructuras generadas (ruinas, templos, mazmorras) y tablas de botín.
// Cada estructura cabe dentro de UN solo chunk, así que no hay problemas de costuras entre chunks.
// Las estructuras tienen sus propios diseños originales.
import { CHUNK_SIZE as CS, WORLD_HEIGHT as WH, SEA_LEVEL as SEA } from './config.js';
import { ID } from './blocks.js';
import { hash2, hash3, mulberry32 } from './noise.js';
import { BIOME } from './biomes.js';
import { chunkInVillage } from './villages.js';
import { chunkInShrine } from './shrines.js';

const REGION = 5; // chunks por región; como mucho una estructura de superficie por región

export const LOOT = {
  hut: [
    { item: 'bread', min: 1, max: 3, w: 6 }, { item: 'stick', min: 2, max: 8, w: 8 }, { item: 'coal', min: 2, max: 6, w: 6 },
    { item: 'seed_wheat', min: 2, max: 6, w: 5 }, { item: 'carrot', min: 1, max: 4, w: 4 }, { item: 'stone_pickaxe', min: 1, max: 1, w: 2 },
    { item: 'leather', min: 1, max: 3, w: 3 }, { item: 'torch', min: 3, max: 8, w: 5 }, { item: 'bucket', min: 1, max: 1, w: 1 },
    { item: 'tomato', min: 1, max: 3, w: 3 }, { item: 'corn', min: 1, max: 3, w: 3 }, { item: 'rope', min: 1, max: 2, w: 2 },
  ],
  ruin: [
    { item: 'iron_ingot', min: 1, max: 4, w: 6 }, { item: 'gold_ingot', min: 1, max: 3, w: 4 }, { item: 'coal', min: 3, max: 9, w: 6 },
    { item: 'crystal_shard', min: 1, max: 3, w: 3 }, { item: 'cooked_pork', min: 2, max: 5, w: 5 }, { item: 'copper_axe', min: 1, max: 1, w: 2 },
    { item: 'iron_sword', min: 1, max: 1, w: 1.5 }, { item: 'leather_chestplate', min: 1, max: 1, w: 2 }, { item: 'copper_helmet', min: 1, max: 1, w: 2 },
    { item: 'bucket', min: 1, max: 1, w: 2 }, { item: 'torch', min: 4, max: 12, w: 6 },
  ],
  temple: [
    { item: 'gold_ingot', min: 2, max: 6, w: 7 }, { item: 'iron_ingot', min: 2, max: 6, w: 6 }, { item: 'crystal_shard', min: 2, max: 5, w: 5 },
    { item: 'raw_noctisite', min: 1, max: 2, w: 1.2 }, { item: 'iron_chestplate', min: 1, max: 1, w: 1.5 }, { item: 'gold_pickaxe', min: 1, max: 1, w: 2 },
    { item: 'cooked_beef', min: 3, max: 6, w: 4 }, { item: 'crystal_lamp', min: 1, max: 2, w: 2 }, { item: 'iron_helmet', min: 1, max: 1, w: 1.5 },
  ],
  village: [
    { item: 'bread', min: 1, max: 4, w: 6 }, { item: 'sun_coin', min: 1, max: 4, w: 5 }, { item: 'wheat', min: 2, max: 7, w: 5 },
    { item: 'apple', min: 1, max: 3, w: 4 }, { item: 'tomato', min: 1, max: 4, w: 3 }, { item: 'corn', min: 1, max: 4, w: 3 },
    { item: 'paper', min: 1, max: 4, w: 2 }, { item: 'torch', min: 2, max: 6, w: 4 }, { item: 'rope', min: 1, max: 2, w: 2 },
  ],
  smithy: [
    { item: 'iron_ingot', min: 1, max: 5, w: 7 }, { item: 'coal', min: 2, max: 8, w: 6 }, { item: 'sun_coin', min: 1, max: 3, w: 4 },
    { item: 'iron_pickaxe', min: 1, max: 1, w: 2 }, { item: 'iron_sword', min: 1, max: 1, w: 1.5 }, { item: 'iron_helmet', min: 1, max: 1, w: 1.5 },
    { item: 'gold_ingot', min: 1, max: 2, w: 2 }, { item: 'bread', min: 1, max: 3, w: 3 },
  ],
  dungeon: [
    { item: 'iron_ingot', min: 1, max: 5, w: 6 }, { item: 'copper_ingot', min: 2, max: 7, w: 6 }, { item: 'gold_ingot', min: 1, max: 3, w: 3 },
    { item: 'crystal_shard', min: 1, max: 4, w: 3 }, { item: 'iron_pickaxe', min: 1, max: 1, w: 1.5 }, { item: 'iron_boots', min: 1, max: 1, w: 1.5 },
    { item: 'cooked_venison', min: 2, max: 4, w: 4 }, { item: 'bucket', min: 1, max: 1, w: 1 }, { item: 'noctisite_ingot', min: 1, max: 1, w: 0.4 },
  ],
};

/** Genera el contenido de un cofre: lista de {item, n} (determinista según rng). */
export function rollLoot(table, rng, rolls = 5) {
  const entries = LOOT[table] || LOOT.ruin;
  const total = entries.reduce((s, e) => s + e.w, 0);
  const out = [];
  for (let r = 0; r < rolls; r++) {
    let t = rng() * total;
    for (const e of entries) {
      t -= e.w;
      if (t <= 0) {
        out.push({ item: e.item, n: e.min + Math.floor(rng() * (e.max - e.min + 1)) });
        break;
      }
    }
  }
  return out;
}

class Stamp {
  constructor(blocks, cx, cz) {
    this.blocks = blocks; this.x0 = cx * CS; this.z0 = cz * CS;
    this.chests = []; this.mobs = [];
  }
  set(wx, y, wz, id) {
    const lx = wx - this.x0, lz = wz - this.z0;
    if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || y < 1 || y >= WH) return;
    this.blocks[lx + (lz << 4) + (y << 8)] = id;
  }
  get(wx, y, wz) {
    const lx = wx - this.x0, lz = wz - this.z0;
    if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || y < 0 || y >= WH) return 0;
    return this.blocks[lx + (lz << 4) + (y << 8)];
  }
  fill(x1, y1, z1, x2, y2, z2, id) {
    for (let y = y1; y <= y2; y++) for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) this.set(x, y, z, id);
  }
  chest(x, y, z, table) { this.set(x, y, z, ID.CHEST); this.chests.push({ x, y, z, table }); }
  mob(type, x, y, z) { this.mobs.push({ type, x: x + 0.5, y, z: z + 0.5 }); }
}

/** Zona libre de árboles/flora generada (en coords del mundo): se rellena al generar. */
export function structureFootprints(terrain, cx, cz) {
  const s = planFor(terrain, cx, cz);
  return s ? [s.foot] : [];
}

/** Decide si el chunk (cx,cz) contiene una estructura y de qué tipo. Determinista. */
function planFor(terrain, cx, cz) {
  if (!terrain.structures) return null;
  if (chunkInShrine(terrain, cx, cz)) return null; // las arenas de los jefes no se mezclan con otras estructuras
  const seed = terrain.seed;
  // Estructuras subterráneas: mazmorras (independientes de la superficie)
  const dg = hash2(cx, cz, seed + 9001);
  if (dg < 0.035) {
    const ox = cx * CS + 4, oz = cz * CS + 4;
    const oy = 12 + Math.floor(hash2(cx, cz, seed + 9002) * 26);
    return { type: 'dungeon', ox, oz, oy, foot: [ox - 1, oz - 1, ox + 7, oz + 7] };
  }
  // Superficie: una por región (y nunca dentro de una aldea)
  if (chunkInVillage(terrain, cx, cz)) return null;
  const rx = Math.floor(cx / REGION), rz = Math.floor(cz / REGION);
  if (hash2(rx, rz, seed + 7001) > 0.6) return null;
  const pcx = rx * REGION + 1 + Math.floor(hash2(rx, rz, seed + 7002) * (REGION - 2));
  const pcz = rz * REGION + 1 + Math.floor(hash2(rx, rz, seed + 7003) * (REGION - 2));
  if (pcx !== cx || pcz !== cz) return null;
  const ox = cx * CS + 2 + Math.floor(hash2(cx, cz, seed + 7004) * 3);
  const oz = cz * CS + 2 + Math.floor(hash2(cx, cz, seed + 7005) * 3);
  const mid = terrain.column(ox + 5, oz + 5);
  const g = Math.floor(mid.h);
  if (g <= SEA + 1) return null;
  // Terreno razonablemente plano
  let lo = 999, hi = -999;
  for (const [dx, dz] of [[0, 0], [10, 0], [0, 10], [10, 10]]) {
    const c = terrain.column(ox + dx, oz + dz);
    lo = Math.min(lo, c.h); hi = Math.max(hi, c.h);
  }
  if (hi - lo > 7) return null;
  const roll = hash2(cx, cz, seed + 7006);
  let type = null;
  switch (mid.biome) {
    case BIOME.DESERT: case BIOME.MESA: type = 'desert_temple'; break;
    case BIOME.JUNGLE: type = roll < 0.6 ? 'jungle_ruin' : 'forest_ruin'; break;
    case BIOME.DARK_FOREST: type = roll < 0.7 ? 'forest_ruin' : 'hut'; break;
    case BIOME.PLAINS: case BIOME.FOREST: type = roll < 0.75 ? 'hut' : 'forest_ruin'; break;
    case BIOME.SWAMP: type = 'hut'; break;
    case BIOME.SNOW: type = 'hut'; break;
    default: return null;
  }
  return { type, ox, oz, oy: g, foot: [ox - 1, oz - 1, ox + 11, oz + 11] };
}

const MOSS = (r) => (r < 0.35 ? ID.STONEBRICKS_MOSSY : r < 0.5 ? ID.COBBLE : ID.STONEBRICKS);

/** Coloca la estructura del chunk (si hay) en `blocks`. Devuelve {chests, mobs}. */
export function placeStructures(terrain, blocks, cx, cz) {
  const out = { chests: [], mobs: [] };
  const plan = planFor(terrain, cx, cz);
  if (!plan) return out;
  const st = new Stamp(blocks, cx, cz);
  const seed = terrain.seed;
  const r = (x, y, z) => hash3(x, y, z, seed + 31337);
  const { ox, oz, oy, type } = plan;

  const foundation = (x1, z1, x2, z2, y, id) => {
    for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) {
      for (let yy = y; yy > y - 12; yy--) {
        const b = st.get(x, yy, z);
        if (b !== 0 && b !== ID.WATER) break;
        st.set(x, yy, z, id);
      }
    }
  };

  if (type === 'hut') {
    const y0 = oy;
    foundation(ox, oz, ox + 6, oz + 6, y0 - 1, ID.COBBLE);
    st.fill(ox - 1, y0 + 1, oz - 1, ox + 7, y0 + 9, oz + 7, 0);
    st.fill(ox, y0, oz, ox + 6, y0, oz + 6, ID.PLANKS);
    for (let x = ox; x <= ox + 6; x++) for (let z = oz; z <= oz + 6; z++) {
      const edge = x === ox || x === ox + 6 || z === oz || z === oz + 6;
      if (!edge) continue;
      for (let y = y0 + 1; y <= y0 + 4; y++) {
        const corner = (x === ox || x === ox + 6) && (z === oz || z === oz + 6);
        if (!corner && r(x, y, z) < 0.13) continue; // paredes derruidas
        st.set(x, y, z, corner ? ID.LOG_OAK : ID.PLANKS);
      }
    }
    // puerta de madera (hoja en el lado sur, hacia fuera) y ventanas
    st.set(ox + 3, y0 + 1, oz + 6, ID.DOOR_WOOD_S); st.set(ox + 3, y0 + 2, oz + 6, ID.DOOR_WOOD_S_SUP);
    st.set(ox, y0 + 2, oz + 3, 0); st.set(ox + 6, y0 + 2, oz + 3, 0);
    // techo con alero de escaleras (la parte alta hacia dentro) y algunos huecos
    for (let x = ox - 1; x <= ox + 7; x++) for (let z = oz - 1; z <= oz + 7; z++) {
      if (r(x, 99, z) < 0.18) continue;
      const inner = x >= ox + 1 && x <= ox + 5 && z >= oz + 1 && z <= oz + 5;
      let id = inner ? ID.PLANKS : ID.SLAB_PLANKS;
      const ex = x === ox - 1 || x === ox + 7, ez = z === oz - 1 || z === oz + 7;
      if (ez && !ex) id = z === oz - 1 ? ID.STAIRS_PLANKS_S : ID.STAIRS_PLANKS;       // facing S / N
      else if (ex && !ez) id = x === ox - 1 ? ID.STAIRS_PLANKS_E : ID.STAIRS_PLANKS_O; // facing E / O
      st.set(x, y0 + 5, z, id);
    }
    st.chest(ox + 1, y0 + 1, oz + 1, 'hut');
    st.set(ox + 5, y0 + 1, oz + 1, ID.WORKBENCH);
    st.set(ox + 5, y0 + 1, oz + 5, ID.TORCH);
  } else if (type === 'forest_ruin') {
    const y0 = oy;
    foundation(ox, oz, ox + 8, oz + 8, y0, ID.STONEBRICKS_MOSSY);
    st.fill(ox - 1, y0 + 1, oz - 1, ox + 9, y0 + 9, oz + 9, 0);
    st.fill(ox, y0, oz, ox + 8, y0, oz + 8, ID.STONEBRICKS_MOSSY);
    for (let x = ox; x <= ox + 8; x++) for (let z = oz; z <= oz + 8; z++) {
      const edge = x === ox || x === ox + 8 || z === oz || z === oz + 8;
      if (edge) {
        const hgt = 1 + Math.floor(r(x, 5, z) * 4);
        const gap = (x === ox + 4 || z === oz + 4) && r(x, 6, z) < 0.8;
        if (!gap) for (let y = 1; y <= hgt; y++) st.set(x, y0 + y, z, MOSS(r(x, y, z)));
      } else if (r(x, 7, z) < 0.22) st.set(x, y0 + 1, z, MOSS(r(x, 8, z)));
    }
    for (const [px, pz] of [[ox, oz], [ox + 8, oz], [ox, oz + 8], [ox + 8, oz + 8]]) {
      const ph = 4 + Math.floor(r(px, 9, pz) * 3);
      for (let y = 1; y <= ph; y++) st.set(px, y0 + y, pz, ID.STONEBRICKS);
    }
    st.set(ox + 4, y0 + 1, oz + 4, ID.STONEBRICKS);
    st.chest(ox + 4, y0 + 2, oz + 4, 'ruin');
    st.mob('ruin_guardian', ox + 4, y0 + 1, oz + 6);
  } else if (type === 'jungle_ruin') {
    const y0 = oy;
    foundation(ox, oz, ox + 8, oz + 8, y0, ID.STONEBRICKS_MOSSY);
    st.fill(ox - 1, y0 + 1, oz - 1, ox + 9, y0 + 14, oz + 9, 0);
    const layers = [[0, 8, 4], [1, 7, 4], [2, 6, 3]];
    let y = y0;
    for (const [a, b, h] of layers) {
      for (let k = 0; k < h; k++) {
        y++;
        for (let x = ox + a; x <= ox + b; x++) for (let z = oz + a; z <= oz + b; z++) {
          const edge = x === ox + a || x === ox + b || z === oz + a || z === oz + b;
          if (edge) {
            const door = z === oz + b && x === ox + 4 && k < 2;
            const crumble = r(x, y, z) < 0.12;
            if (!door && !crumble) st.set(x, y, z, MOSS(r(x, y, z)));
          } else st.set(x, y, z, 0);
        }
      }
      // suelo del siguiente piso
      for (let x = ox + a; x <= ox + b; x++) for (let z = oz + a; z <= oz + b; z++) st.set(x, y + 1, z, ID.STONEBRICKS_MOSSY);
      y++;
    }
    st.chest(ox + 4, y0 + 6 + 1, oz + 4, 'ruin');
    st.chest(ox + 3, y0 + 1, oz + 3, 'ruin');
    st.mob('ruin_guardian', ox + 4, y0 + 1, oz + 5);
  } else if (type === 'desert_temple') {
    const g = oy;
    const bottom = g - 7;
    st.fill(ox - 1, g + 1, oz - 1, ox + 9, g + 12, oz + 9, 0);
    // Cámara enterrada 9x9: interior 7x7x4, techo de 2 bloques bajo la arena
    st.fill(ox, bottom, oz, ox + 8, g - 1, oz + 8, ID.SANDSTONE);
    st.fill(ox + 1, bottom + 1, oz + 1, ox + 7, bottom + 4, oz + 7, 0);
    for (let x = ox + 1; x <= ox + 7; x++) for (let z = oz + 1; z <= oz + 7; z++) {
      st.set(x, bottom, z, (x + z) % 2 === 0 ? ID.RED_SANDSTONE : ID.SANDSTONE);
    }
    for (const [px, pz] of [[ox + 2, oz + 2], [ox + 6, oz + 2], [ox + 2, oz + 6], [ox + 6, oz + 6]]) {
      st.fill(px, bottom + 1, pz, px, bottom + 4, pz, ID.SANDSTONE);
      st.set(px, bottom + 3, pz, ID.CRYSTAL_LAMP);
    }
    st.chest(ox + 4, bottom + 1, oz + 4, 'temple');
    st.chest(ox + 4, bottom + 1, oz + 1, 'temple');
    st.chest(ox + 1, bottom + 1, oz + 4, 'temple');
    st.chest(ox + 7, bottom + 1, oz + 4, 'temple');
    // Capa de arena superior y pozo de entrada de 1x1 con escalera de mano apoyada en una columna de arenisca
    st.fill(ox, g, oz, ox + 8, g, oz + 8, ID.SAND);
    st.fill(ox + 3, g, oz + 5, ox + 5, g, oz + 7, ID.SANDSTONE);
    st.fill(ox + 4, bottom + 1, oz + 7, ox + 4, bottom + 4, oz + 7, ID.SANDSTONE);
    st.fill(ox + 4, bottom + 1, oz + 6, ox + 4, g, oz + 6, ID.LADDER_S);
    // Obelisco visible desde lejos
    st.fill(ox + 4, g + 1, oz + 4, ox + 4, g + 5, oz + 4, ID.SANDSTONE);
    st.set(ox + 4, g + 6, oz + 4, ID.RED_SANDSTONE);
    st.set(ox + 4, g + 7, oz + 4, ID.CRYSTAL_LAMP);
    st.mob('sand_devourer', ox + 4, bottom + 1, oz + 2);
  } else if (type === 'dungeon') {
    const y0 = plan.oy;
    st.fill(ox, y0, oz, ox + 6, y0 + 4, oz + 6, ID.COBBLE);
    st.fill(ox + 1, y0 + 1, oz + 1, ox + 5, y0 + 3, oz + 5, 0);
    for (let x = ox; x <= ox + 6; x++) for (let z = oz; z <= oz + 6; z++) {
      st.set(x, y0, z, r(x, 1, z) < 0.5 ? ID.STONEBRICKS_MOSSY : ID.COBBLE);
      st.set(x, y0 + 4, z, MOSS(r(x, 2, z)));
    }
    st.chest(ox + 1, y0 + 1, oz + 1, 'dungeon');
    st.chest(ox + 5, y0 + 1, oz + 5, 'dungeon');
    st.set(ox + 3, y0 + 1, oz + 3, ID.STONEBRICKS);
    st.set(ox + 3, y0 + 2, oz + 3, ID.TORCH);
    st.mob('night_stalker', ox + 2, y0 + 1, oz + 4);
    st.mob('obsidian_skeleton', ox + 4, y0 + 1, oz + 2);
  }
  out.chests = st.chests;
  out.mobs = st.mobs;
  return out;
}

export { mulberry32 };
