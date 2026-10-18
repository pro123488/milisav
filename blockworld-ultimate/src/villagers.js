// Habitantes de las aldeas: aldeanos con oficio, rutina día/noche, navegación A* (abren y cierran puertas),
// huida de monstruos y comercio; y el Guardián de piedra que defiende la aldea.
import * as THREE from 'three';
import { Mob, buildModel } from './entities.js';
import { Items } from './items.js';
import { findPath, isOpenableDoor } from './navigation.js';
import { PROFESSIONS, newTradeState, restock } from './trading.js';
import { MONSTERS } from './monsters.js';
import { Blocks } from './blocks.js';

const P = (name, size, center, color, o = {}) => ({ name, size, center, color, ...o });
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Modelo de aldeano: túnica del color del oficio y sombrero propio. */
function villagerModel(prof) {
  const pr = PROFESSIONS[prof] || PROFESSIONS.none;
  const parts = [
    P('body', [0.5, 0.8, 0.32], [0, 1.1, 0], pr.robe, { pivot: [0, 1.1, 0], color2: '#3a2a20' }),
    P('robe', [0.54, 0.5, 0.36], [0, 0.55, 0], pr.robe, { pivot: [0, 0.8, 0] }),
    P('head', [0.44, 0.48, 0.44], [0, 1.74, 0], '#c9926a', { pivot: [0, 1.5, 0] }),
    P('nose', [0.1, 0.18, 0.08], [0, 1.68, -0.26], '#b07a56', { pivot: [0, 1.5, 0], parent: 'head' }),
    P('eyeL', [0.08, 0.05, 0.02], [-0.1, 1.8, -0.225], '#2a3a4a', { pivot: [0, 1.5, 0], parent: 'head' }),
    P('eyeR', [0.08, 0.05, 0.02], [0.1, 1.8, -0.225], '#2a3a4a', { pivot: [0, 1.5, 0], parent: 'head' }),
    P('arms', [0.62, 0.2, 0.22], [0, 1.15, -0.2], pr.robe, { pivot: [0, 1.3, 0] }),
    P('hands', [0.22, 0.16, 0.16], [0, 1.15, -0.3], '#c9926a', { pivot: [0, 1.3, 0], parent: 'arms' }),
    P('legL', [0.2, 0.32, 0.22], [-0.12, 0.16, 0], '#4a3a2e', { pivot: [-0.12, 0.32, 0] }),
    P('legR', [0.2, 0.32, 0.22], [0.12, 0.16, 0], '#4a3a2e', { pivot: [0.12, 0.32, 0] }),
  ];
  if (pr.hat === 'straw') parts.push(P('hat', [0.7, 0.08, 0.7], [0, 2.0, 0], '#d8c070', { pivot: [0, 1.5, 0], parent: 'head' }), P('hatTop', [0.4, 0.16, 0.4], [0, 2.1, 0], '#cdb460', { pivot: [0, 1.5, 0], parent: 'head' }));
  else if (pr.hat === 'cap') parts.push(P('hat', [0.48, 0.14, 0.48], [0, 2.02, 0], pr.robe, { pivot: [0, 1.5, 0], parent: 'head' }));
  else if (pr.hat === 'hood') parts.push(P('hat', [0.5, 0.3, 0.5], [0, 1.92, 0.03], '#d8d8c8', { pivot: [0, 1.5, 0], parent: 'head' }));
  else if (prof === 'blacksmith') parts.push(P('apron', [0.46, 0.6, 0.04], [0, 0.95, -0.18], '#2a2420', { pivot: [0, 1.1, 0] }));
  return parts;
}

