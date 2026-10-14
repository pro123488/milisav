// Jugador: movimiento en primera persona con gravedad, salto, carrera, agacharse, natación, vuelo creativo,
// autosalto, subida de escalones, escaleras de mano, corrientes de agua y daño por caída.
// Sin DOM ni three.js (se alimenta con un objeto `input`).
import { moveEntity, boxCollides, unstick } from './physics.js';
import { B_FLUID, B_CLIMB } from './blocks.js';
import { flowVector } from './fluids.js';
import { renderBoxes } from './shapes.js';

export const PLAYER_W = 0.6, PLAYER_H = 1.8, EYE = 1.62, EYE_CROUCH = 1.27;
const WALK = 4.3, SPRINT = 5.9, CROUCH = 1.7, SWIM = 2.6, FLY = 11, FLY_SPRINT = 20;
const GRAVITY = 32, JUMP_V = 9.0, TERMINAL = 70;
const CLIMB_UP = 2.6, CLIMB_DOWN = 2.4, STEP = 0.6;

const approach = (v, target, delta) => (v < target ? Math.min(v + delta, target) : Math.max(v - delta, target));

export class Player {
  constructor() {
    this.x = 0; this.y = 80; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.w = PLAYER_W; this.h = PLAYER_H;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false; this.hitX = false; this.hitZ = false; this.hitHead = false;
    this.inWater = false; this.headInWater = false; this.inLava = false;
    this.sprinting = false; this.crouching = false;
    this.flying = false; this.allowFlying = false;
    this.fallDistance = 0;
    this.eye = EYE;
    this.moved = 0;           // distancia horizontal recorrida (para pasos/hambre)
    this.jumpedThisFrame = false;
    this.landed = null;       // {distance} cuando aterriza este fotograma
    this.autoJump = true;
    this._spaceTap = 0;
    this._prevJump = false;
    this.noClip = false;
    this.speedMul = 1;
    this.stepHeight = STEP;   // sube escaleras y losas andando
    this.stepSmooth = 0;      // desfase de cámara al subir un escalón (decrece a 0)
    this.onLadder = false;
  }

  get eyeY() { return this.y + this.eye; }

  /** Dirección de mirada (vector unitario). */
  lookDir(out = {}) {
    const cp = Math.cos(this.pitch);
    out.x = -Math.sin(this.yaw) * cp; out.y = Math.sin(this.pitch); out.z = -Math.cos(this.yaw) * cp;
    return out;
  }

  teleport(x, y, z) { this.x = x; this.y = y; this.z = z; this.vx = this.vy = this.vz = 0; this.fallDistance = 0; }

  /**
   * input: {fwd, strafe (−1..1), jump, sprint, crouch}
   * Devuelve eventos útiles en this.landed / this.jumpedThisFrame.
   */
  update(dt, input, world, canSprint = true) {
    dt = Math.min(dt, 0.05);
    this.landed = null; this.jumpedThisFrame = false;

    // Estado del entorno
    const fx = Math.floor(this.x), fz = Math.floor(this.z);
    const feetF = world.fluidAt(fx, Math.floor(this.y + 0.1), fz);
    const bodyF = world.fluidAt(fx, Math.floor(this.y + 0.9), fz);
    const headF = world.fluidAt(fx, Math.floor(this.y + this.eye), fz);
    this.inWater = feetF === 1 || bodyF === 1;
    this.inLava = feetF === 2 || bodyF === 2;
    this.headInWater = headF === 1;
    const inFluid = this.inWater || this.inLava;
    this.onLadder = !this.flying && !this.noClip && this._touchingLadder(world);
    // Corriente: el agua que fluye arrastra al jugador
    const flow = this.inWater && !this.flying ? flowVector(world, fx, Math.floor(this.y + 0.1), fz) : null;

    // Doble toque de espacio → volar (creativo)
    if (input.jump && !this._prevJump && this.allowFlying) {
      if (this._spaceTap > 0) { this.flying = !this.flying; this.vy = 0; this._spaceTap = 0; }
      else this._spaceTap = 0.3;
    }
    this._prevJump = input.jump;
    if (this._spaceTap > 0) this._spaceTap -= dt;
    if (!this.allowFlying) this.flying = false;

    // Agacharse / correr
    this.crouching = !!input.crouch && !this.flying && !inFluid;
    const wantSprint = input.sprint && input.fwd > 0 && !this.crouching && canSprint;
    this.sprinting = wantSprint && !(this.inWater && this.headInWater);
    this.eye = approach(this.eye, this.crouching ? EYE_CROUCH : EYE, dt * 6);

    // Dirección deseada en el plano
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * input.fwd + cy * input.strafe;
    let wz = -cy * input.fwd - sy * input.strafe;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }

