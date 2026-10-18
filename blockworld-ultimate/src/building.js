// Colocar bloques e interactuar (clic derecho): colocación precisa por cara, soportes, antorchas de pared,
// bloques orientados (escaleras, escaleras de mano, puertas, puertas de valla, trampillas), azada, semillas,
// cubos, cuerda y bloques interactivos (cofre, mesa, horno, cama, arbusto de bayas, puertas).
import * as THREE from 'three';
import { Blocks, BLOCKS, B_SOLID, B_REPLACEABLE, B_FLUID, B_FLUIDLVL, ID } from './blocks.js';
import { Items } from './items.js';
import { tileAverageColor } from './atlas.js';
import { WORLD_HEIGHT as WH } from './config.js';
import {
  B_FAMILY, FAM, B_STURDY, FACING_VEC, facingFromVector, collisionBoxes, renderBoxes, boxesBounds, needsMask, connectMask,
} from './shapes.js';

const SANDY = new Set([ID.SAND, ID.RED_SAND, ID.SANDSTONE, ID.RED_SANDSTONE]);
/** Celdas que el jugador puede ocupar al colocar (aire, hierba alta, flores...). Los fluidos también. */
const freeCell = (id) => id === 0 || !!B_REPLACEABLE[id];

/** ¿Sirve el bloque de debajo como suelo para plantas/antorchas? (sólido y sin forma de cajas abierta) */
const solidTop = (id) => !!B_SOLID[id] && (B_FAMILY[id] === 0 || B_FAMILY[id] === FAM.FENCE || B_FAMILY[id] === FAM.WALL || B_FAMILY[id] === FAM.FACING);

/** ¿Puede existir el bloque `id` en (x,y,z) según lo que tiene debajo/al lado? */
export function supportOk(world, x, y, z, id) {
  const b = Blocks.get(id);
  switch (b.plantOn) {
    case 'soil': return Blocks.get(world.getBlock(x, y - 1, z)).soil;
    case 'sand': { const below = world.getBlock(x, y - 1, z); return below === ID.SAND || below === ID.RED_SAND || below === ID.CACTUS; }
    case 'dry': { const below = world.getBlock(x, y - 1, z); return SANDY.has(below) || Blocks.get(below).soil; }
    case 'any': return solidTop(world.getBlock(x, y - 1, z));
    case 'umbral': { const below = world.getBlock(x, y - 1, z); return below === ID.UMBRAL_MOSS || below === ID.UMBRAL_STONE; }
    case 'farmland': { const below = world.getBlock(x, y - 1, z); return below === ID.FARMLAND || below === ID.FARMLAND_WET; }
    case 'torch': {
      switch (b.dir) {
        case 1: return !!B_STURDY[world.getBlock(x + 1, y, z)];
        case 2: return !!B_STURDY[world.getBlock(x - 1, y, z)];
        case 3: return !!B_STURDY[world.getBlock(x, y, z + 1)];
        case 4: return !!B_STURDY[world.getBlock(x, y, z - 1)];
        default: return solidTop(world.getBlock(x, y - 1, z));
      }
    }
    case 'wall': { // escalera de mano: muro completo en el lado `facing`
      const v = FACING_VEC[b.facing];
      return !!B_STURDY[world.getBlock(x + v[0], y, z + v[1])];
    }
    case 'door_lower': { // suelo firme y su mitad superior encima
      const up = Blocks.get(world.getBlock(x, y + 1, z));
      return !!B_STURDY[world.getBlock(x, y - 1, z)] && up.family === 'door' && up.upper === 1 && up.famBase === b.famBase;
    }
    case 'hang': return !!B_SOLID[world.getBlock(x, y + 1, z)]; // farol colgante: algo sólido encima
    case 'door_upper': {
      const lo = Blocks.get(world.getBlock(x, y - 1, z));
      return lo.family === 'door' && lo.upper === 0 && lo.famBase === b.famBase;
    }
    default: return true;
  }
}

