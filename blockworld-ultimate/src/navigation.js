// Navegación de criaturas: búsqueda A* sobre celdas transitables del mundo de bloques (pies en la celda,
// cabeza libre, suelo debajo). Permite subir 1 bloque, bajar hasta `maxDrop` y cruzar puertas de madera
// (que el que camina abre y cierra). Sin DOM: se prueba en Node con el mundo real.
import { B_SOLID, B_FLUID, BLOCKS } from './blocks.js';
import { B_FAMILY, FAM, B_TALLCOL } from './shapes.js';
import { WORLD_HEIGHT as WH } from './config.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** ¿Es una puerta que un aldeano puede abrir con la mano? (madera: puertas, puertas de valla y trampillas no) */
export function isOpenableDoor(id) {
  const f = B_FAMILY[id];
  if (f === FAM.DOOR) return BLOCKS[id].sound === 'wood';
  return f === FAM.GATE;
}

/** ¿Se puede ocupar la celda (sin chocar)? Las puertas de madera cuentan como paso si `doors`. */
function passable(world, x, y, z, doors) {
  if (y < 0 || y >= WH) return false;
  const id = world.getBlock(x, y, z);
  if (id === 0) return true;
  if (B_FLUID[id] === 2) return false;
  if (doors && isOpenableDoor(id)) return true;
  if (!world.isLoaded(x, z)) return false;
  return world.collisionBoxes(x, y, z).length === 0;
}

/** ¿Hay suelo firme bajo (x,y,z)? (bloques sólidos salvo vallas/muros/puertas) */
function ground(world, x, y, z) {
  const id = world.getBlock(x, y - 1, z);
  if (B_FLUID[id] === 1) return true; // se puede nadar
  if (!B_SOLID[id] || B_TALLCOL[id]) return false;
  const f = B_FAMILY[id];
  return f !== FAM.DOOR && f !== FAM.GATE && f !== FAM.LADDER;
}

/** ¿Puede estar de pie una criatura de 2 de alto en (x,y,z)? */
export function standable(world, x, y, z, doors = true) {
  return passable(world, x, y, z, doors) && passable(world, x, y + 1, z, doors) && ground(world, x, y, z);
}

/**
 * Camino de (sx,sy,sz) a (tx,ty,tz) en celdas enteras (pies). Devuelve [[x,y,z], ...] desde el siguiente paso
 * hasta el destino (o hasta la celda explorada más cercana si `partial` y no se alcanza), o null.
 * opts: {maxNodes=1500, maxDrop=3, doors=true, partial=true, range=0 (llegar a esa distancia basta)}
 */
export function findPath(world, sx, sy, sz, tx, ty, tz, opts = {}) {
  const maxNodes = opts.maxNodes ?? 1500, maxDrop = opts.maxDrop ?? 3, doors = opts.doors !== false;
  const partial = opts.partial !== false, range = opts.range ?? 0;
  const key = (x, y, z) => `${x},${y},${z}`;
  const h = (x, y, z) => Math.abs(x - tx) + Math.abs(z - tz) + Math.abs(y - ty) * 0.5;
  const open = new MinHeap();
  const came = new Map(), gScore = new Map();
  const startK = key(sx, sy, sz);
  gScore.set(startK, 0);
  open.push([h(sx, sy, sz), sx, sy, sz]);
  let best = [sx, sy, sz], bestH = h(sx, sy, sz), expanded = 0;
  const closed = new Set();
  while (open.size && expanded < maxNodes) {
    const [, x, y, z] = open.pop();
    const k = key(x, y, z);
    if (closed.has(k)) continue;
    closed.add(k); expanded++;
    const hh = h(x, y, z);
    if (hh < bestH) { bestH = hh; best = [x, y, z]; }
    if ((x === tx && y === ty && z === tz) || (range > 0 && Math.abs(x - tx) + Math.abs(z - tz) <= range && Math.abs(y - ty) <= 1)) {
      return rebuild(came, k, key, x, y, z, startK);
    }
    const g0 = gScore.get(k);
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      let ny = null, cost = 1;
      if (standable(world, nx, y, nz, doors)) ny = y;
      else if (passable(world, x, y + 2, z, doors) && standable(world, nx, y + 1, nz, doors)) { ny = y + 1; cost = 1.6; }
      else if (passable(world, nx, y, nz, doors) && passable(world, nx, y + 1, nz, doors)) {
        for (let d = 1; d <= maxDrop; d++) {
          if (!passable(world, nx, y - d, nz, doors)) break;
          if (ground(world, nx, y - d, nz)) { ny = y - d; cost = 1 + d * 0.4; break; }
        }
      }
      if (ny === null) continue;
      if (B_FLUID[world.getBlock(nx, ny, nz)] === 1) cost += 4; // evitar el agua
      const nk = key(nx, ny, nz);
      if (closed.has(nk)) continue;
      const ng = g0 + cost;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng); came.set(nk, [x, y, z]);
        open.push([ng + h(nx, ny, nz), nx, ny, nz]);
      }
    }
  }
  if (!partial || (best[0] === sx && best[1] === sy && best[2] === sz)) return null;
  return rebuild(came, key(best[0], best[1], best[2]), key, best[0], best[1], best[2], startK);
}

function rebuild(came, k, key, x, y, z, startK) {
  const out = [[x, y, z]];
  let cur = came.get(k);
  while (cur && key(cur[0], cur[1], cur[2]) !== startK) { out.push(cur); cur = came.get(key(cur[0], cur[1], cur[2])); }
  return out.reverse();
}

/** Montículo binario mínimo de [prioridad, ...] */
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(v) {
    const a = this.a; a.push(v); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}
