// Raycast de vóxeles (Amanatides & Woo) con cajas de selección reales (losas, antorchas, plantas...).
import { B_TARGET, B_SHAPE, B_HEIGHT, B_FLUID, BLOCKS } from './blocks.js';

const SHAPE = { CUBE: 1, CROSS: 2, FLUID: 3, TORCH: 4, SLAB: 5, FARMLAND: 6 };

/** Caja de selección local (0..1) de un bloque: [minx,miny,minz,maxx,maxy,maxz]. */
export function selectionBox(id) {
  switch (B_SHAPE[id]) {
    case SHAPE.CROSS: return [0.15, 0, 0.15, 0.85, 0.85, 0.85];
    case SHAPE.TORCH: return [0.375, 0, 0.375, 0.625, 0.7, 0.625];
    case SHAPE.SLAB: case SHAPE.FARMLAND: return [0, 0, 0, 1, B_HEIGHT[id], 1];
    default: return [0, 0, 0, 1, 1, 1];
  }
}

/** Intersección rayo–AABB. Devuelve {t, nx, ny, nz} (entrada) o null. */
export function rayAABB(ox, oy, oz, dx, dy, dz, min, max) {
  let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0, nz = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) { if (o[a] < min[a] || o[a] > max[a]) return null; continue; }
    let t1 = (min[a] - o[a]) / d[a], t2 = (max[a] - o[a]) / d[a];
    let sgn = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sgn = 1; }
    if (t1 > tmin) { tmin = t1; nx = ny = nz = 0; if (a === 0) nx = sgn; else if (a === 1) ny = sgn; else nz = sgn; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(tmin, 0), nx, ny, nz };
}

/**
 * Lanza un rayo desde (ox,oy,oz) con dirección unitaria (dx,dy,dz) hasta maxDist.
 * opts.fluids: también golpea agua/lava (para cubos).
 * @returns {{x:number,y:number,z:number,nx:number,ny:number,nz:number,dist:number,id:number}|null}
 */
export function raycastBlocks(world, ox, oy, oz, dx, dy, dz, maxDist, opts = {}) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmx = dx !== 0 ? ((dx > 0 ? x + 1 - ox : ox - x) * tdx) : Infinity;
  let tmy = dy !== 0 ? ((dy > 0 ? y + 1 - oy : oy - y) * tdy) : Infinity;
  let tmz = dz !== 0 ? ((dz > 0 ? z + 1 - oz : oz - z) * tdz) : Infinity;
  let t = 0;
  for (let i = 0; i < 200; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== 0 && (B_TARGET[id] || (opts.fluids && B_FLUID[id]))) {
      const box = selectionBox(id);
      const hit = rayAABB(ox - x, oy - y, oz - z, dx, dy, dz, [box[0], box[1], box[2]], [box[3], box[4], box[5]]);
      if (hit && hit.t <= maxDist) {
        // Si empezamos dentro de la caja, normal = opuesta a la dirección dominante
        let { nx, ny, nz } = hit;
        if (!nx && !ny && !nz) { const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz); if (ax >= ay && ax >= az) nx = -sx; else if (ay >= az) ny = -sy; else nz = -sz; }
        return { x, y, z, nx, ny, nz, dist: hit.t, id };
      }
    }
    // avanzar
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; }
    else { z += sz; t = tmz; tmz += tdz; }
    if (t > maxDist) return null;
  }
  return null;
}
void BLOCKS;
