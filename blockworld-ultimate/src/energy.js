// Energía: palancas, botones, placas de presión y bloques de energía alimentan cables de cobre (nivel 15 que baja 1
// por tramo), repetidores (diodo que devuelve el nivel a 15 con retardo) e inversores (salida = NO entrada). Lo que
// queda junto a un punto con energía se activa: lámparas, puertas, trampillas y puertas de valla, pistones,
// dispensadores, cosechadoras y raíles propulsores. Las tolvas mueven objetos solas.
// El estado visible (encendido/apagado, pistón extendido…) son IDs de bloque, así que se guarda con el mundo; los
// niveles se recalculan en cada pulso (TICK s). Lógica sobre `game` (o un objeto de pruebas con world, etc.).
import { BLOCKS, ID, B_FLUID, B_FLUIDLVL, B_REPLACEABLE, B_OPAQUE, B_SHAPE, Blocks } from './blocks.js';
import { Items, rollDrops } from './items.js';
import { B_FAMILY, FAM, FACING_VEC } from './shapes.js';
import { boosterWithPower } from './rails.js';
import { addToSlots } from './inventory.js';
import { smeltRecipe } from './crafting.js';
import { brewFor, isIngredient, isBrewBase } from './alchemy.js';

export const TICK = 0.1;
const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const K = (x, y, z) => x + ',' + y + ',' + z;
const P = (k) => k.split(',').map(Number);
/** Tipo de energía por ID (o null). */
const E = (id) => (BLOCKS[id] ? BLOCKS[id].energy : null);
const ALWAYS = new Set(['source', 'plate', 'cable', 'repeater', 'inverter', 'hopper']); // nodos que se siguen siempre
const PISTON_PUSH = 12;

export class EnergySystem {
  constructor(game) {
    this.game = game;
    this.nodes = new Set();       // claves de nodos (fuentes, placas, cables, repetidores, inversores, tolvas)
    this.levels = new Map();      // nivel de cada cable
    this.pending = new Map();     // repetidor/inversor → {state, at}
    this.buttons = new Map();     // botón pulsado → tick en que se suelta
    this.lastPowered = new Set(); // consumidores con energía en el pulso anterior
    this.retry = new Map();       // puertas/trampillas que no pudieron cambiar (alguien en medio) → estado pedido
    this.recheck = new Set();     // consumidores encendidos recién cargados o movidos: se comprueban en el siguiente pulso
    this.tickN = 0; this.acc = 0;
  }
  get world() { return this.game.world; }

  // ── Registro de nodos ──
  scanChunk(c) {
    if (!c || !c.blocks) return;
    const b = c.blocks, x0 = c.cx * 16, z0 = c.cz * 16;
    for (let i = 0; i < b.length; i++) {
      const id = b[i];
      if (id < 160) continue;
      const x = x0 + (i & 15), y = i >> 8, z = z0 + ((i >> 4) & 15);
      if (ALWAYS.has(E(id))) this.nodes.add(K(x, y, z));
      else if (this._activeConsumer(id)) this.recheck.add(this._consumerKey(x, y, z, id));
    }
  }
  /**
   * Consumidores en estado "encendido" que solo la energía pudo poner así (lámpara encendida, pistón extendido,
   * propulsor activo, puerta de hierro abierta). Al cargarlos o moverlos se vuelven a comprobar en el siguiente
   * pulso: si nada les da energía, se apagan. Las puertas de madera abiertas no (se abren a mano).
   */
  _activeConsumer(id) {
    const b = BLOCKS[id];
    if (!b) return false;
    if (b.energy === 'lamp' || b.energy === 'booster') return b.light > 0 || (b.rail && b.rail.on);
    if (b.energy === 'piston') return !!b.extended;
    return b.family === 'door' && b.sound === 'metal' && !!b.open && !b.upper;
  }
  unloadChunk(c) {
    for (const k of [...this.nodes]) { const [x, , z] = P(k); if (x >> 4 === c.cx && z >> 4 === c.cz) this.nodes.delete(k); }
  }
  onBlockChange(x, y, z, old, nw) {
    const k = K(x, y, z);
    if (ALWAYS.has(E(nw))) this.nodes.add(k); else this.nodes.delete(k);
    if (this._activeConsumer(nw)) this.recheck.add(this._consumerKey(x, y, z, nw));
    // romper la cabeza de un pistón lo recoge; romper un pistón extendido quita la cabeza
    if (old >= ID.PISTON_HEAD && old <= ID.PISTON_HEAD + 3 && nw === 0) {
      const f = BLOCKS[old].facing, bx = x - FACING_VEC[f][0], bz = z - FACING_VEC[f][1];
      const base = this.world.getBlock(bx, y, bz);
      if (BLOCKS[base] && BLOCKS[base].extended && BLOCKS[base].facing === f) this.world.setBlock(bx, y, bz, ID.PISTON + f);
    }
    if (BLOCKS[old] && BLOCKS[old].energy === 'piston' && BLOCKS[old].extended && !(BLOCKS[nw] && BLOCKS[nw].extended)) {
      const f = BLOCKS[old].facing, hx = x + FACING_VEC[f][0], hz = z + FACING_VEC[f][1];
      if (this.world.getBlock(hx, y, hz) === ID.PISTON_HEAD + f) this.world.setBlock(hx, y, hz, 0);
    }
  }