export const isContainerBlock = (id) => !!BLOCKS[id] && (BLOCKS[id].container > 0 || id === ID.FURNACE || id === ID.FURNACE_LIT);

/** ID del estado de una familia con otros valores (facing/open/top/upper). */
export function familyState(baseId, { facing = 0, open = 0, top = 0, upper = 0 } = {}) {
  const fam = B_FAMILY[baseId];
  switch (fam) {
    case FAM.STAIRS: return baseId + facing + 4 * top;
    case FAM.LADDER: return baseId + facing;
    case FAM.DOOR: return baseId + facing + 4 * open + 8 * upper;
    case FAM.GATE: return baseId + facing + 4 * open;
    case FAM.TRAPDOOR: return baseId + facing + 4 * open + 8 * top;
    default: return baseId;
  }
}

export class Building {
  constructor(game) {
    this.game = game;
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.ghost = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
    this.ghost.visible = false; this.ghost.renderOrder = 9;
    game.scene.add(this.ghost);
  }
  dispose() { this.game.scene.remove(this.ghost); }

  /** Dirección horizontal hacia la que mira el jugador (0 N, 1 E, 2 S, 3 O). */
  _lookFacing() { const d = this.game.player.lookDir(); return facingFromVector(d.x, d.z); }

  /**
   * ¿Chocarían las cajas de colisión del bloque `id` colocado en (x,y,z) con el jugador o una criatura?
   * Usa la máscara de conexiones como si el bloque ya estuviera puesto (vallas de 1,5 incluidas).
   */
  blocksEntity(x, y, z, id) {
    const w = this.game.world;
    if (!B_SOLID[id] && B_FAMILY[id] !== FAM.GATE) return false;
    const mask = needsMask(id) ? connectMask((a, b, c) => w.getBlock(a, b, c), x, y, z, id) : 0;
    const boxes = collisionBoxes(id, mask);
    if (!boxes.length) return false;
    const hits = (e) => {
      const hw = e.w / 2;
      for (const b of boxes) {
        if (x + b[0] < e.x + hw - 1e-4 && x + b[3] > e.x - hw + 1e-4 && y + b[1] < e.y + e.h - 1e-4 && y + b[4] > e.y + 1e-4 && z + b[2] < e.z + hw - 1e-4 && z + b[5] > e.z - hw + 1e-4) return true;
      }
      return false;
    };
    if (hits(this.game.player)) return true;
    const ents = this.game.entities ? this.game.entities.list : [];
    for (const e of ents) if (!e.removed && e.def && e.deathTime < 0 && hits(e)) return true;
    return false;
  }

  /** Estado orientado de un bloque de familia según la cara apuntada y la mirada. -1 = no se puede. */
  _orient(blk, hit) {
    const lf = this._lookFacing();
    const fy = hit.py !== undefined ? hit.py - hit.y : 0.25; // altura del impacto dentro del bloque apuntado
    switch (B_FAMILY[blk.id]) {
      case FAM.STAIRS: {
        const top = hit.ny === -1 || (hit.ny === 0 && fy > 0.5) ? 1 : 0;
        return familyState(blk.famBase, { facing: lf, top });
      }
      case FAM.LADDER: {
        if (hit.ny !== 0) { // sobre/bajo otra escalera de mano: continúa con su orientación
          const hb = BLOCKS[hit.id];
          return hb && hb.family === 'ladder' ? familyState(blk.famBase, { facing: hb.facing }) : -1;
        }
        return familyState(blk.famBase, { facing: facingFromVector(-hit.nx, -hit.nz) });
      }
      case FAM.GATE: return familyState(blk.famBase, { facing: lf });
      case FAM.TRAPDOOR: {
        if (hit.ny === 0) return familyState(blk.famBase, { facing: facingFromVector(-hit.nx, -hit.nz), top: fy > 0.5 ? 1 : 0 });
        return familyState(blk.famBase, { facing: lf, top: hit.ny === -1 ? 1 : 0 });
      }
      case FAM.CUSTOM: return blk.oriented ? blk.famBase + (blk.placeAway ? lf : (lf + 2) % 4) : blk.id; // mira hacia el jugador (o hacia donde mira él)
      case FAM.FACING: return blk.famBase + lf; // máquinas: el frente mira hacia donde mira el jugador
      case FAM.RAIL: return blk.id; // la forma la decide rails.js al colocarlo
      default: return blk.id;
    }
  }

