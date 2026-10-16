// Aldeas: estructuras de varios chunks generadas de forma determinista por región. El plan de una aldea
// (calles, parcelas y piezas) solo depende de la semilla y del terreno (terrain.column), así que cada chunk
// construye su parte —recortada a sus 16×16 columnas— sin costuras, en cualquier orden y en cualquier Worker.
// Sin DOM ni three.js (se usa en el Worker de terreno, en el juego y en las pruebas de Node).
import { CHUNK_SIZE as CS, WORLD_HEIGHT as WH, SEA_LEVEL as SEA } from './config.js';
import { ID, B_SOLID, B_FLUID, B_REPLACEABLE } from './blocks.js';
import { hash2, mulberry32 } from './noise.js';
import { BIOME } from './biomes.js';
import { rotateBlockId } from './shapes.js';
import { villagerName, PROFESSION_BY_STATION } from './trading.js';

/** Tamaño de la región de aldeas (en chunks): como mucho una aldea por región. */
export const VREGION = 10;
/** Radio máximo de una aldea (bloques desde el pozo). */
export const VRADIUS = 46;

// ── Estilos por bioma ────────────────────────────────────────────
const STYLES = {
  plains: { key: 'plains', floor: 'PLANKS', wall: 'PLANKS', corner: 'LOG_OAK', found: 'COBBLE', roof: 'STAIRS_PLANKS', ridge: 'SLAB_PLANKS', ceil: 'PLANKS', path: 'PATH', fence: 'FENCE_WOOD' },
  desert: { key: 'desert', floor: 'SANDSTONE', wall: 'PLASTER', corner: 'SANDSTONE', found: 'SANDSTONE', roof: 'STAIRS_SANDSTONE', ridge: 'SANDSTONE', ceil: 'SANDSTONE', path: 'SANDSTONE', fence: 'FENCE_WOOD' },
  snow: { key: 'snow', floor: 'PLANKS', wall: 'PLANKS', corner: 'LOG_PINE', found: 'STONEBRICKS', roof: 'STAIRS_STONEBRICKS', ridge: 'STONEBRICKS', ceil: 'PLANKS', path: 'PATH', fence: 'FENCE_WOOD' },
  jungle: { key: 'jungle', floor: 'PLANKS', wall: 'PLANKS', corner: 'LOG_JUNGLE', found: 'COBBLE', roof: 'STAIRS_PLANKS', ridge: 'HAY_BALE', ceil: 'PLANKS', path: 'PATH', fence: 'FENCE_WOOD' },
};
function styleFor(biome) {
  switch (biome) {
    case BIOME.PLAINS: case BIOME.FOREST: return STYLES.plains;
    case BIOME.DESERT: case BIOME.MESA: return STYLES.desert;
    case BIOME.SNOW: return STYLES.snow;
    case BIOME.JUNGLE: return STYLES.jungle;
    default: return null;
  }
}

/** Tamaños (ancho × fondo) y peso de cada tipo de parcela. */
const PIECES = {
  house_small: { w: 5, d: 5, weight: 5 },
  house_large: { w: 7, d: 7, weight: 3 },
  library: { w: 7, d: 7, weight: 1.2 },
  smithy: { w: 7, d: 6, weight: 1.2 },
  workshop: { w: 6, d: 6, weight: 2 },
  farm: { w: 9, d: 7, weight: 3 },
  pen: { w: 7, d: 7, weight: 1.2 },
  tower: { w: 3, d: 3, weight: 0.6 },
};
const DIR4 = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S O

// ── Plan de una región ───────────────────────────────────────────
const caches = new WeakMap();
function cacheOf(terrain) { let c = caches.get(terrain); if (!c) { c = new Map(); caches.set(terrain, c); } return c; }

/** Plan de la aldea de la región (rx, rz), o null. Determinista y con caché por generador. */
export function villageAt(terrain, rx, rz) {
  const cache = cacheOf(terrain);
  const k = rx + ',' + rz;
  if (cache.has(k)) return cache.get(k);
  const plan = terrain.structures ? planVillage(terrain, rx, rz) : null;
  cache.set(k, plan);
  return plan;
}

const overlaps = (a, b, m = 0) => a[0] - m <= b[2] && a[2] + m >= b[0] && a[1] - m <= b[3] && a[3] + m >= b[1];

