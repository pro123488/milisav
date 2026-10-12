// Entidades: base, objetos soltados, bloques que caen, partículas, criaturas (Mob) y el gestor.
import * as THREE from 'three';
import { moveEntity } from './physics.js';
import { Items, cloneStack } from './items.js';
import { getItemIcon } from './atlas.js';
import { Blocks, B_FLUID, B_SOLID } from './blocks.js';
import { addToSlots } from './inventory.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const angleDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// ── Modelos de criaturas hechos de cajas ─────────────────────────
let noiseTex = null;
function creatureTexture() {
  if (noiseTex) return noiseTex;
  const c = document.createElement('canvas'); c.width = c.height = 8;
  const g = c.getContext('2d');
  let s = 4242; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = 215 + Math.floor(r() * 40); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 1, 1); }
  noiseTex = new THREE.CanvasTexture(c);
  noiseTex.magFilter = THREE.NearestFilter; noiseTex.minFilter = THREE.NearestFilter; noiseTex.colorSpace = THREE.NoColorSpace;
  return noiseTex;
}
const FACE_TINT = [0.82, 0.82, 1.0, 0.55, 0.7, 0.7]; // +x -x +y -y +z -z

function boxGeometry(sx, sy, sz, color, color2) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const pos = g.attributes.position.count;
  const cols = new Float32Array(pos * 3);
  const c1 = new THREE.Color(color), c2 = new THREE.Color(color2 ?? color);
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    const c = (f === 3 ? c2 : c1);
    const t = FACE_TINT[f];
    cols[i * 3] = c.r * t; cols[i * 3 + 1] = c.g * t; cols[i * 3 + 2] = c.b * t;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

/**
 * Construye un modelo jerárquico. parts: [{name,size,center,pivot?,color,color2?,parent?, emissive?}]
 * Todas las coordenadas están en bloques, relativas a los pies del modelo (centro del suelo).
 */
export function buildModel(parts, opts = {}) {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: creatureTexture(), vertexColors: true });
  const emissiveMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const map = {};
  const meshes = [];
  for (const p of parts) {
    const pivot = p.pivot || p.center;
    const g = new THREE.Group();
    const parent = p.parent ? map[p.parent] : null;
    const parentPivot = p.parent ? parts.find((q) => q.name === p.parent).pivot || parts.find((q) => q.name === p.parent).center : [0, 0, 0];
    g.position.set(pivot[0] - parentPivot[0], pivot[1] - parentPivot[1], pivot[2] - parentPivot[2]);
    const mesh = new THREE.Mesh(boxGeometry(p.size[0], p.size[1], p.size[2], p.color, p.color2), p.emissive ? emissiveMat : mat);
    mesh.position.set(p.center[0] - pivot[0], p.center[1] - pivot[1], p.center[2] - pivot[2]);
    g.add(mesh);
    (parent || root).add(g);
    map[p.name] = g;
    meshes.push(mesh);
  }
  const scale = opts.scale ?? 1;
  root.scale.setScalar(scale);
  return { root, parts: map, mat, emissiveMat, meshes };
}

// ── Entidad base ─────────────────────────────────────────────────
let nextId = 1;
export class Entity {
  constructor(game, type) {
    this.game = game; this.world = game.world; this.type = type; this.id = nextId++;
    this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0;
    this.w = 0.6; this.h = 1.0; this.yaw = 0;
    this.onGround = false; this.removed = false; this.age = 0;
    this.obj = null;
  }
  setPos(x, y, z) { this.x = x; this.y = y; this.z = z; this._sync(); }
  _sync() { if (this.obj) { this.obj.position.set(this.x, this.y, this.z); } }
  update() {}
  remove() { this.removed = true; }
  dispose() { if (this.obj) { this.game.scene.remove(this.obj); this.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose && o.userData.ownMat) o.material.dispose(); }); this.obj = null; } }
  get persistent() { return false; }
  serialize() { return { t: this.type, x: this.x, y: this.y, z: this.z }; }
  aabb() { const hw = this.w / 2; return [[this.x - hw, this.y, this.z - hw], [this.x + hw, this.y + this.h, this.z + hw]]; }
  distTo(px, py, pz) { return Math.hypot(this.x - px, this.y + this.h / 2 - py, this.z - pz); }
}