  /** Pulsa un botón: da energía durante 1 s. */
  press(x, y, z) {
    const w = this.world;
    if (w.getBlock(x, y, z) === ID.BUTTON) w.setBlock(x, y, z, ID.BUTTON_ON);
    this.buttons.set(K(x, y, z), this.tickN + 10);
  }
  /** Mueve una palanca. */
  toggleLever(x, y, z) {
    const w = this.world, id = w.getBlock(x, y, z);
    if (id === ID.LEVER) w.setBlock(x, y, z, ID.LEVER_ON);
    else if (id === ID.LEVER_ON) w.setBlock(x, y, z, ID.LEVER);
  }

  update(dt) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= TICK && n++ < 3) { this.acc -= TICK; this.tick(); }
    if (this.acc > TICK) this.acc = 0;
  }

  // ── Un pulso ──
  tick() {
    const w = this.world, g = this.game;
    if (!w) return;
    this.tickN++;
    // Botones que se sueltan (un botón pulsado sin temporizador —partida cargada, chunk recargado— se suelta en 1 s)
    for (const k of this.nodes) if (!this.buttons.has(k)) { const [x, y, z] = P(k); if (w.getBlock(x, y, z) === ID.BUTTON_ON) this.buttons.set(k, this.tickN + 10); }
    for (const [k, t] of this.buttons) if (this.tickN >= t) { const [x, y, z] = P(k); if (w.getBlock(x, y, z) === ID.BUTTON_ON) w.setBlock(x, y, z, ID.BUTTON); this.buttons.delete(k); }
    // Placas de presión: pisadas por el jugador o por criaturas
    for (const k of this.nodes) {
      const [x, y, z] = P(k), id = w.getBlock(x, y, z);
      if (E(id) !== 'plate') continue;
      const on = this._stoodOn(x, y, z);
      if (on && id === ID.PRESSURE_PLATE) w.setBlock(x, y, z, ID.PRESSURE_PLATE_ON);
      else if (!on && id === ID.PRESSURE_PLATE_ON) w.setBlock(x, y, z, ID.PRESSURE_PLATE);
    }
    // 1) Emisores: fuentes encendidas (en las 6 direcciones) y salidas de repetidores/inversores encendidos (al frente)
    const powered = new Set();  // celdas con energía
    const frontOf = new Set();  // celdas alimentadas por la salida de un repetidor/inversor
    const seeds = [];           // cables con nivel inicial 15
    const cables = [];
    for (const k of this.nodes) {
      const [x, y, z] = P(k), id = w.getBlock(x, y, z), b = BLOCKS[id];
      if (!b) continue;
      const e = b.energy;
      if (e === 'cable') { cables.push(k); continue; }
      if ((e === 'source' || e === 'plate') && b.power > 0) {
        for (const [dx, dy, dz] of N6) { const nk = K(x + dx, y + dy, z + dz); powered.add(nk); if (E(w.getBlock(x + dx, y + dy, z + dz)) === 'cable') seeds.push(nk); }
      } else if ((e === 'repeater' || e === 'inverter') && b.power > 0) {
        const fx = x + FACING_VEC[b.facing][0], fz = z + FACING_VEC[b.facing][1], nk = K(fx, y, fz);
        powered.add(nk); frontOf.add(nk);
        if (E(w.getBlock(fx, y, fz)) === 'cable') seeds.push(nk);
      }
    }
    // 2) Cables: búsqueda en anchura desde las semillas; −1 por tramo (también sube y baja escalones)
    const lv = new Map();
    const q = [];
    for (const k of seeds) if (!lv.has(k)) { lv.set(k, 15); q.push(k); }
    while (q.length) {
      const k = q.shift(), l = lv.get(k);
      if (l <= 1) continue;
      const [x, y, z] = P(k);
      for (const [nx, ny, nz] of this._cableNeighbours(x, y, z)) {
        const nk = K(nx, ny, nz);
        if ((lv.get(nk) || 0) >= l - 1) continue;
        lv.set(nk, l - 1); q.push(nk);
      }
    }
    this.levels = lv;
    for (const k of cables) {
      const [x, y, z] = P(k), id = w.getBlock(x, y, z), l = lv.get(k) || 0;
      if (l > 0) for (const [dx, dy, dz] of N6) powered.add(K(x + dx, y + dy, z + dz));
      const want = l > 0 ? ID.CABLE_ON : ID.CABLE;
      if (id !== want && (id === ID.CABLE || id === ID.CABLE_ON)) w.setBlock(x, y, z, want);
    }
    // 3) Repetidores e inversores: entrada por detrás; el cambio de salida llega con retardo
    for (const k of this.nodes) {
      const [x, y, z] = P(k), id = w.getBlock(x, y, z), b = BLOCKS[id];
      if (!b || (b.energy !== 'repeater' && b.energy !== 'inverter')) continue;
      const bx = x - FACING_VEC[b.facing][0], bz = z - FACING_VEC[b.facing][1], bk = K(bx, y, bz);
      const backId = w.getBlock(bx, y, bz), back = BLOCKS[backId];
      let input = (lv.get(bk) || 0) > 0 || (back && (back.energy === 'source' || back.energy === 'plate') && back.power > 0);
      if (!input && back && (back.energy === 'repeater' || back.energy === 'inverter') && back.power > 0 && back.facing === b.facing) input = true;
      const want = b.energy === 'repeater' ? input : !input;
      const isOn = b.power > 0;
      const pend = this.pending.get(k);
      if (want !== isOn) {
        if (!pend || pend.state !== want) this.pending.set(k, { state: want, at: this.tickN + (b.energy === 'repeater' ? 2 : 1) });
      } else if (pend) this.pending.delete(k);
    }
    for (const [k, pd] of this.pending) {
      if (this.tickN < pd.at) continue;
      this.pending.delete(k);
      const [x, y, z] = P(k), id = w.getBlock(x, y, z), b = BLOCKS[id];
      if (!b || (b.energy !== 'repeater' && b.energy !== 'inverter')) continue;
      const base = b.energy === 'repeater' ? ID.REPEATER : ID.INVERTER;
      w.setBlock(x, y, z, base + (pd.state ? 4 : 0) + b.facing);
    }
    // 4) Consumidores: los que tienen energía ahora y los que la tenían antes (para apagarlos)
    const now = new Set();
    for (const k of powered) {
      const [x, y, z] = P(k), id = w.getBlock(x, y, z);
      if (this._isConsumer(id)) now.add(this._consumerKey(x, y, z, id));
    }
    const re = this.recheck; this.recheck = new Set();
    const check = new Set([...now, ...this.lastPowered, ...re, ...this.retry.keys()]);
    for (const k of check) {
      const [x, y, z] = P(k), id = w.getBlock(x, y, z);
      const on = now.has(k), was = this.lastPowered.has(k) || re.has(k);
      this._drive(x, y, z, id, on, was, k);
    }
    this.lastPowered = now;
    // 5) Tolvas: cada 4 pulsos
    if (this.tickN % 4 === 0) for (const k of this.nodes) { const [x, y, z] = P(k); if (w.getBlock(x, y, z) === ID.HOPPER) this._hopper(x, y, z); }
    void g;
  }

  /** Vecinos de un cable a los que pasa la energía: mismo nivel, un escalón arriba o abajo. */
  _cableNeighbours(x, y, z) {
    const w = this.world, out = [];
    const isCable = (a, b, c) => E(w.getBlock(a, b, c)) === 'cable';
    const opaque = (a, b, c) => { const b0 = BLOCKS[w.getBlock(a, b, c)]; return !!b0 && b0.opaque; };
    for (const [dx, dz] of FACING_VEC) {
      const nx = x + dx, nz = z + dz;
      if (isCable(nx, y, nz)) out.push([nx, y, nz]);
      else {
        if (!opaque(x, y + 1, z) && isCable(nx, y + 1, nz)) out.push([nx, y + 1, nz]);
        if (!opaque(nx, y, nz) && isCable(nx, y - 1, nz)) out.push([nx, y - 1, nz]);
      }
    }
    return out;
  }

  _stoodOn(x, y, z) {
    const g = this.game, p = g.player;
    const inCell = (e) => e.x >= x - 0.1 && e.x <= x + 1.1 && e.z >= z - 0.1 && e.z <= z + 1.1 && e.y >= y - 0.05 && e.y < y + 0.6;
    if (p && !(g.survival && g.survival.dead) && inCell(p)) return true;
    if (g.entities) for (const e of g.entities.list) if (!e.removed && e.def && e.deathTime < 0 && inCell(e)) return true;
    return false;
  }

  _isConsumer(id) {
    const b = BLOCKS[id];
    if (!b) return false;
    if (b.energy === 'lamp' || b.energy === 'piston' || b.energy === 'dispenser' || b.energy === 'harvester' || b.energy === 'booster') return true;
    const f = B_FAMILY[id];
    return f === FAM.DOOR || f === FAM.TRAPDOOR || f === FAM.GATE;
  }
  /** Las dos mitades de una puerta cuentan como un solo consumidor (la de abajo). */
  _consumerKey(x, y, z, id) { const b = BLOCKS[id]; return b.family === 'door' && b.upper ? K(x, y - 1, z) : K(x, y, z); }

  /** Actúa sobre un consumidor según tenga energía (on) y la tuviera en el pulso anterior (was). */
  _drive(x, y, z, id, on, was, key = K(x, y, z)) {
    const w = this.world, g = this.game, b = BLOCKS[id];
    if (!b) { this.retry.delete(key); return; }
    if (b.family === 'door' || b.family === 'trapdoor' || b.family === 'gate') {
      // solo en los flancos (a mano se siguen pudiendo abrir las de madera), salvo si el cambio anterior quedó
      // bloqueado por alguien en medio: entonces se reintenta en cada pulso mientras la energía no cambie
      const pend = this.retry.get(key);
      if (on === was && (pend === undefined || pend !== on)) { this.retry.delete(key); return; }
      const bd = g.building;
      if (!bd) return;
      const r = b.family === 'door' ? bd.toggleDoor(x, y, z, on, true) : b.family === 'trapdoor' ? bd.toggleTrapdoor(x, y, z, on, true) : bd.toggleGate(x, y, z, on, true);
      if (r === 'denied') this.retry.set(key, on); else this.retry.delete(key);
      return;
    }
    this.retry.delete(key);
    switch (b.energy) {
      case 'lamp': { const want = on ? ID.ENERGY_LAMP_ON : ID.ENERGY_LAMP; if (id !== want) w.setBlock(x, y, z, want); break; }
      case 'booster': { const want = boosterWithPower(id, on); if (want !== id) w.setBlock(x, y, z, want); break; }
      case 'piston': {
        if (on && !b.extended) this._extend(x, y, z, b.facing);
        else if (!on && b.extended) this._retract(x, y, z, b.facing);
        break;
      }
      case 'dispenser': if (on && !was) this._dispense(x, y, z, b.facing); break;
      case 'harvester': if (on && (!was || this.tickN % 25 === 0)) this._harvest(x, y, z, b.facing); break;
      default: break;
    }
  }

  // ── Pistones ──
  _extend(x, y, z, f) {
    const w = this.world, g = this.game;
    const [dx, dz] = FACING_VEC[f];
    const line = [];
    let k = 1;
    for (; k <= PISTON_PUSH + 1; k++) {
      if (!w.isLoaded(x + dx * k, z + dz * k)) return false; // no empujar hacia un chunk sin cargar (se perdería el bloque)
      const id = w.getBlock(x + dx * k, y, z + dz * k);
      if (id === 0 || B_FLUID[id] || B_REPLACEABLE[id]) break;
      const b = BLOCKS[id];
      if (!b || b.unbreakable || b.container || id === ID.FURNACE || id === ID.FURNACE_LIT || b.interact === 'altar' || b.energy === 'piston' || (id >= ID.PISTON_HEAD && id <= ID.PISTON_HEAD + 3) || b.family === 'door' || id === ID.PORTAL_CORE_ACTIVE || id === ID.PORTAL_VEIL) return false;
      line.push(id);
    }
    if (line.length > PISTON_PUSH) return false;
    // lo que haya en la celda final (hierba alta, agua…) se sustituye; las plantas sueltan su objeto
    const ex = x + dx * k, ez = z + dz * k, endId = w.getBlock(ex, y, ez);
    if (endId && !B_FLUID[endId] && g.breakNatural) g.breakNatural(ex, y, ez);
    for (let i = line.length; i >= 1; i--) w.setBlock(x + dx * (i + 1), y, z + dz * (i + 1), line[i - 1]);
    w.setBlock(x + dx, y, z + dz, ID.PISTON_HEAD + f);
    w.setBlock(x, y, z, ID.PISTON_EXT + f);
    // empujar al jugador y a las criaturas que estén en las celdas movidas
    const push = (e) => {
      for (let i = 1; i <= line.length + 1; i++) {
        const cx = x + dx * i, cz = z + dz * i;
        if (e.x + e.w / 2 > cx && e.x - e.w / 2 < cx + 1 && e.z + e.w / 2 > cz && e.z - e.w / 2 < cz + 1 && e.y < y + 1 && e.y + e.h > y) { e.x += dx; e.z += dz; return; }
      }
    };
    if (g.player) push(g.player);
    if (g.entities) for (const e of g.entities.list) if (!e.removed && e.def) push(e);
    g.audio && g.audio.play('door_metal', x + 0.5, y + 0.5, z + 0.5);
    return true;
  }
  _retract(x, y, z, f) {
    const w = this.world;
    const hx = x + FACING_VEC[f][0], hz = z + FACING_VEC[f][1];
    w.setBlock(x, y, z, ID.PISTON + f);
    if (w.getBlock(hx, y, hz) === ID.PISTON_HEAD + f) w.setBlock(hx, y, hz, 0);
    this.game.audio && this.game.audio.play('door_metal', x + 0.5, y + 0.5, z + 0.5);
  }

  // ── Dispensador ──
  _dispense(x, y, z, f) {
    const w = this.world, g = this.game;
    const be = w.blockEntities.get(w.beKey(x, y, z));
    if (!be) return false;
    const idx = be.slots.findIndex((s) => s);
    if (idx < 0) { g.audio && g.audio.play('click', x, y, z); return false; }
    const st = be.slots[idx], it = Items.get(st.i);
    const [dx, dz] = FACING_VEC[f];
    const fx = x + dx, fz = z + dz, front = w.getBlock(fx, y, fz);
    const take = () => { st.n--; if (st.n <= 0) be.slots[idx] = null; };
    const free = front === 0 || B_REPLACEABLE[front];
    if (it.key === 'water_bucket' || it.key === 'lava_bucket') {
      if (!free || (B_FLUID[front] && B_FLUIDLVL[front] === 0)) return false;
      w.setBlock(fx, y, fz, it.key === 'water_bucket' ? ID.WATER : ID.LAVA);
      be.slots[idx] = { i: Items.id('bucket'), n: 1, d: 0 };
    } else if (it.key === 'bucket' && B_FLUID[front] && B_FLUIDLVL[front] === 0) {
      const filled = { i: Items.id(B_FLUID[front] === 1 ? 'water_bucket' : 'lava_bucket'), n: 1, d: 0 };
      w.setBlock(fx, y, fz, 0);
      take(); if (addToSlots(be.slots, filled)) g.dropItem && g.dropItem(filled, fx + 0.5, y + 0.5, fz + 0.5);
    } else if (it.kind === 'fertilizer' && BLOCKS[front] && BLOCKS[front].group === 'crop' && BLOCKS[front].next) {
      w.setBlock(fx, y, fz, Blocks.id(BLOCKS[front].next)); take();
    } else if (it.plants && free && (w.getBlock(fx, y - 1, fz) === ID.FARMLAND || w.getBlock(fx, y - 1, fz) === ID.FARMLAND_WET)) {
      w.setBlock(fx, y, fz, Blocks.id(it.plants)); take();
    } else if (it.key === 'snowball' && g.throwFrom) {
      g.throwFrom(x + 0.5 + dx * 0.7, y + 0.5, z + 0.5 + dz * 0.7, dx, 0.1, dz); take();
    } else {
      // soltar el objeto por delante
      if (g.dropItem) {
        const e = g.dropItem({ i: st.i, n: 1, d: st.d || 0 }, fx + 0.5 - dx * 0.3, y + 0.4, fz + 0.5 - dz * 0.3, 0);
        if (e) { e.vx = dx * 4; e.vz = dz * 4; e.vy = 1.5; }
      }
      take();
    }
    g.audio && g.audio.play('click', x, y, z);
    g.particles && g.particles.emit(fx + 0.5, y + 0.5, fz + 0.5, 0xb0b0b0, 4, 1.2);
    return true;
  }

  // ── Cosechadora: recoge los cultivos maduros de 3×3 delante y vuelve a plantar ──
  _harvest(x, y, z, f) {
    const w = this.world, g = this.game;
    const [dx, dz] = FACING_VEC[f];
    const cx = x + dx * 2, cz = z + dz * 2;
    let n = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const px = cx + a, pz = cz + b;
      for (const py of [y, y + 1]) {
        const id = w.getBlock(px, py, pz), bl = BLOCKS[id];
        if (!bl || bl.group !== 'crop' || bl.next) continue; // solo maduros
        const drops = rollDrops(bl.drops);
        for (const d of drops) g.dropItem && g.dropItem({ i: d.id, n: d.n, d: 0 }, px + 0.5, py + 0.4, pz + 0.5, 0.6);
        const seedStage = bl.key.replace(/_\d+$/, '_0');
        w.setBlock(px, py, pz, Blocks.get(seedStage) ? Blocks.id(seedStage) : 0);
        n++;
      }
    }
    if (n) { g.audio && g.audio.blockSound('break', 'plant', cx + 0.5, y + 0.5, cz + 0.5); g.particles && g.particles.emit(cx + 0.5, y + 0.6, cz + 0.5, 0x8ac048, 10, 2, 1.2); }
    return n;
  }

  // ── Tolva: toma de arriba (contenedor u objetos sueltos) y entrega abajo ──
  _hopper(x, y, z) {
    const w = this.world, g = this.game;
    const be = w.blockEntities.get(w.beKey(x, y, z)) || (g.getBlockEntity ? g.getBlockEntity(x, y, z, 'hopper', 5) : null);
    if (!be) return;
    // entregar 1 objeto al contenedor de abajo: el primero que quepa (un objeto que no entra no atasca a los demás)
    const below = this._container(x, y - 1, z);
    if (below) {
      for (let i = 0; i < be.slots.length; i++) {
        const s = be.slots[i];
        if (!s) continue;
        const one = { i: s.i, n: 1, d: s.d || 0 };
        const target = below.type === 'furnace' ? this._furnaceSlot(below, one) : below.type === 'alchemy' ? this._alchemySlots(below, one) : below.slots;
        if (target && !addToSlots(target, one)) { s.n--; if (s.n <= 0) be.slots[i] = null; break; }
      }
    }
    // tomar 1 objeto del contenedor de arriba (del horno: el resultado y lo que no es combustible, como un cubo vacío;
    // de la mesa de alquimia: los tónicos terminados)
    const above = this._container(x, y + 1, z);
    if (above) {
      for (const k of this._pullable(above)) {
        const s = above.slots[k];
        if (!s) continue;
        const one = { i: s.i, n: 1, d: s.d || 0 };
        if (!addToSlots(be.slots, one)) { s.n--; if (s.n <= 0) above.slots[k] = null; break; }
      }
    } else if (g.entities && !(B_OPAQUE[w.getBlock(x, y + 1, z)] && B_SHAPE[w.getBlock(x, y + 1, z)] === 1)) {
      // recoge lo que cae encima (también a través de tierra arada o losas), no a través de un bloque entero
      // recoger objetos sueltos que caen dentro
      for (const e of g.entities.list) {
        if (e.removed || e.type !== 'item' || !e.stack) continue;
        if (e.x < x || e.x > x + 1 || e.z < z || e.z > z + 1 || e.y < y + 0.5 || e.y > y + 2) continue;
        const rest = addToSlots(be.slots, e.stack);
        if (!rest) e.removed = true; else e.stack.n = rest.n;
      }
    }
  }
  _container(x, y, z) {
    const w = this.world, id = w.getBlock(x, y, z), b = BLOCKS[id];
    if (!b) return null;
    if (b.container > 0 || id === ID.FURNACE || id === ID.FURNACE_LIT) {
      const g = this.game;
      const type = id === ID.FURNACE || id === ID.FURNACE_LIT ? 'furnace' : b.energy === 'hopper' ? 'hopper' : b.energy === 'dispenser' ? 'dispenser' : b.interact === 'alchemy' ? 'alchemy' : 'chest';
      return w.blockEntities.get(w.beKey(x, y, z)) || (g.getBlockEntity ? g.getBlockEntity(x, y, z, type, type === 'furnace' ? 3 : b.container) : null);
    }
    return null;
  }
  /** Un horno recibe lo que se funde en su entrada y el combustible en su hueco de combustible. */
  _furnaceSlot(be, one) {
    const it = Items.get(one.i);
    const idx = smeltRecipe(one.i) ? 0 : it && it.fuel ? 1 : -1;
    return idx < 0 ? null : this._slotView(be, idx);
  }
  /** Huecos de la mesa de alquimia donde puede ir `one`: ingrediente arriba, frascos (de uno en uno) abajo. */
  _alchemySlots(be, one) {
    const k = Items.get(one.i).key;
    if (isIngredient(k)) return this._slotView(be, 0);
    if (isBrewBase(k)) { for (let i = 1; i <= 3; i++) if (!be.slots[i]) return this._slotView(be, i); }
    return null;
  }
  /** Huecos de los que una tolva puede sacar objetos de un contenedor. */
  _pullable(c) {
    if (c.type === 'furnace') return c.slots[1] && !Items.get(c.slots[1].i).fuel ? [2, 1] : [2];
    if (c.type === 'alchemy') {
      const ing = c.slots[0] ? Items.get(c.slots[0].i).key : null;
      return [1, 2, 3].filter((i) => { const s = c.slots[i]; if (!s) return false; const k = Items.get(s.i).key; return !isBrewBase(k) || (ing && !brewFor(k, ing)); });
    }
    return c.slots.map((_, k) => k);
  }
  _slotView(be, idx) {
    // vista de un solo hueco compatible con addToSlots (escribe en be.slots[idx])
    return new Proxy([be.slots[idx]], { set: (t, p, v) => { if (p === '0') be.slots[idx] = v; t[p] = v; return true; } });
  }
}
