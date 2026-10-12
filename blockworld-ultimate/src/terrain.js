// Generador procedural de terreno. Puro y determinista: se usa tanto en el Web Worker como en el hilo
// principal (consultas de bioma, punto de aparición) y en pruebas de Node.
import { CHUNK_SIZE as CS, WORLD_HEIGHT as WH, SEA_LEVEL as SEA } from './config.js';
import { ID } from './blocks.js';
import { Simplex, hash2, hash3, mulberry32, clamp, lerp, smoothstep } from './noise.js';
import { BIOME, BIOMES } from './biomes.js';
import { placeStructures, structureFootprints } from './structures.js';

const BX = (lx, y, lz) => lx + (lz << 4) + (y << 8);
const TOPID = {};   // biome id → [top, filler, depth]
for (const b of BIOMES) TOPID[b.id] = [ID[b.top.toUpperCase()], ID[b.filler.toUpperCase()], b.fillerDepth];

const ORES = [
  // id, minY, maxY, intentos por chunk, tamaño de veta
  { id: ID.ORE_COAL, min: 4, max: 112, count: 18, size: 9 },
  { id: ID.ORE_COPPER, min: 6, max: 80, count: 12, size: 7 },
  { id: ID.ORE_IRON, min: 4, max: 64, count: 10, size: 6 },
  { id: ID.ORE_GOLD, min: 4, max: 30, count: 3, size: 5 },
  { id: ID.ORE_CRYSTAL, min: 4, max: 42, count: 3.5, size: 4 },
  { id: ID.ORE_NOCTISITE, min: 2, max: 16, count: 1.1, size: 3 },
];

export class Terrain {
  /**
   * @param {number} seed entero de 32 bits
   * @param {{type?:string, structures?:boolean}} opts
   */
  constructor(seed, opts = {}) {
    this.seed = seed >>> 0;
    this.type = opts.type || 'normal';
    this.structures = opts.structures !== false;
    const s = (k) => new Simplex((this.seed * 31 + k * 7919) >>> 0);
    this.nCont = s(1); this.nErosion = s(2); this.nPeaks = s(3); this.nTemp = s(4); this.nHum = s(5);
    this.nHill = s(6); this.nRiver = s(7); this.nLake = s(8); this.nVolc = s(9); this.nPlateau = s(10);
    this.nCanyon = s(11); this.nDetail = s(12); this.nCaveA = s(13); this.nCaveB = s(14); this.nCaveC = s(15);
    this.nWarp = s(16); this.nSurf = s(17); this.nRidge = s(18); this.nFlora = s(19); this.nRavine = s(20);
    this._col = null;
  }

