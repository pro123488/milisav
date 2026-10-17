// Supervivencia: salud, hambre, saturación, recuperación, daño (caída, ahogo, lava, fuego, cactus, vacío),
// armadura, muerte y reaparición. Las reglas dependen del modo de juego y de la dificultad.
import { DEFENSE_PER_POINT, Items } from './items.js';
import { ID } from './blocks.js';
import { Effects } from './effects.js';

const DIFF_DAMAGE = { peaceful: 0.0, easy: 0.6, normal: 1.0, hard: 1.45 };
export const mobDamageScale = (difficulty) => DIFF_DAMAGE[difficulty] ?? 1;

export class Survival {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.maxHealth = 20; this.health = 20;
    this.hunger = 20; this.saturation = 5; this.exhaustion = 0;
    this.air = 10; this.maxAir = 10;
    this.fire = 0;
    this.regenTimer = 0; this.starveTimer = 0; this.drownTimer = 0; this.lavaTimer = 0; this.cactusTimer = 0; this.fireTimer = 0;
    this.invuln = 0; this.dead = false; this.deathCause = '';
    this.blocksBroken = 0; this.blocksPlaced = 0;
    this.effects = new Effects(); this.poisonTimer = 0; this.effRegenTimer = 0;
  }

  get canSprint() { return this.hunger > 6 || this.game.mode === 'creative'; }
  get invulnerable() { return this.game.mode === 'creative' || this.invuln > 0; }

  addExhaustion(x) { if (this.game.mode === 'creative' || this.game.difficulty === 'peaceful') return; this.exhaustion += x; }

  /** Daño al jugador. type: 'fall'|'drown'|'lava'|'fire'|'cactus'|'void'|'starve'|'mob'|'magic'. */
  damage(amount, type = 'mob', source = null) {
    const g = this.game;
    if (this.dead || amount <= 0) return false;
    if (g.mode === 'creative' && type !== 'void') return false;
    if (this.invuln > 0 && type !== 'void') return false;
    const fx = this.effects;
    if ((type === 'fire' || type === 'lava') && fx.has('fire_resistance')) return false;
    let dmg = amount;
    if (type !== 'void' && type !== 'starve') dmg *= fx.damageFactor();
    if (type === 'mob') dmg *= mobDamageScale(g.difficulty);
    const armored = !['drown', 'starve', 'void', 'fall'].includes(type);
    if (armored) {
      const def = g.inventory.armorDefense();
      dmg *= 1 - Math.min(0.8, def * DEFENSE_PER_POINT);
      if (dmg > 0) g.inventory.damageArmor(dmg);
    }
    if (g.difficulty === 'peaceful' && type !== 'void') dmg *= 0.5;
    dmg = Math.round(dmg * 2) / 2; // medios corazones
    if (dmg <= 0) return false;
    this.health = Math.max(0, this.health - dmg);
    this.invuln = type === 'void' ? 0 : 0.55;
    this.exhaustion += 0.1;
    g.ui.damageFlash();
    g.audio && g.audio.play(type === 'fall' ? 'fall' : 'hurt');
    if (source && source.x !== undefined) {
      // retroceso
      const dx = g.player.x - source.x, dz = g.player.z - source.z, d = Math.hypot(dx, dz) || 1;
      g.player.vx += (dx / d) * 5.5; g.player.vz += (dz / d) * 5.5; g.player.vy = Math.max(g.player.vy, 4.5);
    }
    if (this.health <= 0) this.die(type, source);
    return true;
  }

  /** ¿Lleva puesta la pieza de armadura `key`? (la Corona de coral da respiración acuática) */
  wearing(key) { const a = this.game.inventory && this.game.inventory.armor; if (!a) return false; for (const s of a) if (s && Items.get(s.i).key === key) return true; return false; }

  /** Aplica una lista de efectos [[id, segundos, nivel], ...] (tónicos y comidas especiales). */
  applyEffects(list) { for (const [id, sec, lvl] of list || []) this.effects.add(id, sec, lvl || 1); }

  heal(n) { this.health = Math.min(this.maxHealth, this.health + n); }

  eat(item) {
    const f = item.food;
    this.hunger = Math.min(20, this.hunger + f.hunger);
    this.saturation = Math.min(this.hunger, this.saturation + f.sat);
  }

  die(cause, source) {
    if (this.dead) return;
    this.dead = true; this.deathCause = cause;
    const g = this.game;
    g.onPlayerDeath(cause, source);
  }

  respawn() {
    const mh = this.maxHealth;
    this.reset();
    this.maxHealth = mh; this.health = mh; // los corazones extra (recompensas de jefes) se conservan
  }

  /** Avanza las reglas del juego un fotograma. */
  update(dt) {
    const g = this.game, p = g.player, w = g.world;
    if (this.dead) return;
    this.invuln = Math.max(0, this.invuln - dt);
    const creative = g.mode === 'creative';
    const peaceful = g.difficulty === 'peaceful';

    // Caída
    if (p.landed && !creative) {
      const dmg = Math.ceil(p.landed.distance - 3);
      if (dmg > 0 && !p.inWater && !p.flying) this.damage(dmg, 'fall');
    }
    // Vacío
    if (p.y < -20) { this.damage(4, 'void'); p.teleport(p.x, 90, p.z); }

    const fx = this.effects;
    fx.update(dt);
    if (creative) { this.health = this.maxHealth; this.hunger = 20; this.air = this.maxAir; this.fire = 0; return; }

    // Movimiento → hambre
    if (p.moved > 0) {
      const unit = p.sprinting ? 0.1 : p.inWater ? 0.015 : 0.0;
      this.addExhaustion(p.moved * unit);
    }
    if (p.jumpedThisFrame) this.addExhaustion(p.sprinting ? 0.2 : 0.05);

    // Efectos de estado
    if (fx.has('regeneration') && this.health < this.maxHealth) {
      this.effRegenTimer += dt;
      if (this.effRegenTimer >= 2.5 / fx.level('regeneration')) { this.effRegenTimer = 0; this.heal(1); }
    } else this.effRegenTimer = 0;
    if (fx.has('poison') && this.health > 1) {
      this.poisonTimer += dt;
      if (this.poisonTimer >= 1.25 / fx.level('poison')) { this.poisonTimer = 0; this.health = Math.max(1, this.health - 1); g.ui.damageFlash(); }
    }

    // Ahogamiento
    if (p.headInWater && !fx.has('water_breathing') && !this.wearing('coral_crown')) {
      this.air -= dt;
      if (this.air <= 0) { this.drownTimer += dt; if (this.drownTimer >= 1) { this.drownTimer = 0; this.damage(2, 'drown'); } }
    } else { this.air = Math.min(this.maxAir, this.air + dt * 5); this.drownTimer = 0; }

    // Lava y fuego
    if (fx.has('fire_resistance')) this.fire = 0;
    if (p.inLava && !fx.has('fire_resistance')) {
      this.fire = 8; this.lavaTimer += dt;
      if (this.lavaTimer >= 0.5) { this.lavaTimer = 0; this.damage(4, 'lava'); }
    }
    if (this.fire > 0) {
      if (p.inWater) this.fire = 0;
      else {
        this.fire -= dt; this.fireTimer += dt;
        if (this.fireTimer >= 1) { this.fireTimer = 0; this.damage(1, 'fire'); }
      }
    }
    // Cactus
    this.cactusTimer -= dt;
    if (this.cactusTimer <= 0) {
      const hw = p.w / 2 + 0.07;
      let hit = false;
      for (let x = Math.floor(p.x - hw); x <= Math.floor(p.x + hw) && !hit; x++) for (let z = Math.floor(p.z - hw); z <= Math.floor(p.z + hw) && !hit; z++) for (let y = Math.floor(p.y); y <= Math.floor(p.y + 1.5); y++) {
        if (w.getBlock(x, y, z) === ID.CACTUS) { hit = true; break; }
      }
      if (hit) { this.damage(1, 'cactus'); this.cactusTimer = 0.5; } else this.cactusTimer = 0.1;
    }

    // Hambre: el cansancio acumulado consume saturación y luego hambre
    if (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else if (!peaceful) this.hunger = Math.max(0, this.hunger - 1);
    }
    // Recuperación
    if (peaceful) {
      if (this.health < this.maxHealth) { this.regenTimer += dt; if (this.regenTimer >= 1) { this.regenTimer = 0; this.heal(1); } }
      this.hunger = Math.min(20, this.hunger + dt * 2);
    } else if (this.hunger >= 18 && this.health < this.maxHealth) {
      this.regenTimer += dt;
      const fast = this.hunger >= 20 && this.saturation > 0;
      const period = fast ? 0.5 : 4;
      if (this.regenTimer >= period) { this.regenTimer = 0; this.heal(1); this.addExhaustion(fast ? 1.5 : 6); }
    } else this.regenTimer = 0;
    // Inanición
    if (this.hunger <= 0 && !peaceful) {
      this.starveTimer += dt;
      if (this.starveTimer >= 4) {
        this.starveTimer = 0;
        const limit = g.difficulty === 'hard' ? 0 : g.difficulty === 'normal' ? 1 : 10;
        if (this.health > limit) this.damage(1, 'starve');
      }
    } else this.starveTimer = 0;
  }

  serialize() {
    return { h: this.health, hu: this.hunger, sat: this.saturation, ex: this.exhaustion, air: this.air, fx: this.effects.serialize(), mh: this.maxHealth };
  }
  load(o) {
    if (!o) return;
    this.maxHealth = o.mh ?? 20;
    this.health = Math.max(1, Math.min(this.maxHealth, o.h ?? 20)); this.hunger = o.hu ?? 20; this.saturation = o.sat ?? 5; this.exhaustion = o.ex ?? 0; this.air = o.air ?? 10;
    this.effects.load(o.fx);
  }
}