  /** Calcula dónde y qué bloque se colocaría con el objeto seleccionado (o null). */
  planPlacement(hit, item) {
    const g = this.game, w = g.world;
    if (!hit || !item) return null;
    if (item.kind === 'door') return this._planDoor(hit, item);
    if (item.kind !== 'block') return null;
    let blk = Blocks.get(item.block);
    let cx = hit.x + hit.nx, cy = hit.y + hit.ny, cz = hit.z + hit.nz;
    if (B_REPLACEABLE[hit.id] && !B_FLUID[hit.id]) { cx = hit.x; cy = hit.y; cz = hit.z; } // sustituye hierba alta, flores...
    const cur = w.getBlock(cx, cy, cz);
    if (!freeCell(cur)) return null;
    if (cy < 1 || cy >= WH - 2) return null;
    let id = blk.id;
    if (blk.shape === 'torch') {
      if (hit.ny === 1) id = ID.TORCH;
      else if (hit.ny === -1) return null;
      else if (hit.nx === 1) id = ID.TORCH_W;
      else if (hit.nx === -1) id = ID.TORCH_E;
      else if (hit.nz === 1) id = ID.TORCH_N;
      else id = ID.TORCH_S;
    } else if (id === ID.LANTERN && hit.ny === -1) {
      id = ID.LANTERN_HANGING; // bajo un bloque: farol colgante
    } else if (blk.family) {
      id = this._orient(blk, hit);
      if (id < 0) return null;
    }
    blk = Blocks.get(id);
    if (!supportOk(w, cx, cy, cz, id)) return null;
    if (this.blocksEntity(cx, cy, cz, id)) return null; // no dentro del jugador ni de criaturas
    return { x: cx, y: cy, z: cz, id, block: blk };
  }

  /** Puerta: dos celdas libres, suelo firme; la hoja cerrada queda en el lado más cercano al jugador. */
  _planDoor(hit, item) {
    const w = this.game.world;
    const base = Blocks.id(item.places + '_n');
    let cx = hit.x + hit.nx, cy = hit.y + hit.ny, cz = hit.z + hit.nz;
    if (B_REPLACEABLE[hit.id] && !B_FLUID[hit.id]) { cx = hit.x; cy = hit.y; cz = hit.z; }
    if (cy < 1 || cy >= WH - 3) return null;
    if (!freeCell(w.getBlock(cx, cy, cz)) || !freeCell(w.getBlock(cx, cy + 1, cz))) return null;
    if (B_FLUID[w.getBlock(cx, cy, cz)] || B_FLUID[w.getBlock(cx, cy + 1, cz)]) return null;
    if (!B_STURDY[w.getBlock(cx, cy - 1, cz)]) return null;
    const facing = (this._lookFacing() + 2) % 4;
    const lower = familyState(base, { facing }), upper = familyState(base, { facing, upper: 1 });
    if (this.blocksEntity(cx, cy, cz, lower) || this.blocksEntity(cx, cy + 1, cz, upper)) return null;
    return { x: cx, y: cy, z: cz, id: lower, upperId: upper, block: Blocks.get(lower), door: true };
  }