function planVillage(terrain, rx, rz) {
  const seed = terrain.seed;
  if (hash2(rx, rz, seed + 5101) > 0.45) return null;
  const ccx = rx * VREGION + 2 + Math.floor(hash2(rx, rz, seed + 5102) * (VREGION - 4));
  const ccz = rz * VREGION + 2 + Math.floor(hash2(rx, rz, seed + 5103) * (VREGION - 4));
  const X = ccx * CS + 8, Z = ccz * CS + 8;
  const c = terrain.column(X, Z);
  const style = styleFor(c.biome);
  if (!style) return null;
  const y0 = Math.floor(c.h);
  if (y0 < SEA + 1 || y0 > WH - 32) return null;
  // Terreno razonablemente llano y seco alrededor
  let lo = y0, hi = y0, wet = 0;
  for (const r of [14, 28]) for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + (r === 28 ? 0.5 : 0);
    const h = Math.floor(terrain.column(Math.round(X + Math.cos(a) * r), Math.round(Z + Math.sin(a) * r)).h);
    if (h < SEA + 1) { wet++; continue; }
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  if (wet > 2 || hi - lo > 12) return null;

  const rng = mulberry32((hash2(rx, rz, seed + 5104) * 4294967296) >>> 0);
  const plan = { id: `${rx},${rz}`, rx, rz, x: X, z: Z, y: y0, style: style.key, pieces: [], roads: [], lamps: [], villagers: [], guardian: null };
  const rects = [];
  const groundAt = (x, z) => Math.floor(terrain.column(x, z).h);

  // Pozo central
  const well = { type: 'well', x0: X - 2, z0: Z - 2, x1: X + 2, z1: Z + 2, w: 5, d: 5, y: y0, facing: 2 };
  plan.pieces.push(well); rects.push([well.x0, well.z0, well.x1, well.z1]);

  // Calles (2-4) en direcciones cardinales
  const dirs = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [dirs[i], dirs[j]] = [dirs[j], dirs[i]]; }
  const nRoads = 2 + Math.floor(rng() * 3);
  const types = Object.keys(PIECES);
  const totalW = types.reduce((s, t) => s + PIECES[t].weight, 0);
  const pick = () => { let t = rng() * totalW; for (const k of types) { t -= PIECES[k].weight; if (t <= 0) return k; } return 'house_small'; };
  let homes = 0;
  for (let r = 0; r < nRoads; r++) {
    const dir = dirs[r], [dx, dz] = DIR4[dir];
    const len = 20 + Math.floor(rng() * 15);
    // rectángulo de la calle (3 de ancho) desde el borde del pozo
    const ax = X + dx * 3, az = Z + dz * 3, bx = X + dx * len, bz = Z + dz * len;
    const road = dx ? [Math.min(ax, bx), Z - 1, Math.max(ax, bx), Z + 1] : [X - 1, Math.min(az, bz), X + 1, Math.max(az, bz)];
    plan.roads.push(road);
    // farolas cada 8 bloques en el lado izquierdo
    for (let t = 5; t <= len - 2; t += 8) {
      const px = X + dx * t + (dz ? 2 * (dir === 0 ? -1 : 1) : 0), pz = Z + dz * t + (dx ? 2 * (dir === 1 ? 1 : -1) : 0);
      plan.lamps.push([px, pz]);
    }
    // parcelas a ambos lados
    let t = 6;
    while (t < len - 2) {
      for (const side of [-1, 1]) {
        if (rng() > 0.85) continue;
        let type = pick();
        if (homes < 2 && rng() < 0.6) type = rng() < 0.6 ? 'house_small' : 'house_large';
        const P = PIECES[type];
        // la parcela mira hacia la calle
        const sx = dz ? side : 0, sz = dx ? side : 0;      // vector perpendicular hacia la parcela
        const facing = sx === 1 ? 3 : sx === -1 ? 1 : sz === 1 ? 0 : 2;
        const cxp = X + dx * t, czp = Z + dz * t;         // punto de la calle frente a la parcela
        let x0, z0, x1, z1;
        if (sz) { // calle Este-Oeste: parcela al Norte o al Sur
          x0 = cxp - (P.w >> 1); x1 = x0 + P.w - 1;
          if (sz > 0) { z0 = Z + 3; z1 = z0 + P.d - 1; } else { z1 = Z - 3; z0 = z1 - P.d + 1; }
        } else { // calle Norte-Sur: parcela al Este o al Oeste
          z0 = czp - (P.w >> 1); z1 = z0 + P.w - 1;
          if (sx > 0) { x0 = X + 3; x1 = x0 + P.d - 1; } else { x1 = X - 3; x0 = x1 - P.d + 1; }
        }
        const rect = [x0, z0, x1, z1];
        if (rects.some((q) => overlaps(q, rect, 1)) || plan.roads.some((q) => overlaps(q, rect, 0))) continue;
        if (Math.max(Math.abs(x0 - X), Math.abs(x1 - X), Math.abs(z0 - Z), Math.abs(z1 - Z)) > VRADIUS) continue;
        const gy = groundAt((x0 + x1) >> 1, (z0 + z1) >> 1);
        if (gy < SEA + 1) continue;
        const corners = [groundAt(x0, z0), groundAt(x1, z0), groundAt(x0, z1), groundAt(x1, z1)];
        if (corners.some((h) => h < SEA || Math.abs(h - gy) > 3)) continue;
        const piece = { type, x0, z0, x1, z1, w: P.w, d: P.d, y: gy, facing, seed: Math.floor(rng() * 1e9) };
        plan.pieces.push(piece); rects.push(rect);
        if (type === 'house_small' || type === 'house_large' || type === 'library' || type === 'workshop') homes++;
        // camino de 1 bloque desde la puerta hasta la calle
        const door = pieceToWorld(piece, P.w >> 1, P.d - 1);
        const ox = door[0] - sx, oz = door[1] - sz; // celda entre la puerta y la calle
        plan.roads.push([ox, oz, ox, oz]);
      }
      t += 8 + Math.floor(rng() * 4);
    }
  }
  // Aldeanos: uno por cama; las estaciones de trabajo dan oficio (primero las de su misma pieza)
  const beds = [], stations = [];
  for (const p of plan.pieces) {
    const L = layoutOf(p);
    for (const b of L.beds) beds.push({ pos: b, piece: p });
    for (const s of L.stations) stations.push({ pos: s.pos, block: s.block, piece: p, used: false });
  }
  const nrng = mulberry32((hash2(rx, rz, seed + 5105) * 4294967296) >>> 0);
  for (const b of beds) {
    let st = stations.find((s) => !s.used && s.piece === b.piece) || stations.find((s) => !s.used);
    if (st) st.used = true;
    plan.villagers.push({
      x: b.pos[0] + 0.5, y: b.pos[1] + 0.6, z: b.pos[2] + 0.5, bed: b.pos, ws: st ? st.pos : null,
      prof: st ? PROFESSION_BY_STATION[st.block] || 'none' : 'none', name: villagerName(nrng), village: plan.id,
    });
  }
  plan.guardian = { x: X + 3.5, y: y0 + 1, z: Z + 3.5 };
  // Las farolas no pueden tapar calles ni accesos ni caer dentro de una parcela
  plan.lamps = plan.lamps.filter(([x, z]) => !plan.roads.some((r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3])
    && !plan.pieces.some((q) => x >= q.x0 - 1 && x <= q.x1 + 1 && z >= q.z0 - 1 && z <= q.z1 + 1));
  const xs = plan.pieces.flatMap((p) => [p.x0, p.x1]).concat(plan.roads.flatMap((r) => [r[0], r[2]]));
  const zs = plan.pieces.flatMap((p) => [p.z0, p.z1]).concat(plan.roads.flatMap((r) => [r[1], r[3]]));
  plan.bounds = [Math.min(...xs) - 2, Math.min(...zs) - 2, Math.max(...xs) + 2, Math.max(...zs) + 2];
  return plan;
}

