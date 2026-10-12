// Ticks aleatorios del mundo (cultivos, brotes, tierra arada, hierba) y lógica de hornos.
// Solo avanzan los chunks cercanos al jugador (cargados): el crecimiento NO ocurre con el mundo cerrado.
import { Blocks, ID, B_OPAQUE, B_REPLACEABLE, B_FLUID } from './blocks.js';
import { Items } from './items.js';
import { smeltRecipe, fuelTime } from './crafting.js';
import { stackMax } from './inventory.js';
import { chunkKey } from './chunk.js';

const GRASS_IDS = new Set([ID.GRASS, ID.GRASS_LUSH, ID.GRASS_DRY]);
const TREE_OF = { sapling_oak: 'oak', sapling_dark: 'dark', sapling_jungle: 'jungle', sapling_pine: 'pine' };

export class RandomTicks {
  constructor(game) {
    this.game = game; this.timer = 0; this.simChunks = 4;
  }

  /** ¿Hay luz suficiente para crecer? (incluye la hora: de noche el cielo no basta) */
  _lightOK(x, y, z) {
    const w = this.game.world;
    const sky = w.getSky(x, y, z) * this.game.sky.atm.sun;
    return sky >= 8 || w.getBlockLight(x, y, z) >= 9;
  }

  update(dt) {
    this.timer += dt;
    if (this.timer < 1) return;
    this.timer -= 1;
    const g = this.game, w = g.world, p = g.player;
    const pcx = Math.floor(p.x / 16), pcz = Math.floor(p.z / 16);
    for (let dz = -this.simChunks; dz <= this.simChunks; dz++) for (let dx = -this.simChunks; dx <= this.simChunks; dx++) {
      const c = w.chunks.get(chunkKey(pcx + dx, pcz + dz));
      if (!c || !c.blocks || !c.lightReady) continue;
      const x0 = c.cx * 16, z0 = c.cz * 16;
      // Bloques "tickeables": cada uno con probabilidad 6 % por segundo
      if (c.tickables.size) {
        for (const idx of [...c.tickables]) {
          if (Math.random() > 0.06) continue;
          const id = c.blocks[idx];
          this.tickBlock(x0 + (idx & 15), idx >> 8, z0 + ((idx >> 4) & 15), id);
        }
      }
      // Hierba: dos columnas al azar
      for (let k = 0; k < 2; k++) this.tickGrass(c, x0 + ((Math.random() * 16) | 0), z0 + ((Math.random() * 16) | 0));
    }
  }