  /** Actualiza la vista previa (contorno de las cajas reales del bloque planificado). */
  updatePreview(hit, stack) {
    const item = stack ? Items.get(stack.i) : null;
    const plan = (this.game.mode !== 'adventure') ? this.planPlacement(hit, item) : null;
    if (!plan) { this.ghost.visible = false; return; }
    const w = this.game.world;
    let bb;
    if (B_FAMILY[plan.id]) {
      const mask = needsMask(plan.id) ? connectMask((a, b, c) => w.getBlock(a, b, c), plan.x, plan.y, plan.z, plan.id) : 0;
      bb = boxesBounds(renderBoxes(plan.id, mask));
    } else bb = boxesBounds(collisionBoxes(plan.id).length ? collisionBoxes(plan.id) : [[0, 0, 0, 1, 1, 1]]);
    if (plan.door) bb = [bb[0], 0, bb[2], bb[3], 2, bb[5]];
    this.ghost.position.set(plan.x + (bb[0] + bb[3]) / 2, plan.y + (bb[1] + bb[4]) / 2, plan.z + (bb[2] + bb[5]) / 2);
    this.ghost.scale.set(bb[3] - bb[0] + 0.01, bb[4] - bb[1] + 0.01, bb[5] - bb[2] + 0.01);
    this.ghost.visible = true;
  }

