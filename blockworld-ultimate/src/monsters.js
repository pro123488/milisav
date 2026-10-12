// Criaturas hostiles originales: persecución, ataques cuerpo a cuerpo y a distancia, retroceso, recompensas
// y comportamientos propios (quemarse al sol, emboscar bajo la arena, custodiar ruinas, volar errático...).
import * as THREE from 'three';
import { Mob, Entity } from './entities.js';
import { Items } from './items.js';
import { moveEntity } from './physics.js';
import { mobDamageScale } from './survival.js';
import { B_SOLID } from './blocks.js';

const P = (name, size, center, color, o = {}) => ({ name, size, center, color, ...o });
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** threat: nivel de amenaza 1..5 (se muestra en el bestiario/depuración). */
export const MONSTERS = {
  night_stalker: {
    key: 'night_stalker', name: 'Acechador nocturno', threat: 2, hp: 20, speed: 2.2, chase: 3.1, dmg: 3, reach: 1.6, detect: 22, w: 0.6, h: 1.85,
    burns: true, habitat: 'Superficie, de noche y en cuevas oscuras', sound: 'growl', cooldown: 1.0, jump: 8.4,
    drops: [{ item: 'coal', min: 0, max: 2 }, { item: 'stick', min: 0, max: 2 }, { item: 'iron_ingot', min: 0, max: 1, chance: 0.08 }],
    model: () => [
      P('torso', [0.52, 0.72, 0.28], [0, 1.2, 0], '#3b3b4d', { pivot: [0, 1.2, 0] }),
      P('head', [0.46, 0.46, 0.46], [0, 1.78, 0], '#4a4a60', { pivot: [0, 1.6, 0] }),
      P('eyeL', [0.1, 0.07, 0.04], [-0.12, 1.8, -0.24], '#ffe14a', { pivot: [0, 1.6, 0], parent: 'head', emissive: true }),
      P('eyeR', [0.1, 0.07, 0.04], [0.12, 1.8, -0.24], '#ffe14a', { pivot: [0, 1.6, 0], parent: 'head', emissive: true }),
      P('armL', [0.18, 0.78, 0.18], [-0.36, 1.2, 0], '#34344a', { pivot: [-0.36, 1.55, 0] }),
      P('armR', [0.18, 0.78, 0.18], [0.36, 1.2, 0], '#34344a', { pivot: [0.36, 1.55, 0] }),
      P('legL', [0.22, 0.84, 0.24], [-0.14, 0.42, 0], '#2a2a3a', { pivot: [-0.14, 0.84, 0] }),
      P('legR', [0.22, 0.84, 0.24], [0.14, 0.42, 0], '#2a2a3a', { pivot: [0.14, 0.84, 0] }),
    ],
  },
  cave_bat: {
    key: 'cave_bat', name: 'Murciélago cavernario', threat: 1, hp: 6, speed: 3.0, chase: 3.4, dmg: 2, reach: 1.1, detect: 14, w: 0.45, h: 0.4, flying: true, canJump: false,
    habitat: 'Cuevas oscuras', sound: 'screech', cooldown: 1.2,
    drops: [{ item: 'leather', min: 0, max: 1, chance: 0.5 }],
    model: () => [
      P('body', [0.2, 0.2, 0.3], [0, 0.22, 0], '#4a3a30'),
      P('head', [0.2, 0.18, 0.18], [0, 0.26, -0.22], '#3a2c24', { pivot: [0, 0.24, -0.15] }),
      P('earL', [0.06, 0.12, 0.04], [-0.07, 0.4, -0.22], '#3a2c24', { pivot: [0, 0.24, -0.15], parent: 'head' }),
      P('earR', [0.06, 0.12, 0.04], [0.07, 0.4, -0.22], '#3a2c24', { pivot: [0, 0.24, -0.15], parent: 'head' }),
      P('eyeL', [0.04, 0.04, 0.02], [-0.05, 0.28, -0.32], '#ff5a5a', { pivot: [0, 0.24, -0.15], parent: 'head', emissive: true }),
      P('eyeR', [0.04, 0.04, 0.02], [0.05, 0.28, -0.32], '#ff5a5a', { pivot: [0, 0.24, -0.15], parent: 'head', emissive: true }),
      P('wingL', [0.55, 0.03, 0.3], [-0.38, 0.26, 0], '#5a463a', { pivot: [-0.1, 0.26, 0] }),
      P('wingR', [0.55, 0.03, 0.3], [0.38, 0.26, 0], '#5a463a', { pivot: [0.1, 0.26, 0] }),
    ],
  },
  mud_golem: {
    key: 'mud_golem', name: 'Gólem de barro', threat: 3, hp: 40, speed: 1.2, chase: 1.9, dmg: 6, reach: 2.0, detect: 14, w: 1.0, h: 2.2, knockRes: 0.8,
    habitat: 'Pantanos', sound: 'rumble', cooldown: 1.6, jump: 7,
    drops: [{ item: 'clay_ball', min: 2, max: 5 }, { item: 'stick', min: 0, max: 3 }],
    model: () => [
      P('torso', [0.95, 0.95, 0.6], [0, 1.45, 0], '#6b5238', { pivot: [0, 1.45, 0], color2: '#4a3724' }),
      P('moss', [0.97, 0.2, 0.62], [0, 1.85, 0], '#4d6b3c'),
      P('head', [0.6, 0.55, 0.55], [0, 2.12, 0], '#7a5e40', { pivot: [0, 1.95, 0] }),
      P('eyeL', [0.12, 0.08, 0.04], [-0.15, 2.14, -0.29], '#9affc0', { pivot: [0, 1.95, 0], parent: 'head', emissive: true }),
      P('eyeR', [0.12, 0.08, 0.04], [0.15, 2.14, -0.29], '#9affc0', { pivot: [0, 1.95, 0], parent: 'head', emissive: true }),
      P('armL', [0.36, 1.1, 0.36], [-0.68, 1.4, 0], '#5e4630', { pivot: [-0.68, 1.9, 0] }),
      P('armR', [0.36, 1.1, 0.36], [0.68, 1.4, 0], '#5e4630', { pivot: [0.68, 1.9, 0] }),
      P('legL', [0.4, 0.95, 0.42], [-0.25, 0.47, 0], '#4a3724', { pivot: [-0.25, 0.95, 0] }),
      P('legR', [0.4, 0.95, 0.42], [0.25, 0.47, 0], '#4a3724', { pivot: [0.25, 0.95, 0] }),
    ],
  },
  ruin_guardian: {
    key: 'ruin_guardian', name: 'Guardián de ruinas', threat: 4, hp: 50, speed: 1.0, chase: 2.1, dmg: 7, reach: 2.0, detect: 13, w: 0.9, h: 2.0, knockRes: 0.9, guard: 14,
    habitat: 'Ruinas y templos', sound: 'rumble', cooldown: 1.5, noDespawn: true,
    drops: [{ item: 'crystal_shard', min: 1, max: 3 }, { item: 'iron_ingot', min: 1, max: 3 }, { item: 'gold_ingot', min: 0, max: 2 }],
    model: () => [
      P('torso', [0.8, 0.9, 0.5], [0, 1.4, 0], '#7d8088', { pivot: [0, 1.4, 0] }),
      P('rune', [0.3, 0.3, 0.04], [0, 1.45, -0.27], '#58f0ff', { pivot: [0, 1.4, 0], parent: 'torso', emissive: true }),
      P('head', [0.5, 0.5, 0.5], [0, 2.0, 0], '#8e9199', { pivot: [0, 1.85, 0] }),
      P('eyeL', [0.1, 0.05, 0.04], [-0.12, 2.02, -0.26], '#58f0ff', { pivot: [0, 1.85, 0], parent: 'head', emissive: true }),
      P('eyeR', [0.1, 0.05, 0.04], [0.12, 2.02, -0.26], '#58f0ff', { pivot: [0, 1.85, 0], parent: 'head', emissive: true }),
      P('armL', [0.3, 1.0, 0.3], [-0.58, 1.3, 0], '#6c6f77', { pivot: [-0.58, 1.8, 0] }),
      P('armR', [0.3, 1.0, 0.3], [0.58, 1.3, 0], '#6c6f77', { pivot: [0.58, 1.8, 0] }),
      P('legL', [0.34, 0.95, 0.36], [-0.22, 0.47, 0], '#5c5f67', { pivot: [-0.22, 0.95, 0] }),
      P('legR', [0.34, 0.95, 0.36], [0.22, 0.47, 0], '#5c5f67', { pivot: [0.22, 0.95, 0] }),
    ],
  },
  obsidian_skeleton: {
    key: 'obsidian_skeleton', name: 'Esqueleto de obsidiana', threat: 3, hp: 20, speed: 1.8, chase: 2.4, dmg: 4, reach: 1.5, detect: 24, w: 0.6, h: 1.9, ranged: true,
    habitat: 'Cuevas profundas y volcanes', sound: 'rattle', cooldown: 2.0,
    drops: [{ item: 'coal', min: 0, max: 2 }, { item: 'flint', min: 0, max: 2 }, { item: 'iron_ingot', min: 0, max: 1, chance: 0.12 }, { item: 'raw_noctisite', min: 0, max: 1, chance: 0.05 }],
    model: () => [
      P('torso', [0.44, 0.7, 0.22], [0, 1.25, 0], '#2a2438', { pivot: [0, 1.25, 0] }),
      P('ribs', [0.38, 0.12, 0.24], [0, 1.3, 0], '#8a7ca8', { parent: 'torso', pivot: [0, 1.25, 0] }),
      P('head', [0.42, 0.42, 0.42], [0, 1.78, 0], '#2f2942', { pivot: [0, 1.62, 0] }),
      P('eyeL', [0.09, 0.09, 0.04], [-0.1, 1.8, -0.22], '#ff3df0', { pivot: [0, 1.62, 0], parent: 'head', emissive: true }),
      P('eyeR', [0.09, 0.09, 0.04], [0.1, 1.8, -0.22], '#ff3df0', { pivot: [0, 1.62, 0], parent: 'head', emissive: true }),
      P('armL', [0.12, 0.74, 0.12], [-0.3, 1.2, 0], '#241f33', { pivot: [-0.3, 1.58, 0] }),
      P('armR', [0.12, 0.74, 0.12], [0.3, 1.2, 0], '#241f33', { pivot: [0.3, 1.58, 0] }),
      P('legL', [0.14, 0.9, 0.14], [-0.12, 0.45, 0], '#211c2e', { pivot: [-0.12, 0.9, 0] }),
      P('legR', [0.14, 0.9, 0.14], [0.12, 0.45, 0], '#211c2e', { pivot: [0.12, 0.9, 0] }),
    ],
  },
  sand_devourer: {
    key: 'sand_devourer', name: 'Devorador de arena', threat: 3, hp: 24, speed: 1.5, chase: 3.5, dmg: 5, reach: 1.8, detect: 16, w: 0.9, h: 0.8, burrow: true, knockRes: 0.3,
    habitat: 'Desiertos y mesetas', sound: 'growl', cooldown: 1.2, jump: 7,
    drops: [{ item: 'leather', min: 0, max: 2 }, { item: 'raw_gold', min: 0, max: 1, chance: 0.15 }],
    model: () => [
      P('seg1', [0.8, 0.6, 0.8], [0, 0.4, 0.5], '#b79f6a', { pivot: [0, 0.4, 0.4] }),
      P('seg2', [0.62, 0.5, 0.62], [0, 0.34, 1.1], '#a89160', { pivot: [0, 0.34, 0.8], parent: 'seg1' }),
      P('head', [0.9, 0.7, 0.8], [0, 0.45, -0.2], '#c9b27a', { pivot: [0, 0.45, 0.1] }),
      P('jawT', [0.8, 0.12, 0.5], [0, 0.66, -0.55], '#efe2b8', { pivot: [0, 0.6, -0.2], parent: 'head' }),
      P('jawB', [0.8, 0.12, 0.5], [0, 0.26, -0.55], '#efe2b8', { pivot: [0, 0.3, -0.2], parent: 'head' }),
      P('eyeL', [0.1, 0.1, 0.04], [-0.28, 0.62, -0.6], '#ff7a2a', { pivot: [0, 0.45, 0.1], parent: 'head', emissive: true }),
      P('eyeR', [0.1, 0.1, 0.04], [0.28, 0.62, -0.6], '#ff7a2a', { pivot: [0, 0.45, 0.1], parent: 'head', emissive: true }),
    ],
  },
  volcano_beast: {
    key: 'volcano_beast', name: 'Bestia volcánica', threat: 5, hp: 60, speed: 2.0, chase: 3.4, dmg: 7, reach: 2.0, detect: 20, w: 1.3, h: 1.4, fireImmune: true, knockRes: 0.7, ignite: 5,
    habitat: 'Regiones volcánicas', sound: 'growl', cooldown: 1.3, jump: 9,
    drops: [{ item: 'coal', min: 2, max: 4 }, { item: 'raw_noctisite', min: 0, max: 1, chance: 0.25 }, { item: 'raw_gold', min: 0, max: 2, chance: 0.4 }],
    model: () => [
      P('body', [1.0, 0.8, 1.5], [0, 0.95, 0], '#2c2226', { color2: '#1a1214' }),
      P('crack1', [1.02, 0.1, 0.5], [0, 1.2, 0.1], '#ff6a1a', { emissive: true }),
      P('crack2', [0.5, 0.1, 1.0], [0, 1.36, -0.1], '#ff9a2a', { emissive: true }),
      P('head', [0.7, 0.6, 0.7], [0, 1.15, -1.0], '#3a2c30', { pivot: [0, 1.0, -0.75] }),
      P('mouth', [0.5, 0.15, 0.3], [0, 0.95, -1.35], '#ff7a20', { pivot: [0, 1.0, -0.75], parent: 'head', emissive: true }),
      P('hornL', [0.12, 0.35, 0.12], [-0.28, 1.6, -0.95], '#1a1214', { pivot: [0, 1.0, -0.75], parent: 'head' }),
      P('hornR', [0.12, 0.35, 0.12], [0.28, 1.6, -0.95], '#1a1214', { pivot: [0, 1.0, -0.75], parent: 'head' }),
      P('leg_fl', [0.32, 0.6, 0.32], [-0.35, 0.3, -0.55], '#241a1c', { pivot: [-0.35, 0.6, -0.55] }),
      P('leg_fr', [0.32, 0.6, 0.32], [0.35, 0.3, -0.55], '#241a1c', { pivot: [0.35, 0.6, -0.55] }),
      P('leg_bl', [0.32, 0.6, 0.32], [-0.35, 0.3, 0.55], '#241a1c', { pivot: [-0.35, 0.6, 0.55] }),
      P('leg_br', [0.32, 0.6, 0.32], [0.35, 0.3, 0.55], '#241a1c', { pivot: [0.35, 0.6, 0.55] }),
    ],
  },
};