  tickGrass(c, x, z) {
    const w = this.game.world;
    const y = w.surfaceY(x, z);
    if (y < 1) return;
    const id = w.getBlock(x, y, z);
    const above = w.getBlock(x, y + 1, z);
    if (GRASS_IDS.has(id)) {
      if (B_OPAQUE[above] && Math.random() < 0.5) w.setBlock(x, y, z, ID.DIRT);
    } else if (id === ID.DIRT && (above === 0 || B_REPLACEABLE[above]) && w.getSky(x, y + 1, z) >= 9) {
      // se propaga desde un césped vecino
      const cand = [];
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) {
        const nid = w.getBlock(x + dx, y + dy, z + dz);
        if (GRASS_IDS.has(nid)) cand.push(nid);
      }
      if (cand.length && Math.random() < 0.35) w.setBlock(x, y, z, cand[(Math.random() * cand.length) | 0]);
    }
  }

  tickBlock(x, y, z, id) {
    const g = this.game, w = g.world;
    const b = Blocks.get(id);
    if (b.group === 'crop' && b.next) {
      const below = w.getBlock(x, y - 1, z);
      if (below !== ID.FARMLAND && below !== ID.FARMLAND_WET) return;
      if (!this._lightOK(x, y, z)) return;
      const chance = below === ID.FARMLAND_WET ? 0.5 : 0.2;
      if (Math.random() < chance) w.setBlock(x, y, z, Blocks.id(b.next));
      return;
    }
    if (id === ID.FARMLAND || id === ID.FARMLAND_WET) {
      let wet = false;
      for (let dx = -4; dx <= 4 && !wet; dx++) for (let dz = -4; dz <= 4 && !wet; dz++) for (let dy = 0; dy <= 1; dy++) {
        if (w.getBlock(x + dx, y + dy, z + dz) === ID.WATER) { wet = true; break; }
      }
      const above = w.getBlock(x, y + 1, z);
      if (B_OPAQUE[above]) { w.setBlock(x, y, z, ID.DIRT); return; }
      if (wet && id === ID.FARMLAND) w.setBlock(x, y, z, ID.FARMLAND_WET);
      else if (!wet && id === ID.FARMLAND_WET) w.setBlock(x, y, z, ID.FARMLAND);
      else if (!wet && id === ID.FARMLAND && Blocks.get(above).group !== 'crop' && Math.random() < 0.25) w.setBlock(x, y, z, ID.DIRT);
      return;
    }
    if (TREE_OF[b.key]) {
      if (w.getSky(x, y, z) < 9 || Math.random() > 0.12) return;
      this.growTree(x, y, z, TREE_OF[b.key]);
      return;
    }
    if (id === ID.BERRY_BUSH_EMPTY) {
      if (this._lightOK(x, y, z) && Math.random() < 0.15) w.setBlock(x, y, z, ID.BERRY_BUSH);
    }
  }

  /** Hace crecer un árbol reutilizando el generador de árboles del terreno. Devuelve true si creció. */
  growTree(x, y, z, type) {
    const g = this.game, w = g.world;
    const need = type === 'jungle' ? 14 : type === 'dark' ? 10 : 7;
    for (let k = 1; k <= need; k++) {
      const id = w.getBlock(x, y + k, z);
      if (id !== 0 && !B_REPLACEABLE[id] && Blocks.get(id).group !== 'leaves') return false;
    }
    const setIfAir = (wx, wy, wz, id) => { const cur = w.getBlock(wx, wy, wz); if (cur === 0 || B_REPLACEABLE[cur]) w.setBlock(wx, wy, wz, id); };
    const setForce = (wx, wy, wz, id) => { const cur = w.getBlock(wx, wy, wz); if (cur === 0 || B_REPLACEABLE[cur] || Blocks.get(cur).group === 'leaves' || Blocks.get(cur).group === 'plant') w.setBlock(wx, wy, wz, id); };
    w.setBlock(x, y, z, 0);
    const rr = (k) => Math.random() * (k + 1) % 1;
    w.terrain._tree(type, x, y - 1, z, () => Math.random(), setIfAir, setForce);
    void rr;
    g.audio && g.audio.blockSound('place', 'leaf', x, y, z);
    return true;
  }
}

// ── Hornos ───────────────────────────────────────────────────────
/** Avanza un horno (be: Container con extra {burn,burnMax,cook}). Devuelve true si el estado "encendido" cambió. */
export function tickFurnace(be, dt) {
  const ex = be.extra || (be.extra = { burn: 0, burnMax: 0, cook: 0 });
  const [inp, fuel, out] = be.slots;
  const rec = inp ? smeltRecipe(inp.i) : null;
  const outId = rec ? Items.id(rec.out) : 0;
  const canSmelt = !!rec && (!out || (out.i === outId && out.n < stackMax(outId)));
  const wasLit = ex.burn > 0;
  if (ex.burn > 0) ex.burn = Math.max(0, ex.burn - dt);
  if (canSmelt && ex.burn <= 0 && fuel && fuelTime(fuel.i) > 0) {
    ex.burn = ex.burnMax = fuelTime(fuel.i);
    const it = Items.get(fuel.i);
    if (it.key === 'lava_bucket') be.slots[1] = { i: Items.id('bucket'), n: 1, d: 0 };
    else { fuel.n--; if (fuel.n <= 0) be.slots[1] = null; }
  }
  if (canSmelt && ex.burn > 0) {
    ex.cook += dt;
    if (ex.cook >= rec.time) {
      ex.cook = 0;
      inp.n--; if (inp.n <= 0) be.slots[0] = null;
      if (out) out.n++; else be.slots[2] = { i: outId, n: 1, d: 0 };
    }
  } else ex.cook = Math.max(0, ex.cook - dt * 2);
  return (ex.burn > 0) !== wasLit;
}
void B_FLUID;
