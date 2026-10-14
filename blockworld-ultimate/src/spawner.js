// Aparición controlada de criaturas: según bioma, hora, luz y dificultad, con límites de población
// y desaparición de las que quedan lejos (excepto domesticadas / criadas / guardianes).
import { BIOMES } from './biomes.js';
import { ANIMALS } from './animals.js';
import { MONSTERS } from './monsters.js';
import { ID, B_SOLID, B_FLUID, B_REPLACEABLE } from './blocks.js';
import { B_FAMILY } from './shapes.js';

const pickWeighted = (table) => {
  const entries = Object.entries(table).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (!total) return null;
  let t = Math.random() * total;
  for (const [k, w] of entries) { t -= w; if (t <= 0) return k; }
  return entries[entries.length - 1][0];
};
const DAY_SPAWN = new Set(['sand_devourer', 'mud_golem', 'volcano_beast', 'obsidian_skeleton']);
const GROUND_OK = new Set([ID.GRASS, ID.GRASS_LUSH, ID.GRASS_DRY, ID.GRASS_SWAMP, ID.GRASS_SNOW, ID.DIRT, ID.SAND, ID.RED_SAND, ID.SNOW, ID.MUD, ID.STONE, ID.BASALT, ID.ASH, ID.SANDSTONE, ID.RED_SANDSTONE, ID.GRAVEL, ID.CLAY]);
const MONSTER_CAP = { easy: 6, normal: 12, hard: 18, peaceful: 0 };

export class Spawner {
  constructor(game) {
    this.game = game;
    this.animalTimer = 1; this.monsterTimer = 4; this.cleanTimer = 2;
    this.enabledAnimals = true; this.enabledMonsters = true;
  }

  configure(meta, difficulty) {
    this.enabledAnimals = meta.mobs === 'all' || meta.mobs === 'animals';
    this.enabledMonsters = meta.mobs === 'all' && difficulty !== 'peaceful';
  }

  _standable(x, z) {
    const w = this.game.world;
    if (!w.isLoaded(x, z)) return -1;
    const c = w.chunkAt(x >> 4, z >> 4);
    if (!c || !c.lightReady) return -1;
    return w.surfaceY(x, z);
  }

  /** Aparición inicial rápida alrededor del jugador. */
  initialFill(n = 40) {
    if (!this.enabledAnimals) return;
    for (let i = 0; i < n; i++) this.trySpawnAnimal(8, 56);
  }

  update(dt) {
    const g = this.game;
    this.animalTimer -= dt; this.monsterTimer -= dt; this.cleanTimer -= dt;
    if (this.enabledAnimals && this.animalTimer <= 0) { this.animalTimer = 2 + Math.random() * 3; this.trySpawnAnimal(24, 60); }
    if (this.enabledMonsters && this.monsterTimer <= 0 && g.mode !== 'creative') { this.monsterTimer = 1.5 + Math.random() * 2.5; this.trySpawnMonster(); }
    if (this.cleanTimer <= 0) { this.cleanTimer = 2; this.cleanup(); }
  }

  cleanup() {
    const g = this.game, p = g.player;
    for (const e of g.entities.list) {
      if (e.removed || e.type === 'item' || e.type === 'falling' || e.type === 'projectile') continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (MONSTERS[e.type]) {
        if (!this.enabledMonsters) { e.removed = true; continue; }
        if (e.noDespawn) continue;
        if (d > 80 || (d > 36 && Math.random() < 0.02)) e.removed = true;
      } else if (ANIMALS[e.type] && !e.persistent && d > 100) e.removed = true;
    }
  }

