// Raycast de vóxeles (Amanatides & Woo) con las cajas de selección reales de cada bloque (losas, antorchas,
// plantas, escaleras, puertas, vallas...). Devuelve también el punto de impacto y la caja envolvente.
import { B_TARGET, B_FLUID, B_FLUIDLVL } from './blocks.js';
import { selectionBoxes, needsMask, connectMask, boxesBounds, FULL_BOX } from './shapes.js';

const FULL = [FULL_BOX];

/** Cajas de selección del bloque `id` situado en (x,y,z) del mundo (las vallas dependen de sus vecinos). */
export function selectionBoxesAt(world, x, y, z, id) {
  if (!needsMask(id)) return selectionBoxes(id);
  return selectionBoxes(id, connectMask((a, b, c) => world.getBlock(a, b, c), x, y, z, id));
}

/**
 * ¿Bloquean las cajas de COLISIÓN del mundo el segmento a→b? (línea de visión de criaturas y proyectiles:
 * una puerta cerrada o una valla tapan; una puerta abierta, una flor o el hueco de una escalera no).
 */
export function segmentBlocked(world, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return false;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  let x = Math.floor(ax), y = Math.floor(ay), z = Math.floor(az);
  const sx = ux > 0 ? 1 : -1, sy = uy > 0 ? 1 : -1, sz = uz > 0 ? 1 : -1;
  const tdx = ux !== 0 ? Math.abs(1 / ux) : Infinity, tdy = uy !== 0 ? Math.abs(1 / uy) : Infinity, tdz = uz !== 0 ? Math.abs(1 / uz) : Infinity;
  let tmx = ux !== 0 ? ((ux > 0 ? x + 1 - ax : ax - x) * tdx) : Infinity;
  let tmy = uy !== 0 ? ((uy > 0 ? y + 1 - ay : ay - y) * tdy) : Infinity;
  let tmz = uz !== 0 ? ((uz > 0 ? z + 1 - az : az - z) * tdz) : Infinity;
  for (let i = 0; i < 256; i++) {
    const boxes = world.collisionBoxes(x, y, z);
    for (let k = 0; k < boxes.length; k++) {
      const b = boxes[k];
      const h = rayAABB(ax - x, ay - y, az - z, ux, uy, uz, [b[0], b[1], b[2]], [b[3], b[4], b[5]]);
      if (h && h.t <= len) return true;
    }
    let t;
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; }
    else { z += sz; t = tmz; tmz += tdz; }
    if (t > len) return false;
  }
  return false;
}

/** Caja de selección envolvente (local 0..1) de un bloque sin contexto de vecinos. */
export function selectionBox(id) { return boxesBounds(selectionBoxes(id)); }

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
 * opts.fluids: también golpea agua/lava (para cubos); 'source' = solo fuentes (el agua que corre se atraviesa).
 * @returns {{x:number,y:number,z:number,nx:number,ny:number,nz:number,dist:number,id:number,
 *   px:number,py:number,pz:number,box:number[]}|null} px,py,pz = punto de impacto; box = caja envolvente local
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
    const isFluid = opts.fluids && B_FLUID[id] && (opts.fluids !== 'source' || B_FLUIDLVL[id] === 0);
    if (id !== 0 && (B_TARGET[id] || isFluid)) {
      const boxes = isFluid ? FULL : selectionBoxesAt(world, x, y, z, id);
      let best = null;
      for (const box of boxes) {
        const hit = rayAABB(ox - x, oy - y, oz - z, dx, dy, dz, [box[0], box[1], box[2]], [box[3], box[4], box[5]]);
        if (hit && hit.t <= maxDist && (!best || hit.t < best.t)) best = hit;
      }
      if (best) {
        // Si empezamos dentro de la caja, normal = opuesta a la dirección dominante
        let { nx, ny, nz } = best;
        if (!nx && !ny && !nz) { const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz); if (ax >= ay && ax >= az) nx = -sx; else if (ay >= az) ny = -sy; else nz = -sz; }
        return {
          x, y, z, nx, ny, nz, dist: best.t, id,
          px: ox + dx * best.t, py: oy + dy * best.t, pz: oz + dz * best.t, box: boxesBounds(boxes),
        };
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