// ── Objeto soltado en el suelo ───────────────────────────────────
const iconTextures = new Map();
function iconTexture(item) {
  if (iconTextures.has(item.id)) return iconTextures.get(item.id);
  const t = new THREE.CanvasTexture(getItemIcon(item));
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  iconTextures.set(item.id, t);
  return t;
}
const itemGeo = new THREE.PlaneGeometry(0.42, 0.42);

export class ItemEntity extends Entity {
  constructor(game, stack, pickupDelay = 0.6) {
    super(game, 'item');
    this.stack = cloneStack(stack);
    this.w = 0.3; this.h = 0.3;
    this.pickupDelay = pickupDelay;
    this.spin = Math.random() * 6.28;
    const item = Items.get(stack.i);
    this.mat = new THREE.MeshBasicMaterial({ map: iconTexture(item), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
    const m = new THREE.Mesh(itemGeo, this.mat); m.userData.ownMat = true;
    const g = new THREE.Group(); g.add(m); this.sprite = m;
    // Una cruz de dos planos da volumen sin necesidad de billboards
    const m2 = new THREE.Mesh(itemGeo, this.mat); m2.rotation.y = Math.PI / 2; g.add(m2);
    this.obj = g; game.scene.add(g);
    this.life = 300;
  }
  get persistent() { return true; }
  serialize() { return { t: 'item', x: this.x, y: this.y, z: this.z, s: [this.stack.i, this.stack.n, this.stack.d || 0], life: this.life }; }
  update(dt) {
    const w = this.world;
    this.age += dt; this.life -= dt; this.pickupDelay -= dt;
    if (this.life <= 0) { this.removed = true; return; }
    const fl = w.fluidAt(Math.floor(this.x), Math.floor(this.y + 0.15), Math.floor(this.z));
    if (fl === 2) { this.removed = true; this.game.particles && this.game.particles.emit(this.x, this.y + 0.2, this.z, 0xff6a10, 6, 2); return; }
    if (fl === 1) { this.vy += 18 * dt; this.vy *= 0.9; this.vx *= 0.92; this.vz *= 0.92; }
    else this.vy -= 22 * dt;
    // Imán hacia el jugador
    const p = this.game.player;
    const dx = p.x - this.x, dy = p.y + 0.8 - this.y, dz = p.z - this.z;
    const d = Math.hypot(dx, dy, dz);
    if (this.pickupDelay <= 0 && d < 1.8 && this.game.canPickup(this.stack)) {
      const k = (1.8 - d) * 9;
      this.vx += (dx / d) * k * dt * 6; this.vy += (dy / d) * k * dt * 6; this.vz += (dz / d) * k * dt * 6;
      if (d < 0.7) { this.game.pickup(this); return; }
    }
    moveEntity(w, this, this.vx * dt, this.vy * dt, this.vz * dt);
    if (this.onGround) { this.vx *= Math.pow(0.02, dt); this.vz *= Math.pow(0.02, dt); }
    this.spin += dt * 1.6;
    if (this.obj) {
      const bob = Math.sin(this.age * 2.4) * 0.05;
      this.obj.position.set(this.x, this.y + 0.24 + bob, this.z);
      this.obj.rotation.y = this.spin;
      const l = this.game.lightAt(this.x, this.y + 0.3, this.z);
      this.mat.color.setScalar(l);
    }
  }
}

// ── Bloque que cae (arena/grava) ─────────────────────────────────
export class FallingBlock extends Entity {
  constructor(game, blockId) {
    super(game, 'falling');
    this.blockId = blockId; this.w = 0.98; this.h = 0.98;
    const b = Blocks.get(blockId);
    const item = Items.forBlock ? Items.forBlock(blockId) : null;
    const mat = new THREE.MeshBasicMaterial({ map: item ? iconTexture(item) : null, transparent: true });
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.98, 0.98), mat); m.userData.ownMat = true;
    m.position.y = 0.49; this.obj = new THREE.Group(); this.obj.add(m); game.scene.add(this.obj);
    void b;
  }
  update(dt) {
    this.vy -= 28 * dt;
    moveEntity(this.world, this, 0, this.vy * dt, 0);
    this._sync();
    if (this.onGround || this.y < 0) {
      const bx = Math.floor(this.x), by = Math.round(this.y), bz = Math.floor(this.z);
      this.removed = true;
      const w = this.world;
      let y = by;
      while (y < 127 && w.getBlock(bx, y, bz) !== 0 && !B_FLUID[w.getBlock(bx, y, bz)] && Blocks.get(w.getBlock(bx, y, bz)).shape !== 'cross') y++;
      w.setBlock(bx, y, bz, this.blockId);
      this.game.audio && this.game.audio.blockSound('place', Blocks.get(this.blockId).sound, bx, y, bz);
    }
  }
}