    let speed;
    if (this.flying) speed = this.sprinting ? FLY_SPRINT : FLY;
    else if (inFluid) speed = this.inLava ? SWIM * 0.5 : SWIM * (this.sprinting ? 1.4 : 1);
    else if (this.crouching) speed = CROUCH;
    else speed = this.sprinting ? SPRINT : WALK;
    speed *= this.speedMul;

    let tvx = wx * speed, tvz = wz * speed;
    if (flow) { const fl = Math.hypot(flow.x, flow.z); tvx += (flow.x / fl) * 1.7; tvz += (flow.z / fl) * 1.7; }
    const grounded = this.onGround;
    let accel;
    if (this.flying) accel = 60;
    else if (inFluid) accel = 16;
    else if (grounded) accel = (wl > 0.01) ? 55 : 45;
    else accel = 12;
    // aproximación vectorial a la velocidad objetivo
    const dvx = tvx - this.vx, dvz = tvz - this.vz;
    const dl = Math.hypot(dvx, dvz);
    const maxd = accel * dt;
    if (dl <= maxd || dl === 0) { this.vx = tvx; this.vz = tvz; }
    else { this.vx += (dvx / dl) * maxd; this.vz += (dvz / dl) * maxd; }

    // Vertical
    let dyAvg = null;
    if (this.flying) {
      let tvy = 0;
      if (input.jump) tvy += speed * 0.55;
      if (input.crouchDown) tvy -= speed * 0.55;
      this.vy = approach(this.vy, tvy, 70 * dt);
    } else if (inFluid) {
      const buoy = this.inLava ? 3 : 7;
      this.vy -= (GRAVITY * 0.25) * dt;
      this.vy *= Math.exp(-(this.inLava ? 4 : 2.5) * dt);
      if (input.jump) {
        this.vy = approach(this.vy, this.inLava ? 2.5 : 4.2, buoy * 2 * dt * 3);
        // salir del agua por el borde
        if (this.hitX || this.hitZ) {
          if (!boxCollides(world, this.x + wx * 0.4, this.y + 1.05, this.z + wz * 0.4, this.w, this.h)) this.vy = Math.max(this.vy, 6.5);
        }
      } else if (input.crouch) this.vy = approach(this.vy, -3, 20 * dt);
      this.vy = Math.max(this.vy, -3.5);
    } else {
      // Integración exacta de la parábola: la altura del salto no depende de los FPS
      const vy0 = this.vy;
      this.vy -= GRAVITY * dt;
      if (this.vy < -TERMINAL) this.vy = -TERMINAL;
      if (input.jump && grounded) { this.vy = JUMP_V - GRAVITY * dt; dyAvg = ((JUMP_V + this.vy) / 2) * dt; this.jumpedThisFrame = true; this.onGround = false; }
      else dyAvg = ((vy0 + this.vy) / 2) * dt;
    }

    // Escalera de mano: sube con salto o empujando contra ella, se sujeta agachado, baja despacio
    if (this.onLadder) {
      const pushing = (this.hitX || this.hitZ) && wl > 0.1;
      if (input.jump || pushing) this.vy = CLIMB_UP;
      else if (this.crouching) this.vy = 0;
      else this.vy = Math.max(this.vy, -CLIMB_DOWN);
      dyAvg = null;
      this.fallDistance = 0;
    }

