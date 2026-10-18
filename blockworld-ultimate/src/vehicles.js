// Vehículos montables: vagonetas que siguen los raíles (pendientes, curvas, propulsores) y barcas que navegan.
// Clic derecho para subir, C (agacharse) para bajar, atacar dos veces para recogerlos. Se guardan con el mundo.
import { Entity, buildModel } from './entities.js';
import { Items } from './items.js';
import { moveEntity, boxCollides } from './physics.js';
import { B_FLUID, B_SOLID } from './blocks.js';
import { RAIL, DIRV, railPoint, nextRailCell, opposite } from './rails.js';

const P = (name, size, center, color, o = {}) => ({ name, size, center, color, ...o });
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const CART_MAX = 8;

class Vehicle extends Entity {
  constructor(game, type, parts) {
    super(game, type);
    this.isVehicle = true; this.rider = null; this.hits = 0; this.hitCd = 0;
    this.model = buildModel(parts);
    this.obj = this.model.root; game.scene.add(this.obj);
  }
  get persistent() { return !this.removed; }
  /** Golpes del jugador: al segundo se recoge como objeto. */
  hurt(amount, sx, sz, knock, source) {
    if (this.hitCd > 0) return false;
    this.hitCd = 0.25; this.hits++;
    this.game.audio && this.game.audio.play('hit', this.x, this.y, this.z);
    if (this.hits >= 2 || this.game.mode === 'creative') {
      if (this.rider) this.game.dismount && this.game.dismount();
      this.removed = true;
      if (this.game.mode !== 'creative') this.game.dropItem({ i: Items.id(this.type === 'minecart' ? 'minecart' : 'boat'), n: 1, d: 0 }, this.x, this.y + 0.4, this.z, 1);
    }
    return true;
  }
  _tint() { const l = this.game.lightAt(this.x, this.y + 0.5, this.z); this.model.mat.color.setRGB(l, l, l); }
}

// ── Vagoneta ─────────────────────────────────────────────────────
export class Minecart extends Vehicle {
  constructor(game) {
    super(game, 'minecart', [
      P('base', [0.9, 0.12, 1.2], [0, 0.18, 0], '#5a5c66'),
      P('wallL', [0.08, 0.45, 1.2], [-0.41, 0.46, 0], '#7a7c86'), P('wallR', [0.08, 0.45, 1.2], [0.41, 0.46, 0], '#7a7c86'),
      P('wallF', [0.9, 0.45, 0.08], [0, 0.46, -0.56], '#7a7c86'), P('wallB', [0.9, 0.45, 0.08], [0, 0.46, 0.56], '#7a7c86'),
      P('w1', [0.1, 0.24, 0.24], [-0.47, 0.12, -0.38], '#2a2a30'), P('w2', [0.1, 0.24, 0.24], [0.47, 0.12, -0.38], '#2a2a30'),
      P('w3', [0.1, 0.24, 0.24], [-0.47, 0.12, 0.38], '#2a2a30'), P('w4', [0.1, 0.24, 0.24], [0.47, 0.12, 0.38], '#2a2a30'),
    ]);
    this.w = 0.98; this.h = 0.7;
    this.cell = null; this.entry = 2; this.exit = 0; this.t = 0.5; this.speed = 0;
  }
  /** Coloca la vagoneta sobre el raíl de (x,y,z). */
  placeOn(x, y, z, look = 0) {
    const r = RAIL[this.world.getBlock(x, y, z)];
    if (!r) return false;
    this.cell = [x, y, z];
    // sale por el extremo más parecido a la dirección en la que mira el jugador
    const diff = (a, b) => Math.min((a - b + 4) % 4, (b - a + 4) % 4);
    this.exit = diff(look, r.a) <= diff(look, r.b) ? r.a : r.b; this.entry = this.exit === r.a ? r.b : r.a;
    this.t = 0.5; this.speed = 0;
    this._place();
    return true;
  }
  _place() {
    const [x, y, z] = this.cell, r = RAIL[this.world.getBlock(x, y, z)];
    if (!r) return;
    const [lx, ly, lz] = railPoint(r, this.entry, this.exit, this.t);
    this.x = x + lx; this.y = y + ly; this.z = z + lz;
    const a = Math.min(1, this.t + 0.05), b = Math.max(0, this.t - 0.05);
    const p1 = railPoint(r, this.entry, this.exit, a), p0 = railPoint(r, this.entry, this.exit, b);
    this.yaw = Math.atan2(-(p1[0] - p0[0]), -(p1[2] - p0[2]));
    this.pitch = Math.atan2(p1[1] - p0[1], Math.hypot(p1[0] - p0[0], p1[2] - p0[2]));
  }
  /** Invierte el sentido de marcha. */
  _reverse() { const e = this.entry; this.entry = this.exit; this.exit = e; this.t = 1 - this.t; }

