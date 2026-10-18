// Santuarios de los jefes: arenas deterministas (una como mucho por región de SREGION×SREGION chunks) con el altar
// de invocación en el centro. Como las aldeas, el plan solo depende de la semilla y de terrain.column, y cada chunk
// construye su parte recortada. Sin DOM (se usa en el Worker de terreno, en el juego y en las pruebas de Node).
import { CHUNK_SIZE as CS, WORLD_HEIGHT as WH, SEA_LEVEL as SEA } from './config.js';
import { ID } from './blocks.js';
import { hash2, hash3 } from './noise.js';
import { BIOME } from './biomes.js';
import { villagesNear, ChunkWriter } from './villages.js';

/** Tamaño de región (en chunks). */
export const SREGION = 14;
/** Tipos de santuario: jefe, nombre y radio de la arena. */
export const SHRINE_TYPES = {
  bosque: { boss: 'forest_guardian', name: 'Santuario del Bosque', altar: 'ALTAR_FOREST', r: 12 },
  cristal: { boss: 'crystal_colossus', name: 'Gruta de cristal', altar: 'ALTAR_CRYSTAL', r: 12 },
  mar: { boss: 'deep_queen', name: 'Templo sumergido', altar: 'ALTAR_TIDE', r: 11 },
  fuego: { boss: 'volcanic_titan', name: 'Caldera volcánica', altar: 'ALTAR_EMBER', r: 13 },
};

const caches = new WeakMap();
function cacheOf(t) { let c = caches.get(t); if (!c) { c = new Map(); caches.set(t, c); } return c; }

/** Plan del santuario de la región (rx,rz) o null. Con caché por generador. */
export function shrineAt(terrain, rx, rz) {
  const cache = cacheOf(terrain), k = rx + ',' + rz;
  if (cache.has(k)) return cache.get(k);
  const plan = terrain.structures ? planShrine(terrain, rx, rz) : null;
  cache.set(k, plan);
  return plan;
}

const TYPE_ORDER = ['bosque', 'cristal', 'mar', 'fuego'];
/** ¿Encaja el tipo de santuario con el bioma y la altura de la columna? */
function fits(type, c, h) {
  switch (type) {
    case 'bosque': return c.biome === BIOME.FOREST || c.biome === BIOME.DARK_FOREST || c.biome === BIOME.JUNGLE;
    case 'fuego': return c.biome === BIOME.DESERT || c.biome === BIOME.MESA || c.biome === BIOME.VOLCANIC;
    case 'mar': return c.biome === BIOME.OCEAN && h <= SEA - 8 && h >= 8;
    default: return c.biome !== BIOME.OCEAN || h > SEA - 8;
  }
}

function planShrine(terrain, rx, rz) {
  const seed = terrain.seed;
  if (hash2(rx, rz, seed + 6101) > 0.85) return null;
  // Cada región prefiere un tipo; si su bioma no aparece en la región, se busca otro (la gruta de cristal cabe en casi todas partes)
  const first = Math.floor(hash2(rx, rz, seed + 6104) * 4);
  const pref = TYPE_ORDER[first];
  const order = pref === 'cristal' ? TYPE_ORDER.slice() : [pref, ...TYPE_ORDER.filter((t) => t !== pref && t !== 'cristal'), 'cristal'];
  if (pref === 'cristal') order.unshift(order.splice(1, 1)[0]); // la gruta primero
  for (const type of order) {
    for (let k = 0; k < 10; k++) {
      const ccx = rx * SREGION + 3 + Math.floor(hash3(rx, k, rz, seed + 6102) * (SREGION - 6));
      const ccz = rz * SREGION + 3 + Math.floor(hash3(rx, k, rz, seed + 6103) * (SREGION - 6));
      const X = ccx * CS + 8, Z = ccz * CS + 8;
      const c = terrain.column(X, Z);
      const h = Math.floor(c.h);
      if (!fits(type, c, h)) continue;
      if (villagesNear(terrain, ccx, ccz, 40).length) continue; // lejos de las aldeas
      const plan = siteFor(terrain, type, X, Z, h);
      if (plan) { plan.id = `s${rx},${rz}`; plan.rx = rx; plan.rz = rz; return plan; }
    }
  }
  return null;
}

