// Fluidos que fluyen: el agua y la lava se extienden desde sus fuentes con niveles (agua 7 bloques, lava 3),
// caen por los huecos, se secan cuando pierden la fuente y reaccionan entre sí (vidrio volcánico, adoquín,
// piedra). Las actualizaciones se programan al cambiar un bloque y se procesan con un presupuesto por
// fotograma, así que un lago abierto se derrama poco a poco sin congelar el juego.
// Sin DOM: la lógica se prueba en Node con el mundo real.
import { BLOCKS, B_FLUID, B_FLUIDLVL, B_SOLID, B_REPLACEABLE, B_SHAPE, SHAPE_ID, ID } from './blocks.js';
import { WORLD_HEIGHT as WH } from './config.js';
import { B_FAMILY, FAM } from './shapes.js';

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/** Alcance máximo (nivel) de cada fluido: 1 agua, 2 lava. */
export const FLUID_MAX = [0, 7, 3];
/** Segundos entre pasos de propagación. */
export const FLUID_DELAY = [0, 0.25, 1.5];

/** ID del bloque de fluido `ft` (1 agua, 2 lava) con nivel `lvl` (0 fuente, 1..max corriente, 8 cayendo). */
export function fluidId(ft, lvl) {
  if (ft === 1) return lvl === 0 ? ID.WATER : lvl === 8 ? ID.WATER_FALL : ID.WATER_FLOW_1 + lvl - 1;
  return lvl === 0 ? ID.LAVA : lvl === 8 ? ID.LAVA_FALL : ID.LAVA_FLOW_1 + lvl - 1;
}

/** Nivel "efectivo" para propagarse: las fuentes y las cascadas cuentan como 0. */
const effLevel = (id) => { const l = B_FLUIDLVL[id]; return l === 8 ? 0 : l; };

/**
 * ¿Puede el fluido entrar en la celda `n`? (aire, plantas y antorchas que arrastra, el otro fluido,
 * o el mismo fluido con un nivel peor). Las puertas, escaleras de mano y vallas lo detienen.
 */
export function canFlowInto(n, ft, lvl) {
  if (n === 0) return true;
  const nf = B_FLUID[n];
  if (nf === ft) { const nl = B_FLUIDLVL[n]; return nl !== 0 && nl !== 8 && nl > lvl; }
  if (nf) return true; // el otro fluido: reacción
  if (B_FAMILY[n] === FAM.GATE) return false;
  if (B_SOLID[n]) return false;
  return !!B_REPLACEABLE[n] || B_SHAPE[n] === SHAPE_ID.cross || B_SHAPE[n] === SHAPE_ID.torch;
}

/**
 * Dirección de la corriente en una celda de agua/lava (vector horizontal no normalizado, o null si está quieta).
 * Empuja hacia los vecinos con más nivel (más lejos de la fuente) y hacia los huecos por los que cae.
 */
export function flowVector(world, x, y, z) {
  const id = world.getBlock(x, y, z);
  const ft = B_FLUID[id];
  if (!ft) return null;
  const lvl = B_FLUIDLVL[id];
  if (lvl === 0 || lvl === 8) return null;
  let fx = 0, fz = 0;
  for (const [dx, dz] of DIRS) {
    const n = world.getBlock(x + dx, y, z + dz);
    if (B_FLUID[n] === ft) {
      const nl = effLevel(n);
      if (nl > lvl) { fx += dx * (nl - lvl); fz += dz * (nl - lvl); } else if (nl < lvl) { fx -= dx * (lvl - nl); fz -= dz * (lvl - nl); }
    } else if (!B_SOLID[n]) {
      const below = world.getBlock(x + dx, y - 1, z + dz);
      if (!B_SOLID[below]) { fx += dx * 4; fz += dz * 4; }
    }
  }
  return fx || fz ? { x: fx, z: fz } : null;
}

export class FluidSim {
  /**
   * @param host {{world, breakNatural?(x,y,z), audio?, time?:number}} — el juego (o un objeto de pruebas).
   */
  constructor(host) {
    this.host = host;
    this.queue = new Map(); // "x,y,z" → instante en que toca actualizar
    this.time = 0;
    this.budget = 256;
    this.stats = { ticks: 0 };
  }
  get world() { return this.host.world; }

  /** Programa la actualización de una celda (si es fluido) dentro de `delay` segundos. */
  schedule(x, y, z, delay) {
    if (y < 0 || y >= WH) return;
    const k = `${x},${y},${z}`;
    const due = this.time + delay;
    const cur = this.queue.get(k);
    if (cur === undefined || due < cur) this.queue.set(k, due);
  }