  /**
   * Acción de clic derecho. Devuelve true si hizo algo (para animar la mano).
   * hit = bloque apuntado; fluidHit = bloque apuntado incluyendo fluidos (para cubos).
   * pressed = clic nuevo (no repetición por mantener pulsado): las puertas solo cambian con un clic nuevo.
   */
  use(hit, fluidHit, crouching, pressed = true) {
    const g = this.game, w = g.world, inv = g.inventory;
    const stack = inv.getSelected();
    const item = stack ? Items.get(stack.i) : null;

    // 1) Bloques interactivos (si no se agacha con algo en la mano). Solo con un clic nuevo.
    if (hit && pressed) {
      const b = Blocks.get(hit.id);
      if (b.interact && !(crouching && item) && this.interact(hit, b)) return true;
      if (B_FAMILY[hit.id] === FAM.FENCE && !crouching && this.useFence(hit)) return true;
    }
    // Mantener pulsado sobre una puerta, cofre, valla... no coloca bloques delante (solo cuenta el clic nuevo)
    if (hit && !pressed && !crouching && (Blocks.get(hit.id).interact || B_FAMILY[hit.id] === FAM.FENCE)) return false;
    if (!item) return false;

    // 2) Cubos
    if (item.kind === 'bucket') return pressed ? this.useBucket(item, fluidHit || hit) : false;

    // 3) Comida: se come manteniendo pulsado (lo gestiona el juego)
    if (item.food && !item.plants) { g.beginEating(); return false; }
    if (item.drink) { g.beginEating(); return false; } // frascos y tónicos

    // Venda: cura al instante
    if (item.kind === 'heal') {
      if (!pressed) return false;
      const sv = g.survival;
      if (sv.health >= sv.maxHealth) { g.ui.toast('Ya tienes la salud completa'); return false; }
      sv.health = Math.min(sv.maxHealth, sv.health + (item.heal || 4));
      if (g.mode !== 'creative') inv.consumeSelected(1);
      g.audio && g.audio.play('pickup'); g.particles.emit(g.player.x, g.player.y + 1.2, g.player.z, 0xff6a6a, 8, 1.4);
      return true;
    }

    if (!hit) { if (item.food) g.beginEating(); return false; }
    const b = Blocks.get(hit.id);

    // Abono: adelanta un cultivo, intenta hacer crecer un brote o hace brotar flores en el césped
    if (item.kind === 'fertilizer' && pressed) {
      let used = false;
      if (b.group === 'crop' && b.next) { w.setBlock(hit.x, hit.y, hit.z, Blocks.id(b.next)); used = true; }
      else if (b.key.startsWith('sapling_')) { used = true; if (Math.random() < 0.45 && g.ticks) g.ticks.growTree(hit.x, hit.y, hit.z, b.key.slice(8)); }
      else if (hit.id === ID.GRASS || hit.id === ID.GRASS_LUSH) {
        used = true;
        for (let k = 0; k < 10; k++) {
          const x = hit.x + Math.floor(Math.random() * 5) - 2, z = hit.z + Math.floor(Math.random() * 5) - 2;
          if (w.getBlock(x, hit.y, z) === hit.id && w.getBlock(x, hit.y + 1, z) === 0) w.setBlock(x, hit.y + 1, z, Math.random() < 0.7 ? ID.TALL_GRASS : [ID.FLOWER_RED, ID.FLOWER_YELLOW, ID.FLOWER_BLUE][k % 3]);
        }
      }
      if (used) {
        g.particles.emit(hit.x + 0.5, hit.y + 0.8, hit.z + 0.5, 0x66dd55, 10, 1.5);
        if (g.mode !== 'creative') inv.consumeSelected(1);
        g.achieve && g.achieve('abono');
        return true;
      }
      return false;
    }

    // Pala sobre césped/tierra: camino
    if (item.tool && item.tool.type === 'shovel' && pressed && (b.key.startsWith('grass') || hit.id === ID.DIRT) && hit.id !== ID.GRASS_SNOW && hit.ny === 1) {
      if (g.mode === 'adventure') return false;
      const above = w.getBlock(hit.x, hit.y + 1, hit.z);
      if (above !== 0 && !B_REPLACEABLE[above]) return false;
      if (above !== 0) w.setBlock(hit.x, hit.y + 1, hit.z, 0);
      w.setBlock(hit.x, hit.y, hit.z, ID.PATH);
      g.audio && g.audio.blockSound('dig', 'dirt', hit.x, hit.y, hit.z);
      if (g.mode !== 'creative') inv.damageSelected(1);
      return true;
    }

    // 4) Azada
    if (item.tool && item.tool.type === 'hoe') {
      if (g.mode === 'adventure') return false;
      if ((hit.id === ID.DIRT || b.key.startsWith('grass')) && hit.id !== ID.GRASS_SWAMP && hit.id !== ID.GRASS_SNOW) {
        const above = w.getBlock(hit.x, hit.y + 1, hit.z);
        if (above === 0 || B_REPLACEABLE[above]) {
          w.setBlock(hit.x, hit.y, hit.z, ID.FARMLAND);
          if (above !== 0) w.setBlock(hit.x, hit.y + 1, hit.z, 0);
          g.audio && g.audio.blockSound('dig', 'dirt', hit.x, hit.y, hit.z);
          g.particles.emit(hit.x + 0.5, hit.y + 1, hit.z + 0.5, tileAverageColor('dirt'), 6, 2);
          if (g.mode !== 'creative') inv.damageSelected(1);
          return true;
        }
      }
      return false;
    }

    // 5) Semillas / cultivos (algunas también son comida: se plantan si se apunta a tierra arada)
    if (item.plants) {
      if ((hit.id === ID.FARMLAND || hit.id === ID.FARMLAND_WET) && hit.ny === 1) {
        const above = w.getBlock(hit.x, hit.y + 1, hit.z);
        if (above === 0 || (B_REPLACEABLE[above] && !B_FLUID[above])) {
          w.setBlock(hit.x, hit.y + 1, hit.z, Blocks.id(item.plants));
          g.audio && g.audio.blockSound('place', 'plant', hit.x, hit.y, hit.z);
          if (g.mode !== 'creative') inv.consumeSelected(1);
          return true;
        }
      }
      if (item.food) g.beginEating();
      return false;
    }

    // 6) Colocar bloque o puerta
    if (item.kind === 'block' || item.kind === 'door') {
      if (g.mode === 'adventure') { if (pressed) g.ui.toast('Modo Aventura: no puedes colocar bloques'); return false; }
      const plan = this.planPlacement(hit, item);
      if (!plan) return false;
      w.setBlock(plan.x, plan.y, plan.z, plan.id);
      if (plan.door) { w.setBlock(plan.x, plan.y + 1, plan.z, plan.upperId); g.achieve && g.achieve('hogar'); }
      if (g.onWorkstationPlaced) g.onWorkstationPlaced(plan.x, plan.y, plan.z, plan.id);
      g.audio && g.audio.blockSound('place', plan.block.sound, plan.x + 0.5, plan.y + 0.5, plan.z + 0.5);
      if (g.mode !== 'creative') inv.consumeSelected(1);
      g.stats && g.stats.blocksPlaced++;
      return true;
    }
    return false;
  }