/** Columnas de muestra alrededor de (X,Z): n puntos en el anillo de radio r (más el centro). */
function ring(terrain, X, Z, r, n) {
  const out = [terrain.column(X, Z)];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push(terrain.column(Math.round(X + Math.cos(a) * r), Math.round(Z + Math.sin(a) * r))); }
  return out;
}
function siteFor(terrain, type, X, Z, h) {
  const T = SHRINE_TYPES[type];
  let y;
  const plan = { type, boss: T.boss, name: T.name, x: X, z: Z, r: T.r, surface: Math.max(h, SEA) };
  if (type === 'bosque' || type === 'fuego') {
    if (h < SEA + 1 || h > WH - 30) return null;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const hh = Math.floor(terrain.column(Math.round(X + Math.cos(a) * 10), Math.round(Z + Math.sin(a) * 10)).h);
      if (hh < SEA || Math.abs(hh - h) > 7) return null;
    }
    // la caldera no puede quedar dentro de un lago de lava natural (la inundaría)
    if (type === 'fuego') for (const r of [0, 6, 12, 16]) for (const c of ring(terrain, X, Z, r, 12)) if (c.lavaTop > 0) return null;
    y = h;
  } else if (type === 'mar') {
    // todo el cilindro bajo el agua (no en la costa)
    for (const r of [T.r - 4, T.r + 1, T.r + 3]) for (const c of ring(terrain, X, Z, r, 16)) if (c.h >= SEA - 3) return null;
    y = h;
  } else {
    const surf = Math.max(h, SEA);
    y = Math.max(12, Math.min(34, surf - 26));
    if (surf - y < 18) return null;
    // altura real del pozo: la columna más alta entre la torre y su salida (al Oeste)
    let top = SEA;
    for (let dx = -3; dx <= 1; dx++) top = Math.max(top, Math.floor(terrain.column(X + 9 + dx, Z).h));
    plan.shaftTop = top + 1;
  }
  plan.y = y;
  return plan;
}

/** Santuarios cuya zona toca el chunk (cx,cz) ampliado `margin` bloques. */
export function shrinesNear(terrain, cx, cz, margin = 4) {
  const out = [];
  const rx = Math.floor(cx / SREGION), rz = Math.floor(cz / SREGION);
  const x0 = cx * CS - margin, z0 = cz * CS - margin, x1 = cx * CS + CS - 1 + margin, z1 = cz * CS + CS - 1 + margin;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const s = shrineAt(terrain, rx + dx, rz + dz);
    if (!s) continue;
    const R = s.r + 4;
    // la gruta de cristal tiene además el pozo de acceso a 9 bloques del centro
    if (s.x + R >= x0 && s.x - R <= x1 && s.z + R >= z0 && s.z - R <= z1) out.push(s);
  }
  return out;
}
/** ¿Toca algún santuario el chunk? (las estructuras de un chunk se apartan) */
export const chunkInShrine = (terrain, cx, cz) => shrinesNear(terrain, cx, cz, 6).length > 0;

/** Zonas sin árboles: las arenas de superficie y la torre de acceso de la gruta. */
export function shrineFootprints(terrain, cx, cz) {
  const out = [];
  for (const s of shrinesNear(terrain, cx, cz, 8)) {
    if (s.type === 'cristal') out.push([s.x + 6, s.z - 3, s.x + 12, s.z + 3]);
    else if (s.type !== 'mar') out.push([s.x - s.r - 3, s.z - s.r - 3, s.x + s.r + 3, s.z + s.r + 3]);
  }
  return out;
}

/** Santuario más cercano a (x,z) (de un tipo concreto si se indica) dentro de `maxRegions` regiones. */
export function nearestShrine(terrain, x, z, type = null, maxRegions = 6) {
  const rx = Math.floor(x / CS / SREGION), rz = Math.floor(z / CS / SREGION);
  let best = null, bd = Infinity;
  for (let dz = -maxRegions; dz <= maxRegions; dz++) for (let dx = -maxRegions; dx <= maxRegions; dx++) {
    const s = shrineAt(terrain, rx + dx, rz + dz);
    if (!s || (type && s.type !== type)) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// ── Construcción recortada al chunk ──────────────────────────────
/** Coloca en el chunk la parte de los santuarios cercanos. Devuelve {chests, mobs}. */
export function placeShrines(terrain, blocks, cx, cz) {
  const W = new ChunkWriter(blocks, cx, cz);
  for (const s of shrinesNear(terrain, cx, cz, 2)) BUILD[s.type](W, s, terrain);
  return { chests: W.chests, mobs: W.mobs };
}

/** Recorre las columnas del chunk dentro del radio r del centro: fn(x, z, d). */
function columns(W, s, r, fn) {
  for (let z = W.z0; z < W.z0 + CS; z++) for (let x = W.x0; x < W.x0 + CS; x++) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d <= r + 0.5) fn(x, z, d);
  }
}
/** Pilares alrededor del centro: fn(px, pz) para cada uno (n pilares a radio r). */
function pillars(s, n, r, off, fn) { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + off; fn(Math.round(s.x + Math.cos(a) * r), Math.round(s.z + Math.sin(a) * r)); } }