// ── Partículas (instanciadas) ────────────────────────────────────
export class Particles {
  constructor(scene, max = 160) {
    this.max = max; this.n = 0;
    this.geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    scene.add(this.mesh);
    this.px = new Float32Array(max * 3); this.pv = new Float32Array(max * 3); this.life = new Float32Array(max); this.size = new Float32Array(max);
    this.dummy = new THREE.Object3D(); this.col = new THREE.Color();
    this.enabled = true;
  }
  emit(x, y, z, color, count = 8, speed = 2.5, spread = 0.4) {
    if (!this.enabled) return;
    for (let i = 0; i < count; i++) {
      const k = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
      this.px[k * 3] = x + (Math.random() - 0.5) * spread; this.px[k * 3 + 1] = y + (Math.random() - 0.5) * spread; this.px[k * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.pv[k * 3] = (Math.random() - 0.5) * speed; this.pv[k * 3 + 1] = Math.random() * speed * 0.9; this.pv[k * 3 + 2] = (Math.random() - 0.5) * speed;
      this.life[k] = 0.5 + Math.random() * 0.6; this.size[k] = 0.6 + Math.random() * 0.8;
      this.col.setHex(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
      this.mesh.setColorAt(k, this.col);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // intercambiar con el último
        const last = --this.n;
        if (i !== last) {
          for (let k = 0; k < 3; k++) { this.px[i * 3 + k] = this.px[last * 3 + k]; this.pv[i * 3 + k] = this.pv[last * 3 + k]; }
          this.life[i] = this.life[last]; this.size[i] = this.size[last];
          this.mesh.getColorAt(last, this.col); this.mesh.setColorAt(i, this.col);
        }
        continue;
      }
      this.pv[i * 3 + 1] -= 14 * dt;
      this.px[i * 3] += this.pv[i * 3] * dt; this.px[i * 3 + 1] += this.pv[i * 3 + 1] * dt; this.px[i * 3 + 2] += this.pv[i * 3 + 2] * dt;
      this.dummy.position.set(this.px[i * 3], this.px[i * 3 + 1], this.px[i * 3 + 2]);
      this.dummy.scale.setScalar(this.size[i] * Math.min(1, this.life[i] * 3));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ── Criaturas ────────────────────────────────────────────────────
/** Base de animales y monstruos: física, daño, retroceso, muerte y animación de patas. */
export class Mob extends Entity {
  /**
   * def: {key,name,hp,speed,w,h,model:()=>parts,scale,...}
   */
  constructor(game, def) {
    super(game, def.key);
    this.def = def;
    this.w = def.w; this.h = def.h;
    this.hp = def.hp; this.maxHp = def.hp;
    this.speed = def.speed ?? 1.5;
    this.wishX = 0; this.wishZ = 0; this.wantJump = false;
    this.kbx = 0; this.kbz = 0;
    this.hurtTime = 0; this.deathTime = -1;
    this.walkPhase = 0; this.walkAmt = 0;
    this.targetYaw = Math.random() * 6.28; this.yaw = this.targetYaw;
    this.inWater = false; this.baby = false; this.scale = 1;
    this.model = buildModel(def.model(), { scale: def.scale ?? 1 });
    this.obj = this.model.root; game.scene.add(this.obj);
    this.obj.userData.ownMat = false;
    this.id = this.id;
    this.noDespawn = false;
    this.lastHitBy = null;
  }

  setBaby(b) {
    this.baby = b; this.scale = b ? 0.55 : 1;
    this.obj.scale.setScalar((this.def.scale ?? 1) * this.scale);
    this.w = this.def.w * this.scale; this.h = this.def.h * this.scale;
  }

  hurt(amount, sx, sz, knock = 1, source = null) {
    if (this.deathTime >= 0) return false;
    if (this.hurtTime > 0.25) return false; // invulnerabilidad breve
    this.hp -= amount;
    this.hurtTime = 0.45;
    this.lastHitBy = source;
    let dx = this.x - sx, dz = this.z - sz; const d = Math.hypot(dx, dz) || 1;
    this.kbx = (dx / d) * 6 * knock * (this.def.knockRes ? 1 - this.def.knockRes : 1); this.kbz = (dz / d) * 6 * knock * (this.def.knockRes ? 1 - this.def.knockRes : 1);
    this.vy = Math.max(this.vy, 5.5);
    this.onGround = false;
    this.game.audio && this.game.audio.play('hit', this.x, this.y, this.z);
    this.onHurt && this.onHurt(amount, source);
    if (this.hp <= 0) this.die(source);
    return true;
  }

  die(source) {
    if (this.deathTime >= 0) return;
    this.deathTime = 0;
    this.game.audio && this.game.audio.play('die', this.x, this.y, this.z);
    this.onDeath && this.onDeath(source);
    this.game.mobKilled && this.game.mobKilled(this, source);
  }

  /** Decide wishX/wishZ/wantJump. Las subclases lo sobrescriben. */
  think() {}

  update(dt) {
    this.age += dt;
    const w = this.world;
    if (this.deathTime >= 0) {
      this.deathTime += dt;
      this.obj.rotation.z = Math.min(1, this.deathTime * 4) * (Math.PI / 2);
      this.setTint(1, 0.3, 0.3);
      if (this.deathTime > 0.7) { this.removed = true; }
      return;
    }
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.wishX = this.wishZ = 0; this.wantJump = false;
    this.think(dt);

    const fl = w.fluidAt(Math.floor(this.x), Math.floor(this.y + this.h * 0.4), Math.floor(this.z));
    this.inWater = fl === 1; this.inLava = fl === 2;
    const grounded = this.onGround;
    const spd = this.speed * (this.baby ? 1.1 : 1);
    const tvx = this.wishX * spd, tvz = this.wishZ * spd;
    const acc = (grounded ? 22 : 7) * dt;
    this.vx = approach(this.vx, tvx + this.kbx, acc * (this.kbx ? 2 : 1));
    this.vz = approach(this.vz, tvz + this.kbz, acc * (this.kbz ? 2 : 1));
    this.kbx *= Math.pow(0.001, dt); this.kbz *= Math.pow(0.001, dt);
    if (Math.abs(this.kbx) < 0.05) this.kbx = 0; if (Math.abs(this.kbz) < 0.05) this.kbz = 0;

    if (this.def.flying) {
      this.vy = approach(this.vy, this.flyTargetVy || 0, 8 * dt);
    } else if (this.def.swimmer) {
      if (this.inWater) { this.vy = approach(this.vy, this.swimVy || 0, 6 * dt); }
      else this.vy -= 28 * dt;
    } else if (this.inWater || this.inLava) {
      this.vy -= 6 * dt; this.vy *= Math.exp(-3 * dt); this.vy += 14 * dt * (this.def.avoidWater ? 0.9 : 0.5) + 1.6 * dt;
      this.vy = clamp(this.vy, -2, 3);
    } else {
      this.vy -= 30 * dt; if (this.vy < -40) this.vy = -40;
    }
    if (this.wantJump && grounded && !this.def.flying && !this.def.swimmer) { this.vy = this.def.jump ?? 8.2; this.onGround = false; }

    const px = this.x, pz = this.z;
    moveEntity(w, this, this.vx * dt, this.vy * dt, this.vz * dt);
    // Obstáculo de 1 bloque: saltar
    if ((this.hitX || this.hitZ) && this.onGround && (this.wishX || this.wishZ) && this.def.canJump !== false && !this.def.flying) this.vy = this.def.jump ?? 8.2;
    const moved = Math.hypot(this.x - px, this.z - pz);
    this.walkAmt = approach(this.walkAmt, Math.min(1, moved / Math.max(dt, 1e-3) / Math.max(0.5, this.speed)), 6 * dt);
    this.walkPhase += moved * 3.2 / Math.max(0.4, this.scale);

    // Orientación
    if (this.wishX || this.wishZ) this.targetYaw = Math.atan2(-this.wishX, -this.wishZ);
    this.yaw += clamp(angleDiff(this.yaw, this.targetYaw), -9 * dt, 9 * dt);
    this._sync();
    this.obj.rotation.y = this.yaw;
    this.animate(dt);
    const l = this.game.lightAt(this.x, this.y + this.h * 0.5, this.z);
    if (this.hurtTime > 0) this.setTint(Math.min(1, l + 0.5), l * 0.35, l * 0.35); else this.setTint(l, l, l);
  }

  setTint(r, g, b) { this.model.mat.color.setRGB(r, g, b); }

  /** Animación por defecto: patas "leg_fl, leg_fr, leg_bl, leg_br" y cabeza "head". */
  animate(dt) {
    const p = this.model.parts;
    const s = Math.sin(this.walkPhase) * 0.9 * this.walkAmt;
    if (p.leg_fl) { p.leg_fl.rotation.x = s; p.leg_br.rotation.x = s; p.leg_fr.rotation.x = -s; p.leg_bl.rotation.x = -s; }
    if (p.legL) { p.legL.rotation.x = s; p.legR.rotation.x = -s; }
    if (p.armL) { p.armL.rotation.x = -s; p.armR.rotation.x = s; }
    void dt;
  }

  serialize() {
    return { t: this.type, x: this.x, y: this.y, z: this.z, hp: this.hp, baby: this.baby, age: this.growAge || 0, tamed: this.tamed || false, trust: this.trust || 0 };
  }
}

// ── Gestor ───────────────────────────────────────────────────────
export class EntityManager {
  constructor(game) { this.game = game; this.list = []; this.simDistance = 64; }
  add(e) { this.list.push(e); return e; }
  clear() { for (const e of this.list) e.dispose(); this.list.length = 0; }
  update(dt) {
    const p = this.game.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.removed) { e.dispose(); this.list.splice(i, 1); continue; }
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d > this.simDistance + 16) { if (e.persistent) this.game.sleepEntity(e); e.removed = true; continue; }
      // Entidades en chunks sin cargar se congelan
      if (!this.game.world.isLoaded(Math.floor(e.x), Math.floor(e.z))) { if (e.obj) e.obj.visible = false; continue; }
      if (e.obj) e.obj.visible = d < this.simDistance;
      e.update(dt);
    }
  }
  count(pred) { let n = 0; for (const e of this.list) if (!e.removed && pred(e)) n++; return n; }
  /** Entidad más cercana a lo largo de un rayo (para atacar/interactuar). */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filter) {
    let best = null, bestT = maxDist;
    for (const e of this.list) {
      if (e.removed || !e.obj || !e.obj.visible || e.type === 'item' || e.type === 'falling') continue;
      if (e.deathTime >= 0) continue;
      if (filter && !filter(e)) continue;
      const [mn, mx] = e.aabb();
      // ensanchar un poco para apuntar con comodidad
      const pad = 0.12;
      let tmin = -Infinity, tmax = Infinity;
      const o = [ox, oy, oz], d = [dx, dy, dz];
      let ok = true;
      for (let a = 0; a < 3; a++) {
        const lo = mn[a] - pad, hi = mx[a] + pad;
        if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo || o[a] > hi) { ok = false; break; } continue; }
        let t1 = (lo - o[a]) / d[a], t2 = (hi - o[a]) / d[a];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
      if (ok && tmax >= 0 && tmin < bestT) { bestT = Math.max(tmin, 0); best = e; }
    }
    return best ? { entity: best, dist: bestT } : null;
  }
  persistentList() { return this.list.filter((e) => !e.removed && e.persistent && e.deathTime === undefined || (e.deathTime !== undefined && e.deathTime < 0 && e.persistent)); }
}

export { addToSlots, B_SOLID };