/**
 * Coordenadas del mundo de la posición local (lx, lz) de una pieza. Local: lx a lo ancho (0..w-1), lz de fondo
 * (0..d-1); la fachada con la puerta es lz = d-1. La pieza "facing" indica hacia dónde mira la puerta.
 */
export function pieceToWorld(p, lx, lz) {
  switch (p.facing) {
    case 2: return [p.x0 + lx, p.z0 + lz];                         // puerta al Sur (+Z)
    case 0: return [p.x0 + (p.w - 1 - lx), p.z0 + (p.d - 1 - lz)]; // al Norte
    case 1: return [p.x0 + lz, p.z0 + (p.w - 1 - lx)];             // al Este
    default: return [p.x0 + (p.d - 1 - lz), p.z0 + lx];            // al Oeste
  }
}
/** Giro de los bloques orientados (de local con la puerta al Sur a la orientación de la pieza). */
const rotK = (p) => (p.facing - 2 + 4) % 4;

// ── Distribución interior de cada pieza (camas y estaciones), compartida por el plan y la construcción ──
const SMALL_STATIONS = ['barrel', 'loom', 'alchemy_table', 'lectern'];
const LARGE_STATIONS = ['anvil', 'loom', 'barrel', 'alchemy_table', 'compost_bin'];
/** Estación de trabajo de una casa (o null): casa pequeña la mitad de las veces, casa grande siempre. */
function houseStation(p) {
  if (p.type === 'house_small') return p.seed % 2 === 0 ? SMALL_STATIONS[(p.seed >>> 1) % SMALL_STATIONS.length] : null;
  if (p.type === 'house_large') return LARGE_STATIONS[p.seed % LARGE_STATIONS.length];
  return null;
}
const STATION_ID = () => ({ barrel: ID.BARREL, loom: ID.LOOM, alchemy_table: ID.ALCHEMY_TABLE, lectern: ID.LECTERN_S, anvil: ID.ANVIL_S, compost_bin: ID.COMPOST_BIN });
function layoutOf(p) {
  const at = (lx, ly, lz) => { const [x, z] = pieceToWorld(p, lx, lz); return [x, p.y + ly, z]; };
  const hs = houseStation(p);
  switch (p.type) {
    case 'house_small': return { beds: [at(1, 1, 1)], stations: hs ? [{ pos: at(3, 1, 1), block: hs }] : [] };
    case 'house_large': return { beds: [at(1, 1, 1), at(5, 1, 1)], stations: [{ pos: at(1, 1, 5), block: hs }] };
    case 'library': return { beds: [at(1, 1, 1)], stations: [{ pos: at(3, 1, 3), block: 'lectern' }] };
    case 'workshop': {
      const kinds = ['loom', 'barrel', 'alchemy_table'];
      return { beds: [at(1, 1, 1)], stations: [{ pos: at(4, 1, 1), block: kinds[p.seed % 3] }] };
    }
    case 'smithy': return { beds: [], stations: [{ pos: at(3, 1, 1), block: 'anvil' }] };
    case 'farm': return { beds: [], stations: [{ pos: at(0, 1, 0), block: 'compost_bin' }] };
    default: return { beds: [], stations: [] };
  }
}