export const VILLAGER_DEF = {
  key: 'villager', name: 'Aldeano', hp: 20, speed: 1.25, fleeMul: 1.9, w: 0.6, h: 1.95, jump: 8.4, model: () => villagerModel('none'),
};
export const GUARDIAN_DEF = {
  key: 'stone_guardian', name: 'Guardián de piedra', hp: 100, speed: 1.1, chase: 2.4, dmg: 10, reach: 2.2, w: 1.2, h: 2.6, knockRes: 1, jump: 8.4, cooldown: 1.4,
  model: () => [
    P('body', [1.1, 1.1, 0.7], [0, 1.65, 0], '#8a8c90', { pivot: [0, 1.65, 0], color2: '#5a5c60' }),
    P('moss', [1.12, 0.16, 0.72], [0, 2.1, 0], '#5a7a3c'),
    P('head', [0.56, 0.56, 0.56], [0, 2.45, -0.08], '#9a9ca0', { pivot: [0, 2.2, 0] }),
    P('eyeL', [0.12, 0.06, 0.04], [-0.13, 2.5, -0.37], '#ffd060', { pivot: [0, 2.2, 0], parent: 'head', emissive: true }),
    P('eyeR', [0.12, 0.06, 0.04], [0.13, 2.5, -0.37], '#ffd060', { pivot: [0, 2.2, 0], parent: 'head', emissive: true }),
    P('armL', [0.34, 1.4, 0.34], [-0.75, 1.45, 0], '#7a7c80', { pivot: [-0.75, 2.1, 0] }),
    P('armR', [0.34, 1.4, 0.34], [0.75, 1.45, 0], '#7a7c80', { pivot: [0.75, 2.1, 0] }),
    P('legL', [0.4, 1.1, 0.42], [-0.3, 0.55, 0], '#6a6c70', { pivot: [-0.3, 1.1, 0] }),
    P('legR', [0.4, 1.1, 0.42], [0.3, 0.55, 0], '#6a6c70', { pivot: [0.3, 1.1, 0] }),
  ],
};

const isNight = (t) => t > 0.53 && t < 0.97;

/** Sigue un camino A* de celdas (abre y cierra puertas de madera a su paso). */
class PathFollower {
  constructor(mob) { this.mob = mob; this.path = null; this.i = 0; this.goal = null; this.cool = 0; this.stuck = 0; this.doors = []; }
  setGoal(x, y, z, range = 0) {
    const g = this.goal;
    if (g && g[0] === x && g[1] === y && g[2] === z && this.path) return;
    this.goal = [x, y, z, range]; this.path = null; this.i = 0;
  }
  clear() { this.goal = null; this.path = null; }
  /** Devuelve true si ha llegado (o no hay objetivo). */
  update(dt, speedMul = 1) {
    const m = this.mob, w = m.world, game = m.game;
    this.cool -= dt;
    this._closeDoors(dt);
    if (!this.goal) return true;
    const [gx, gy, gz, range] = this.goal;
    const cx = Math.floor(m.x), cy = Math.floor(m.y + 0.01), cz = Math.floor(m.z);
    if (Math.abs(cx - gx) + Math.abs(cz - gz) <= range && Math.abs(cy - gy) <= 1) { this.clear(); return true; }
    if (!this.path) {
      if (this.cool > 0) return false;
      this.cool = 0.6 + Math.random() * 0.4;
      this.path = findPath(w, cx, cy, cz, gx, gy, gz, { maxNodes: 900, range });
      this.i = 0; this.stuck = 0;
      if (!this.path || !this.path.length) { this.path = null; this.goal = null; return true; }
    }
    const wp = this.path[this.i];
    // abrir la puerta del siguiente paso (o de la celda actual)
    for (const c of [wp, [cx, cy, cz]]) for (const yy of [c[1], c[1] + 1]) {
      const id = w.getBlock(c[0], yy, c[2]);
      if (isOpenableDoor(id) && !Blocks.get(id).open && game.building) {
        const fam = Blocks.get(id).family;
        const ok = fam === 'door' ? game.building.toggleDoor(c[0], yy, c[2], true) : game.building.toggleGate(c[0], yy, c[2], true);
        if (ok) this.doors.push({ x: c[0], y: yy, z: c[2], t: 2.5 });
      }
    }
    const tx = wp[0] + 0.5, tz = wp[2] + 0.5;
    const d = Math.hypot(tx - m.x, tz - m.z);
    if (d < 0.35 && Math.abs(wp[1] - m.y) < 1.1) {
      this.i++;
      if (this.i >= this.path.length) { this.path = null; return false; }
      return false;
    }
    m.wishX = ((tx - m.x) / (d || 1)) * speedMul; m.wishZ = ((tz - m.z) / (d || 1)) * speedMul;
    if (wp[1] > m.y + 0.6 && m.onGround && (m.hitX || m.hitZ)) m.wantJump = true;
    // atasco: recalcular
    if (Math.hypot(m.vx, m.vz) < 0.15) { this.stuck += dt; if (this.stuck > 1.5) { this.path = null; this.stuck = 0; } } else this.stuck = 0;
    return false;
  }
  _closeDoors(dt) {
    const m = this.mob, game = m.game;
    for (let k = this.doors.length - 1; k >= 0; k--) {
      const dr = this.doors[k];
      dr.t -= dt;
      const inside = Math.floor(m.x) === dr.x && Math.floor(m.z) === dr.z;
      if (dr.t <= 0 && !inside && Math.hypot(m.x - dr.x - 0.5, m.z - dr.z - 0.5) > 1.6) {
        const id = m.world.getBlock(dr.x, dr.y, dr.z);
        if (isOpenableDoor(id) && Blocks.get(id).open && game.building) {
          if (Blocks.get(id).family === 'door') game.building.toggleDoor(dr.x, dr.y, dr.z, false); else game.building.toggleGate(dr.x, dr.y, dr.z, false);
        }
        this.doors.splice(k, 1);
      } else if (dr.t < -20) this.doors.splice(k, 1);
    }
  }
}

