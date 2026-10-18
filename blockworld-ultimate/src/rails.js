// Raíles: forma automática según los raíles vecinos (rectos, curvas y rampas) y geometría del recorrido de una
// vagoneta dentro de una celda. Funciones puras sobre un objeto con getBlock/setBlock. Sin DOM.
import { BLOCKS, MAX_BLOCKS, ID } from './blocks.js';

export const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 0 N, 1 E, 2 S, 3 O
export const opposite = (d) => (d + 2) & 3;

/** Información de raíl por ID (o null). */
export const RAIL = new Array(MAX_BLOCKS).fill(null);
for (const b of BLOCKS) if (b && b.rail) RAIL[b.id] = b.rail;
export const isRail = (id) => !!RAIL[id];

// Índices de forma → ID, para raíles normales y propulsores (apagados/encendidos)
const key = (a, b, asc) => `${Math.min(a, b)},${Math.max(a, b)},${asc}`;
const NORMAL = new Map(), BOOST = new Map(), BOOST_ON = new Map();
for (const b of BLOCKS) {
  if (!b || !b.rail) continue;
  const r = b.rail, k = key(r.a, r.b, r.asc);
  (r.booster ? (r.on ? BOOST_ON : BOOST) : NORMAL).set(k, b.id);
}
/** ID del raíl del mismo tipo (normal / propulsor encendido o apagado) con la forma pedida, o -1 si no existe. */
export function railId(sample, a, b, asc = -1) {
  const r = RAIL[sample];
  const map = !r || !r.booster ? NORMAL : r.on ? BOOST_ON : BOOST;
  return map.get(key(a, b, asc)) ?? -1;
}
/** El mismo raíl propulsor con otro estado de energía. */
export function boosterWithPower(id, on) {
  const r = RAIL[id];
  if (!r || !r.booster || r.on === on) return id;
  return (on ? BOOST_ON : BOOST).get(key(r.a, r.b, r.asc)) ?? id;
}

/** Direcciones (con desnivel) en las que hay un raíl vecino que podría unirse a (x,y,z). */
function neighbours(w, x, y, z) {
  const out = [];
  for (let d = 0; d < 4; d++) {
    const nx = x + DIRV[d][0], nz = z + DIRV[d][1];
    if (isRail(w.getBlock(nx, y, nz))) out.push({ d, dy: 0 });
    else if (isRail(w.getBlock(nx, y + 1, nz))) out.push({ d, dy: 1 });
    else if (isRail(w.getBlock(nx, y - 1, nz))) out.push({ d, dy: -1 });
  }
  return out;
}
/** ¿Apunta el raíl de (x,y,z) hacia la dirección d? */
export function railConnects(w, x, y, z, d) { const r = RAIL[w.getBlock(x, y, z)]; return !!r && (r.a === d || r.b === d); }

/**
 * Forma que debería tener el raíl de (x,y,z) según sus vecinos. Los propulsores no hacen curvas.
 * Prioridad: dos vecinos enfrentados (recto) > dos en ángulo (curva) > uno (recto hacia él) > el que ya tiene.
 */