  update(dt) {
    const w = this.world, g = this.game;
    this.hitCd = Math.max(0, this.hitCd - dt);
    if (!this.cell) { this.removed = true; return; }
    let [x, y, z] = this.cell;
    let r = RAIL[w.getBlock(x, y, z)];
    if (!r) { // sin raíl debajo: se suelta como objeto
      if (this.rider && g.dismount) g.dismount();
      this.removed = true; g.dropItem({ i: Items.id('minecart'), n: 1, d: 0 }, this.x, this.y + 0.3, this.z); return;
    }
    // Pendientes, propulsores, rozamiento y empuje del pasajero
    if (r.asc >= 0) { if (this.exit === r.asc) this.speed -= 5 * dt; else this.speed += 5 * dt; }
    if (r.booster) {
      if (r.on) this.speed = Math.min(CART_MAX, this.speed + 12 * dt + (this.speed < 0.2 ? 2 : 0));
      else this.speed *= Math.exp(-6 * dt);
    }
    this.speed -= (0.15 + 0.03 * this.speed) * dt;
    if (this.rider && this.rider.push) {
      const look = this.rider.look; // dirección horizontal de la mirada (0..3)
      if (this.speed < 0.3 && look !== undefined && (r.a === look || r.b === look) && this.exit !== look) { this._reverse(); this.speed = 0.3; }
      if (this.speed < 4) this.speed += 2.5 * dt;
    }
    if (this.speed < 0) { this._reverse(); this.speed = -this.speed * 0.5; }
    if (this.speed < 0.02) this.speed = 0;
    this.speed = Math.min(CART_MAX, this.speed);
    // Avance por las celdas
    let dist = this.speed * dt, guard = 0;
    while (dist > 0 && guard++ < 8) {
      const step = Math.min(dist, (1 - this.t));
      this.t += step; dist -= step;
      if (this.t >= 1 - 1e-6) {
        const nx = nextRailCell(w, x, y, z, this.exit);
        if (!nx) { // fin de la vía: rebota suave
          this.t = 1; this._reverse(); this.speed *= 0.3;
          g.audio && this.speed > 1 && g.audio.play('hit', this.x, this.y, this.z);
          break;
        }
        x = nx.x; y = nx.y; z = nx.z; this.cell = [x, y, z];
        this.entry = nx.entry; this.exit = nx.exitDir; this.t = 0;
        r = RAIL[w.getBlock(x, y, z)];
      }
    }
    this._place();
    this._sync();
    this.obj.rotation.set(0, 0, 0);
    this.obj.rotation.y = this.yaw;
    this.obj.rotateX(this.pitch);
    this._tint();
    if (this.speed > 2 && Math.random() < this.speed * dt) g.particles && g.particles.emit(this.x, this.y + 0.1, this.z, 0x999999, 1, 0.6, 0.3);
  }
  /** Posición del asiento (pies del pasajero). */
  seat() { return [this.x, this.y + 0.25, this.z]; }
  serialize() { return { t: 'minecart', x: this.x, y: this.y, z: this.z, vd: { cell: this.cell, e: this.entry, x: this.exit, tt: this.t, s: this.speed } }; }
  initFromData(d) { if (!d) return; this.cell = d.cell; this.entry = d.e; this.exit = d.x; this.t = d.tt ?? 0.5; this.speed = d.s || 0; }
}

