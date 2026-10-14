// Colisiones AABB contra el mundo de bloques (barrido por ejes) usando las cajas de colisión de cada bloque
// (cubos, losas, escaleras, puertas, vallas de 1,5 de alto...). Usado por el jugador y por todas las criaturas.
// Una entidad tiene: x,y,z (pies, centro), w (ancho), h (alto) y, opcionalmente, stepHeight (subida de
// escalones: con 0,6 se suben escaleras y losas andando, pero un bloque completo exige saltar).

const EPS = 1e-5;
const CELL_TOL = 1e-7;
const NONE = [];
/** Capa extra de abajo: solo cuentan las cajas que sobresalen de su celda (vallas de 1,5...). */
const colTall = (world, x, y, z) => (world.collisionBoxesTall ? world.collisionBoxesTall(x, y, z) : NONE);

/** ¿Solapa la caja con alguna caja de colisión del mundo? */
export function boxCollides(world, x, y, z, w, h) {
  const hw = w / 2;
  const ax0 = x - hw, ax1 = x + hw, ay0 = y, ay1 = y + h, az0 = z - hw, az1 = z + hw;
  const x0 = Math.floor(ax0 + EPS), x1 = Math.ceil(ax1 - EPS) - 1;
  const y0 = Math.floor(ay0 + EPS) - 1, y1 = Math.ceil(ay1 - EPS) - 1; // −1: cajas de 1,5 de la celda de abajo
  const z0 = Math.floor(az0 + EPS), z1 = Math.ceil(az1 - EPS) - 1;
  for (let cy = y0; cy <= y1; cy++) for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const boxes = cy === y0 ? colTall(world, cx, cy, cz) : world.collisionBoxes(cx, cy, cz);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (cx + b[0] < ax1 - EPS && cx + b[3] > ax0 + EPS && cy + b[1] < ay1 - EPS && cy + b[4] > ay0 + EPS && cz + b[2] < az1 - EPS && cz + b[5] > az0 + EPS) return true;
    }
  }
  return false;
}

const LO = [0, 0, 0], HI = [0, 0, 0], BLO = [0, 0, 0], BHI = [0, 0, 0];

/** Mueve la entidad `d` a lo largo de un eje (0=x,1=y,2=z) y devuelve el desplazamiento real. */
function sweep(world, e, axis, d) {
  if (d === 0) return 0;
  const hw = e.w / 2;
  LO[0] = e.x - hw; LO[1] = e.y; LO[2] = e.z - hw;
  HI[0] = e.x + hw; HI[1] = e.y + e.h; HI[2] = e.z + hw;
  let f0 = LO[0], f1 = LO[1], f2 = LO[2], t0 = HI[0], t1 = HI[1], t2 = HI[2];
  if (axis === 0) { if (d > 0) t0 += d; else f0 += d; }
  else if (axis === 1) { if (d > 0) t1 += d; else f1 += d; }
  else if (d > 0) t2 += d; else f2 += d;
  const x0 = Math.floor(f0 + CELL_TOL), x1 = Math.ceil(t0 - CELL_TOL) - 1;
  const y0 = Math.floor(f1 + CELL_TOL) - 1, y1 = Math.ceil(t1 - CELL_TOL) - 1;
  const z0 = Math.floor(f2 + CELL_TOL), z1 = Math.ceil(t2 - CELL_TOL) - 1;
  for (let cy = y0; cy <= y1; cy++) for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const boxes = cy === y0 ? colTall(world, cx, cy, cz) : world.collisionBoxes(cx, cy, cz);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      BLO[0] = cx + b[0]; BLO[1] = cy + b[1]; BLO[2] = cz + b[2];
      BHI[0] = cx + b[3]; BHI[1] = cy + b[4]; BHI[2] = cz + b[5];
      let overlap = true;
      for (let k = 0; k < 3; k++) {
        if (k === axis) continue;
        if (!(LO[k] < BHI[k] - EPS && HI[k] > BLO[k] + EPS)) { overlap = false; break; }
      }
      if (!overlap) continue;
      if (d > 0 && BLO[axis] >= HI[axis] - EPS) d = Math.min(d, BLO[axis] - HI[axis]);
      else if (d < 0 && BHI[axis] <= LO[axis] + EPS) d = Math.max(d, BHI[axis] - LO[axis]);
    }
  }
  if (axis === 0) e.x += d; else if (axis === 1) e.y += d; else e.z += d;
  return d;
}