  /**
   * Información de una columna (x,z) del mundo. Es la función cara; se llama 1 vez por columna.
   * Devuelve un objeto nuevo: {h, biome, cont, temp, hum, vol, river, lavaTop, mount}
   */
  column(x, z) {
    const o = { h: SEA + 1, biome: BIOME.PLAINS, cont: 0.3, temp: 0, hum: 0, vol: 0, river: 1, lavaTop: 0, mount: 0, snowLine: 999 };
    if (this.type === 'flat') {
      o.h = SEA + 1;
      const t = this.nTemp.fbm2(x / 1100, z / 1100, 2) * 1.3;
      o.temp = t; o.biome = t < -0.45 ? BIOME.SNOW : BIOME.PLAINS;
      return o;
    }
    const type = this.type;
    const wx = x + this.nWarp.noise2(x * 0.004, z * 0.004) * 55;
    const wz = z + this.nWarp.noise2(x * 0.004 + 100, z * 0.004 + 100) * 55;

    const cs = type === 'islands' ? 1 / 300 : 1 / 760;
    let C = this.nCont.fbm2(wx * cs, wz * cs, 4) * 1.6 + 0.2;
    if (type === 'islands') C = C * 0.9 - 0.3;
    const E = this.nErosion.fbm2(wx / 520, wz / 520, 3) * 1.4;
    const W = this.nPeaks.fbm2(wx / 380, wz / 380, 3) * 1.5;
    let T = this.nTemp.fbm2(wx / 1000, wz / 1000, 3) * 1.55;
    let Hm = this.nHum.fbm2(wx / 820 + 50, wz / 820 - 50, 3) * 1.55;
    T = clamp(T, -1, 1); Hm = clamp(Hm, -1, 1);

    const t = smoothstep(-0.2, 0.02, C); // 0 océano → 1 tierra
    const oceanH = Math.max(SEA - 34, SEA - 3 + C * 42 + this.nDetail.noise2(wx / 30, wz / 30) * 1.5);

    const hillAmp = 2.5 + 11 * smoothstep(0.5, -0.6, E);
    const hills = this.nHill.fbm2(wx / 110, wz / 110, 4) * hillAmp * (type === 'amplified' ? 1.6 : 1);
    const detail = this.nDetail.noise2(wx / 14, wz / 14) * 1.1;
    let landBase = SEA + 1.5 + smoothstep(0.0, 0.35, C) * 9;

    // Montañas: crestas con ruido "ridged"
    let mMask = smoothstep(0.06, 0.42, C) * smoothstep(-0.28, 0.3, W) * smoothstep(0.8, -0.25, E);
    if (type === 'amplified') mMask = Math.min(1, mMask * 1.8 + 0.1 * smoothstep(0.0, 0.3, C));
    const rid = 1 - Math.abs(this.nRidge.fbm2(wx / 210, wz / 210, 4));
    const mountH = mMask * (rid * rid * (type === 'amplified' ? 78 : 58) + 6);

    let h = lerp(oceanH, landBase + hills + mountH + detail, t);

    // Volcanes
    const V = this.nVolc.fbm2(wx / 760, wz / 760, 3) * 1.6;
    const volMask = smoothstep(0.55, 0.85, V) * t * smoothstep(0.0, 0.2, C);
    if (volMask > 0) {
      const cone = smoothstep(0.75, 1.15, V);
      h += volMask * (8 + 30 * cone + this.nDetail.noise2(wx / 22, wz / 22) * 3);
      o.vol = volMask;
    }

    // Zonas áridas: mesetas y barrancos
    const arid = smoothstep(0.08, 0.38, T) * smoothstep(0.05, -0.28, Hm) * t;
    if (arid > 0.02) {
      const P = this.nPlateau.fbm2(wx / 320, wz / 320, 3) * 1.4;
      const pm = arid * smoothstep(0.05, 0.4, P) * smoothstep(0.1, 0.35, C);
      if (pm > 0.01) {
        const base = SEA + 5;
        const up = h + 14;
        const rel = Math.max(0, up - base) / 6;
        const f = Math.floor(rel);
        const terr = base + (f + smoothstep(0.78, 1.0, rel - f)) * 6;
        h = lerp(h, terr, pm);
      }
      const K = Math.abs(this.nCanyon.fbm2(wx / 240 + 9, wz / 240 - 9, 3));
      const cm = arid * smoothstep(0.045, 0.012, K) * smoothstep(SEA + 3, SEA + 9, h);
      if (cm > 0.01) h -= cm * Math.min(20, h - (SEA - 1));
      o.mesa = pm;
    }

    // Ríos
    const R = Math.abs(this.nRiver.fbm2(wx / 640, wz / 640, 3) * 1.4);
    o.river = R;
    if (t > 0.3) {
      const damp = 1 - smoothstep(SEA + 18, SEA + 34, h);
      const core = smoothstep(0.034, 0.008, R) * damp * t;
      const bank = smoothstep(0.09, 0.03, R) * damp * t;
      if (bank > 0) h = lerp(h, Math.min(h, SEA + 1.2), bank * 0.85);
      if (core > 0) h = lerp(h, SEA - 2.6 - (0.034 - R) * 20, core);
    }

    // Lagos
    if (t > 0.5) {
      const L = this.nLake.fbm2(wx / 150 + 7, wz / 150 + 3, 3) * 1.4;
      const lm = smoothstep(0.34, 0.5, L) * (1 - smoothstep(SEA + 4, SEA + 11, h)) * t;
      if (lm > 0) h = lerp(h, SEA - 2.5 - (L - 0.34) * 14, lm);
    }

    // Lagos de lava en regiones volcánicas
    if (o.vol > 0.35) {
      const ln = this.nDetail.fbm2(wx / 38 + 11, wz / 38, 2);
      if (ln > 0.22) {
        const rim = Math.floor(h);
        o.lavaTop = rim - 2;
        h = rim - 4 - (ln - 0.22) * 8;
      }
    }

    const tempEff = T - Math.max(0, h - (SEA + 20)) * 0.012;
    o.h = h; o.cont = C; o.temp = tempEff; o.rawTemp = T; o.hum = Hm; o.mount = mMask;
    o.snowLine = SEA + 52 + this.nDetail.noise2(wx / 25, wz / 25) * 5;

    // Selección de bioma
    let b;
    const fh = Math.floor(h);
    if (C < -0.08 && fh < SEA + 1) b = BIOME.OCEAN;
    else if (C < 0.03 && fh <= SEA + 2) b = BIOME.COAST;
    else if (o.vol > 0.35) b = BIOME.VOLCANIC;
    else if (fh > SEA + 38 || (mMask > 0.55 && fh > SEA + 26)) b = tempEff < -0.6 ? BIOME.SNOW : BIOME.MOUNTAINS;
    else if (arid > 0.42) b = (o.mesa > 0.2 || T > 0.62) ? BIOME.MESA : BIOME.DESERT;
    else if (tempEff < -0.6) b = BIOME.SNOW;
    else if (T > 0.28 && Hm > 0.22) b = BIOME.JUNGLE;
    else if (Hm > 0.3 && fh < SEA + 7) b = BIOME.SWAMP;
    else if (Hm > 0.4) b = BIOME.DARK_FOREST;
    else if (Hm > -0.06) b = BIOME.FOREST;
    else b = BIOME.PLAINS;
    o.biome = b;
    return o;
  }