export function railShapeFor(w, x, y, z) {
  const id = w.getBlock(x, y, z), r = RAIL[id];
  if (!r) return id;
  const nb = neighbours(w, x, y, z);
  // los vecinos que ya están unidos a otros dos raíles y no apuntan aquí no cuentan
  const want = nb.filter((n) => {
    const nx = x + DIRV[n.d][0], ny = y + n.dy, nz = z + DIRV[n.d][1];
    if (railConnects(w, nx, ny, nz, opposite(n.d))) return true;
    return !full(w, nx, ny, nz);
  });
  const has = (d) => want.find((n) => n.d === d);
  let a = r.a, b = r.b, asc = -1;
  if (has(0) && has(2)) { a = 0; b = 2; }
  else if (has(1) && has(3)) { a = 1; b = 3; }
  else if (want.length >= 2 && !r.booster) { const ds = want.map((n) => n.d).sort(); a = ds[0]; b = ds[1]; if (a === 0 && b === 3) { a = 3; b = 0; } }
  else if (want.length >= 1) { const d = want[0].d; a = d % 2 ? 1 : 0; b = d % 2 ? 3 : 2; }
  // rampa: si en la dirección de un extremo recto el vecino está un bloque más arriba
  if ((a + 2) % 4 === b || (b + 2) % 4 === a) for (const n of want) if (n.dy === 1 && (n.d === a || n.d === b)) asc = n.d;
  const nid = railId(id, a, b, asc);
  return nid >= 0 ? nid : id;
}
/** ¿Tiene el raíl de (x,y,z) sus dos extremos unidos a otros raíles? */
function full(w, x, y, z) {
  const r = RAIL[w.getBlock(x, y, z)];
  if (!r) return false;
  let n = 0;
  for (const d of [r.a, r.b]) {
    const nx = x + DIRV[d][0], nz = z + DIRV[d][1];
    const up = r.asc === d ? 1 : 0;
    if (isRail(w.getBlock(nx, y + up, nz)) || isRail(w.getBlock(nx, y - 1 + up, nz))) n++;
  }
  return n >= 2;
}

/** Recalcula la forma del raíl de (x,y,z) y de sus vecinos (al colocar o quitar raíles). */
export function updateRailsAround(w, x, y, z) {
  const fix = (px, py, pz) => { const cur = w.getBlock(px, py, pz); if (!isRail(cur)) return; const n = railShapeFor(w, px, py, pz); if (n !== cur) w.setBlock(px, py, pz, n); };
  fix(x, y, z);
  for (let d = 0; d < 4; d++) for (const dy of [-1, 0, 1]) fix(x + DIRV[d][0], y + dy, z + DIRV[d][1]);
  fix(x, y, z);
}

// ── Recorrido dentro de una celda ────────────────────────────────
const edge = (d) => [0.5 + DIRV[d][0] * 0.5, 0.5 + DIRV[d][1] * 0.5];
/**
 * Posición local (lx, ly, lz) a lo largo del recorrido entrada → salida, con t ∈ [0,1].
 * Rectas y curvas pasan por el centro de la celda; en las rampas la altura sube hacia `asc`.
 */
export function railPoint(rail, entry, exit, t) {
  const A = edge(entry), B = edge(exit), C = [0.5, 0.5];
  let lx, lz;
  if (t < 0.5) { lx = A[0] + (C[0] - A[0]) * t * 2; lz = A[1] + (C[1] - A[1]) * t * 2; }
  else { lx = C[0] + (B[0] - C[0]) * (t * 2 - 1); lz = C[1] + (B[1] - C[1]) * (t * 2 - 1); }
  let ly = 1 / 16;
  if (rail.asc >= 0) ly = 0.5 + (lx - 0.5) * DIRV[rail.asc][0] + (lz - 0.5) * DIRV[rail.asc][1] + 1 / 16;
  return [lx, ly, lz];
}

/**
 * Siguiente celda al salir de (x,y,z) por la dirección `exit`. Devuelve {x,y,z,entry,exitDir} o null si la vía se
 * acaba o el raíl siguiente no está unido por ese lado.
 */
export function nextRailCell(w, x, y, z, exit) {
  const r = RAIL[w.getBlock(x, y, z)];
  const nx = x + DIRV[exit][0], nz = z + DIRV[exit][1];
  const up = r && r.asc === exit ? 1 : 0;
  const entry = opposite(exit);
  for (const ny of up ? [y + 1] : [y, y - 1]) {
    const nr = RAIL[w.getBlock(nx, ny, nz)];
    if (!nr) continue;
    if (ny === y - 1 && nr.asc !== entry) continue; // bajar solo a una rampa que suba hacia nosotros
    if (nr.a !== entry && nr.b !== entry) return null;
    return { x: nx, y: ny, z: nz, entry, exitDir: nr.a === entry ? nr.b : nr.a };
  }
  return null;
}
export { ID };