/**
 * Mueve la entidad (dx,dy,dz) con colisiones. Actualiza e.onGround, e.hitX, e.hitZ, e.hitHead y e.stepped
 * (altura subida por escalones en este movimiento, para suavizar la cámara).
 * Divide el movimiento en pasos pequeños para no atravesar bloques a gran velocidad.
 */
export function moveEntity(world, e, dx, dy, dz) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.4));
  const sx = dx / steps, sy = dy / steps, sz = dz / steps;
  const stepH = e.stepHeight || 0;
  e.hitX = e.hitZ = e.hitHead = false;
  e.stepped = 0;
  let grounded = false;
  let ground = !!e.onGround;
  for (let i = 0; i < steps; i++) {
    const ry = sweep(world, e, 1, sy);
    if (sy < 0 && ry > sy + 1e-9) { grounded = true; ground = true; }
    if (sy > 0 && ry < sy - 1e-9) { e.hitHead = true; }
    if (ry !== sy) e.vy = 0;
    if (sx === 0 && sz === 0) continue;
    const ox = e.x, oy = e.y, oz = e.z;
    let rx = sx !== 0 ? sweep(world, e, 0, sx) : 0;
    let rz = sz !== 0 ? sweep(world, e, 2, sz) : 0;
    let bx = Math.abs(rx - sx) > 1e-9, bz = Math.abs(rz - sz) > 1e-9;
    // Subida de escalón: subir, avanzar y volver a bajar; se acepta si se avanza más que sin subir.
    if ((bx || bz) && ground && stepH > 0 && sy <= 1e-9) {
      const ax = e.x, ay = e.y, az = e.z;
      e.x = ox; e.y = oy; e.z = oz;
      const up = sweep(world, e, 1, stepH);
      const rx2 = sx !== 0 ? sweep(world, e, 0, sx) : 0;
      const rz2 = sz !== 0 ? sweep(world, e, 2, sz) : 0;
      sweep(world, e, 1, -up - 1e-4);
      if (up > 1e-6 && rx2 * rx2 + rz2 * rz2 > rx * rx + rz * rz + 1e-9 && e.y > oy - 1e-6 && !onTallTop(world, e)) {
        e.stepped += e.y - oy;
        rx = rx2; rz = rz2;
        bx = Math.abs(rx - sx) > 1e-9; bz = Math.abs(rz - sz) > 1e-9;
        grounded = true;
      } else { e.x = ax; e.y = ay; e.z = az; }
    }
    if (bx) { e.hitX = true; e.vx = 0; }
    if (bz) { e.hitZ = true; e.vz = 0; }
  }
  e.onGround = grounded || (dy <= 0 && isOnGround(world, e));
}

/** ¿Está la entidad de pie sobre el tope de una valla/muro (1,5)? La subida de escalones no lleva ahí: corrales. */
function onTallTop(world, e) {
  const hw = e.w / 2, cy = Math.floor(e.y - 1e-3) - 1;
  const x0 = Math.floor(e.x - hw + EPS), x1 = Math.ceil(e.x + hw - EPS) - 1;
  const z0 = Math.floor(e.z - hw + EPS), z1 = Math.ceil(e.z + hw - EPS) - 1;
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const boxes = colTall(world, cx, cy, cz);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (cy + b[4] > 1 + cy && cy + b[4] >= e.y - 0.01 && cx + b[0] < e.x + hw - EPS && cx + b[3] > e.x - hw + EPS && cz + b[2] < e.z + hw - EPS && cz + b[5] > e.z - hw + EPS) return true;
    }
  }
  return false;
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
