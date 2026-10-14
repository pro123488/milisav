// Animales originales: modelos de cajas, comportamientos (vagar, pastar, descansar, huir, seguir, criar, domesticar)
// y reglas propias por especie. Todos distintos entre sí.
import * as THREE from 'three';
import { Mob } from './entities.js';
import { Items } from './items.js';
import { ID, B_SOLID, B_FLUID } from './blocks.js';
import { B_TALLCOL, B_FAMILY, FAM } from './shapes.js';

const LEASH_PTS = 10;

const P = (name, size, center, color, o = {}) => ({ name, size, center, color, ...o });
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Definiciones. food: objetos que aceptan; drops: [{item,min,max,chance}] */
export const ANIMALS = {
  prairie_bovid: {
    key: 'prairie_bovid', name: 'Bóvido de pradera', category: 'doméstico', hp: 10, speed: 1.3, fleeMul: 2.3, w: 0.9, h: 1.4, jump: 8.4,
    food: ['wheat'], domestic: true, grazes: true, breeds: true, sound: 'moo', cap: 14,
    drops: [{ item: 'raw_beef', min: 1, max: 3 }, { item: 'leather', min: 0, max: 2 }],
    model: () => [
      P('body', [0.72, 0.62, 1.15], [0, 0.92, 0], '#7b5a3c', { color2: '#5a3f28' }),
      P('patch', [0.74, 0.3, 0.42], [0, 1.0, 0.12], '#e6d9c4'),
      P('head', [0.46, 0.46, 0.46], [0, 1.1, -0.8], '#6a4a30', { pivot: [0, 1.0, -0.58] }),
      P('muzzle', [0.32, 0.2, 0.16], [0, 0.98, -1.06], '#e2c9a6', { pivot: [0, 1.0, -0.58], parent: 'head' }),
      P('hornL', [0.07, 0.2, 0.07], [-0.24, 1.42, -0.74], '#efe7cf', { pivot: [0, 1.0, -0.58], parent: 'head' }),
      P('hornR', [0.07, 0.2, 0.07], [0.24, 1.42, -0.74], '#efe7cf', { pivot: [0, 1.0, -0.58], parent: 'head' }),
      P('leg_fl', [0.2, 0.62, 0.2], [-0.24, 0.31, -0.42], '#5a3f28', { pivot: [-0.24, 0.62, -0.42] }),
      P('leg_fr', [0.2, 0.62, 0.2], [0.24, 0.31, -0.42], '#5a3f28', { pivot: [0.24, 0.62, -0.42] }),
      P('leg_bl', [0.2, 0.62, 0.2], [-0.24, 0.31, 0.42], '#5a3f28', { pivot: [-0.24, 0.62, 0.42] }),
      P('leg_br', [0.2, 0.62, 0.2], [0.24, 0.31, 0.42], '#5a3f28', { pivot: [0.24, 0.62, 0.42] }),
      P('tail', [0.08, 0.5, 0.08], [0, 0.98, 0.64], '#5a3f28', { pivot: [0, 1.2, 0.62] }),
    ],
  },
  forest_boar: {
    key: 'forest_boar', name: 'Cerdo de bosque', category: 'doméstico', hp: 10, speed: 1.4, fleeMul: 2.2, w: 0.85, h: 0.95, jump: 8.0,
    food: ['potato', 'carrot', 'berries'], domestic: true, grazes: true, breeds: true, sound: 'oink', cap: 12,
    drops: [{ item: 'raw_pork', min: 1, max: 3 }],
    model: () => [
      P('body', [0.62, 0.52, 0.95], [0, 0.55, 0], '#6b4a3a', { color2: '#4a3226' }),
      P('mane', [0.16, 0.12, 0.7], [0, 0.86, 0.05], '#33241c'),
      P('head', [0.46, 0.42, 0.42], [0, 0.62, -0.62], '#765240', { pivot: [0, 0.6, -0.45] }),
      P('snout', [0.28, 0.2, 0.2], [0, 0.54, -0.92], '#c98a80', { pivot: [0, 0.6, -0.45], parent: 'head' }),
      P('tuskL', [0.05, 0.12, 0.05], [-0.14, 0.52, -0.9], '#f1ead6', { pivot: [0, 0.6, -0.45], parent: 'head' }),
      P('tuskR', [0.05, 0.12, 0.05], [0.14, 0.52, -0.9], '#f1ead6', { pivot: [0, 0.6, -0.45], parent: 'head' }),
      P('leg_fl', [0.17, 0.36, 0.17], [-0.2, 0.18, -0.3], '#4a3226', { pivot: [-0.2, 0.36, -0.3] }),
      P('leg_fr', [0.17, 0.36, 0.17], [0.2, 0.18, -0.3], '#4a3226', { pivot: [0.2, 0.36, -0.3] }),
      P('leg_bl', [0.17, 0.36, 0.17], [-0.2, 0.18, 0.3], '#4a3226', { pivot: [-0.2, 0.36, 0.3] }),
      P('leg_br', [0.17, 0.36, 0.17], [0.2, 0.18, 0.3], '#4a3226', { pivot: [0.2, 0.36, 0.3] }),
    ],
  },
  mountain_bird: {
    key: 'mountain_bird', name: 'Ave de montaña', category: 'volador', hp: 4, speed: 2.4, fleeMul: 1.6, w: 0.45, h: 0.55, flying: true, canJump: false,
    food: ['seed_wheat'], domestic: false, breeds: true, sound: 'chirp', cap: 10, skittish: 6,
    drops: [{ item: 'feather', min: 1, max: 2 }, { item: 'raw_bird', min: 1, max: 1 }],
    model: () => [
      P('body', [0.3, 0.28, 0.5], [0, 0.32, 0], '#5f7898'),
      P('breast', [0.26, 0.2, 0.3], [0, 0.26, -0.06], '#e8eef4'),
      P('head', [0.22, 0.22, 0.22], [0, 0.5, -0.3], '#4c6684', { pivot: [0, 0.42, -0.22] }),
      P('beak', [0.1, 0.06, 0.12], [0, 0.48, -0.46], '#f0a030', { pivot: [0, 0.42, -0.22], parent: 'head' }),
      P('wingL', [0.5, 0.04, 0.3], [-0.4, 0.38, 0.02], '#3f5878', { pivot: [-0.15, 0.38, 0.02] }),
      P('wingR', [0.5, 0.04, 0.3], [0.4, 0.38, 0.02], '#3f5878', { pivot: [0.15, 0.38, 0.02] }),
      P('tail', [0.2, 0.04, 0.3], [0, 0.34, 0.38], '#3f5878', { pivot: [0, 0.34, 0.25] }),
    ],
  },
  crystal_fox: {
    key: 'crystal_fox', name: 'Zorro de cristal', category: 'raro', hp: 8, speed: 2.0, fleeMul: 2.6, w: 0.55, h: 0.7, jump: 8.6,
    food: ['raw_fish', 'cooked_fish'], domestic: false, breeds: false, tameTrust: 3, skittish: 9, sound: 'yip', cap: 4,
    drops: [{ item: 'crystal_shard', min: 0, max: 1 }, { item: 'leather', min: 0, max: 1 }],
    model: () => [
      P('body', [0.34, 0.34, 0.78], [0, 0.46, 0], '#e8f2f8', { color2: '#b8c8d4' }),
      P('spike1', [0.1, 0.18, 0.1], [0, 0.72, -0.15], '#58d6e8', { emissive: true }),
      P('spike2', [0.1, 0.22, 0.1], [0, 0.74, 0.05], '#7ae6f4', { emissive: true }),
      P('spike3', [0.08, 0.16, 0.08], [0, 0.7, 0.25], '#58d6e8', { emissive: true }),
      P('head', [0.3, 0.28, 0.34], [0, 0.6, -0.5], '#f4fafc', { pivot: [0, 0.55, -0.38] }),
      P('snout', [0.14, 0.12, 0.16], [0, 0.55, -0.7], '#2c3a44', { pivot: [0, 0.55, -0.38], parent: 'head' }),
      P('earL', [0.09, 0.16, 0.06], [-0.1, 0.8, -0.46], '#58d6e8', { pivot: [0, 0.55, -0.38], parent: 'head' }),
      P('earR', [0.09, 0.16, 0.06], [0.1, 0.8, -0.46], '#58d6e8', { pivot: [0, 0.55, -0.38], parent: 'head' }),
      P('leg_fl', [0.1, 0.3, 0.1], [-0.12, 0.15, -0.28], '#c4d4de', { pivot: [-0.12, 0.3, -0.28] }),
      P('leg_fr', [0.1, 0.3, 0.1], [0.12, 0.15, -0.28], '#c4d4de', { pivot: [0.12, 0.3, -0.28] }),
      P('leg_bl', [0.1, 0.3, 0.1], [-0.12, 0.15, 0.28], '#c4d4de', { pivot: [-0.12, 0.3, 0.28] }),
      P('leg_br', [0.1, 0.3, 0.1], [0.12, 0.15, 0.28], '#c4d4de', { pivot: [0.12, 0.3, 0.28] }),
      P('tail', [0.24, 0.24, 0.6], [0, 0.5, 0.62], '#f4fafc', { pivot: [0, 0.5, 0.4] }),
      P('tailTip', [0.26, 0.26, 0.2], [0, 0.5, 0.98], '#58d6e8', { pivot: [0, 0.5, 0.4], parent: 'tail', emissive: true }),
    ],
  },
  river_turtle: {
    key: 'river_turtle', name: 'Tortuga de río', category: 'salvaje', hp: 12, speed: 0.7, fleeMul: 1.5, w: 0.8, h: 0.5, jump: 5,
    food: [], domestic: false, breeds: false, sound: null, cap: 6, avoidWater: false,
    drops: [{ item: 'scute', min: 0, max: 2 }],
    model: () => [
      P('shell', [0.7, 0.26, 0.82], [0, 0.3, 0], '#5e7a3e', { color2: '#3e5428' }),
      P('plate', [0.5, 0.1, 0.6], [0, 0.46, 0], '#86a85a'),
      P('belly', [0.62, 0.1, 0.74], [0, 0.17, 0], '#d8cc9a'),
      P('head', [0.2, 0.18, 0.24], [0, 0.26, -0.5], '#7c9a50', { pivot: [0, 0.26, -0.4] }),
      P('leg_fl', [0.16, 0.12, 0.2], [-0.34, 0.1, -0.28], '#6c8a46', { pivot: [-0.34, 0.16, -0.28] }),
      P('leg_fr', [0.16, 0.12, 0.2], [0.34, 0.1, -0.28], '#6c8a46', { pivot: [0.34, 0.16, -0.28] }),
      P('leg_bl', [0.16, 0.12, 0.2], [-0.34, 0.1, 0.28], '#6c8a46', { pivot: [-0.34, 0.16, 0.28] }),
      P('leg_br', [0.16, 0.12, 0.2], [0.34, 0.1, 0.28], '#6c8a46', { pivot: [0.34, 0.16, 0.28] }),
    ],
  },
  glow_fish: {
    key: 'glow_fish', name: 'Pez luminoso', category: 'acuático', hp: 3, speed: 1.5, fleeMul: 2.0, w: 0.4, h: 0.3, swimmer: true, canJump: false,
    food: [], domestic: false, breeds: false, sound: null, cap: 16, skittish: 4,
    drops: [{ item: 'raw_fish', min: 1, max: 1 }],
    model: () => [
      P('body', [0.14, 0.22, 0.42], [0, 0.16, 0], '#58d6e8', { emissive: true }),
      P('stripe', [0.16, 0.05, 0.3], [0, 0.22, 0], '#c4f7ff', { emissive: true }),
      P('tail', [0.04, 0.2, 0.18], [0, 0.16, 0.3], '#2a8aa6', { pivot: [0, 0.16, 0.2], emissive: true }),
      P('finT', [0.04, 0.1, 0.16], [0, 0.3, 0], '#2a8aa6', { emissive: true }),
      P('eyeL', [0.02, 0.04, 0.04], [-0.08, 0.2, -0.16], '#10202a'),
      P('eyeR', [0.02, 0.04, 0.04], [0.08, 0.2, -0.16], '#10202a'),
    ],
  },
  mist_deer: {
    key: 'mist_deer', name: 'Ciervo de niebla', category: 'salvaje', hp: 12, speed: 1.7, fleeMul: 2.9, w: 0.75, h: 1.65, jump: 9.0,
    food: [], domestic: false, breeds: false, sound: null, cap: 8, skittish: 12, grazes: true,
    drops: [{ item: 'raw_venison', min: 1, max: 3 }, { item: 'leather', min: 0, max: 1 }],
    model: () => [
      P('body', [0.46, 0.5, 0.98], [0, 1.0, 0], '#9aa5ad', { color2: '#cfd6da' }),
      P('neck', [0.2, 0.55, 0.22], [0, 1.4, -0.46], '#8c989f', { pivot: [0, 1.15, -0.4] }),
      P('head', [0.28, 0.26, 0.4], [0, 1.72, -0.58], '#a8b2ba', { pivot: [0, 1.6, -0.46], parent: 'neck' }),
      P('nose', [0.12, 0.1, 0.1], [0, 1.68, -0.82], '#2c3a44', { pivot: [0, 1.6, -0.46], parent: 'neck' }),
      P('antlerL', [0.05, 0.4, 0.05], [-0.16, 2.0, -0.5], '#d8e0e4', { pivot: [0, 1.6, -0.46], parent: 'neck' }),
      P('antlerR', [0.05, 0.4, 0.05], [0.16, 2.0, -0.5], '#d8e0e4', { pivot: [0, 1.6, -0.46], parent: 'neck' }),
      P('antlerL2', [0.04, 0.2, 0.2], [-0.18, 2.1, -0.4], '#d8e0e4', { pivot: [0, 1.6, -0.46], parent: 'neck' }),
      P('antlerR2', [0.04, 0.2, 0.2], [0.18, 2.1, -0.4], '#d8e0e4', { pivot: [0, 1.6, -0.46], parent: 'neck' }),
      P('leg_fl', [0.12, 0.78, 0.12], [-0.16, 0.39, -0.36], '#7d8991', { pivot: [-0.16, 0.78, -0.36] }),
      P('leg_fr', [0.12, 0.78, 0.12], [0.16, 0.39, -0.36], '#7d8991', { pivot: [0.16, 0.78, -0.36] }),
      P('leg_bl', [0.12, 0.78, 0.12], [-0.16, 0.39, 0.36], '#7d8991', { pivot: [-0.16, 0.78, 0.36] }),
      P('leg_br', [0.12, 0.78, 0.12], [0.16, 0.39, 0.36], '#7d8991', { pivot: [0.16, 0.78, 0.36] }),
      P('tail', [0.12, 0.16, 0.12], [0, 1.12, 0.52], '#f0f4f6', { pivot: [0, 1.12, 0.5] }),
    ],
  },
};