// ── Consultas para la generación por chunk ───────────────────────
/** Aldeas cuya zona toca el chunk (cx,cz) ampliado `margin` bloques. */
export function villagesNear(terrain, cx, cz, margin = 6) {
  const out = [];
  const x0 = cx * CS - margin, z0 = cz * CS - margin, x1 = cx * CS + CS - 1 + margin, z1 = cz * CS + CS - 1 + margin;
  const rx = Math.floor(cx / VREGION), rz = Math.floor(cz / VREGION);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const v = villageAt(terrain, rx + dx, rz + dz);
    if (v && overlaps(v.bounds, [x0, z0, x1, z1])) out.push(v);
  }
  return out;
}

/** Huellas (rectángulos) donde no deben crecer árboles ni flora: parcelas y calles de las aldeas cercanas. */
export function villageFootprints(terrain, cx, cz) {
  const out = [];
  for (const v of villagesNear(terrain, cx, cz, 8)) {
    for (const p of v.pieces) out.push([p.x0 - 4, p.z0 - 4, p.x1 + 4, p.z1 + 4]); // margen: las copas no invaden las casas
    for (const r of v.roads) out.push([r[0] - 1, r[1] - 1, r[2] + 1, r[3] + 1]);
  }
  return out;
}

/** ¿Toca alguna aldea el chunk? (las estructuras de un solo chunk se apartan) */
export function chunkInVillage(terrain, cx, cz) { return villagesNear(terrain, cx, cz, 4).length > 0; }