/** Proyectil (fragmento de obsidiana). */
export class Projectile extends Entity {
  constructor(game, x, y, z, vx, vy, vz, dmg, owner) {
    super(game, 'projectile');
    this.x = x; this.y = y; this.z = z; this.vx = vx; this.vy = vy; this.vz = vz; this.dmg = dmg; this.owner = owner;
    this.w = 0.2; this.h = 0.2; this.life = 5;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.34), new THREE.MeshBasicMaterial({ color: 0xc040ff })); m.userData.ownMat = true;
    this.obj = new THREE.Group(); this.obj.add(m); game.scene.add(this.obj);
    this.mesh = m;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.removed = true; return; }
    this.vy -= 4 * dt;
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt, nz = this.z + this.vz * dt;
    if (this.world.solidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) { this.removed = true; this.game.particles.emit(this.x, this.y, this.z, 0xc040ff, 5, 2); return; }
    this.x = nx; this.y = ny; this.z = nz;
    this.obj.position.set(nx, ny, nz);
    this.mesh.rotation.y = Math.atan2(this.vx, this.vz); this.mesh.rotation.x = -Math.atan2(this.vy, Math.hypot(this.vx, this.vz));
    const p = this.game.player;
    if (Math.abs(nx - p.x) < 0.45 && ny > p.y - 0.1 && ny < p.y + p.h + 0.1 && Math.abs(nz - p.z) < 0.45) {
      this.game.survival.damage(this.dmg, 'mob', this.owner || this);
      this.removed = true;
      this.game.particles.emit(nx, ny, nz, 0xc040ff, 8, 3);
    }
  }
}