  interact(hit, b) {
    const g = this.game;
    switch (b.interact) {
      case 'workbench': g.openCrafting('workbench'); return true;
      case 'chest': g.openChest(hit.x, hit.y, hit.z); return true;
      case 'furnace': g.openFurnace(hit.x, hit.y, hit.z); return true;
      case 'bed': g.sleep(hit.x, hit.y, hit.z); return true;
      case 'berry': {
        const drops = [{ id: Items.id('berries'), n: 1 + Math.floor(Math.random() * 3) }];
        g.world.setBlock(hit.x, hit.y, hit.z, ID.BERRY_BUSH_EMPTY);
        for (const d of drops) g.dropItem({ i: d.id, n: d.n, d: 0 }, hit.x + 0.5, hit.y + 0.6, hit.z + 0.5);
        g.audio && g.audio.blockSound('break', 'plant', hit.x, hit.y, hit.z);
        return true;
      }
      case 'anvil': g.openCrafting('workbench'); return true; // el yunque repara (pantalla de la mesa)
      case 'compost': return this.useCompost(hit);
      case 'bell': if (g.ringBell) g.ringBell(hit.x, hit.y, hit.z); return true;
      case 'lectern': if (g.showVillageInfo) { g.showVillageInfo(hit.x, hit.z); return true; } return false;
      case 'alchemy': if (g.openAlchemy) { g.openAlchemy(hit.x, hit.y, hit.z); return true; } return false;
      case 'altar': return g.useAltar ? g.useAltar(hit.x, hit.y, hit.z, b) : false;
      case 'portal': return g.usePortalCore ? g.usePortalCore(hit.x, hit.y, hit.z) : false;
      case 'lever': if (g.energy) { g.energy.toggleLever(hit.x, hit.y, hit.z); g.audio && g.audio.play('click', hit.x, hit.y, hit.z); } return true;
      case 'button': if (g.energy) { g.energy.press(hit.x, hit.y, hit.z); g.audio && g.audio.play('click', hit.x, hit.y, hit.z); } return true;
      case 'dispenser': if (g.openMachine) { g.openMachine(hit.x, hit.y, hit.z, 'dispenser'); return true; } return false;
      case 'hopper': if (g.openMachine) { g.openMachine(hit.x, hit.y, hit.z, 'hopper'); return true; } return false;
      case 'door':
        if (b.sound === 'metal') { g.ui.toast('La puerta de hierro solo se abre con energía (palanca, botón, placa de presión…)'); this._denied(); return true; }
        return this.toggleDoor(hit.x, hit.y, hit.z);
      case 'gate': return this.toggleGate(hit.x, hit.y, hit.z);
      case 'trapdoor': return this.toggleTrapdoor(hit.x, hit.y, hit.z);
      default: return false;
    }
  }

  _denied() { this.game.audio && this.game.audio.play('deny'); }

