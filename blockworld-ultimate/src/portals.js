// Portales umbríos: un Núcleo de portal rodeado (en el mismo plano) por 8 bloques de vidrio volcánico. Con la Llave
// umbría el núcleo se activa y levanta un velo de dos bloques encima; quedarse dentro del velo lleva a la otra dimensión.
// Funciones puras sobre un objeto con getBlock/setBlock (el mundo o un mundo de pruebas).
import { ID } from './blocks.js';

export const PORTAL_RING = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
/** Segundos que hay que pasar dentro del velo para viajar. */
export const PORTAL_TIME = 1.6;

/** ¿Está el núcleo (x,y,z) rodeado por los 8 bloques de vidrio volcánico? */
export function portalFrameOK(w, x, y, z) {
  for (const [dx, dz] of PORTAL_RING) if (w.getBlock(x + dx, y, z + dz) !== ID.OBSIDIAN) return false;
  return true;
}

/** Activa el portal: núcleo encendido y velo encima (si hay hueco). Devuelve false si el marco no es válido. */
export function activatePortal(w, x, y, z) {
  const id = w.getBlock(x, y, z);
  if (id !== ID.PORTAL_CORE && id !== ID.PORTAL_CORE_ACTIVE) return false;
  if (!portalFrameOK(w, x, y, z)) return false;
  for (let k = 1; k <= 2; k++) { const b = w.getBlock(x, y + k, z); if (b !== 0 && b !== ID.PORTAL_VEIL) return false; }
  w.setBlock(x, y, z, ID.PORTAL_CORE_ACTIVE);
  w.setBlock(x, y + 1, z, ID.PORTAL_VEIL); w.setBlock(x, y + 2, z, ID.PORTAL_VEIL);
  return true;
}

/** Apaga un portal (al romper el núcleo o el marco): quita el velo. */
export function deactivatePortal(w, x, y, z) {
  if (w.getBlock(x, y, z) === ID.PORTAL_CORE_ACTIVE) w.setBlock(x, y, z, ID.PORTAL_CORE);
  for (let k = 1; k <= 2; k++) if (w.getBlock(x, y + k, z) === ID.PORTAL_VEIL) w.setBlock(x, y + k, z, 0);
}

/** Si (x,y,z) es parte de un portal activo (núcleo, velo o marco), devuelve la posición del núcleo. */
export function portalCoreFor(w, x, y, z) {
  const id = w.getBlock(x, y, z);
  if (id === ID.PORTAL_CORE_ACTIVE) return [x, y, z];
  if (id === ID.PORTAL_VEIL) { for (let k = 1; k <= 2; k++) if (w.getBlock(x, y - k, z) === ID.PORTAL_CORE_ACTIVE) return [x, y - k, z]; return null; }
  if (id === ID.OBSIDIAN) for (const [dx, dz] of PORTAL_RING) if (w.getBlock(x - dx, y, z - dz) === ID.PORTAL_CORE_ACTIVE) return [x - dx, y, z - dz];
  return null;
}

/** Busca un núcleo activo a menos de `r` bloques (en horizontal) de (x,z), en toda la altura. */
export function findPortalNear(w, x, z, r = 24, height = 128) {
  let best = null, bd = Infinity;
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const d = dx * dx + dz * dz;
    if (d > r * r || d >= bd) continue;
    for (let y = 1; y < height - 3; y++) if (w.getBlock(x + dx, y, z + dz) === ID.PORTAL_CORE_ACTIVE) { best = [x + dx, y, z + dz]; bd = d; break; }
  }
  return best;
}

/**
 * Construye un portal de vuelta con el núcleo en (x,y,z): plataforma de 5×5 debajo (para no caer al abismo), marco,
 * núcleo activo, velo y hueco libre alrededor. `floor` es el bloque de la plataforma.
 */
export function buildPortal(w, x, y, z, floor) {
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    w.setBlock(x + dx, y - 1, z + dz, floor);
    if (Math.abs(dx) === 2 || Math.abs(dz) === 2) w.setBlock(x + dx, y, z + dz, floor);
    for (let k = 1; k <= 3; k++) w.setBlock(x + dx, y + k, z + dz, 0);
  }
  for (const [dx, dz] of PORTAL_RING) w.setBlock(x + dx, y, z + dz, ID.OBSIDIAN);
  w.setBlock(x, y, z, ID.PORTAL_CORE);
  activatePortal(w, x, y, z);
}