    // Autosalto: obstáculo de 1 bloque delante
    if (this.autoJump && grounded && !this.flying && !inFluid && !this.onLadder && (this.hitX || this.hitZ) && wl > 0.2 && !this.crouching) {
      const ax = this.x + wx * 0.45, az = this.z + wz * 0.45;
      if (!boxCollides(world, ax, this.y + 1.02, az, this.w, this.h) && boxCollides(world, ax, this.y + 0.1, az, this.w, 0.5)) {
        this.vy = 8.1; this.jumpedThisFrame = true;
      }
    }

    // Mover
    const prevX = this.x, prevZ = this.z, prevY = this.y;
    let dx = this.vx * dt, dz = this.vz * dt, dy = dyAvg !== null ? dyAvg : this.vy * dt;
    const wasGround = this.onGround;
    if (this.noClip) { this.x += dx; this.y += dy; this.z += dz; this.onGround = false; }
    else {
      // Agacharse en el borde: no caer
      if (this.crouching && wasGround) {
        if (dx !== 0 && !this._supported(world, this.x + dx, this.y, this.z)) { dx = 0; this.vx = 0; }
        if (dz !== 0 && !this._supported(world, this.x + dx, this.y, this.z + dz)) { dz = 0; this.vz = 0; }
      }
      moveEntity(world, this, dx, dy, dz);
      if (this.stepped > 0) this.stepSmooth = Math.min(0.6, this.stepSmooth + this.stepped);
    }
    this.stepSmooth = Math.max(0, this.stepSmooth - dt * Math.max(2.5, this.stepSmooth * 9));
    // Límite del mundo
    if (world.size) {
      const half = world.size / 2 - 0.4;
      this.x = Math.max(-half, Math.min(half, this.x)); this.z = Math.max(-half, Math.min(half, this.z));
    }
    this.moved = Math.hypot(this.x - prevX, this.z - prevZ);

    // Caídas
    if (inFluid || this.flying || this.onLadder) this.fallDistance = 0;
    else if (this.y < prevY) this.fallDistance += prevY - this.y;
    if (this.onGround && !wasGround && this.fallDistance > 0) {
      this.landed = { distance: this.fallDistance };
      this.fallDistance = 0;
    } else if (this.onGround) this.fallDistance = 0;
    if (this.flying && this.onGround && !input.jump) this.flying = false;
    // Nunca quedar atrapado
    if (!this.noClip && boxCollides(world, this.x, this.y, this.z, this.w, this.h)) unstick(world, this);
  }

  _supported(world, x, y, z) {
    return boxCollides(world, x, y - 0.6, z, this.w, 0.6);
  }

  /** ¿Está el jugador en una celda de escalera de mano, o toca su hoja (caja ensanchada 0,08)? */
  _touchingLadder(world) {
    const cx0 = Math.floor(this.x), cz0 = Math.floor(this.z);
    if (B_CLIMB[world.getBlock(cx0, Math.floor(this.y + 0.05), cz0)] || B_CLIMB[world.getBlock(cx0, Math.floor(this.y + 0.9), cz0)]) return true;
    const hw = this.w / 2 + 0.08;
    const ax0 = this.x - hw, ax1 = this.x + hw, az0 = this.z - hw, az1 = this.z + hw;
    const x0 = Math.floor(ax0), x1 = Math.floor(ax1), z0 = Math.floor(az0), z1 = Math.floor(az1);
    for (const yy of [Math.floor(this.y + 0.05), Math.floor(this.y + 0.9)]) {
      for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
        const id = world.getBlock(cx, yy, cz);
        if (!B_CLIMB[id]) continue;
        for (const b of renderBoxes(id)) if (cx + b[0] < ax1 && cx + b[3] > ax0 && cz + b[2] < az1 && cz + b[5] > az0) return true;
      }
    }
    return false;
  }
}
void B_FLUID;
