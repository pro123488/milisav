// Formas de los bloques como listas de cajas: un único sitio define las cajas de RENDER, COLISIÓN y
// SELECCIÓN, de modo que mallado, física y raycast siempre coinciden. Sin DOM: se usa en el navegador,
// en el Worker y en las pruebas de Node.
//
// Cajas en coordenadas locales del bloque: [x0, y0, z0, x1, y1, z1] (0..1; la colisión puede llegar a 1,5).
// Orientación (facing): 0 = Norte (−Z), 1 = Este (+X), 2 = Sur (+Z), 3 = Oeste (−X).
import { BLOCKS, MAX_BLOCKS, B_OPAQUE, B_SOLID, B_SHAPE, B_HEIGHT, SHAPE_ID } from './blocks.js';

export const FACING_VEC = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const FAM = { NONE: 0, STAIRS: 1, LADDER: 2, DOOR: 3, FENCE: 4, WALL: 5, GATE: 6, TRAPDOOR: 7, CUSTOM: 8 };
const FAM_BY_NAME = { stairs: FAM.STAIRS, ladder: FAM.LADDER, door: FAM.DOOR, fence: FAM.FENCE, wall: FAM.WALL, gate: FAM.GATE, trapdoor: FAM.TRAPDOOR, custom: FAM.CUSTOM };

/** Familia de forma por ID de bloque (0 = sin familia: cubo y formas clásicas). */
export const B_FAMILY = new Uint8Array(MAX_BLOCKS);
for (const b of BLOCKS) if (b && b.family) B_FAMILY[b.id] = FAM_BY_NAME[b.family] || 0;
export const isBoxShape = (id) => B_FAMILY[id] !== 0;
/** ¿Necesita conocer a sus vecinos para su forma? (vallas y muros) */
export const needsMask = (id) => B_FAMILY[id] === FAM.FENCE || B_FAMILY[id] === FAM.WALL;

const p = (v) => v / 16;

/** Gira una caja 90°·k alrededor del eje Y (N→E→S→W): (x, z) → (1 − z, x). Devuelve una caja nueva. */
export function rotateBox(b, k) {
  let x0 = b[0], z0 = b[2], x1 = b[3], z1 = b[5];
  for (let i = 0; i < (k & 3); i++) {
    const nx0 = 1 - z1, nx1 = 1 - z0, nz0 = x0, nz1 = x1;
    x0 = nx0; x1 = nx1; z0 = nz0; z1 = nz1;
  }
  return [x0, b[1], z0, x1, b[4], z1];
}
const rotAll = (boxes, k) => boxes.map((b) => rotateBox(b, k));

// ── Definiciones base (orientadas al Norte) ──────────────────────
const STAIRS_N = [[0, 0, 0, 1, 0.5, 1], [0, 0.5, 0, 1, 1, 0.5]];
const STAIRS_N_TOP = [[0, 0.5, 0, 1, 1, 1], [0, 0, 0, 1, 0.5, 0.5]];
const THIN = p(3);
const PANEL_N = [[0, 0, 0, 1, 1, THIN]];          // hoja pegada al lado norte
const DOOR_N_OPEN = [[0, 0, 0, THIN, 1, 1]];      // abierta: girada sobre la bisagra del lado oeste
const TRAP_BOTTOM = [[0, 0, 0, 1, THIN, 1]];
const TRAP_TOP = [[0, 1 - THIN, 0, 1, 1, 1]];
// Vallas
const FENCE_POST = [p(6), 0, p(6), p(10), 1, p(10)];
const FENCE_ARM_N = [[p(7), p(6), 0, p(9), p(9), p(6)], [p(7), p(12), 0, p(9), p(15), p(6)]];
const FENCE_POST_COL = [p(6), 0, p(6), p(10), 1.5, p(10)];
const FENCE_ARM_COL_N = [p(6), 0, 0, p(10), 1.5, p(6)];
const FENCE_ARM_SEL_N = [p(6), 0, 0, p(10), 1, p(6)];
// Muros
const WALL_POST = [p(4), 0, p(4), p(12), 1, p(12)];
const WALL_ARM_N = [p(5), 0, 0, p(11), p(13), p(8)];
const WALL_POST_COL = [p(4), 0, p(4), p(12), 1.5, p(12)];
const WALL_ARM_COL_N = [p(5), 0, 0, p(11), 1.5, p(8)];
// Puerta de valla (Norte = atraviesa el eje X; las hojas se abren hacia +Z)
const GATE_POSTS = [[0, p(5), p(7), p(2), 1, p(9)], [p(14), p(5), p(7), 1, 1, p(9)]];
const GATE_BARS = [[p(2), p(6), p(7), p(14), p(9), p(9)], [p(2), p(12), p(7), p(14), p(15), p(9)], [p(7), p(9), p(7), p(9), p(12), p(9)]];
const GATE_OPEN_WINGS = [
  [0, p(6), p(9), p(2), p(9), p(15)], [0, p(12), p(9), p(2), p(15), p(15)],
  [p(14), p(6), p(9), 1, p(9), p(15)], [p(14), p(12), p(9), 1, p(15), p(15)],
];
const GATE_COL_N = [[0, 0, p(7), 1, 1.5, p(9)]];