export class Monster extends Mob {
  constructor(game, def) {
    super(game, def);
    this.atkCd = 1 + Math.random(); this.state = 'idle'; this.stateTimer = Math.random() * 3;
    this.stuckTime = 0; this.lastX = this.x; this.lastZ = this.z; this.sidestep = 0; this.sideDir = 1;
    this.homeX = null; this.homeZ = null;
    this.burrowed = !!def.burrow; this.burrowTimer = 0;
    this.soundTimer = 6 + Math.random() * 10;
    this.attackAnim = 0;
    this.noDespawn = !!def.noDespawn;
    this.flit = 0; this.flitX = 0; this.flitZ = 0; this.flitVy = 0;
    if (this.burrowed) this.obj.visible = false;
  }

  get persistent() { return !!this.def.noDespawn && this.hp > 0; }

  onHurt() {
    if (this.burrowed) this._emerge();
    this.sound(true);
  }
  sound() { const g = this.game; if (this.def.sound && g.audio) g.audio.play(this.def.sound, this.x, this.y, this.z); }

  onDeath() {
    const g = this.game;
    for (const d of this.def.drops || []) {
      if ((d.chance ?? 1) < 1 && Math.random() >= d.chance) continue;
      const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
      if (n > 0) g.dropItem({ i: Items.id(d.item), n, d: 0 }, this.x, this.y + 0.5, this.z);
    }
    g.particles.emit(this.x, this.y + this.h / 2, this.z, 0x8844cc, 14, 3);
  }