export class Villager extends Mob {
  constructor(game) {
    super(game, VILLAGER_DEF);
    this.prof = 'none'; this.vname = 'Aldeano'; this.village = null; this.bed = null; this.ws = null;
    this.trade = newTradeState('none');
    this.nav = new PathFollower(this);
    this.mode = 'idle'; this.modeTimer = Math.random() * 3; this.lastDay = -1; this.isVillager = true;
    this.fear = 0; this.fearX = 0; this.fearZ = 0; this.talk = 0;
  }
  get persistent() { return this.deathTime < 0; }
  get displayName() { return `${this.vname} (${PROFESSIONS[this.prof].name})`; }

  /** Datos del plan de la aldea o del guardado. */
  initFromData(d) {
    if (!d) return;
    this.prof = PROFESSIONS[d.prof] ? d.prof : 'none';
    this.vname = d.name || this.vname; this.village = d.village || null; this.bed = d.bed || null; this.ws = d.ws || null;
    this.trade = d.trade ? { ...newTradeState(this.prof), ...d.trade, prof: this.prof } : newTradeState(this.prof);
    if (d.hp) this.hp = d.hp;
    this.rebuildModel();
  }
  rebuildModel() {
    const vis = this.obj ? this.obj.visible : true;
    if (this.obj) this.game.scene.remove(this.obj);
    this.model = buildModel(villagerModel(this.prof));
    this.obj = this.model.root; this.obj.visible = vis; this.game.scene.add(this.obj); this._sync();
  }
  /** Asigna un oficio (al tomar una estación de trabajo libre). */
  setProfession(prof, ws) {
    this.prof = prof; this.ws = ws; this.trade = newTradeState(prof);
    this.rebuildModel();
    this.game.particles && this.game.particles.emit(this.x, this.y + 2, this.z, 0x66dd66, 10, 1.5);
  }

  onHurt(amount, source) {
    this.fear = 5;
    const p = this.game.player;
    this.fearX = source && source.x !== undefined ? source.x : p.x; this.fearZ = source && source.z !== undefined ? source.z : p.z;
    if (source === p && this.game.villageReputation) this.game.villageReputation(this.village, -5, this);
  }
  onDeath() { this.game.particles.emit(this.x, this.y + 1, this.z, 0xaaaaaa, 10, 2); }

