// Colocar bloques e interactuar (clic derecho): colocación precisa por cara, soportes, antorchas de pared,
// azada, semillas, cubos y bloques interactivos (cofre, mesa, horno, cama, arbusto de bayas).
import * as THREE from 'three';
import { Blocks, B_SOLID, B_REPLACEABLE, B_FLUID, B_HEIGHT, ID } from './blocks.js';
import { Items } from './items.js';
import { tileAverageColor } from './atlas.js';

const SANDY = new Set([ID.SAND, ID.RED_SAND, ID.SANDSTONE, ID.RED_SANDSTONE]);

/** ¿Puede existir el bloque `id` en (x,y,z) según lo que tiene debajo/al lado? */
export function supportOk(world, x, y, z, id) {
  const b = Blocks.get(id);
  switch (b.plantOn) {
    case 'soil': return Blocks.get(world.getBlock(x, y - 1, z)).soil;
    case 'sand': { const below = world.getBlock(x, y - 1, z); return below === ID.SAND || below === ID.RED_SAND || below === ID.CACTUS; }
    case 'dry': { const below = world.getBlock(x, y - 1, z); return SANDY.has(below) || Blocks.get(below).soil; }
    case 'any': return !!B_SOLID[world.getBlock(x, y - 1, z)];
    case 'farmland': { const below = world.getBlock(x, y - 1, z); return below === ID.FARMLAND || below === ID.FARMLAND_WET; }
    case 'torch': {
      switch (b.dir) {
        case 1: return !!B_SOLID[world.getBlock(x + 1, y, z)];
        case 2: return !!B_SOLID[world.getBlock(x - 1, y, z)];
        case 3: return !!B_SOLID[world.getBlock(x, y, z + 1)];
        case 4: return !!B_SOLID[world.getBlock(x, y, z - 1)];
        default: return !!B_SOLID[world.getBlock(x, y - 1, z)];
      }
    }
    default: return true;
  }
}

export const isContainerBlock = (id) => id === ID.CHEST || id === ID.FURNACE || id === ID.FURNACE_LIT;

export class Building {
  constructor(game) {
    this.game = game;
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.ghost = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
    this.ghost.visible = false; this.ghost.renderOrder = 9;
    game.scene.add(this.ghost);
  }
  dispose() { this.game.scene.remove(this.ghost); }

  /** Calcula dónde y qué bloque se colocaría con el objeto seleccionado (o null). */
  planPlacement(hit, item) {
    const g = this.game, w = g.world;
    if (!hit || !item || item.kind !== 'block') return null;
    let blk = Blocks.get(item.block);
    let cx = hit.x + hit.nx, cy = hit.y + hit.ny, cz = hit.z + hit.nz;
    if (B_REPLACEABLE[hit.id] && !B_FLUID[hit.id]) { cx = hit.x; cy = hit.y; cz = hit.z; } // sustituye hierba alta, flores...
    const cur = w.getBlock(cx, cy, cz);
    if (!(cur === 0 || B_REPLACEABLE[cur])) return null;
    if (cy < 1 || cy >= 126) return null;
    let id = blk.id;
    if (blk.shape === 'torch') {
      if (hit.ny === 1) id = ID.TORCH;
      else if (hit.ny === -1) return null;
      else if (hit.nx === 1) id = ID.TORCH_W;
      else if (hit.nx === -1) id = ID.TORCH_E;
      else if (hit.nz === 1) id = ID.TORCH_N;
      else id = ID.TORCH_S;
      blk = Blocks.get(id);
    }
    if (!supportOk(w, cx, cy, cz, id)) return null;
    // No dentro del jugador
    if (blk.solid) {
      const p = g.player, hw = p.w / 2;
      const hgt = B_HEIGHT[id] || 1;
      if (p.x + hw > cx && p.x - hw < cx + 1 && p.y + p.h > cy && p.y < cy + hgt && p.z + hw > cz && p.z - hw < cz + 1) return null;
    }
    return { x: cx, y: cy, z: cz, id, block: blk };
  }

  /** Actualiza la vista previa. */
  updatePreview(hit, stack) {
    const item = stack ? Items.get(stack.i) : null;
    const plan = (this.game.mode !== 'adventure') ? this.planPlacement(hit, item) : null;
    if (!plan) { this.ghost.visible = false; return; }
    this.ghost.position.set(plan.x + 0.5, plan.y + (B_HEIGHT[plan.id] || 1) / 2, plan.z + 0.5);
    this.ghost.scale.set(1.01, (B_HEIGHT[plan.id] || 1) + 0.01, 1.01);
    this.ghost.visible = true;
  }