// ── Barca ────────────────────────────────────────────────────────
export class Boat extends Vehicle {
  constructor(game) {
    super(game, 'boat', [
      P('hull', [1.2, 0.18, 1.8], [0, 0.12, 0], '#8a5a2a', { color2: '#5a3a1a' }),
      P('sideL', [0.1, 0.32, 1.8], [-0.55, 0.34, 0], '#9a6a3a'), P('sideR', [0.1, 0.32, 1.8], [0.55, 0.34, 0], '#9a6a3a'),
      P('bow', [1.2, 0.32, 0.1], [0, 0.34, -0.88], '#9a6a3a'), P('stern', [1.2, 0.32, 0.1], [0, 0.34, 0.88], '#9a6a3a'),
      P('seat', [1.0, 0.08, 0.3], [0, 0.3, 0.2], '#b07a40'),
      P('oarL', [0.06, 0.06, 1.0], [-0.75, 0.42, 0], '#6a4420', { pivot: [-0.6, 0.42, 0] }), P('oarR', [0.06, 0.06, 1.0], [0.75, 0.42, 0], '#6a4420', { pivot: [0.6, 0.42, 0] }),
    ]);
    this.w = 1.3; this.h = 0.55; this.rowPhase = 0;
  }
  /** Altura de la superficie del agua en la columna de la barca (o null si no está en el agua). */
  _waterLevel() {
    const w = this.world, x = Math.floor(this.x), z = Math.floor(this.z);
    let y = Math.floor(this.y + 0.6);
    if (B_FLUID[w.getBlock(x, y, z)] === 1) {
      // hundida: busca la superficie hacia arriba para volver a flotar
      for (let k = 0; k < 6 && B_FLUID[w.getBlock(x, y + 1, z)] === 1; k++) y++;
      return B_FLUID[w.getBlock(x, y + 1, z)] ? null : y + 0.875;
    }
    for (y--; y >= Math.floor(this.y) - 1; y--) if (B_FLUID[w.getBlock(x, y, z)] === 1) return y + 0.875;
    return null;
  }
  update(dt) {
    const w = this.world;
    this.hitCd = Math.max(0, this.hitCd - dt);
    const wl = this._waterLevel();
    const inWater = wl !== null;
    const ctl = this.rider && this.rider.ctl;
    if (ctl) {
      this.yaw += (ctl.turn || 0) * 1.9 * dt;
      const thrust = (ctl.fwd || 0) * (inWater ? 7 : 1.2);
      this.vx += -Math.sin(this.yaw) * thrust * dt; this.vz += -Math.cos(this.yaw) * thrust * dt;
      if (ctl.fwd) this.rowPhase += dt * 8;
    }
    const drag = inWater ? 0.9 : 6;
    this.vx *= Math.exp(-drag * dt); this.vz *= Math.exp(-drag * dt);
    const sp = Math.hypot(this.vx, this.vz), max = inWater ? 6 : 1.2;
    if (sp > max) { this.vx *= max / sp; this.vz *= max / sp; }
    if (inWater) this.vy += clamp((wl - 0.3 - this.y) * 12, -8, 8) * dt - this.vy * 4 * dt;
    else this.vy -= 22 * dt;
    moveEntity(w, this, this.vx * dt, this.vy * dt, this.vz * dt);
    if (this.hitX) this.vx *= -0.2; if (this.hitZ) this.vz *= -0.2;
    this._sync();
    this.obj.rotation.set(0, this.yaw, 0);
    this.obj.rotation.z = inWater ? Math.sin(this.age * 1.7) * 0.03 : 0;
    this.age += dt;
    const pt = this.model.parts;
    pt.oarL.rotation.y = Math.sin(this.rowPhase) * 0.6; pt.oarR.rotation.y = -Math.sin(this.rowPhase) * 0.6;
    this._tint();
  }
  seat() { return [this.x, this.y + 0.15, this.z]; }
  serialize() { return { t: 'boat', x: this.x, y: this.y, z: this.z, vd: { yaw: this.yaw } }; }
  initFromData(d) { if (d) this.yaw = d.yaw || 0; }
}

/** ¿Hay sitio para un jugador de pie en (x,y,z)? (para bajar del vehículo) */
export function freeSpot(world, x, y, z) { return !boxCollides(world, x, y, z, 0.6, 1.8) && !!B_SOLID[world.getBlock(Math.floor(x), Math.floor(y - 0.5), Math.floor(z))]; }
export { DIRV, opposite };
