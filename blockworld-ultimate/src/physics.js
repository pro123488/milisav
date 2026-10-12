// Colisiones AABB contra el mundo de bloques (barrido por ejes). Usado por el jugador y por todas las criaturas.
// Una entidad tiene: x,y,z (pies, centro), w (ancho), h (alto).

const EPS = 1e-5;
const CELL_TOL = 1e-7;

/** ¿Solapa la caja con algún bloque sólido? */
export function boxCollides(world, x, y, z, w, h) {
  const hw = w / 2;
  const x0 = Math.floor(x - hw + EPS), x1 = Math.ceil(x + hw - EPS) - 1;
  const y0 = Math.floor(y + EPS), y1 = Math.ceil(y + h - EPS) - 1;
  const z0 = Math.floor(z - hw + EPS), z1 = Math.ceil(z + hw - EPS) - 1;
  for (let cy = y0; cy <= y1; cy++) for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const hg = world.collisionHeight(cx, cy, cz);
    if (hg > 0 && cy + hg > y + EPS) return true;
  }
  return false;
}

/** Mueve la entidad `d` a lo largo de un eje (0=x,1=y,2=z) y devuelve el desplazamiento real. */
function sweep(world, e, axis, d) {
  if (d === 0) return 0;
  const hw = e.w / 2;
  const lo = [e.x - hw, e.y, e.z - hw];
  const hi = [e.x + hw, e.y + e.h, e.z + hw];
  const from = lo.slice(), to = hi.slice();
  if (d > 0) to[axis] += d; else from[axis] += d;
  const x0 = Math.floor(from[0] + CELL_TOL), x1 = Math.ceil(to[0] - CELL_TOL) - 1;
  const y0 = Math.floor(from[1] + CELL_TOL), y1 = Math.ceil(to[1] - CELL_TOL) - 1;
  const z0 = Math.floor(from[2] + CELL_TOL), z1 = Math.ceil(to[2] - CELL_TOL) - 1;
  const a1 = axis === 0 ? 1 : 0, a2 = axis === 2 ? 1 : 2; // otros dos ejes
  const otherA = axis === 0 ? 1 : axis === 1 ? 0 : 0;
  void a1; void a2; void otherA;
  for (let cy = y0; cy <= y1; cy++) for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const hg = world.collisionHeight(cx, cy, cz);
    if (hg <= 0) continue;
    const blo = [cx, cy, cz], bhi = [cx + 1, cy + hg, cz + 1];
    let overlap = true;
    for (let k = 0; k < 3; k++) {
      if (k === axis) continue;
      if (!(lo[k] < bhi[k] - EPS && hi[k] > blo[k] + EPS)) { overlap = false; break; }
    }
    if (!overlap) continue;
    if (d > 0 && blo[axis] >= hi[axis] - EPS) d = Math.min(d, blo[axis] - hi[axis]);
    else if (d < 0 && bhi[axis] <= lo[axis] + EPS) d = Math.max(d, bhi[axis] - lo[axis]);
  }
  if (axis === 0) e.x += d; else if (axis === 1) e.y += d; else e.z += d;
  return d;
}

/**
 * Mueve la entidad (dx,dy,dz) con colisiones. Actualiza e.onGround, e.hitX, e.hitZ, e.hitHead.
 * Divide el movimiento en pasos pequeños para no atravesar bloques a gran velocidad.
 */
export function moveEntity(world, e, dx, dy, dz) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.4));
  const sx = dx / steps, sy = dy / steps, sz = dz / steps;
  e.hitX = e.hitZ = e.hitHead = false;
  let grounded = false;
  for (let i = 0; i < steps; i++) {
    const ry = sweep(world, e, 1, sy);
    if (sy < 0 && ry > sy + 1e-9) grounded = true;
    if (sy > 0 && ry < sy - 1e-9) { e.hitHead = true; }
    if (ry !== sy) e.vy = 0;
    if (sx !== 0) { const rx = sweep(world, e, 0, sx); if (Math.abs(rx - sx) > 1e-9) { e.hitX = true; e.vx = 0; } }
    if (sz !== 0) { const rz = sweep(world, e, 2, sz); if (Math.abs(rz - sz) > 1e-9) { e.hitZ = true; e.vz = 0; } }
  }
  e.onGround = grounded || (dy <= 0 && isOnGround(world, e));
}

/** ¿Hay suelo justo debajo de los pies? */
export function isOnGround(world, e) {
  return boxCollides(world, e.x, e.y - 0.02, e.z, e.w, 0.02 + 1e-3) && !boxCollides(world, e.x, e.y + 0.001, e.z, e.w, 0.01);
}

/** Si la entidad está incrustada en bloques, la sube hasta un hueco libre (máx. `maxUp` bloques). */
export function unstick(world, e, maxUp = 6) {
  if (!boxCollides(world, e.x, e.y, e.z, e.w, e.h)) return false;
  for (let k = 1; k <= maxUp * 4; k++) {
    if (!boxCollides(world, e.x, e.y + k * 0.25, e.z, e.w, e.h)) { e.y += k * 0.25; return true; }
  }
  return false;
}