  biomeAt(x, z) { return this.column(x, z).biome; }

  /** Busca un punto de aparición razonable cerca del origen: tierra, no agua, bioma amable. */
  findSpawn() {
    for (let r = 0; r < 4000; r += 16) {
      const steps = Math.max(1, Math.floor((r * Math.PI * 2) / 24));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
        const c = this.column(x, z);
        const ok = [BIOME.PLAINS, BIOME.FOREST, BIOME.DARK_FOREST, BIOME.JUNGLE, BIOME.SNOW].includes(c.biome);
        if (ok && c.h > SEA + 2 && c.h < SEA + 12) {
          // terreno llano alrededor (nada de acantilados ni orillas)
          let lo = c.h, hi = c.h;
          for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, -3], [3, -3], [-3, 3]]) {
            const n = this.column(x + dx, z + dz).h; lo = Math.min(lo, n); hi = Math.max(hi, n);
          }
          if (hi - lo <= 2 && lo > SEA + 2) return { x, z, h: Math.floor(c.h) };
        }
      }
    }
    return { x: 0, z: 0, h: SEA + 20 };
  }

  /** Genera un chunk completo. */
  generateChunk(cx, cz) {
    const blocks = new Uint8Array(CS * CS * WH);
    const x0 = cx * CS, z0 = cz * CS;
    const cols = new Array(256);
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) cols[lx + lz * CS] = this.column(x0 + lx, z0 + lz);

    const type = this.type;
    const seed = this.seed;
    const coarse = this._caveGrid(x0, z0);
    const GW = 5, GH = 33;

    const biomeMap = new Uint8Array(256);
    const heights = new Int16Array(256);

    for (let lz = 0; lz < CS; lz++) {
      for (let lx = 0; lx < CS; lx++) {
        const col = cols[lx + lz * CS];
        const wx = x0 + lx, wz = z0 + lz;
        const h = Math.max(1, Math.floor(col.h));
        biomeMap[lx + lz * CS] = col.biome;
        heights[lx + lz * CS] = h;
        const [topB, fillB, fDepth] = TOPID[col.biome];
        let top = topB, fill = fillB, depth = fDepth;

        const deepY = 22 + this.nSurf.noise2(wx / 30, wz / 30) * 4;
        const underwater = h < SEA;
        const rnd = hash2(wx, wz, seed + 11);
        if (underwater) {
          const patch = this.nSurf.noise2(wx / 14 + 90, wz / 14);
          if (col.biome === BIOME.SWAMP) { top = ID.MUD; fill = ID.MUD; }
          else if (patch > 0.42) { top = ID.GRAVEL; fill = ID.GRAVEL; }
          else if (patch < -0.45 && h > SEA - 8) { top = ID.CLAY; fill = ID.CLAY; }
          else if (col.biome === BIOME.VOLCANIC) { top = ID.BASALT; fill = ID.BASALT; }
          else { top = ID.SAND; fill = ID.SAND; }
          depth = 3;
        } else if (type !== 'flat') {
          // Riberas arenosas junto al agua
          if (h <= SEA + 1 && col.biome !== BIOME.SNOW && col.biome !== BIOME.VOLCANIC && col.biome !== BIOME.SWAMP && col.biome !== BIOME.MESA) {
            top = ID.SAND; fill = ID.SAND; depth = 3;
          } else if (h <= SEA + 1 && col.biome === BIOME.SWAMP) { top = ID.MUD; fill = ID.MUD; }
          if (col.biome === BIOME.MOUNTAINS || (col.biome === BIOME.SNOW && col.mount > 0.5)) {
            if (h > col.snowLine) { top = ID.SNOW; fill = ID.STONE; depth = 1; }
            else if (h < SEA + 24 && col.biome === BIOME.MOUNTAINS) { top = ID.GRASS; fill = ID.DIRT; depth = 3; }
            else { top = ID.STONE; fill = ID.STONE; depth = 1; }
            if (h > SEA + 24 && this.nSurf.noise2(wx / 9, wz / 9) > 0.55) { top = ID.GRAVEL; fill = ID.STONE; }
          }
          if (col.biome === BIOME.VOLCANIC && this.nSurf.noise2(wx / 12 + 40, wz / 12) > 0.3) top = ID.ASH;
          if (col.biome === BIOME.DESERT && this.nSurf.noise2(wx / 40, wz / 40) > 0.65) { top = ID.SANDSTONE; }
          if ((col.biome === BIOME.PLAINS) && this.nSurf.noise2(wx / 50 + 5, wz / 50) < -0.5) top = ID.GRASS_DRY;
        }
        if (type === 'flat') { top = col.biome === BIOME.SNOW ? ID.GRASS_SNOW : ID.GRASS; fill = ID.DIRT; depth = 3; }

        // Columna base
        const mesaBands = col.biome === BIOME.MESA && !underwater;
        for (let y = 0; y <= h; y++) {
          const i = BX(lx, y, lz);
          let id;
          if (y === 0) id = ID.BASEROCK;
          else if (y <= 3 && hash3(wx, y, wz, seed) < (4 - y) * 0.25) id = ID.BASEROCK;
          else if (y === h) id = top;
          else if (y > h - depth) id = fill;
          else if (mesaBands && y > h - 14) {
            const band = Math.floor((y + hash2(wx >> 3, wz >> 3, seed) * 2) / 2) % 3;
            id = band === 0 ? ID.RED_SANDSTONE : band === 1 ? ID.SANDSTONE : ID.CLAY;
            if (band === 2 && y > h - 4) id = ID.RED_SANDSTONE;
          } else if (col.biome === BIOME.VOLCANIC && y > h - 8 && !underwater) id = ID.BASALT;
          else if (col.biome === BIOME.DESERT && y > h - 7) id = ID.SANDSTONE;
          else id = y < deepY ? ID.DEEPSTONE : ID.STONE;
          blocks[i] = id;
        }
        // Agua
        if (h < SEA) {
          const freezing = col.rawTemp !== undefined && col.rawTemp < -0.4 && col.biome === BIOME.SNOW;
          for (let y = h + 1; y <= SEA; y++) blocks[BX(lx, y, lz)] = ID.WATER;
          if (freezing || (col.biome === BIOME.OCEAN && col.rawTemp < -0.7 && this.nSurf.noise2(wx / 12, wz / 12) > 0.1)) {
            blocks[BX(lx, SEA, lz)] = ID.ICE;
          }
        }
        // Lava volcánica
        if (col.lavaTop > h) for (let y = h + 1; y <= col.lavaTop; y++) blocks[BX(lx, y, lz)] = ID.LAVA;
      }
    }

    // ── Cuevas, túneles y barrancos ──
    if (type !== 'flat' || true) {
      for (let lz = 0; lz < CS; lz++) {
        for (let lx = 0; lx < CS; lx++) {
          const col = cols[lx + lz * CS];
          const h = heights[lx + lz * CS];
          const wx = x0 + lx, wz = z0 + lz;
          const crust = h < SEA ? 6 : 3;
          const entrance = h > SEA + 1 && this.nSurf.noise2(wx / 22 + 300, wz / 22) > 0.66;
          const maxCarve = entrance ? h : h - crust;
          const fx = (lx) / 4, fz = (lz) / 4;
          const gx = Math.floor(fx), gz = Math.floor(fz);
          const tx = fx - gx, tz = fz - gz;
          for (let y = 5; y <= maxCarve; y++) {
            const fy = y / 4; const gy = Math.floor(fy); const ty = fy - gy;
            // interpolación trilineal de la rejilla gruesa
            const i000 = gx + gz * GW + gy * GW * GW;
            const c00 = coarse[i000] * (1 - tx) + coarse[i000 + 1] * tx;
            const c10 = coarse[i000 + GW] * (1 - tx) + coarse[i000 + GW + 1] * tx;
            const c01 = coarse[i000 + GW * GW] * (1 - tx) + coarse[i000 + GW * GW + 1] * tx;
            const c11 = coarse[i000 + GW * GW + GW] * (1 - tx) + coarse[i000 + GW * GW + GW + 1] * tx;
            const v = (c00 * (1 - tz) + c10 * tz) * (1 - ty) + (c01 * (1 - tz) + c11 * tz) * ty;
            if (v > 0) {
              const i = BX(lx, y, lz);
              const cur = blocks[i];
              if (cur === ID.BASEROCK || cur === ID.WATER || cur === ID.LAVA || cur === ID.ICE) continue;
              blocks[i] = y <= 9 ? ID.LAVA : 0;
            }
          }
          // Barrancos: grietas profundas y estrechas
          if (h > SEA + 3 && col.biome !== BIOME.OCEAN) {
            const area = this.nRavine.noise2(wx / 400 + 3, wz / 400 - 3);
            if (area > 0.18) {
              const rv = Math.abs(this.nRavine.noise2(wx / 150, wz / 150));
              const st = 1 - rv / 0.02;
              if (st > 0) {
                const bottom = Math.max(12, h - 34 - Math.floor(hash2(wx >> 4, wz >> 4, seed) * 12));
                for (let y = bottom; y <= h; y++) {
                  if ((y - bottom) / (h - bottom + 1) < 1 - st * 1.1) continue;
                  const i = BX(lx, y, lz);
                  if (blocks[i] !== ID.BASEROCK && blocks[i] !== ID.WATER && blocks[i] !== ID.LAVA) blocks[i] = y <= 9 ? ID.LAVA : 0;
                }
              }
            }
          }
        }
      }
    }

    // ── Minerales y bolsas ──
    const rng = mulberry32((hash3(cx, 7, cz, seed + 555) * 4294967296) >>> 0);
    const centerBiome = cols[8 + 8 * CS].biome;
    const oreMul = centerBiome === BIOME.MOUNTAINS ? 1.6 : 1;
    const replaceable = (b) => b === ID.STONE || b === ID.DEEPSTONE || b === ID.BASALT || b === ID.SANDSTONE;
    const blob = (id, minY, maxY, size, allowAny) => {
      let x = rng() * CS, z = rng() * CS, y = minY + rng() * (maxY - minY);
      for (let n = 0; n < size; n++) {
        const ix = x | 0, iy = y | 0, iz = z | 0;
        if (ix >= 0 && ix < CS && iz >= 0 && iz < CS && iy > 3 && iy < WH) {
          const i = BX(ix, iy, iz);
          if (allowAny ? (blocks[i] !== 0 && blocks[i] !== ID.WATER && blocks[i] !== ID.LAVA && blocks[i] !== ID.BASEROCK) : replaceable(blocks[i])) blocks[i] = id;
        }
        x += (rng() - 0.5) * 2.4; y += (rng() - 0.5) * 2.4; z += (rng() - 0.5) * 2.4;
      }
    };
    for (const o of ORES) {
      let mul = oreMul;
      if (o.id === ID.ORE_NOCTISITE && centerBiome === BIOME.VOLCANIC) mul = 6;
      if (o.id === ID.ORE_NOCTISITE) mul *= 1;
      const cnt = o.count * mul;
      const n = Math.floor(cnt) + (rng() < cnt - Math.floor(cnt) ? 1 : 0);
      const maxY = (o.id === ID.ORE_NOCTISITE && centerBiome === BIOME.VOLCANIC) ? 70 : o.max;
      for (let k = 0; k < n; k++) blob(o.id, o.min, maxY, o.size, false);
    }
    for (let k = 0; k < 8; k++) blob(ID.GRAVEL, 8, 100, 14, false);
    for (let k = 0; k < 6; k++) blob(ID.DIRT, 30, 100, 14, false);
    if (centerBiome === BIOME.VOLCANIC) for (let k = 0; k < 3; k++) blob(ID.OBSIDIAN, 20, 70, 5, false);

    // Decoración de cuevas: cristales luminosos y hongos
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const wx = x0 + lx, wz = z0 + lz;
      const h = heights[lx + lz * CS];
      for (let y = 6; y < Math.min(h - 3, 60); y++) {
        const i = BX(lx, y, lz);
        if (blocks[i] !== 0) continue;
        const r = hash3(wx, y, wz, seed + 4242);
        if (r > 0.0035) continue;
        const below = blocks[i - 256];
        if (r < 0.0012) {
          // cristal incrustado en pared/techo
          const nb = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
          const pick = nb[Math.floor(hash3(wx, y, wz, seed + 1) * nb.length)];
          const nx = lx + pick[0], ny = y + pick[1], nz = lz + pick[2];
          if (nx >= 0 && nx < CS && nz >= 0 && nz < CS) {
            const ni = BX(nx, ny, nz);
            if (replaceable(blocks[ni]) && blocks[ni] !== ID.BASALT) blocks[ni] = ID.CAVE_CRYSTAL;
          }
        } else if (below !== 0 && below !== ID.LAVA && below !== ID.WATER) {
          blocks[i] = ID.MUSHROOM_GLOW;
        }
      }
    }

    // ── Estructuras (antes de árboles) ──
    const foot = this.structures ? structureFootprints(this, cx, cz) : [];
    let sx = { chests: [], mobs: [] };
    if (this.structures) sx = placeStructures(this, blocks, cx, cz);

    // ── Árboles y flora ──
    if (type !== 'flat' || true) this._decorate(blocks, cx, cz, cols, heights, foot);

    return { blocks, chests: sx.chests, mobs: sx.mobs, biomes: biomeMap, heights };
  }

  /** Rejilla gruesa 5×5×33 (cada 4 bloques) del campo escalar de cuevas: >0 significa "excavar". */
  _caveGrid(x0, z0) {
    const GW = 5, GH = 33;
    const g = new Float32Array(GW * GW * GH);
    for (let gy = 0; gy < GH; gy++) {
      const y = gy * 4;
      // más cuevas a media profundidad
      const depthBias = 0.05 + 0.1 * smoothstep(8, 22, y) * (1 - smoothstep(60, 100, y));
      for (let gz = 0; gz < GW; gz++) {
        for (let gx = 0; gx < GW; gx++) {
          const x = x0 + gx * 4, z = z0 + gz * 4;
          const c = this.nCaveA.fbm3(x / 44, y / 30, z / 44, 2) * 1.35;
          const a = this.nCaveB.noise3(x / 70, y / 44, z / 70);
          const b = this.nCaveC.noise3(x / 70 + 500, y / 44, z / 70);
          const cheese = (c - (0.58 - depthBias)) / 0.2;
          const tunnel = 1 - Math.max(Math.abs(a) / 0.055, Math.abs(b) / 0.065);
          g[gx + gz * GW + gy * GW * GW] = Math.max(cheese, tunnel * 0.6);
        }
      }
    }
    return g;
  }

  _decorate(blocks, cx, cz, cols, heights, footprints) {
    const x0 = cx * CS, z0 = cz * CS, seed = this.seed;
    const inFoot = (x, z) => footprints.some((f) => x >= f[0] && x <= f[2] && z >= f[1] && z <= f[3]);
    const setIfAir = (wx, y, wz, id) => {
      const lx = wx - x0, lz = wz - z0;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || y < 1 || y >= WH) return;
      const i = BX(lx, y, lz);
      if (blocks[i] === 0) blocks[i] = id;
    };
    const setForce = (wx, y, wz, id) => {
      const lx = wx - x0, lz = wz - z0;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || y < 1 || y >= WH) return;
      blocks[BX(lx, y, lz)] = id;
    };
    const isSoilTop = (id) => id === ID.GRASS || id === ID.GRASS_LUSH || id === ID.GRASS_DRY || id === ID.GRASS_SWAMP || id === ID.DIRT || id === ID.GRASS_SNOW || id === ID.MUD || id === ID.SNOW;

    // Árboles en rejilla con jitter (celdas de 4×4) con margen para copas que cruzan chunks
    const M = 5;
    for (let gz = Math.floor((z0 - M) / 4); gz <= Math.floor((z0 + CS + M) / 4); gz++) {
      for (let gx = Math.floor((x0 - M) / 4); gx <= Math.floor((x0 + CS + M) / 4); gx++) {
        const wx = gx * 4 + Math.floor(hash2(gx, gz, seed + 21) * 4);
        const wz = gz * 4 + Math.floor(hash2(gx, gz, seed + 22) * 4);
        if (wx < x0 - M || wx >= x0 + CS + M || wz < z0 - M || wz >= z0 + CS + M) continue;
        const col = (wx >= x0 && wx < x0 + CS && wz >= z0 && wz < z0 + CS) ? cols[(wx - x0) + (wz - z0) * CS] : this.column(wx, wz);
        const bio = BIOMES[col.biome];
        if (!bio || bio.treeDensity <= 0) continue;
        // densidad con agrupación suave (claros y bosques densos)
        const cluster = 0.55 + 0.9 * (this.nFlora.noise2(wx / 70, wz / 70) * 0.5 + 0.5);
        const p = Math.min(0.92, bio.treeDensity * 16 * cluster);
        if (hash2(gx, gz, seed + 23) > p) continue;
        const h = Math.floor(col.h);
        if (h <= SEA || col.lavaTop > 0) continue;
        if (inFoot(wx, wz)) continue;
        if (this.type === 'flat') continue;
        // el bloque de la superficie debe ser apto
        let surf;
        if (wx >= x0 && wx < x0 + CS && wz >= z0 && wz < z0 + CS) surf = blocks[BX(wx - x0, h, wz - z0)];
        else surf = 255;
        const type = bio.trees[0][0];
        if (type === 'cactus') {
          if (surf !== 255 && surf !== ID.SAND && surf !== ID.RED_SAND) continue;
        } else if (surf !== 255 && !isSoilTop(surf)) continue;
        if (h > col.snowLine - 3 && col.biome !== BIOME.SNOW) continue;
        const rr = (k) => hash2(wx * 7 + k, wz * 13 - k, seed + 24);
        this._tree(type, wx, h, wz, rr, setIfAir, setForce);
      }
    }

    // Flora de suelo
    for (let lz = 0; lz < CS; lz++) {
      for (let lx = 0; lx < CS; lx++) {
        const col = cols[lx + lz * CS];
        const bio = BIOMES[col.biome];
        if (!bio || !bio.flora.length) continue;
        const h = heights[lx + lz * CS];
        if (h < SEA || h >= WH - 2) continue;
        const wx = x0 + lx, wz = z0 + lz;
        if (inFoot(wx, wz)) continue;
        const surf = blocks[BX(lx, h, lz)];
        if (blocks[BX(lx, h + 1, lz)] !== 0) continue;
        const r = hash2(wx, wz, seed + 31);
        const patch = this.nFlora.noise2(wx / 18 + 70, wz / 18) > 0.1 ? 1.6 : 0.5;
        let acc = 0;
        for (const [name, prob] of bio.flora) {
          const isFlower = name.startsWith('flower');
          acc += prob * (isFlower ? patch * 1.5 : 1);
          if (r < acc) {
            const id = ID[name.toUpperCase()];
            const needSand = name === 'dead_bush';
            const needAny = name === 'mushroom_glow' || name === 'mushroom_dark';
            const okSurf = needSand ? (surf === ID.SAND || surf === ID.RED_SAND || surf === ID.SANDSTONE || surf === ID.DIRT || isSoilTop(surf)) : (needAny ? surf !== 0 : isSoilTop(surf));
            if (!okSurf || surf === ID.SNOW) break;
            if (name === 'reed' && !this._nextToWater(blocks, lx, h, lz)) break;
            blocks[BX(lx, h + 1, lz)] = id;
            break;
          }
        }
      }
    }
  }

  _nextToWater(blocks, lx, h, lz) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = lx + dx, nz = lz + dz;
      if (nx < 0 || nx >= CS || nz < 0 || nz >= CS) continue;
      if (blocks[BX(nx, h, nz)] === ID.WATER) return true;
    }
    return false;
  }

  _tree(type, x, h, z, rr, setIfAir, setForce) {
    const log = { oak: ID.LOG_OAK, dark: ID.LOG_DARK, jungle: ID.LOG_JUNGLE, pine: ID.LOG_PINE, swamp: ID.LOG_OAK, dead: ID.LOG_DARK }[type];
    const leaf = { oak: ID.LEAVES_OAK, dark: ID.LEAVES_DARK, jungle: ID.LEAVES_JUNGLE, pine: ID.LEAVES_PINE, swamp: ID.LEAVES_SWAMP }[type];
    const blob = (cx, cy, cz, rad, flat = 1) => {
      for (let dy = -Math.ceil(rad); dy <= Math.ceil(rad); dy++) for (let dz = -Math.ceil(rad); dz <= Math.ceil(rad); dz++) for (let dx = -Math.ceil(rad); dx <= Math.ceil(rad); dx++) {
        const d = dx * dx + dz * dz + (dy * flat) * (dy * flat);
        if (d <= rad * rad + 0.5 && !(Math.abs(dx) === Math.ceil(rad) && Math.abs(dz) === Math.ceil(rad) && rr(dx * 3 + dz + dy * 5) < 0.5)) setIfAir(cx + dx, cy + dy, cz + dz, leaf);
      }
    };
    if (type === 'cactus') {
      const n = 1 + Math.floor(rr(1) * 3);
      for (let i = 1; i <= n; i++) setForce(x, h + i, z, ID.CACTUS);
    } else if (type === 'oak') {
      const th = 4 + Math.floor(rr(1) * 3);
      blob(x, h + th, z, 2.3, 1.15);
      blob(x, h + th + 1, z, 1.5);
      for (let i = 1; i <= th + 1; i++) setForce(x, h + i, z, log);
    } else if (type === 'swamp') {
      const th = 4 + Math.floor(rr(1) * 2);
      blob(x, h + th, z, 3.0, 1.9);
      for (let i = 1; i <= th + 1; i++) setForce(x, h + i, z, log);
    } else if (type === 'dark') {
      const th = 7 + Math.floor(rr(1) * 4);
      for (let dz = 0; dz <= 1; dz++) for (let dx = 0; dx <= 1; dx++) for (let i = 1; i <= th; i++) setForce(x + dx, h + i, z + dz, log);
      blob(x, h + th, z, 3.4, 1.7);
      blob(x + 1, h + th, z + 1, 3.4, 1.7);
      blob(x, h + th + 2, z, 2, 1);
      for (let dz = 0; dz <= 1; dz++) for (let dx = 0; dx <= 1; dx++) for (let i = 0; i > -3; i--) setForce(x + dx, h + i, z + dz, ID.DIRT);
    } else if (type === 'jungle') {
      const th = 9 + Math.floor(rr(1) * 9);
      for (let i = 1; i <= th; i++) setForce(x, h + i, z, log);
      blob(x, h + th, z, 3.2, 1.6);
      blob(x + 2, h + th - 3, z, 1.8); blob(x - 2, h + th - 4, z + 1, 1.8); blob(x, h + th - 5, z - 2, 1.8);
      blob(x, h + th + 2, z, 1.8);
    } else if (type === 'pine') {
      const th = 6 + Math.floor(rr(1) * 5);
      for (let i = 1; i <= th; i++) setForce(x, h + i, z, log);
      let r = 0;
      for (let y = h + th + 1; y >= h + 3; y--) {
        const k = (h + th + 1) - y;
        const rad = k === 0 ? 0 : (k % 3 === 1 ? 1 : k % 3 === 2 ? 2 : 1);
        const rd = Math.min(rad, 1 + Math.floor(k / 3));
        for (let dz = -rd; dz <= rd; dz++) for (let dx = -rd; dx <= rd; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > rd + (rd > 1 ? 1 : 0)) continue;
          if (dx === 0 && dz === 0 && y <= h + th) continue;
          setIfAir(x + dx, y, z + dz, leaf);
        }
        r = rd;
      }
    } else if (type === 'dead') {
      const th = 3 + Math.floor(rr(1) * 4);
      for (let i = 1; i <= th; i++) setForce(x, h + i, z, log);
      if (rr(2) < 0.7) { setForce(x + 1, h + th - 1, z, log); setForce(x + 2, h + th, z, log); }
      if (rr(3) < 0.7) { setForce(x - 1, h + th - 2, z, log); setForce(x - 2, h + th - 1, z, log); }
    }
  }
}

/** Convierte el texto de semilla en un entero. Vacío → aleatorio. */
export function seedFromString(s) {
  s = String(s ?? '').trim();
  if (!s) return Math.floor(Math.random() * 4294967296) >>> 0;
  if (/^-?\d+$/.test(s)) return (parseInt(s, 10) >>> 0);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