// Precalcular por orientación
const PRE = {};
function pre(name, boxes) { PRE[name] = [0, 1, 2, 3].map((k) => rotAll(boxes, k)); }
pre('stairs', STAIRS_N); pre('stairsTop', STAIRS_N_TOP); pre('panel', PANEL_N); pre('doorOpen', DOOR_N_OPEN);
pre('gateClosed', [...GATE_POSTS, ...GATE_BARS]); pre('gateOpen', [...GATE_POSTS, ...GATE_OPEN_WINGS]);
pre('gateCol', GATE_COL_N); pre('gateSel', [[0, 0, p(7), 1, 1, p(9)]]);
pre('fenceArm', FENCE_ARM_N); pre('fenceArmCol', [FENCE_ARM_COL_N]); pre('fenceArmSel', [FENCE_ARM_SEL_N]);
pre('wallArm', [WALL_ARM_N]); pre('wallArmCol', [WALL_ARM_COL_N]);

export const FULL_BOX = [0, 0, 0, 1, 1, 1];

// Modelos propios (family 'custom'): el bloque define `boxes` (en 1/16, orientadas al Norte) y opcionalmente
// `colBoxes` para la colisión; se giran según su `facing`. Yunque, farol, atril, campana, mesa de alquimia...
const CUSTOM_R = new Array(MAX_BLOCKS).fill(null), CUSTOM_C = new Array(MAX_BLOCKS).fill(null);
for (const b of BLOCKS) {
  if (!b || b.family !== 'custom') continue;
  const sc = (list) => rotAll(list.map((q) => q.map(p)), b.facing);
  CUSTOM_R[b.id] = sc(b.boxes);
  CUSTOM_C[b.id] = b.solid ? sc(b.colBoxes || b.boxes) : [];
}
const FULL = [FULL_BOX];
const EMPTY = [];

// Cajas de los bloques sin familia (cubo, losa, tierra arada, planta, antorcha...)
const BASE_COL = new Array(MAX_BLOCKS).fill(EMPTY);
const BASE_SEL = new Array(MAX_BLOCKS).fill(FULL);
for (const b of BLOCKS) {
  if (!b || B_FAMILY[b.id]) continue;
  const sh = B_SHAPE[b.id], id = b.id;
  if (sh === SHAPE_ID.slab || sh === SHAPE_ID.farmland) BASE_SEL[id] = [[0, 0, 0, 1, B_HEIGHT[id], 1]];
  else if (sh === SHAPE_ID.cross) BASE_SEL[id] = [[0.15, 0, 0.15, 0.85, 0.85, 0.85]];
  else if (sh === SHAPE_ID.torch) BASE_SEL[id] = [[0.375, 0, 0.375, 0.625, 0.7, 0.625]];
  if (B_SOLID[id]) BASE_COL[id] = (sh === SHAPE_ID.slab || sh === SHAPE_ID.farmland) ? [[0, 0, 0, 1, B_HEIGHT[id], 1]] : FULL;
}

/**
 * Máscara de conexiones de vallas y muros (bit 0 N, 1 E, 2 S, 3 O).
 * get(x, y, z) devuelve el ID de bloque (mundo o arrays rellenos del mallador).
 */
export function connectMask(get, x, y, z, id) {
  const fam = B_FAMILY[id];
  if (fam !== FAM.FENCE && fam !== FAM.WALL) return 0;
  let m = 0;
  for (let d = 0; d < 4; d++) if (connectsTo(fam, get(x + FACING_VEC[d][0], y, z + FACING_VEC[d][1]), d)) m |= 1 << d;
  return m;
}
/** ¿Se une una valla/muro (familia fam) al bloque vecino n, que está en la dirección d (0 N, 1 E, 2 S, 3 O)? */
export function connectsTo(fam, n, d = -1) {
  const nf = B_FAMILY[n];
  // a una puerta de valla solo si está alineada con la línea de la valla (no por su costado)
  if (nf === FAM.GATE) return d < 0 || (BLOCKS[n].facing % 2) !== (d % 2);
  return nf === fam || (B_OPAQUE[n] === 1 && B_SOLID[n] === 1);
}

function withArms(core, armSet, mask) {
  const out = [core];
  for (let d = 0; d < 4; d++) if (mask & (1 << d)) out.push(...PRE[armSet][d]);
  return out;
}
// Vallas y muros: las 16 combinaciones de brazos precalculadas (sin crear arrays en los bucles de física)
const MASKED = {};
for (const [name, core, arms] of [
  ['fenceR', FENCE_POST, 'fenceArm'], ['fenceC', FENCE_POST_COL, 'fenceArmCol'], ['fenceS', FENCE_POST, 'fenceArmSel'],
  ['wallR', WALL_POST, 'wallArm'], ['wallC', WALL_POST_COL, 'wallArmCol'],
]) MASKED[name] = Array.from({ length: 16 }, (_, m) => withArms(core, arms, m));