  think(dt) {
    const g = this.game, w = this.world;
    this.modeTimer -= dt; this.fear -= dt; this.talk -= dt;
    // reposición al amanecer (una vez por día)
    if (g.time < 0.08) { if (!this._restocked) { this._restocked = true; restock(this.trade); } } else if (g.time > 0.2) this._restocked = false;
    if (this.talk > 0) { const p = g.player; this.targetYaw = Math.atan2(-(p.x - this.x), -(p.z - this.z)); return; }
    // huir de monstruos cercanos o de quien le golpeó
    let threat = null, td = 9;
    for (const e of g.entities.list) {
      if (e.removed || !MONSTERS[e.type] || e.deathTime >= 0 || e.burrowed) continue;
      const d = Math.hypot(e.x - this.x, e.z - this.z);
      if (d < td) { td = d; threat = e; }
    }
    if (threat || this.fear > 0) {
      const fx = threat ? threat.x : this.fearX, fz = threat ? threat.z : this.fearZ;
      const ax = this.x - fx, az = this.z - fz, ad = Math.hypot(ax, az) || 1;
      // de noche, mejor a casa
      if (this.bed && isNight(g.time) && threat) { this.nav.setGoal(this.bed[0], this.bed[1], this.bed[2], 1); this.nav.update(dt, 1.8); return; }
      this.nav.clear();
      this.wishX = (ax / ad) * 1.8; this.wishZ = (az / ad) * 1.8;
      if ((this.hitX || this.hitZ) && this.onGround) this.wantJump = true;
      return;
    }
    const alarm = g.villageAlarm && g.villageAlarm(this.village);
    if ((isNight(g.time) || alarm) && this.bed) {
      // a casa: junto a la cama
      const d = Math.hypot(this.bed[0] + 0.5 - this.x, this.bed[2] + 0.5 - this.z);
      if (d > 1.6 || Math.abs(this.bed[1] - this.y) > 1.5) {
        if (!this.nav.goal) this.nav.setGoal(this.bed[0], this.bed[1], this.bed[2], 1);
        this.nav.update(dt, alarm ? 1.6 : 1.1);
        this.mode = 'home';
      } else { this.nav.clear(); this.mode = 'sleep'; }
      return;
    }
    if (this.mode === 'sleep' || this.mode === 'home') { this.mode = 'idle'; this.modeTimer = 0; }
    // de día: trabajar o pasear
    if (this.nav.goal) { if (this.nav.update(dt, this.mode === 'work' ? 1 : 0.8)) this.modeTimer = 2 + Math.random() * 5; return; }
    if (this.modeTimer > 0) return;
    const r = Math.random();
    if (this.ws && r < 0.55) {
      this.mode = 'work';
      this.nav.setGoal(this.ws[0], this.ws[1], this.ws[2], 2);
      if (Math.random() < 0.3) restock(this.trade);
    } else if (r < 0.85) {
      this.mode = 'wander';
      const v = g.villageInfo && g.villageInfo(this.village);
      const ox = v ? v.x : this.x, oz = v ? v.z : this.z;
      const a = Math.random() * Math.PI * 2, rr = 3 + Math.random() * 14;
      const tx = Math.floor(ox + Math.cos(a) * rr), tz = Math.floor(oz + Math.sin(a) * rr);
      const ty = w.surfaceY(tx, tz);
      if (ty > 0) this.nav.setGoal(tx, ty + 1, tz, 1);
    } else { this.mode = 'idle'; this.modeTimer = 2 + Math.random() * 4; }
  }

  animate(dt) {
    const p = this.model.parts;
    const walk = Math.sin(this.walkPhase) * 0.8 * this.walkAmt;
    if (p.legL) { p.legL.rotation.x = walk; p.legR.rotation.x = -walk; }
    if (p.head) p.head.rotation.x = this.mode === 'work' ? 0.35 : 0;
    if (p.arms) p.arms.rotation.x = this.mode === 'work' ? Math.sin(this.age * 6) * 0.15 : 0;
    void dt;
  }

  serialize() {
    const o = super.serialize();
    o.vd = { prof: this.prof, name: this.vname, village: this.village, bed: this.bed, ws: this.ws, trade: this.trade, hp: this.hp };
    return o;
  }
}