const pickDrops = (def) => {
  const out = [];
  for (const d of def.drops) {
    if ((d.chance ?? 1) < 1 && Math.random() >= d.chance) continue;
    const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
    if (n > 0) out.push({ item: d.item, n });
  }
  return out;
};

export class Animal extends Mob {
  constructor(game, def) {
    super(game, def);
    this.state = 'idle'; this.stateTimer = Math.random() * 3;
    this.panic = 0; this.fearX = 0; this.fearZ = 0;
    this.loveTimer = 0; this.breedCd = 0; this.growAge = 0;
    this.tamed = false; this.trust = 0;
    this.targetX = 0; this.targetZ = 0;
    this.restLevel = 0;
    this.bobSeed = Math.random() * 100;
    this.persistentFlag = false; // criado/alimentado/domesticado/atado → no desaparece
    this.altitude = 3 + Math.random() * 4;
    this.soundTimer = 6 + Math.random() * 20;
    this.leash = null;           // 'player' | {x,y,z} (valla) | null
    this.leashable = !def.flying && !def.swimmer;
    this.leashLine = null;
  }

  // ── Cuerda ──────────────────────────────────────────────────
  /** Ata el animal al jugador ('player') o a la valla {x,y,z}. */
  attachLeash(target) {
    if (!this.leashable) return false;
    this.leash = target; this.persistentFlag = true;
    if (target !== 'player') this.game.achieve && this.game.achieve('pastor');
    if (!this.leashLine) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LEASH_PTS * 3), 3));
      this.leashLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x9a7444 }));
      this.leashLine.frustumCulled = false;
      this.game.scene.add(this.leashLine);
    }
    return true;
  }
  /** Suelta la cuerda; si `giveRope`, la cuerda vuelve (al inventario o al suelo). */
  detachLeash(giveRope) {
    if (!this.leash) return;
    const wasPlayer = this.leash === 'player';
    this.leash = null;
    if (this.leashLine) { this.game.scene.remove(this.leashLine); this.leashLine.geometry.dispose(); this.leashLine.material.dispose(); this.leashLine = null; }
    if (giveRope && this.game.mode !== 'creative') {
      const st = { i: Items.id('rope'), n: 1, d: 0 };
      if (wasPlayer) { const rest = this.game.inventory.add(st); if (rest) this.game.dropItem(rest, this.x, this.y + 0.5, this.z); }
      else this.game.dropItem(st, this.x, this.y + 0.5, this.z);
    }
  }
  _leashAnchor() {
    if (this.leash === 'player') { const p = this.game.player; return { x: p.x, y: p.y + 1.1, z: p.z }; }
    return { x: this.leash.x + 0.5, y: this.leash.y + 0.75, z: this.leash.z + 0.5 };
  }
  /** La cuerda tira del animal. Devuelve true si este fotograma manda la cuerda (no hace nada más). */
  _thinkLeash() {
    if (!this.leash) return false;
    if (this.leash !== 'player') {
      const k = this.leash;
      if (B_FAMILY[this.world.getBlock(k.x, k.y, k.z)] !== FAM.FENCE) { this.detachLeash(false); this.game.dropItem({ i: Items.id('rope'), n: 1, d: 0 }, k.x + 0.5, k.y + 0.8, k.z + 0.5); return false; }
    } else if (this.game.survival && this.game.survival.dead) { this.detachLeash(false); return false; }
    const a = this._leashAnchor();
    const d = Math.hypot(a.x - this.x, a.z - this.z);
    if (d > 14) { // se rompe
      if (this.leash === 'player') this.detachLeash(true);
      else { const k = this.leash; this.detachLeash(false); this.game.dropItem({ i: Items.id('rope'), n: 1, d: 0 }, k.x + 0.5, k.y + 0.8, k.z + 0.5); }
      return false;
    }
    const slack = this.leash === 'player' ? 3.5 : 2.5;
    if (d > slack) {
      this.moveToward(a.x, a.z, d > 7 ? 2.2 : 1.4);
      if (d > 7) { const dx = (a.x - this.x) / d, dz = (a.z - this.z) / d; this.vx += dx * 0.6; this.vz += dz * 0.6; } // tirón
      if (this.blocked > 0.6 && this.onGround) this.vy = Math.max(this.vy, this.def.jump ?? 8.2); // intenta saltar el obstáculo
      return true;
    }
    return false;
  }
  _updateLeashLine() {
    if (!this.leashLine) return;
    if (!this.leash) return;
    const a = this._leashAnchor();
    const sx = this.x, sy = this.y + this.h * 0.75, sz = this.z;
    const d = Math.hypot(a.x - sx, a.y - sy, a.z - sz);
    const sag = Math.max(0, 1.2 - d * 0.12);
    const arr = this.leashLine.geometry.attributes.position.array;
    for (let i = 0; i < LEASH_PTS; i++) {
      const t = i / (LEASH_PTS - 1);
      arr[i * 3] = sx + (a.x - sx) * t; arr[i * 3 + 1] = sy + (a.y - sy) * t - sag * 4 * t * (1 - t); arr[i * 3 + 2] = sz + (a.z - sz) * t;
    }
    this.leashLine.geometry.attributes.position.needsUpdate = true;
    const l = this.game.lightAt(this.x, this.y + 1, this.z);
    this.leashLine.material.color.setRGB(0.6 * l, 0.45 * l, 0.27 * l);
  }
  update(dt) { super.update(dt); this._updateLeashLine(); }
  dispose() {
    if (this.leashLine) { this.game.scene.remove(this.leashLine); this.leashLine.geometry.dispose(); this.leashLine.material.dispose(); this.leashLine = null; }
    super.dispose();
  }

  get persistent() { return this.persistentFlag || this.tamed || this.baby; }

  onHurt(amount, source) {
    this.panic = 4;
    const p = this.game.player;
    this.fearX = source && source.x !== undefined ? source.x : p.x; this.fearZ = source && source.z !== undefined ? source.z : p.z;
    if (this.def.sound) this.game.audio && this.game.audio.play(this.def.sound, this.x, this.y, this.z);
  }

  onDeath() {
    const g = this.game;
    for (const d of pickDrops(this.def)) {
      if (this.baby) continue;
      g.dropItem({ i: Items.id(d.item), n: d.n, d: 0 }, this.x, this.y + 0.4, this.z);
    }
    g.particles.emit(this.x, this.y + 0.5, this.z, 0xdddddd, 8, 3);
  }

  /** Intenta alimentar con la pila `stack`. Devuelve true si la aceptó (hay que consumir 1). */
  feed(stack) {
    const it = Items.get(stack.i);
    if (!it || !this.def.food.includes(it.key) || this.deathTime >= 0) return false;
    const g = this.game;
    if (this.baby) { this.growAge += 60; this.persistentFlag = true; g.particles.emit(this.x, this.y + 1, this.z, 0x66dd66, 5, 1.5); return true; }
    if (this.def.tameTrust) {
      this.trust++; this.persistentFlag = true;
      g.particles.emit(this.x, this.y + 0.9, this.z, 0xff7799, 4, 1.2);
      if (this.trust >= this.def.tameTrust && !this.tamed) { this.tamed = true; g.ui.toast(`${this.def.name} domesticado`); g.particles.emit(this.x, this.y + 1, this.z, 0xff4477, 12, 2); }
      return true;
    }
    if (this.def.breeds && this.breedCd <= 0 && this.loveTimer <= 0) {
      const near = g.entities.count((e) => e.type === this.type && !e.removed && Math.hypot(e.x - this.x, e.z - this.z) < 24);
      if (near >= (this.def.cap || 12) * 1.5) { g.ui.toast('Demasiados animales cerca para criar'); return false; }
      this.loveTimer = 20; this.persistentFlag = true;
      g.particles.emit(this.x, this.y + 1, this.z, 0xff5588, 8, 1.6);
      return true;
    }
    return false;
  }

  _safeAt(x, z) {
    const w = this.world;
    const fx = Math.floor(x), fz = Math.floor(z);
    if (!w.isLoaded(fx, fz)) return false;
    const y0 = Math.floor(this.y + 0.1);
    if (B_TALLCOL[w.getBlock(fx, y0, fz)] || B_TALLCOL[w.getBlock(fx, y0 - 1, fz)]) return false; // vallas y muros: no se cruzan
    for (let d = 0; d <= 3; d++) {
      const id = w.getBlock(fx, y0 - d, fz);
      if (B_FLUID[id]) return !!this.def.swimmer || this.def.avoidWater === false;
      if (B_SOLID[id]) return d <= 2;
    }
    return false;
  }

  moveToward(tx, tz, mul = 1) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    this.wishX = (dx / d) * mul; this.wishZ = (dz / d) * mul;
    return d;
  }

  think(dt) {
    const g = this.game, p = g.player, def = this.def;
    this.stateTimer -= dt; this.panic -= dt; this.loveTimer -= dt; this.breedCd -= dt;
    this.soundTimer -= dt;
    if (this.soundTimer <= 0 && def.sound) { this.soundTimer = 10 + Math.random() * 25; g.audio && g.audio.play(def.sound, this.x, this.y, this.z); }
    if (this.baby) { this.growAge += dt; if (this.growAge >= 300) this.setBaby(false); }
    if (def.flying) return this._thinkFlying(dt);
    if (def.swimmer) return this._thinkSwimmer(dt);
    if (this.panic <= 0 && this._thinkLeash()) return;

    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz);
    // Pánico
    if (this.panic > 0) {
      const ax = this.x - this.fearX, az = this.z - this.fearZ, ad = Math.hypot(ax, az) || 1;
      let wx = ax / ad, wz = az / ad;
      // si el camino no es seguro, rodear
      if (!this._safeAt(this.x + wx * 1.2, this.z + wz * 1.2)) { const t = wx; wx = -wz; wz = t; }
      this.wishX = wx * def.fleeMul; this.wishZ = wz * def.fleeMul;
      return;
    }
    // Esquivos
    if (def.skittish && !this.tamed) {
      const range = def.skittish * (p.crouching ? 0.4 : 1);
      if (dist < range && g.mode !== 'creative') {
        const held = g.inventory.selectedItem();
        const tempting = held && def.food.includes(held.key) && dist < range * 0.8 && def.tameTrust;
        if (!tempting) { this.panic = 2.5; this.fearX = p.x; this.fearZ = p.z; return; }
        // se acerca con cautela a quien lleva su comida
        if (dist > 2.5) { this.moveToward(p.x, p.z, 0.8); return; }
        return;
      }
    }
    // Atraídos por comida o seguidores
    const held = g.inventory.selectedItem();
    const wantsFood = held && def.food.includes(held.key) && (def.domestic || this.tamed);
    if (wantsFood && dist < 12 && dist > 2.0) { this.moveToward(p.x, p.z, 1); this.state = 'follow'; return; }
    if (this.tamed && dist > 4 && dist < 48) { this.moveToward(p.x, p.z, dist > 10 ? 1.6 : 1); return; }
    if (this.tamed && dist >= 48) { this.setPos(p.x + 2, p.y + 1, p.z + 2); return; }

    // Reproducción
    if (this.loveTimer > 0 && !this.baby) {
      let mate = null, best = 14;
      for (const e of g.entities.list) {
        if (e === this || e.type !== this.type || e.removed || e.baby || !(e.loveTimer > 0)) continue;
        const d = Math.hypot(e.x - this.x, e.z - this.z);
        if (d < best) { best = d; mate = e; }
      }
      if (mate) {
        const d = this.moveToward(mate.x, mate.z, 1);
        if (d < 1.5 && this.breedCd <= 0 && mate.breedCd <= 0) this._breed(mate);
        return;
      }
    }

    // Estados de reposo
    switch (this.state) {
      case 'wander': {
        const d = this.moveToward(this.targetX, this.targetZ, 1);
        if (d < 0.7 || this.stateTimer <= 0) { this.state = 'idle'; this.stateTimer = 1.5 + Math.random() * 4; }
        else if (!this._safeAt(this.x + this.wishX * 0.9, this.z + this.wishZ * 0.9)) { this.wishX = this.wishZ = 0; this.state = 'idle'; this.stateTimer = 1; }
        break;
      }
      case 'graze':
        if (this.stateTimer <= 0) { this.state = 'idle'; this.stateTimer = 1 + Math.random() * 3; }
        break;
      case 'rest':
        if (this.stateTimer <= 0) { this.state = 'idle'; this.stateTimer = 2 + Math.random() * 3; }
        break;
      default: { // idle
        if (this.stateTimer <= 0) {
          const r = Math.random();
          const night = g.sky.atm.sunH < 0;
          if (r < 0.15 + (night ? 0.2 : 0) && def.category !== 'raro') { this.state = 'rest'; this.stateTimer = 6 + Math.random() * 10; }
          else if (r < 0.4 && def.grazes && this._onGrass()) { this.state = 'graze'; this.stateTimer = 3 + Math.random() * 3; }
          else {
            const a = Math.random() * Math.PI * 2, rr = 3 + Math.random() * 6;
            this.targetX = this.x + Math.cos(a) * rr; this.targetZ = this.z + Math.sin(a) * rr;
            this.state = 'wander'; this.stateTimer = 4 + Math.random() * 5;
          }
        }
      }
    }
  }

  _onGrass() {
    const id = this.world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
    return id === ID.GRASS || id === ID.GRASS_LUSH || id === ID.GRASS_DRY || id === ID.GRASS_SNOW;
  }

  _breed(mate) {
    const g = this.game;
    this.loveTimer = 0; mate.loveTimer = 0; this.breedCd = 120; mate.breedCd = 120;
    const baby = g.spawnMob(this.type, (this.x + mate.x) / 2, this.y, (this.z + mate.z) / 2);
    if (baby) { baby.setBaby(true); baby.persistentFlag = true; }
    g.particles.emit((this.x + mate.x) / 2, this.y + 1, (this.z + mate.z) / 2, 0xff5588, 14, 2);
  }

  _thinkFlying(dt) {
    const w = this.world, p = this.game.player, def = this.def;
    const gy = w.surfaceY(Math.floor(this.x), Math.floor(this.z));
    const ground = gy < 0 ? this.y : gy + 1;
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    if (this.panic > 0) {
      const ax = this.x - this.fearX, az = this.z - this.fearZ, ad = Math.hypot(ax, az) || 1;
      this.wishX = (ax / ad) * def.fleeMul; this.wishZ = (az / ad) * def.fleeMul;
      this.flyTargetVy = clamp((ground + 6 - this.y) * 1.5, -3, 4);
      return;
    }
    if (def.skittish && dist < def.skittish * (p.crouching ? 0.4 : 1) && this.state !== 'perch') { this.panic = 2; this.fearX = p.x; this.fearZ = p.z; return; }
    if (this.state === 'perch') {
      this.flyTargetVy = clamp((ground - this.y) * 2, -3, 3);
      if (this.stateTimer <= 0) { this.state = 'fly'; this.stateTimer = 8 + Math.random() * 14; this.altitude = 3 + Math.random() * 5; }
      return;
    }
    // vuelo errático
    if (this.stateTimer <= 0 || !this._tx) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 10;
      this._tx = this.x + Math.cos(a) * r; this._tz = this.z + Math.sin(a) * r;
      this.stateTimer = 2 + Math.random() * 4;
      if (Math.random() < 0.18) { this.state = 'perch'; this.stateTimer = 5 + Math.random() * 8; }
    }
    this.moveToward(this._tx, this._tz, 0.8);
    this.flyTargetVy = clamp((ground + this.altitude + Math.sin(this.age * 1.3 + this.bobSeed) * 1.2 - this.y) * 1.2, -2.5, 2.5);
    void dt;
  }

  _thinkSwimmer(dt) {
    const w = this.world, p = this.game.player;
    const inW = w.fluidAt(Math.floor(this.x), Math.floor(this.y + 0.15), Math.floor(this.z)) === 1;
    if (!inW) { this.hp -= dt * 0.4; if (this.hp <= 0) this.die(null); if (this.onGround && Math.random() < 0.05) this.vy = 5; return; }
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    if (this.panic > 0 || (dist < 4 && !p.crouching)) {
      const ax = this.x - p.x, az = this.z - p.z, ad = Math.hypot(ax, az) || 1;
      this.wishX = (ax / ad) * this.def.fleeMul; this.wishZ = (az / ad) * this.def.fleeMul;
    } else {
      if (this.stateTimer <= 0 || !this._tx) {
        const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5;
        this._tx = this.x + Math.cos(a) * r; this._tz = this.z + Math.sin(a) * r; this._ty = this.y + (Math.random() - 0.5) * 3;
        this.stateTimer = 2 + Math.random() * 3;
      }
      this.moveToward(this._tx, this._tz, 0.8);
    }
    // seguir dentro del agua
    const ahead = w.fluidAt(Math.floor(this.x + this.wishX * 0.6), Math.floor(this.y + 0.15), Math.floor(this.z + this.wishZ * 0.6));
    if (ahead !== 1) { this.wishX = -this.wishX; this.wishZ = -this.wishZ; this._tx = null; this.stateTimer = 0; }
    const above = w.fluidAt(Math.floor(this.x), Math.floor(this.y + 0.7), Math.floor(this.z));
    const ty = this._ty ?? this.y;
    this.swimVy = clamp((ty - this.y) * 1.2, -1.2, 1.2);
    if (above !== 1 && this.swimVy > 0) this.swimVy = -0.3;
  }

  animate(dt) {
    const p = this.model.parts, t = this.age + this.bobSeed;
    const def = this.def;
    const walk = Math.sin(this.walkPhase) * 0.8 * this.walkAmt;
    this.obj.scale.y = (def.scale ?? 1) * this.scale;
    const resting = this.state === 'rest' && this.panic <= 0;
    this.restLevel += ((resting ? 1 : 0) - this.restLevel) * Math.min(1, dt * 4);
    if (def.flying) {
      const flapping = this.state !== 'perch' || this.panic > 0;
      const f = flapping ? Math.sin(t * 22) * 0.9 : 0.3;
      if (p.wingL) { p.wingL.rotation.z = f; p.wingR.rotation.z = -f; }
      if (p.tail) p.tail.rotation.x = Math.sin(t * 3) * 0.1;
      return;
    }
    if (def.swimmer) {
      if (p.tail) p.tail.rotation.y = Math.sin(t * 9) * 0.6;
      this.obj.rotation.z = Math.sin(t * 2) * 0.05;
      return;
    }
    if (p.leg_fl) {
      const fold = this.restLevel * 1.35;
      p.leg_fl.rotation.x = walk * (1 - this.restLevel) - fold; p.leg_br.rotation.x = walk * (1 - this.restLevel) + fold;
      p.leg_fr.rotation.x = -walk * (1 - this.restLevel) - fold; p.leg_bl.rotation.x = -walk * (1 - this.restLevel) + fold;
    }
    if (p.head) {
      const graze = this.state === 'graze' ? 0.9 + Math.sin(t * 5) * 0.12 : 0;
      p.head.rotation.x += ((graze - p.head.rotation.x)) * Math.min(1, dt * 6);
    }
    if (p.neck) {
      const graze = this.state === 'graze' ? 1.0 : 0;
      p.neck.rotation.x += ((graze - p.neck.rotation.x)) * Math.min(1, dt * 6);
    }
    if (p.tail) p.tail.rotation.x = Math.sin(t * 2.4) * 0.25;
    if (p.tailTip) p.tailTip.rotation.y = Math.sin(t * 4) * 0.3;
    // descansar: agacharse
    this.obj.position.y = this.y - this.restLevel * 0.16 * (def.h);
  }

  serialize() {
    const o = super.serialize();
    o.love = this.breedCd; o.pf = this.persistentFlag;
    if (this.leash) o.leash = this.leash === 'player' ? 'p' : [this.leash.x, this.leash.y, this.leash.z];
    return o;
  }
}

export function createAnimal(game, key) {
  const def = ANIMALS[key];
  if (!def) return null;
  return new Animal(game, def);
}