/** Cajas que se dibujan (solo formas de familia). mask solo importa para vallas y muros. */
export function renderBoxes(id, mask = 0) {
  const b = BLOCKS[id];
  switch (B_FAMILY[id]) {
    case FAM.STAIRS: return PRE[b.top ? 'stairsTop' : 'stairs'][b.facing];
    case FAM.LADDER: return PRE.panel[b.facing];
    case FAM.DOOR: return PRE[b.open ? 'doorOpen' : 'panel'][b.facing];
    case FAM.FENCE: return MASKED.fenceR[mask & 15];
    case FAM.WALL: return MASKED.wallR[mask & 15];
    case FAM.GATE: return PRE[b.open ? 'gateOpen' : 'gateClosed'][b.facing];
    case FAM.TRAPDOOR: return b.open ? PRE.panel[b.facing] : (b.top ? TRAP_TOP : TRAP_BOTTOM);
    case FAM.CUSTOM: return CUSTOM_R[id];
    default: return FULL;
  }
}

/** Cajas de colisión. Vallas, muros y puertas de valla cerradas miden 1,5 (no se pueden saltar). */
export function collisionBoxes(id, mask = 0) {
  const b = BLOCKS[id];
  switch (B_FAMILY[id]) {
    case FAM.STAIRS: case FAM.LADDER: case FAM.DOOR: case FAM.TRAPDOOR: return renderBoxes(id);
    case FAM.FENCE: return MASKED.fenceC[mask & 15];
    case FAM.WALL: return MASKED.wallC[mask & 15];
    case FAM.GATE: return b.open ? EMPTY : PRE.gateCol[b.facing];
    case FAM.CUSTOM: return CUSTOM_C[id];
    default: return BASE_COL[id];
  }
}

/** Cajas para apuntar con el cursor (altura máxima 1). */
export function selectionBoxes(id, mask = 0) {
  const b = BLOCKS[id];
  switch (B_FAMILY[id]) {
    case FAM.STAIRS: case FAM.LADDER: case FAM.DOOR: case FAM.TRAPDOOR: return renderBoxes(id);
    case FAM.FENCE: return MASKED.fenceS[mask & 15];
    case FAM.WALL: return MASKED.wallR[mask & 15];
    case FAM.GATE: return PRE.gateSel[b.facing]; // abierta o cerrada: la franja central (fácil de apuntar para cerrarla)
    case FAM.CUSTOM: return CUSTOM_R[id];
    default: return BASE_SEL[id];
  }
}

/** Bloques cuya colisión sobresale por encima de su celda (vallas, muros, puertas de valla: 1,5). */
export const B_TALLCOL = new Uint8Array(MAX_BLOCKS);
for (const b of BLOCKS) {
  if (!b) continue;
  const f = B_FAMILY[b.id];
  if (f === FAM.FENCE || f === FAM.WALL || (f === FAM.GATE && !b.open)) B_TALLCOL[b.id] = 1;
}

/**
 * Cara superior/lateral "firme" (bloque completo): sirve de muro para antorchas de pared y escaleras de mano,
 * y de suelo para puertas. Las formas de cajas y las losas no cuentan.
 */
export const B_STURDY = new Uint8Array(MAX_BLOCKS);
for (const b of BLOCKS) if (b && B_SOLID[b.id] && B_SHAPE[b.id] === SHAPE_ID.cube) B_STURDY[b.id] = 1;

/** Caja que envuelve una lista de cajas. */
export function boxesBounds(boxes) {
  if (!boxes.length) return [0, 0, 0, 1, 1, 1];
  const r = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const b of boxes) for (let i = 0; i < 3; i++) { r[i] = Math.min(r[i], b[i]); r[i + 3] = Math.max(r[i + 3], b[i + 3]); }
  return r;
}

/**
 * Gira 90°·k (N→E→S→O) un bloque orientado: escaleras, puertas, escaleras de mano, puertas de valla,
 * trampillas, modelos propios con orientación y antorchas de pared. Los demás no cambian.
 * (Lo usan las estructuras al construir piezas giradas.)
 */
export function rotateBlockId(id, k) {
  k &= 3;
  if (!k) return id;
  const b = BLOCKS[id];
  if (!b) return id;
  if (b.dir) { // antorchas de pared: dir 1:+X 2:−X 3:+Z 4:−Z (lado del soporte); id = antorcha + dir
    const f = [0, 1, 3, 2, 0][b.dir];
    return id - b.dir + [4, 1, 3, 2][(f + k) & 3];
  }
  const fam = B_FAMILY[id];
  if (!fam || fam === FAM.FENCE || fam === FAM.WALL) return id;
  if (fam === FAM.CUSTOM && !b.oriented) return id;
  return id - b.facing + ((b.facing + k) & 3);
}

/** Dirección horizontal (0..3) más parecida a un vector (x, z). */
export function facingFromVector(x, z) {
  if (Math.abs(x) > Math.abs(z)) return x > 0 ? 1 : 3;
  return z > 0 ? 2 : 0;
}