  trySpawnAnimal(minR = 24, maxR = 60) {
    const g = this.game, p = g.player, w = g.world;
    const near = g.entities.count((e) => ANIMALS[e.type] && !e.removed);
    if (near >= 34) return false;
    const a = Math.random() * Math.PI * 2, r = minR + Math.random() * (maxR - minR);
    const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
    const sy = this._standable(x, z);
    if (sy < 0) return false;
    const ground = w.getBlock(x, sy, z);
    // Acuáticos
    if (ground === ID.WATER || ground === ID.ICE) {
      let depth = 0;
      for (let y = sy; y > 1 && w.getBlock(x, y, z) === ID.WATER; y--) depth++;
      const biome = w.terrain.biomeAt(x, z);
      if (depth >= 2 && biome !== 11 && g.entities.count((e) => e.type === 'glow_fish' && !e.removed) < ANIMALS.glow_fish.cap) {
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) g.spawnMob('glow_fish', x + 0.5 + (Math.random() - 0.5) * 3, sy - 0.8 - Math.random() * Math.min(2, depth - 1), z + 0.5 + (Math.random() - 0.5) * 3);
        return true;
      }
      return false;
    }
    if (!GROUND_OK.has(ground) || w.getBlock(x, sy + 1, z) !== 0 && !B_REPLACEABLE[w.getBlock(x, sy + 1, z)]) return false;
    if (w.getBlock(x, sy + 2, z) !== 0) return false;
    const biome = w.terrain.biomeAt(x, z);
    const table = BIOMES[biome] && BIOMES[biome].animals;
    if (!table) return false;
    const key = pickWeighted(table);
    if (!key || key === 'glow_fish') return false;
    const def = ANIMALS[key];
    if (g.entities.count((e) => e.type === key && !e.removed) >= def.cap) return false;
    const herd = (def.domestic || key === 'mist_deer') ? 1 + Math.floor(Math.random() * 3) : 1;
    let spawned = 0;
    for (let i = 0; i < herd; i++) {
      const hx = x + (Math.random() - 0.5) * 4, hz = z + (Math.random() - 0.5) * 4;
      const hy = this._standable(Math.floor(hx), Math.floor(hz));
      if (hy < 0 || !GROUND_OK.has(w.getBlock(Math.floor(hx), hy, Math.floor(hz)))) continue;
      const m = g.spawnMob(key, hx, key === 'mountain_bird' ? hy + 2 : hy + 1.01, hz);
      if (m) spawned++;
    }
    return spawned > 0;
  }

  trySpawnMonster() {
    const g = this.game, p = g.player, w = g.world;
    const cap = MONSTER_CAP[g.difficulty] ?? 12;
    const near = g.entities.count((e) => MONSTERS[e.type] && !e.removed && Math.hypot(e.x - p.x, e.z - p.z) < 70);
    if (near >= cap) return false;
    const atm = g.sky.atm;
    const underground = w.getSky(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z)) < 8;
    const mode = (underground || Math.random() < 0.35) ? 'cave' : 'surface';
    if (mode === 'surface') {
      const a = Math.random() * Math.PI * 2, r = 22 + Math.random() * 26;
      const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
      const sy = this._standable(x, z);
      if (sy < 0) return false;
      const ground = w.getBlock(x, sy, z);
      if (!GROUND_OK.has(ground) || w.getBlock(x, sy + 1, z) !== 0 || w.getBlock(x, sy + 2, z) !== 0) return false;
      const sky = w.getSky(x, sy + 1, z) / 15 * atm.gameSky, blk = w.getBlockLight(x, sy + 1, z) / 15;
      const dark = Math.max(sky, blk) < 0.5;
      const biome = w.terrain.biomeAt(x, z);
      const table = BIOMES[biome] && BIOMES[biome].monsters;
      if (!table) return false;
      const key = pickWeighted(table);
      if (!key || !MONSTERS[key]) return false;
      if (!dark && !DAY_SPAWN.has(key)) return false;
      if (blk > 0.4) return false;
      const m = g.spawnMob(key, x + 0.5, sy + 1.01, z + 0.5);
      return !!m;
    }
    // Cuevas
    const x = Math.floor(p.x + (Math.random() - 0.5) * 48), z = Math.floor(p.z + (Math.random() - 0.5) * 48);
    const y = Math.floor(p.y + (Math.random() - 0.7) * 22);
    if (y < 4 || y > 120 || !w.isLoaded(x, z)) return false;
    if (Math.hypot(x - p.x, z - p.z, y - p.y) < 12) return false;
    if (w.getBlock(x, y, z) !== 0 || w.getBlock(x, y + 1, z) !== 0) return false;
    const below = w.getBlock(x, y - 1, z);
    if (w.getSky(x, y, z) > 2 || w.getBlockLight(x, y, z) > 4) return false;
    const r = Math.random();
    let key;
    if (r < 0.4) key = 'cave_bat';
    else if (y < 38 && r < 0.65) key = 'obsidian_skeleton';
    else key = 'night_stalker';
    if (key !== 'cave_bat' && (!B_SOLID[below] || B_FAMILY[below])) return false; // ni sobre vallas, escaleras o puertas
    if (B_FLUID[below]) return false;
    return !!g.spawnMob(key, x + 0.5, y + 0.01, z + 0.5);
  }
}