  /**
   * Acción de clic derecho. Devuelve true si hizo algo (para animar la mano).
   * hit = bloque apuntado; fluidHit = bloque apuntado incluyendo fluidos (para cubos).
   */
  use(hit, fluidHit, crouching) {
    const g = this.game, w = g.world, inv = g.inventory;
    const stack = inv.getSelected();
    const item = stack ? Items.get(stack.i) : null;

    // 1) Bloques interactivos (si no se agacha con algo en la mano)
    if (hit) {
      const b = Blocks.get(hit.id);
      if (b.interact && !(crouching && item)) { return this.interact(hit, b); }
    }
    if (!item) return false;

    // 2) Cubos
    if (item.kind === 'bucket') return this.useBucket(item, fluidHit || hit);

    // 3) Comida: se come manteniendo pulsado (lo gestiona el juego)
    if (item.food) { g.beginEating(); return false; }

    if (!hit) return false;
    const b = Blocks.get(hit.id);

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

    // 5) Semillas / cultivos
    if (item.plants) {
      if (g.mode === 'adventure') { /* se permite plantar en Aventura */ }
      if ((hit.id === ID.FARMLAND || hit.id === ID.FARMLAND_WET) && hit.ny === 1) {
        const above = w.getBlock(hit.x, hit.y + 1, hit.z);
        if (above === 0 || B_REPLACEABLE[above]) {
          w.setBlock(hit.x, hit.y + 1, hit.z, Blocks.id(item.plants));
          g.audio && g.audio.blockSound('place', 'plant', hit.x, hit.y, hit.z);
          if (g.mode !== 'creative') inv.consumeSelected(1);
          return true;
        }
      }
      return false;
    }

    // 6) Colocar bloque
    if (item.kind === 'block') {
      if (g.mode === 'adventure') { g.ui.toast('Modo Aventura: no puedes colocar bloques'); return false; }
      const plan = this.planPlacement(hit, item);
      if (!plan) return false;
      w.setBlock(plan.x, plan.y, plan.z, plan.id);
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
        if (g.mode === 'adventure' || true) {
          const drops = [{ id: Items.id('berries'), n: 1 + Math.floor(Math.random() * 3) }];
          g.world.setBlock(hit.x, hit.y, hit.z, ID.BERRY_BUSH_EMPTY);
          for (const d of drops) g.dropItem({ i: d.id, n: d.n, d: 0 }, hit.x + 0.5, hit.y + 0.6, hit.z + 0.5);
          g.audio && g.audio.blockSound('break', 'plant', hit.x, hit.y, hit.z);
          return true;
        }
        return false;
      }
      default: return false;
    }
  }

  useBucket(item, hit) {
    const g = this.game, w = g.world, inv = g.inventory;
    if (!hit) return false;
    const empty = item.key === 'bucket';
    if (empty) {
      if (hit.id === ID.WATER || hit.id === ID.LAVA) {
        w.setBlock(hit.x, hit.y, hit.z, 0);
        const filled = Items.id(hit.id === ID.WATER ? 'water_bucket' : 'lava_bucket');
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
    // Vaciar: colocar fluido en la celda objetivo
    let cx = hit.x + hit.nx, cy = hit.y + hit.ny, cz = hit.z + hit.nz;
    if (B_FLUID[hit.id]) { cx = hit.x; cy = hit.y; cz = hit.z; }
    else if (B_REPLACEABLE[hit.id]) { cx = hit.x; cy = hit.y; cz = hit.z; }
    const cur = w.getBlock(cx, cy, cz);
    if (!(cur === 0 || B_REPLACEABLE[cur])) return false;
    if (g.mode === 'adventure') return false;
    const fluidId = item.fluid === 'water' ? ID.WATER : ID.LAVA;
    w.setBlock(cx, cy, cz, fluidId);
    if (g.mode !== 'creative') { inv.slots[inv.selected] = { i: Items.id('bucket'), n: 1, d: 0 }; }
    g.audio && g.audio.play('splash', cx, cy, cz);
    return true;
  }
}