  _emerge() {
    this.burrowed = false; this.obj.visible = true; this.burrowTimer = 10;
    this.game.particles.emit(this.x, this.y + 0.2, this.z, 0xc9b27a, 22, 4, 1);
    this.game.audio && this.game.audio.blockSound('break', 'sand', this.x, this.y, this.z);
    this.sound();
  }

  think(dt) {
    const g = this.game, p = g.player, def = this.def, w = this.world;
    // Reglas globales de despawn
    if (g.difficulty === 'peaceful' || g.meta.mobs !== 'all') { this.removed = true; return; }
    this.atkCd -= dt; this.attackAnim = Math.max(0, this.attackAnim - dt);
    this.soundTimer -= dt;
    const dx = p.x - this.x, dz = p.z - this.z, dy = (p.y + 0.9) - (this.y + this.h * 0.5);
    const dist = Math.hypot(dx, dz), dist3 = Math.hypot(dx, dy, dz);
    if (this.soundTimer <= 0 && dist < 28) { this.soundTimer = 8 + Math.random() * 14; this.sound(); }

    // Quemarse con el sol
    if (def.burns && !def.fireImmune) {
      const sky = w.getSky(Math.floor(this.x), Math.floor(this.y + this.h), Math.floor(this.z));
      const daylight = g.sky.atm.sunH > 0.12 && sky >= 14;
      if (daylight && !this.inWater) {
        this.burn = (this.burn || 0) + dt;
        if (this.burn >= 1) { this.burn = 0; this.hp -= 2; this.hurtTime = 0.3; g.particles.emit(this.x, this.y + this.h * 0.6, this.z, 0xff7a20, 5, 1.5); if (this.hp <= 0) this.die(null); }
      }
    }
    const target = g.mode !== 'creative' && !g.survival.dead;
    const canSee = target && dist3 < def.detect * (p.crouching ? 0.6 : 1) * (g.sky.atm.sunH < 0 ? 1.15 : 1);

    // ── Guardián: se queda cerca de su origen
    if (def.guard) {
      if (this.homeX === null) { this.homeX = this.x; this.homeZ = this.z; }
      const hd = Math.hypot(this.x - this.homeX, this.z - this.homeZ);
      if (hd > def.guard) { this.moveToward(this.homeX, this.homeZ, 0.8); return; }
      if (!canSee) { if (hd > 2.5) this.moveToward(this.homeX, this.homeZ, 0.5); return; }
    }

    // ── Devorador de arena: emboscada bajo la arena
    if (def.burrow) {
      if (this.burrowed) {
        this.wishX = this.wishZ = 0;
        if (canSee && dist < 4.5) { this._emerge(); }
        else if (canSee && dist < 24) { this.moveToward(p.x, p.z, 0.5); }
        return;
      }
      this.burrowTimer -= dt;
      if (!canSee && this.burrowTimer <= 0) { this.burrowed = true; this.obj.visible = false; this.game.particles.emit(this.x, this.y + 0.2, this.z, 0xc9b27a, 14, 3, 1); return; }
    }

    if (def.flying) return this._thinkBat(dt, canSee, dist, dx, dy, dz);

    if (canSee) {
      this.state = 'chase';
      if (def.ranged) return this._thinkRanged(dt, dist, dx, dz);
      // perseguir
      let wx = dx / (dist || 1), wz = dz / (dist || 1);
      // desbloqueo: si lleva atascado un rato, rodear
      const moved = Math.hypot(this.x - this.lastX, this.z - this.lastZ);
      if (moved < 0.02 * (dt * 60)) this.stuckTime += dt; else this.stuckTime = 0;
      this.lastX = this.x; this.lastZ = this.z;
      if (this.stuckTime > 1.0) { this.sidestep = 0.9; this.sideDir = Math.random() < 0.5 ? 1 : -1; this.stuckTime = 0; this.wantJump = true; }
      if (this.sidestep > 0) { this.sidestep -= dt; const t = wx; wx = -wz * this.sideDir; wz = t * this.sideDir; }
      if (dist > def.reach * 0.8) { const m = def.chase / def.speed; this.wishX = wx * m; this.wishZ = wz * m; }
      // atacar
      if (dist < def.reach && Math.abs(dy) < 1.8 && this.atkCd <= 0) {
        this.atkCd = def.cooldown;
        this.attackAnim = 0.35;
        const hurt = g.survival.damage(def.dmg, 'mob', this);
        if (hurt && def.ignite) g.survival.fire = Math.max(g.survival.fire, def.ignite);
        this.sound();
      }
    } else {
      // vagar
      this.stateTimer -= dt;
      if (this.state === 'wander') {
        const d = this.moveToward(this.targetX, this.targetZ, 0.6);
        if (d < 0.7 || this.stateTimer <= 0) { this.state = 'idle'; this.stateTimer = 2 + Math.random() * 4; }
      } else if (this.stateTimer <= 0) {
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7;
        this.targetX = this.x + Math.cos(a) * r; this.targetZ = this.z + Math.sin(a) * r;
        this.state = 'wander'; this.stateTimer = 4 + Math.random() * 4;
      }
    }
  }

