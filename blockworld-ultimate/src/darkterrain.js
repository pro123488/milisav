// Generador de la Dimensión Oscura: islas flotantes de piedra umbría sobre un abismo con lagos de lava, cavernas,
// bosques de hongos gigantes luminosos, mucha noctisita, ruinas con cofres y la Ciudadela del Soberano (arena del
// jefe final). Misma interfaz que Terrain (generateChunk, column, biomeAt) para el Worker y el mundo. Sin DOM.
import { CHUNK_SIZE as CS, WORLD_HEIGHT as WH } from './config.js';
import { ID } from './blocks.js';
import { Simplex, hash2, hash3 } from './noise.js';
import { BIOME } from './biomes.js';

const BX = (lx, y, lz) => lx + (lz << 4) + (y << 8);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Altura del abismo (lava a FLOOR_LAVA). */
export const FLOOR_TOP = 8, FLOOR_LAVA = 5;
/** Altura media de la cara superior de las islas. */
export const ISLAND_Y = 64;

export class DarkTerrain {
  constructor(seed, opts = {}) {
    this.seed = seed >>> 0;
    this.type = 'dark'; this.dimension = 'dark';
    this.structures = opts.structures !== false;
    const s = (k) => new Simplex((this.seed * 131 + k * 7577 + 99991) >>> 0);
    this.nIsle = s(1); this.nTop = s(2); this.nThick = s(3); this.nCave = s(4); this.nBiome = s(5); this.nDetail = s(6); this.nFloor = s(7);
    // Ciudadela: a 150-230 bloques del origen, en una dirección que depende de la semilla
    const a = hash2(1, 2, this.seed + 8801) * Math.PI * 2, r = 150 + hash2(3, 4, this.seed + 8802) * 80;
    this.citadel = { x: Math.round(Math.cos(a) * r), z: Math.round(Math.sin(a) * r), y: ISLAND_Y + 2, r: 13 };
  }

  /** Máscara de isla (>0 hay isla). La ciudadela siempre tiene una isla grande debajo. */
  _mask(x, z) {
    let m = this.nIsle.fbm2(x / 150, z / 150, 4) * 0.9 + 0.12;
    const c = this.citadel, d = Math.hypot(x - c.x, z - c.z);
    m = Math.max(m, 0.55 * (1 - smooth(18, 34, d)));
    // las cercanías del origen tienen tierra firme (allí suele llegar el primer portal)
    m = Math.max(m, 0.4 * (1 - smooth(10, 28, Math.hypot(x, z))));
    return m;
  }

  /** Columna: {h: cara superior (o 0 si no hay isla), bottom, biome}. */
  column(x, z) {
    const m = this._mask(x, z);
    const biome = this.nBiome.fbm2(x / 220, z / 220, 2) > 0.05 ? BIOME.UMBRAL_FUNGAL : BIOME.UMBRAL_WASTES;
    if (m <= 0) return { h: FLOOR_TOP, bottom: 0, biome, island: false };
    const c = this.citadel;
    const flat = 1 - smooth(14, 30, Math.hypot(x - c.x, z - c.z));
    let top = ISLAND_Y + this.nTop.fbm2(x / 70, z / 70, 3) * 14 * (1 - flat) + Math.min(1, m * 4) * 4;
    if (flat > 0) top = top * (1 - flat) + (c.y - 1) * flat;
    const thick = 4 + Math.pow(Math.min(1, m * 2.2), 1.5) * (26 + this.nThick.noise2(x / 40, z / 40) * 10);
    return { h: Math.floor(top), bottom: Math.floor(top - thick), biome, island: true };
  }
  biomeAt(x, z) { return this.column(x, z).biome; }
  findSpawn() { return { x: 0, z: 0 }; }