const BUILD = {
  bosque(W, s, terrain) {
    const y0 = s.y, seed = terrain.seed;
    columns(W, s, s.r, (x, z, d) => {
      W.foundation(x, y0 - 1, z, ID.DIRT);
      W.set(x, y0, z, d <= 3.2 ? ID.STONEBRICKS_MOSSY : (d > 8.4 && d < 9.6) ? (hash3(x, y0, z, seed + 61) < 0.6 ? ID.STONEBRICKS_MOSSY : ID.COBBLE) : ID.GRASS);
      W.clearAbove(x, y0 + 1, z, Math.min(WH - 1, y0 + 26));
      if (d > 3.5 && d < 8.2 && hash3(x, y0, z, seed + 62) < 0.08) W.set(x, y0 + 1, z, [ID.FLOWER_RED, ID.FLOWER_YELLOW, ID.FLOWER_BLUE, ID.TALL_GRASS][Math.floor(hash3(x, y0, z, seed + 63) * 4)]);
    });
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) W.set(s.x + dx, y0, s.z + dz, ID.RUNESTONE);
    pillars(s, 8, 10.5, 0.2, (px, pz) => {
      for (let y = y0 + 1; y <= y0 + 5; y++) W.set(px, y, pz, ID.ANCIENT_BARK);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { W.set(px + dx, y0 + 6, pz + dz, ID.LEAVES_OAK); if (!dx || !dz) W.set(px + dx, y0 + 7, pz + dz, ID.LEAVES_OAK); }
    });
    W.set(s.x, y0 + 1, s.z, ID.ALTAR_FOREST);
  },
  fuego(W, s) {
    const y0 = s.y;
    columns(W, s, s.r, (x, z, d) => {
      W.foundation(x, y0 - 1, z, ID.BASALT);
      const bridge = Math.abs(x - s.x) <= 1 || Math.abs(z - s.z) <= 1;
      let top = ID.BASALT;
      if (d <= 3.2) top = ID.MAGMA_BRICK;
      else if (d >= 9.6 && d <= 11.2 && !bridge) top = ID.LAVA;
      W.set(x, y0 - 1, z, ID.BASALT);
      W.set(x, y0, z, top);
      W.clearAbove(x, y0 + 1, z, Math.min(WH - 1, y0 + 24));
      if (d > 11.8 && !bridge) W.set(x, y0 + 1, z, ID.MAGMA_BRICK);
    });
    pillars(s, 6, 7.2, 0.5, (px, pz) => { for (let y = y0 + 1; y <= y0 + 4; y++) W.set(px, y, pz, y === y0 + 4 ? ID.MAGMA_BRICK : ID.BASALT); });
    W.set(s.x, y0 + 1, s.z, ID.ALTAR_EMBER);
  },
  mar(W, s) {
    const y0 = s.y;
    columns(W, s, s.r, (x, z, d) => {
      W.foundation(x, y0, z, ID.SEA_STONE);
      W.set(x, y0, z, (d > 4.5 && d < 5.5) || d < 1 ? ID.SEA_LANTERN : ID.SEA_STONE);
      for (let y = y0 + 1; y < SEA; y++) W.set(x, y, z, ID.WATER);
    });
    const top = Math.min(y0 + 7, SEA - 2);
    pillars(s, 6, 9, 0, (px, pz) => { for (let y = y0 + 1; y <= top; y++) W.set(px, y, pz, y === top ? ID.SEA_LANTERN : ID.SEA_STONE); });
    W.set(s.x, y0 + 1, s.z, ID.ALTAR_TIDE);
  },
  cristal(W, s, terrain) {
    const y0 = s.y, cy = y0 + 5, seed = terrain.seed;
    columns(W, s, 13.5, (x, z, d) => {
      for (let y = y0 - 1; y <= y0 + 13; y++) {
        const v = (d / 12) ** 2 + ((y - cy) / 7.5) ** 2;
        if (y === y0 && d <= 12.2) W.set(x, y, z, ID.GEODE);
        else if (y > y0 && v < 0.84) W.set(x, y, z, 0);
        else if (y > y0 - 1 && v < 1.08) W.set(x, y, z, hash3(x, y, z, seed + 71) < 0.14 ? ID.CAVE_CRYSTAL : ID.GEODE);
      }
    });
    for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) W.set(s.x + dx, y0 + 1, s.z + dz, ID.LANTERN);
    W.set(s.x, y0 + 1, s.z, ID.ALTAR_CRYSTAL);
    // Pozo de acceso con escalera de mano (pegada a un pilar de geoda al Este) y torre de geoda en la superficie
    const sx = s.x + 9, sz = s.z;
    const topY = s.shaftTop; // primer nivel de aire sobre el suelo más alto de la torre y su salida
    const surf = topY - 1;
    const RING = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let y = y0 + 1; y <= topY + 2; y++) {
      W.set(sx + 1, y, sz, ID.GEODE);                                   // soporte de la escalera
      if (y > y0 + 8) for (const [dx, dz] of RING) W.set(sx + dx, y, sz + dz, ID.GEODE); // paredes del pozo y de la torre
      W.set(sx, y, sz, y <= topY + 1 ? ID.LADDER_E : 0);
    }
    for (const [dx, dz] of RING.concat([[0, 0]])) W.set(sx + dx, topY + 3, sz + dz, ID.GEODE); // tejado
    W.set(sx, topY + 4, sz, ID.LANTERN);
    // entrada al Oeste: pasillo despejado con suelo hasta fuera de la torre
    for (let dx = 1; dx <= 3; dx++) {
      for (let k = 0; k <= 2; k++) W.set(sx - dx, topY + k, sz, dx === 1 && k === 2 ? ID.GEODE : 0);
      if (W.get(sx - dx, surf, sz) === 0 || W.get(sx - dx, surf, sz) === ID.WATER) W.set(sx - dx, surf, sz, ID.GEODE);
    }
    W.set(sx - 2, surf, sz, ID.RUNESTONE);
  },
};