  /** Compostador: los restos vegetales tienen probabilidad de convertirse en abono. */
  useCompost(hit) {
    const g = this.game, inv = g.inventory, st = inv.getSelected();
    const it = st ? Items.get(st.i) : null;
    const CHANCE = { seed_wheat: 0.3, wheat: 0.5, carrot: 0.5, potato: 0.5, tomato: 0.5, corn: 0.5, apple: 0.6, berries: 0.4, bread: 0.8, tall_grass: 0.3, fern: 0.3, reed: 0.4, hay_bale: 0.9 };
    let chance = it ? CHANCE[it.key] : undefined;
    if (it && chance === undefined) { const bb = it.block !== undefined ? BLOCKS[it.block] : null; if (bb && (bb.group === 'leaves' || bb.group === 'plant' || bb.key.startsWith('sapling'))) chance = 0.3; }
    if (!chance) { g.ui.toast('Pon restos vegetales en el compostador para hacer abono'); return true; }
    if (g.mode !== 'creative') inv.consumeSelected(1);
    g.particles.emit(hit.x + 0.5, hit.y + 1, hit.z + 0.5, 0x7a5a30, 4, 1);
    if (Math.random() < chance) {
      g.dropItem({ i: Items.id('fertilizer'), n: 1, d: 0 }, hit.x + 0.5, hit.y + 1.1, hit.z + 0.5, 0.5);
      g.audio && g.audio.play('pickup', hit.x, hit.y, hit.z);
    } else g.audio && g.audio.blockSound('place', 'plant', hit.x, hit.y, hit.z);
    return true;
  }

  /** Abre/cierra una puerta (las dos mitades). Devuelve false si ya estaba así y 'denied' si chocaría con alguien. */
  toggleDoor(x, y, z, wantOpen = null, quiet = false) {
    const w = this.game.world;
    const b0 = Blocks.get(w.getBlock(x, y, z));
    if (b0.family !== 'door') return false;
    const ly = b0.upper ? y - 1 : y;
    const lb = Blocks.get(w.getBlock(x, ly, z));
    if (lb.family !== 'door' || lb.upper) return false;
    const open = wantOpen === null ? 1 - lb.open : (wantOpen ? 1 : 0);
    if (open === lb.open) return false;
    const lower = familyState(lb.famBase, { facing: lb.facing, open }), upper = familyState(lb.famBase, { facing: lb.facing, open, upper: 1 });
    if (this.blocksEntity(x, ly, z, lower) || this.blocksEntity(x, ly + 1, z, upper)) { if (!quiet) this._denied(); return 'denied'; }
    w.setBlock(x, ly, z, lower);
    if (Blocks.get(w.getBlock(x, ly + 1, z)).family === 'door') w.setBlock(x, ly + 1, z, upper);
    this.game.audio && this.game.audio.play(lb.sound === 'metal' ? 'door_metal' : 'door', x + 0.5, ly + 1, z + 0.5);
    return true;
  }

  /** Puerta de valla: al abrir, las hojas se apartan del jugador. */
  toggleGate(x, y, z, wantOpen = null, quiet = false) {
    const w = this.game.world, p = this.game.player;
    const b = Blocks.get(w.getBlock(x, y, z));
    if (b.family !== 'gate') return false;
    const open = wantOpen === null ? 1 - b.open : (wantOpen ? 1 : 0);
    if (open === b.open) return false;
    let facing = b.facing;
    if (open && wantOpen === null) facing = (b.facing % 2 === 0) ? (p.z < z + 0.5 ? 0 : 2) : (p.x > x + 0.5 ? 1 : 3);
    const nid = familyState(b.famBase, { facing, open });
    if (this.blocksEntity(x, y, z, nid)) { if (!quiet) this._denied(); return 'denied'; }
    w.setBlock(x, y, z, nid);
    this.game.audio && this.game.audio.play('door', x + 0.5, y + 0.5, z + 0.5);
    return true;
  }