/** Aldea más cercana a (x,z) dentro de `maxRegions` regiones (para /localizar y la brújula). */
export function nearestVillage(terrain, x, z, maxRegions = 5) {
  const rx = Math.floor(x / CS / VREGION), rz = Math.floor(z / CS / VREGION);
  let best = null, bd = Infinity;
  for (let dz = -maxRegions; dz <= maxRegions; dz++) for (let dx = -maxRegions; dx <= maxRegions; dx++) {
    const v = villageAt(terrain, rx + dx, rz + dz);
    if (!v) continue;
    const d = Math.hypot(v.x - x, v.z - z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

// ── Construcción recortada a un chunk ────────────────────────────
const BX = (lx, y, lz) => lx + (lz << 4) + (y << 8);

class ChunkWriter {
  constructor(blocks, cx, cz) { this.blocks = blocks; this.x0 = cx * CS; this.z0 = cz * CS; this.chests = []; this.mobs = []; }
  inChunk(x, z) { return x >= this.x0 && x < this.x0 + CS && z >= this.z0 && z < this.z0 + CS; }
  set(x, y, z, id) { if (y < 1 || y >= WH || !this.inChunk(x, z)) return; this.blocks[BX(x - this.x0, y, z - this.z0)] = id; }
  get(x, y, z) { if (y < 0 || y >= WH || !this.inChunk(x, z)) return -1; return this.blocks[BX(x - this.x0, y, z - this.z0)]; }
  /** Cimientos: rellena hacia abajo desde y hasta encontrar suelo sólido (máx. 10). */
  foundation(x, y, z, id) {
    if (!this.inChunk(x, z)) return;
    for (let yy = y; yy > y - 10 && yy > 0; yy--) {
      const b = this.get(x, yy, z);
      if (B_SOLID[b] && !B_FLUID[b] && yy < y) break;
      this.set(x, yy, z, id);
    }
  }
  /** Vacía la columna por encima (árboles, colinas) hasta `top`. */
  clearAbove(x, y, z, top) { for (let yy = y; yy <= top; yy++) this.set(x, yy, z, 0); }
  chest(x, y, z, table) { if (!this.inChunk(x, z)) return; this.set(x, y, z, ID.CHEST); this.chests.push({ x, y, z, table }); }
  mob(m) { if (this.inChunk(Math.floor(m.x), Math.floor(m.z))) this.mobs.push(m); }
}

/** Escritura en coordenadas locales de una pieza (con giro de los bloques orientados). */
class PieceWriter {
  constructor(W, p, style) { this.W = W; this.p = p; this.k = rotK(p); this.S = style; }
  id(name) { return typeof name === 'number' ? name : ID[this.S[name] || name]; }
  set(lx, ly, lz, id, rotate = true) {
    const [x, z] = pieceToWorld(this.p, lx, lz);
    const bid = this.id(id);
    this.W.set(x, this.p.y + ly, z, rotate ? rotateBlockId(bid, this.k) : bid);
  }
  fill(lx0, ly0, lz0, lx1, ly1, lz1, id) {
    for (let ly = ly0; ly <= ly1; ly++) for (let lz = lz0; lz <= lz1; lz++) for (let lx = lx0; lx <= lx1; lx++) this.set(lx, ly, lz, id);
  }
  world(lx, ly, lz) { const [x, z] = pieceToWorld(this.p, lx, lz); return [x, this.p.y + ly, z]; }
  /** Prepara el solar: cimientos bajo todo el rectángulo y aire por encima. */
  site(clearTo, found = 'found') {
    const { w, d } = this.p;
    for (let lz = 0; lz < d; lz++) for (let lx = 0; lx < w; lx++) {
      const [x, z] = pieceToWorld(this.p, lx, lz);
      this.W.foundation(x, this.p.y, z, this.id(found));
      this.W.clearAbove(x, this.p.y + 1, z, this.p.y + clearTo);
    }
  }
  chest(lx, ly, lz, table) { const [x, y, z] = this.world(lx, ly, lz); this.W.chest(x, y, z, table); }
  /** Tejado a cuatro aguas de escaleras sobre el rectángulo [a..b] en la altura ly (sube 1 por anillo). */
  roof(lx0, lz0, lx1, lz1, ly) {
    while (lx0 <= lx1 && lz0 <= lz1) {
      if (lx0 === lx1 || lz0 === lz1) { this.fill(lx0, ly, lz0, lx1, ly, lz1, 'ridge'); break; }
      for (let lx = lx0; lx <= lx1; lx++) {
        this.set(lx, ly, lz0, familyAt(this.id('roof'), 2)); // fila trasera: parte alta hacia dentro (Sur)
        this.set(lx, ly, lz1, familyAt(this.id('roof'), 0)); // fila delantera: hacia el Norte
      }
      for (let lz = lz0 + 1; lz < lz1; lz++) {
        this.set(lx0, ly, lz, familyAt(this.id('roof'), 1));
        this.set(lx1, ly, lz, familyAt(this.id('roof'), 3));
      }
      for (const [cx, cz] of [[lx0, lz0], [lx1, lz0], [lx0, lz1], [lx1, lz1]]) this.set(cx, ly, cz, 'ridge');
      lx0++; lz0++; lx1--; lz1--; ly++;
    }
  }
}
/** ID de una escalera con la orientación f (las escaleras base son facing 0). */
const familyAt = (stairsBase, f) => stairsBase + f;

/** Coloca en el chunk (cx,cz) la parte de las aldeas cercanas que le corresponde. Devuelve {chests, mobs}. */
export function placeVillages(terrain, blocks, cx, cz) {
  const W = new ChunkWriter(blocks, cx, cz);
  for (const v of villagesNear(terrain, cx, cz, 2)) buildVillage(terrain, v, W);
  return { chests: W.chests, mobs: W.mobs };
}

function surfaceY(W, x, z, guess) {
  for (let y = Math.min(WH - 2, guess + 6); y > Math.max(1, guess - 12); y--) {
    const b = W.get(x, y, z);
    if (b > 0 && (B_SOLID[b] || B_FLUID[b]) && !(B_REPLACEABLE[b] && !B_FLUID[b])) return y;
  }
  return guess;
}

function buildVillage(terrain, v, W) {
  const S = STYLES[v.style];
  // Calles: bloque de camino sobre la superficie; puentes de tablones sobre el agua
  for (const r of v.roads) {
    for (let z = r[1]; z <= r[3]; z++) for (let x = r[0]; x <= r[2]; x++) {
      if (!W.inChunk(x, z)) continue;
      const gy = Math.floor(terrain.column(x, z).h);
      const y = surfaceY(W, x, z, gy);
      const top = W.get(x, y, z);
      if (B_FLUID[top]) { W.set(x, Math.max(y, SEA), z, ID.PLANKS); continue; }
      W.set(x, y, z, ID[S.path]);
      W.clearAbove(x, y + 1, z, y + 4);
    }
  }
  // Farolas: dos vallas y un farol
  for (const [x, z] of v.lamps) {
    if (!W.inChunk(x, z)) continue;
    const y = surfaceY(W, x, z, Math.floor(terrain.column(x, z).h));
    if (B_FLUID[W.get(x, y, z)]) continue;
    W.set(x, y + 1, z, ID[S.fence]); W.set(x, y + 2, z, ID[S.fence]); W.set(x, y + 3, z, ID.LANTERN);
  }
  for (const p of v.pieces) {
    // ¿toca este chunk?
    if (p.x1 < W.x0 || p.x0 >= W.x0 + CS || p.z1 < W.z0 || p.z0 >= W.z0 + CS) continue;
    BUILDERS[p.type](new PieceWriter(W, p, S), p, v);
  }
  for (const m of v.villagers) W.mob({ type: 'villager', x: m.x, y: m.y, z: m.z, data: m });
  W.mob({ type: 'stone_guardian', x: v.guardian.x, y: v.guardian.y, z: v.guardian.z, data: { village: v.id } });
}

// ── Piezas ───────────────────────────────────────────────────────
function walls(P, w, d, h, windows = true) {
  for (let ly = 1; ly <= h; ly++) for (let lz = 0; lz < d; lz++) for (let lx = 0; lx < w; lx++) {
    const edgeX = lx === 0 || lx === w - 1, edgeZ = lz === 0 || lz === d - 1;
    if (!edgeX && !edgeZ) continue;
    P.set(lx, ly, lz, edgeX && edgeZ ? 'corner' : 'wall');
  }
  if (windows) {
    P.set(0, 2, d >> 1, ID.GLASS); P.set(w - 1, 2, d >> 1, ID.GLASS); P.set(w >> 1, 2, 0, ID.GLASS);
  }
}
function door(P, lx, lz) { P.set(lx, 1, lz, ID.DOOR_WOOD_S); P.set(lx, 2, lz, ID.DOOR_WOOD_S_SUP); }

const BUILDERS = {
  well(P, p) {
    P.site(6);
    P.fill(0, 0, 0, 4, 0, 4, 'COBBLE');
    for (let lz = 0; lz < 5; lz++) for (let lx = 0; lx < 5; lx++) {
      const inner = lx >= 1 && lx <= 3 && lz >= 1 && lz <= 3;
      if (inner) { P.set(lx, 0, lz, ID.WATER); P.set(lx, -1, lz, ID.WATER); P.set(lx, -2, lz, ID.COBBLE); }
      else P.set(lx, 1, lz, ID.COBBLE);
    }
    for (const [lx, lz] of [[0, 0], [4, 0], [0, 4], [4, 4]]) { P.set(lx, 2, lz, 'fence'); P.set(lx, 3, lz, 'fence'); }
    P.fill(0, 4, 0, 4, 4, 4, 'SLAB_COBBLE');
    P.set(2, 4, 2, ID.COBBLE);
    P.set(2, 3, 2, ID.LANTERN_HANGING);
    // campana en una esquina libre (las calles pasan por el centro de cada lado)
    P.set(-1, 0, -1, ID.COBBLE); P.set(-1, 1, -1, ID.BELL); P.set(-1, 2, -1, 0); P.set(-1, 3, -1, 0);
  },
  house_small(P) {
    P.site(8);
    P.fill(0, 0, 0, 4, 0, 4, 'found'); P.fill(1, 0, 1, 3, 0, 3, 'floor');
    walls(P, 5, 5, 3);
    door(P, 2, 4);
    P.fill(0, 4, 0, 4, 4, 4, 'ceil');
    P.roof(-1, -1, 5, 5, 4);
    const hs = houseStation(P.p);
    P.set(1, 1, 1, ID.BED); P.set(3, 1, 1, hs ? STATION_ID()[hs] : ID.WORKBENCH); P.set(3, 2, 1, ID.TORCH_N);
  },
  house_large(P) {
    P.site(9);
    P.fill(0, 0, 0, 6, 0, 6, 'found'); P.fill(1, 0, 1, 5, 0, 5, 'floor');
    walls(P, 7, 7, 3);
    P.set(1, 2, 0, ID.GLASS); P.set(5, 2, 0, ID.GLASS);
    door(P, 3, 6);
    P.fill(0, 4, 0, 6, 4, 6, 'ceil');
    P.roof(-1, -1, 7, 7, 4);
    P.set(1, 1, 1, ID.BED); P.set(5, 1, 1, ID.BED); P.chest(3, 1, 1, 'village');
    P.set(1, 1, 5, STATION_ID()[houseStation(P.p)]); P.set(5, 1, 5, ID.FURNACE); P.set(5, 1, 4, ID.WORKBENCH);
    P.set(3, 2, 1, ID.TORCH_N);
  },
  library(P) {
    P.site(9);
    P.fill(0, 0, 0, 6, 0, 6, 'found'); P.fill(1, 0, 1, 5, 0, 5, 'floor');
    walls(P, 7, 7, 3);
    door(P, 3, 6);
    for (let lx = 2; lx <= 5; lx++) { P.set(lx, 1, 1, ID.BOOKSHELF); P.set(lx, 2, 1, ID.BOOKSHELF); }
    P.set(1, 1, 1, ID.BED);
    P.set(3, 1, 3, ID.LECTERN_S);
    P.set(5, 2, 5, ID.TORCH_E); P.set(1, 2, 5, ID.TORCH_W);
    P.fill(0, 4, 0, 6, 4, 6, 'ceil');
    P.roof(-1, -1, 7, 7, 4);
  },
  workshop(P, p) {
    P.site(8);
    P.fill(0, 0, 0, 5, 0, 5, 'found'); P.fill(1, 0, 1, 4, 0, 4, 'floor');
    walls(P, 6, 6, 3);
    door(P, 2, 5);
    P.set(1, 1, 1, ID.BED);
    const kinds = [ID.LOOM, ID.BARREL, ID.ALCHEMY_TABLE];
    P.set(4, 1, 1, kinds[p.seed % 3]);
    P.set(4, 1, 4, ID.CHEST); P.set(2, 2, 1, ID.TORCH_N);
    P.fill(0, 4, 0, 5, 4, 5, 'ceil');
    P.roof(-1, -1, 6, 6, 4);
  },
  smithy(P) {
    P.site(8);
    P.fill(0, 0, 0, 6, 0, 5, 'COBBLE');
    // pared trasera y laterales de piedra tallada, frente abierto sobre postes
    for (let ly = 1; ly <= 3; ly++) {
      for (let lx = 0; lx <= 6; lx++) P.set(lx, ly, 0, 'STONEBRICKS');
      for (let lz = 1; lz <= 2; lz++) { P.set(0, ly, lz, 'STONEBRICKS'); P.set(6, ly, lz, 'STONEBRICKS'); }
      P.set(0, ly, 5, 'corner'); P.set(6, ly, 5, 'corner');
    }
    P.fill(0, 4, 0, 6, 4, 5, 'SLAB_COBBLE');
    P.set(1, 1, 1, ID.FURNACE); P.set(2, 1, 1, ID.FURNACE); P.set(3, 1, 1, ID.ANVIL_S);
    P.chest(5, 1, 1, 'smithy');
    P.set(4, 3, 1, ID.TORCH_N);
  },
  farm(P, p) {
    P.site(4, 'DIRT');
    const crops = [ID.CROP_WHEAT_0, ID.CROP_CARROT_0, ID.CROP_POTATO_0, ID.CROP_TOMATO_0, ID.CROP_CORN_0];
    const r = mulberry32(p.seed >>> 0);
    for (let lz = 0; lz < 7; lz++) for (let lx = 0; lx < 9; lx++) {
      const edge = lx === 0 || lx === 8 || lz === 0 || lz === 6;
      if (edge) { P.set(lx, 0, lz, 'corner'); continue; }
      if (lx === 4) { P.set(lx, 0, lz, ID.WATER); continue; }
      P.set(lx, 0, lz, ID.FARMLAND_WET);
      const crop = lx < 4 ? crops[p.seed % 5] : crops[(p.seed >>> 3) % 5];
      P.set(lx, 1, lz, crop + Math.floor(r() * 4));
    }
    P.set(0, 1, 0, ID.COMPOST_BIN);
  },
  pen(P, p) {
    P.site(5, 'DIRT');
    for (let lz = 0; lz < 7; lz++) for (let lx = 0; lx < 7; lx++) {
      P.set(lx, 0, lz, ID.GRASS);
      if (lx === 0 || lx === 6 || lz === 0 || lz === 6) P.set(lx, 1, lz, lx === 3 && lz === 6 ? ID.GATE_WOOD : 'fence');
    }
    P.set(1, 1, 1, ID.HAY_BALE);
    const kind = p.seed % 2 ? 'prairie_bovid' : 'forest_boar';
    for (const [lx, lz] of [[2, 3], [4, 3]]) { const [x, y, z] = P.world(lx, 1, lz); P.W.mob({ type: kind, x: x + 0.5, y: y + 0.01, z: z + 0.5, data: { pen: true } }); }
  },
  tower(P) {
    P.site(10);
    for (let ly = 0; ly <= 6; ly++) for (let lz = 0; lz < 3; lz++) for (let lx = 0; lx < 3; lx++) {
      const edge = lx !== 1 || lz !== 1;
      if (edge) P.set(lx, ly, lz, ly === 0 ? 'found' : 'COBBLE');
      else P.set(lx, ly, lz, ly === 0 ? 'COBBLE' : ID.LADDER);
    }
    P.set(1, 1, 2, 0); P.set(1, 2, 2, 0); // entrada
    P.set(1, 1, 1, ID.LADDER); P.set(1, 2, 1, ID.LADDER);
    P.fill(-1, 7, -1, 3, 7, 3, 'SLAB_COBBLE'); P.set(1, 7, 1, ID.TRAPDOOR_WOOD + 8); // trampilla arriba
    for (let lx = -1; lx <= 3; lx++) for (let lz = -1; lz <= 3; lz++) if (lx === -1 || lx === 3 || lz === -1 || lz === 3) P.set(lx, 8, lz, 'fence');
    P.set(-1, 9, -1, ID.LANTERN);
  },
};

export { STYLES, PIECES, layoutOf };