  generateChunk(cx, cz) {
    const blocks = new Uint16Array(CS * CS * WH);
    const biomes = new Uint8Array(256);
    const heights = new Int16Array(256);
    const x0 = cx * CS, z0 = cz * CS, seed = this.seed;
    const chests = [], mobs = [];
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const col = this.column(x, z);
      biomes[lx + lz * CS] = col.biome;
      heights[lx + lz * CS] = col.island ? col.h : FLOOR_TOP;
      // Suelo del abismo: roca base, piedra umbría ondulada y lagos de lava
      blocks[BX(lx, 0, lz)] = ID.BASEROCK;
      const fh = FLOOR_TOP - 3 + Math.floor(this.nFloor.fbm2(x / 30, z / 30, 2) * 4);
      for (let y = 1; y <= Math.max(fh, 1); y++) blocks[BX(lx, y, lz)] = ID.UMBRAL_STONE;
      for (let y = fh + 1; y <= FLOOR_LAVA; y++) blocks[BX(lx, y, lz)] = ID.LAVA;
      if (!col.island) continue;
      // Isla flotante: piedra umbría con musgo encima, cavernas dentro
      for (let y = Math.max(col.bottom, FLOOR_TOP + 4); y <= col.h && y < WH - 1; y++) {
        const depth = col.h - y;
        if (depth > 3 && y > col.bottom + 2) {
          const cv = this.nCave.noise3(x / 24, y / 16, z / 24);
          if (cv > 0.52) continue; // caverna
        }
        let id = depth === 0 ? ID.UMBRAL_MOSS : ID.UMBRAL_STONE;
        if (depth > 2) {
          const r = hash3(x, y, z, seed + 501);
          if (r < 0.010) id = ID.ORE_NOCTISITE_UMBRAL;
          else if (r < 0.014) id = ID.ORE_CRYSTAL;
          else if (r < 0.016) id = ID.VOID_CRYSTAL;
        }
        blocks[BX(lx, y, lz)] = id;
      }
    }
    // Vegetación: hierba umbría, hongos luminosos y hongos gigantes
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const h = heights[lx + lz * CS];
      if (h <= FLOOR_TOP || h >= WH - 12) continue;
      if (blocks[BX(lx, h, lz)] !== ID.UMBRAL_MOSS || blocks[BX(lx, h + 1, lz)] !== 0) continue;
      if (this._nearCitadel(x, z, 20)) continue;
      const fungal = biomes[lx + lz * CS] === BIOME.UMBRAL_FUNGAL;
      const r = hash2(x, z, seed + 601);
      if (r < (fungal ? 0.012 : 0.003) && lx >= 2 && lx <= 13 && lz >= 2 && lz <= 13) this._fungus(blocks, lx, h + 1, lz, hash2(x, z, seed + 602));
      else if (r < 0.15) blocks[BX(lx, h + 1, lz)] = ID.UMBRAL_GRASS;
      else if (r < 0.18) blocks[BX(lx, h + 1, lz)] = ID.MUSHROOM_GLOW;
    }
    // Ruinas umbrías: un círculo de columnas con un cofre (algunos chunks de isla)
    if (this.structures && hash2(cx, cz, seed + 701) < 0.03 && !this._nearCitadel(x0 + 8, z0 + 8, 40)) {
      const h = heights[8 + 8 * CS];
      if (h > FLOOR_TOP + 10 && blocks[BX(8, h, 8)] === ID.UMBRAL_MOSS) {
        for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) for (let y = h + 1; y <= h + 3 + (hash3(dx, dz, cx, seed) < 0.5 ? 1 : 0); y++) blocks[BX(8 + dx, y, 8 + dz)] = ID.UMBRAL_BRICKS;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) blocks[BX(8 + dx, h, 8 + dz)] = ID.UMBRAL_BRICKS;
        blocks[BX(8, h + 1, 8)] = ID.CHEST; chests.push({ x: x0 + 8, y: h + 1, z: z0 + 8, table: 'umbral' });
        mobs.push({ type: 'umbral_sentinel', x: x0 + 9.5, y: h + 1, z: z0 + 9.5 });
      }
    }
    if (this.structures) this._citadel(blocks, cx, cz, mobs);
    return { blocks, chests, mobs, biomes, heights };
  }

  _nearCitadel(x, z, r) { return Math.hypot(x - this.citadel.x, z - this.citadel.z) < r + this.citadel.r; }

  _fungus(blocks, lx, y, lz, r) {
    const h = 4 + Math.floor(r * 5);
    for (let k = 0; k < h; k++) blocks[BX(lx, y + k, lz)] = ID.FUNGUS_STEM;
    const rad = h > 6 ? 2 : 1, cy = y + h;
    for (let dz = -rad - 1; dz <= rad + 1; dz++) for (let dx = -rad - 1; dx <= rad + 1; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dz));
      if (d <= rad) blocks[BX(lx + dx, cy, lz + dz)] = ID.FUNGUS_CAP;
      else if (d === rad + 1 && Math.abs(dx) !== Math.abs(dz)) blocks[BX(lx + dx, cy - 1, lz + dz)] = ID.FUNGUS_CAP; // ala caída
    }
    blocks[BX(lx, cy + 1, lz)] = ID.FUNGUS_CAP;
  }

  /**
   * Ciudadela del Soberano: zigurat de tres pisos de ladrillo umbrío con escalinatas en los cuatro lados, columnas con
   * cristales del vacío y la arena en lo alto (el Trono del Soberano en el centro). Recortada al chunk.
   */
  _citadel(blocks, cx, cz, mobs) {
    const C = this.citadel, x0 = cx * CS, z0 = cz * CS;
    if (C.x + 24 < x0 || C.x - 24 >= x0 + CS || C.z + 24 < z0 || C.z - 24 >= z0 + CS) return;
    const set = (x, y, z, id) => { if (x < x0 || x >= x0 + CS || z < z0 || z >= z0 + CS || y < 1 || y >= WH) return; blocks[BX(x - x0, y, z - z0)] = id; };
    const base = C.y - 1; // suelo de la isla bajo la ciudadela
    const tiers = [[19, 0], [15, 4], [11, 8]]; // [semilado, altura de su suelo sobre la base]
    for (let z = z0; z < z0 + CS; z++) for (let x = x0; x < x0 + CS; x++) {
      const dx = Math.abs(x - C.x), dz = Math.abs(z - C.z), d = Math.max(dx, dz);
      if (d > 21) continue;
      // cimientos hasta la isla y aire por encima de todo el recinto
      for (let y = base - 6; y <= base; y++) set(x, y, z, ID.UMBRAL_BRICKS);
      for (let y = base + 1; y < Math.min(WH, base + 24); y++) set(x, y, z, 0);
      let top = base;
      for (const [half, hy] of tiers) if (d <= half) top = base + hy;
      for (let y = base; y <= top; y++) set(x, y, z, ID.UMBRAL_BRICKS);
      // escalinatas en los 4 ejes (ancho 3): cada bloque de distancia sube uno
      if (Math.min(dx, dz) <= 1 && d > 11) {
        const st = base + Math.max(0, Math.min(8, 20 - d));
        for (let y = base; y <= st; y++) set(x, y, z, ID.UMBRAL_BRICK_CARVED);
      }
      // borde de cada piso y almenas en el último
      if (d === 19 || d === 15) set(x, top + 1, z, (x + z) % 2 ? ID.UMBRAL_BRICK_CARVED : 0);
      if (d === 11 && Math.min(dx, dz) > 1) set(x, top + 1, z, ID.UMBRAL_BRICK_CARVED);
      // dibujo del suelo de la arena
      if (d <= 10 && (d === 6 || d === 3)) set(x, top, z, ID.UMBRAL_BRICK_CARVED);
    }
    const top = base + 8;
    // columnas con cristales del vacío en las esquinas de la arena
    for (const [px, pz] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
      for (let y = top + 1; y <= top + 5; y++) set(C.x + px, y, C.z + pz, ID.UMBRAL_BRICK_CARVED);
      set(C.x + px, top + 6, C.z + pz, ID.VOID_CRYSTAL);
    }
    set(C.x, top + 1, C.z, ID.ALTAR_SOVEREIGN);
    // centinelas en la base de las escalinatas
    for (const [px, pz] of [[0, 23], [23, 0], [0, -23], [-23, 0]]) {
      const mx = C.x + px + 0.5, mz = C.z + pz + 0.5;
      if (mx >= x0 && mx < x0 + CS && mz >= z0 && mz < z0 + CS) mobs.push({ type: 'umbral_sentinel', x: mx, y: base + 1, z: mz });
    }
  }

  /** Posición del trono (para /localizar ciudadela). */
  citadelAltar() { return { x: this.citadel.x, y: this.citadel.y - 1 + 8 + 1, z: this.citadel.z }; }
}