  toggleTrapdoor(x, y, z, wantOpen = null, quiet = false) {
    const w = this.game.world;
    const b = Blocks.get(w.getBlock(x, y, z));
    if (b.family !== 'trapdoor') return false;
    const open = wantOpen === null ? 1 - b.open : (wantOpen ? 1 : 0);
    if (open === b.open) return false;
    const nid = familyState(b.famBase, { facing: b.facing, open, top: b.top });
    if (this.blocksEntity(x, y, z, nid)) { if (!quiet) this._denied(); return 'denied'; }
    w.setBlock(x, y, z, nid);
    this.game.audio && this.game.audio.play('door', x + 0.5, y + 0.5, z + 0.5);
    return true;
  }

  /** Clic derecho en una valla: atar los animales que llevas con cuerda, o soltar los atados en ella. */
  useFence(hit) {
    const g = this.game, p = g.player;
    if (!g.entities) return false;
    const led = g.entities.list.filter((e) => !e.removed && e.leash === 'player' && Math.hypot(e.x - p.x, e.z - p.z) < 12);
    if (led.length) {
      for (const e of led) e.attachLeash({ x: hit.x, y: hit.y, z: hit.z });
      g.ui.toast(led.length === 1 ? `${led[0].def.name} atado a la valla` : `${led.length} animales atados a la valla`);
      g.audio && g.audio.play('leash', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      return true;
    }
    const tied = g.entities.list.filter((e) => !e.removed && e.leash && e.leash !== 'player' && e.leash.x === hit.x && e.leash.y === hit.y && e.leash.z === hit.z);
    if (tied.length) {
      for (const e of tied) e.attachLeash('player');
      g.audio && g.audio.play('leash', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      return true;
    }
    return false;
  }

  useBucket(item, hit) {
    const g = this.game, w = g.world, inv = g.inventory;
    if (!hit) return false;
    const empty = item.key === 'bucket';
    if (empty) {
      // Solo se recogen fuentes (nivel 0), no el agua o la lava que corre
      if (B_FLUID[hit.id] && B_FLUIDLVL[hit.id] === 0) {
        const isWater = B_FLUID[hit.id] === 1;
        w.setBlock(hit.x, hit.y, hit.z, 0);
        const filled = Items.id(isWater ? 'water_bucket' : 'lava_bucket');
        if (g.mode !== 'creative') {
          const cur = inv.getSelected();
          if (cur && cur.n === 1) inv.slots[inv.selected] = { i: filled, n: 1, d: 0 }; // el cubo vacío se transforma en la mano
          else {
            inv.consumeSelected(1);
            const rest = inv.add({ i: filled, n: 1, d: 0 });
            if (rest) g.dropItem(rest, g.player.x, g.player.y + 1, g.player.z);
          }
        }
        g.audio && g.audio.play('splash', hit.x, hit.y, hit.z);
        return true;
      }
      return false;
    }
    // Vaciar: colocar una fuente en la celda objetivo (sustituye agua o lava que corre)
    let cx = hit.x + hit.nx, cy = hit.y + hit.ny, cz = hit.z + hit.nz;
    // Sobre una corriente o una planta se sustituye en el sitio; sobre una fuente (de agua o de lava) se vacía al lado
    if (B_FLUID[hit.id] ? B_FLUIDLVL[hit.id] !== 0 : B_REPLACEABLE[hit.id]) { cx = hit.x; cy = hit.y; cz = hit.z; }
    const cur = w.getBlock(cx, cy, cz);
    if (!freeCell(cur)) return false;
    if (B_FLUID[cur] && B_FLUIDLVL[cur] === 0) return false; // ya es una fuente
    if (g.mode === 'adventure') return false;
    const fluidId = item.fluid === 'water' ? ID.WATER : ID.LAVA;
    if (cur !== 0 && !B_FLUID[cur]) g.breakNatural(cx, cy, cz); // hierba alta, flores... sueltan su objeto
    w.setBlock(cx, cy, cz, fluidId);
    if (g.mode !== 'creative') { inv.slots[inv.selected] = { i: Items.id('bucket'), n: 1, d: 0 }; }
    g.audio && g.audio.play('splash', cx, cy, cz);
    return true;
  }
}