  /** Se llama tras cada cambio de bloque: despierta el fluido de la celda y de sus 6 vecinas. */
  onBlockChange(x, y, z) {
    const w = this.world;
    const cells = [[x, y, z], [x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]];
    for (const [cx, cy, cz] of cells) {
      const ft = B_FLUID[w.getBlock(cx, cy, cz)];
      if (ft) this.schedule(cx, cy, cz, FLUID_DELAY[ft]);
    }
  }

  update(dt) {
    this.time += dt;
    if (!this.queue.size) return;
    const due = [];
    for (const [k, t] of this.queue) { if (t <= this.time) due.push(k); if (due.length >= this.budget) break; }
    for (const k of due) {
      this.queue.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      if (!this.world.isLoaded(x, z)) continue;
      this.tick(x, y, z);
      this.stats.ticks++;
    }
  }

  /** Coloca fluido en una celda, con reacciones y arrastre de plantas. */
  _place(x, y, z, ft, lvl) {
    const w = this.world;
    const cur = w.getBlock(x, y, z);
    const cf = B_FLUID[cur];
    if (cf && cf !== ft) {
      // agua sobre lava: fuente → vidrio volcánico, corriente → adoquín; lava sobre agua → piedra
      const res = ft === 1 ? (B_FLUIDLVL[cur] === 0 ? ID.OBSIDIAN : ID.COBBLE) : ID.STONE;
      w.setBlock(x, y, z, res);
      this.host.audio && this.host.audio.play && this.host.audio.play('fizz', x + 0.5, y + 0.5, z + 0.5);
      return;
    }
    if (cur !== 0 && !cf) {
      if (this.host.breakNatural) this.host.breakNatural(x, y, z); else w.setBlock(x, y, z, 0);
    }
    w.setBlock(x, y, z, fluidId(ft, lvl));
  }

  /** Un paso de simulación de la celda (x,y,z). */
  tick(x, y, z) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    const ft = B_FLUID[id];
    if (!ft) return;
    const max = FLUID_MAX[ft];
    let lvl = B_FLUIDLVL[id];

    // Lava que toca agua se solidifica
    if (ft === 2) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
        if (B_FLUID[w.getBlock(x + dx, y + dy, z + dz)] === 1) {
          w.setBlock(x, y, z, lvl === 0 ? ID.OBSIDIAN : ID.COBBLE);
          this.host.audio && this.host.audio.play && this.host.audio.play('fizz', x + 0.5, y + 0.5, z + 0.5);
          return;
        }
      }
    }

    // 1) Las celdas que no son fuente recalculan su nivel a partir de sus vecinas
    if (lvl !== 0) {
      let want;
      if (B_FLUID[w.getBlock(x, y + 1, z)] === ft) want = 8;
      else {
        let best = 99, sources = 0;
        for (const [dx, dz] of DIRS) {
          const n = w.getBlock(x + dx, y, z + dz);
          if (B_FLUID[n] !== ft) continue;
          if (B_FLUIDLVL[n] === 0) sources++;
          best = Math.min(best, effLevel(n) + 1);
        }
        want = best <= max ? best : -1;
        // Agua "infinita": dos fuentes al lado y suelo (o fuente) debajo
        if (ft === 1 && sources >= 2) {
          const below = w.getBlock(x, y - 1, z);
          if (B_SOLID[below] || (B_FLUID[below] === 1 && B_FLUIDLVL[below] === 0)) want = 0;
        }
      }
      if (want === -1) { w.setBlock(x, y, z, 0); return; }
      if (want !== lvl) { w.setBlock(x, y, z, fluidId(ft, want)); return; } // el cambio vuelve a programar la celda
      lvl = want;
    }

    // 2) Caer si hay hueco debajo
    if (y > 0) {
      const below = w.getBlock(x, y - 1, z);
      if (B_FLUID[below] === ft) {
        const bl = B_FLUIDLVL[below];
        if (bl !== 0 && bl !== 8) { w.setBlock(x, y - 1, z, fluidId(ft, 8)); return; } // la corriente de abajo pasa a cascada
        if (bl === 8) return;                                                         // la columna sigue cayendo
        // debajo hay una fuente: se extiende por encima
      } else if (canFlowInto(below, ft, 8)) { this._place(x, y - 1, z, ft, 8); return; }
    }

    // 3) Extenderse hacia los lados
    const next = lvl === 0 || lvl === 8 ? 1 : lvl + 1;
    if (next > max) return;
    for (const [dx, dz] of DIRS) {
      const n = w.getBlock(x + dx, y, z + dz);
      if (canFlowInto(n, ft, next)) this._place(x + dx, y, z + dz, ft, next);
    }
  }
}

void BLOCKS;