export class StoneGuardian extends Mob {
  constructor(game) {
    super(game, GUARDIAN_DEF);
    this.isGolem = true;
    this.village = null; this.home = null; this.atkCd = 1; this.angry = 0; this.attackAnim = 0;
    this.nav = new PathFollower(this); this.modeTimer = 0; this.target = null;
  }
  get persistent() { return this.deathTime < 0; }
  initFromData(d) {
    if (!d) return;
    this.village = d.village || null; this.home = d.home || [Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)];
    if (d.hp) this.hp = d.hp; if (d.angry) this.angry = d.angry;
  }
  onHurt(amount, source) {
    if (source === this.game.player) { this.angry = 60; this.game.villageReputation && this.game.villageReputation(this.village, -3, this); }
  }
  onDeath() {
    const g = this.game;
    g.dropItem({ i: Items.id('iron_ingot'), n: 3 + Math.floor(Math.random() * 3), d: 0 }, this.x, this.y + 1, this.z);
    g.particles.emit(this.x, this.y + 1.2, this.z, 0x8a8c90, 18, 3);
  }
  think(dt) {
    const g = this.game, p = g.player;
    this.atkCd -= dt; this.angry -= dt; this.attackAnim = Math.max(0, this.attackAnim - dt); this.modeTimer -= dt;
    if (!this.home) this.home = [Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)];
    // objetivo: monstruos cerca de la aldea, o el jugador si está enfadado
    let tgt = null, best = 16;
    for (const e of g.entities.list) {
      if (e.removed || !MONSTERS[e.type] || e.deathTime >= 0 || e.burrowed) continue;
      const d = Math.hypot(e.x - this.x, e.z - this.z);
      if (d < best && Math.hypot(e.x - this.home[0], e.z - this.home[2]) < 40) { best = d; tgt = e; }
    }
    const rep = g.villageInfo ? (g.villageInfo(this.village) || {}).rep || 0 : 0;
    if (!tgt && (this.angry > 0 || rep <= -30) && g.mode !== 'creative' && !g.survival.dead && Math.hypot(p.x - this.x, p.z - this.z) < 20) tgt = p;
    this.target = tgt;
    if (tgt) {
      this.nav.clear();
      const dx = tgt.x - this.x, dz = tgt.z - this.z, d = Math.hypot(dx, dz) || 1;
      if (d > GUARDIAN_DEF.reach * 0.7) { this.wishX = (dx / d) * (GUARDIAN_DEF.chase / GUARDIAN_DEF.speed); this.wishZ = (dz / d) * (GUARDIAN_DEF.chase / GUARDIAN_DEF.speed); }
      if ((this.hitX || this.hitZ) && this.onGround) this.wantJump = true;
      if (d < GUARDIAN_DEF.reach && Math.abs((tgt.y || 0) - this.y) < 2.5 && this.atkCd <= 0) {
        this.atkCd = GUARDIAN_DEF.cooldown; this.attackAnim = 0.4;
        if (tgt === p) g.survival.damage(GUARDIAN_DEF.dmg * 0.6, 'mob', this);
        else if (tgt.hurt) { tgt.hurt(GUARDIAN_DEF.dmg, this.x, this.z, 1.6, this); tgt.vy = Math.max(tgt.vy || 0, 8); }
        g.audio && g.audio.play('rumble', this.x, this.y, this.z);
      }
      return;
    }
    // patrulla alrededor del pozo
    if (this.nav.goal) { this.nav.update(dt, 0.7); return; }
    if (this.modeTimer <= 0) {
      this.modeTimer = 4 + Math.random() * 8;
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 12;
      const tx = Math.floor(this.home[0] + Math.cos(a) * r), tz = Math.floor(this.home[2] + Math.sin(a) * r);
      const ty = this.world.surfaceY(tx, tz);
      if (ty > 0) this.nav.setGoal(tx, ty + 1, tz, 1);
    }
  }
  animate(dt) {
    const p = this.model.parts;
    const walk = Math.sin(this.walkPhase * 0.7) * 0.6 * this.walkAmt;
    if (p.legL) { p.legL.rotation.x = walk; p.legR.rotation.x = -walk; }
    const swing = this.attackAnim > 0 ? -Math.sin((1 - this.attackAnim / 0.4) * Math.PI) * 1.6 : 0;
    if (p.armL) { p.armL.rotation.x = swing - walk * 0.5; p.armR.rotation.x = swing + walk * 0.5; }
    void dt;
  }
  serialize() {
    const o = super.serialize();
    o.vd = { village: this.village, home: this.home, hp: this.hp, angry: Math.max(0, this.angry) };
    return o;
  }
}

export const VILLAGE_MOBS = { villager: VILLAGER_DEF, stone_guardian: GUARDIAN_DEF };
export function createVillageMob(game, key) {
  if (key === 'villager') return new Villager(game);
  if (key === 'stone_guardian') return new StoneGuardian(game);
  return null;
}
void THREE; void clamp;