  moveToward(tx, tz, mul = 1) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    this.wishX = (dx / d) * mul; this.wishZ = (dz / d) * mul;
    return d;
  }

  _thinkRanged(dt, dist, dx, dz) {
    const def = this.def, g = this.game, p = g.player;
    const ux = dx / (dist || 1), uz = dz / (dist || 1);
    // mantener distancia: acercarse si lejos, alejarse si cerca, y moverse en círculo
    if (dist > 13) { this.wishX = ux * 1.3; this.wishZ = uz * 1.3; }
    else if (dist < 6) { this.wishX = -ux * 1.2; this.wishZ = -uz * 1.2; }
    else { const s = Math.sin(this.age * 0.8) > 0 ? 1 : -1; this.wishX = -uz * s * 0.7; this.wishZ = ux * s * 0.7; }
    this.targetYaw = Math.atan2(-ux, -uz);
    if (this.atkCd <= 0 && dist < 22 && this._hasLineOfSight(p)) {
      this.atkCd = def.cooldown; this.attackAnim = 0.4;
      const sx = this.x, sy = this.y + 1.5, sz = this.z;
      const tx = p.x, ty = p.y + 1.1, tz = p.z;
      const dd = Math.hypot(tx - sx, ty - sy, tz - sz) || 1;
      const sp = 15;
      const lead = dd / sp;
      const vx = (tx + p.vx * lead * 0.5 - sx) / dd * sp, vy = (ty - sy) / dd * sp + dd * 0.12, vz = (tz + p.vz * lead * 0.5 - sz) / dd * sp;
      g.entities.add(new Projectile(g, sx, sy, sz, vx, vy, vz, def.dmg, this));
      g.audio && g.audio.play('shoot', this.x, this.y, this.z);
    }
  }

  _hasLineOfSight(p) {
    const w = this.world;
    const sx = this.x, sy = this.y + 1.5, sz = this.z;
    const tx = p.x, ty = p.y + 1.2, tz = p.z;
    const n = Math.ceil(Math.hypot(tx - sx, ty - sy, tz - sz) * 1.5);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (B_SOLID[w.getBlock(Math.floor(sx + (tx - sx) * t), Math.floor(sy + (ty - sy) * t), Math.floor(sz + (tz - sz) * t))]) return false;
    }
    return true;
  }

  _thinkBat(dt, canSee, dist, dx, dy, dz) {
    const def = this.def, g = this.game;
    this.flit -= dt;
    if (this.flit <= 0) { this.flit = 0.4 + Math.random() * 0.5; this.flitX = (Math.random() - 0.5) * 2; this.flitZ = (Math.random() - 0.5) * 2; this.flitVy = (Math.random() - 0.5) * 2.5; }
    if (canSee) {
      const d3 = Math.hypot(dx, dy, dz) || 1;
      this.wishX = (dx / d3) * 1.1 + this.flitX * 0.5; this.wishZ = (dz / d3) * 1.1 + this.flitZ * 0.5;
      this.flyTargetVy = clamp(dy * 1.5 + this.flitVy * 0.4, -3, 3);
      if (dist < def.reach && Math.abs(dy) < 1.4 && this.atkCd <= 0) {
        this.atkCd = def.cooldown; this.attackAnim = 0.3;
        g.survival.damage(def.dmg, 'mob', this);
        this.sound();
        this.flit = 0.8; this.flitX = -dx / (dist || 1); this.flitZ = -dz / (dist || 1);
      }
    } else {
      this.wishX = this.flitX * 0.6; this.wishZ = this.flitZ * 0.6; this.flyTargetVy = this.flitVy;
      // no chocar con el techo/suelo
    }
    // evitar quedarse pegado a las paredes
    if (this.hitX || this.hitZ) { this.flitX = -this.flitX; this.flitZ = -this.flitZ; }
  }

  animate(dt) {
    const p = this.model.parts, def = this.def, t = this.age * 1;
    const walk = Math.sin(this.walkPhase) * 0.9 * this.walkAmt;
    if (def.flying) {
      const f = Math.sin(t * 26) * 0.9;
      if (p.wingL) { p.wingL.rotation.z = f; p.wingR.rotation.z = -f; }
      return;
    }
    if (p.legL) { p.legL.rotation.x = walk; p.legR.rotation.x = -walk; }
    if (p.leg_fl) { p.leg_fl.rotation.x = walk; p.leg_br.rotation.x = walk; p.leg_fr.rotation.x = -walk; p.leg_bl.rotation.x = -walk; }
    if (p.armL) {
      const chasing = this.state === 'chase' && !def.ranged;
      const reach = chasing ? -1.4 : 0;
      const swing = this.attackAnim > 0 ? -Math.sin((1 - this.attackAnim / 0.35) * Math.PI) * 1.3 : 0;
      p.armL.rotation.x = reach + (chasing ? swing : -walk * 0.6);
      p.armR.rotation.x = reach + (chasing ? swing : walk * 0.6);
      if (def.ranged) { p.armR.rotation.x = -1.2 + (this.attackAnim > 0 ? 0.5 : 0); p.armL.rotation.x = -1.0; }
    }
    if (p.head && def.key === 'sand_devourer') { p.jawT.rotation.x = -0.3 - Math.abs(Math.sin(t * 5)) * 0.3; p.jawB.rotation.x = 0.3 + Math.abs(Math.sin(t * 5)) * 0.3; }
    if (p.seg1) { p.seg1.rotation.y = Math.sin(this.walkPhase * 0.7) * 0.3; p.seg2.rotation.y = Math.sin(this.walkPhase * 0.7 + 1) * 0.4; }
    void dt;
  }
}

export function createMonster(game, key) {
  const def = MONSTERS[key];
  return def ? new Monster(game, def) : null;
}
export { mobDamageScale, moveEntity };
