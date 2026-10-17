// Romper bloques: apuntado, progreso con grietas, herramienta, requisitos de cosecha, desgaste y drops.
import * as THREE from 'three';
import { Blocks, B_FLUID, ID } from './blocks.js';
import { Items, rollDrops } from './items.js';
import { buildCrackCanvases } from './atlas.js';
import { tileAverageColor } from './atlas.js';

/** ¿Suelta objetos este bloque con esta herramienta? (nivel de cosecha suficiente y tipo correcto) */
export function canHarvest(block, tool) {
  if (block.harvest <= 0) return true;
  return !!tool && tool.type === block.tool && tool.level >= block.harvest;
}

/**
 * Segundos para romper un bloque.
 * Mano o herramienta incorrecta: ×5 si el bloque exige herramienta; con la correcta ×1.5 y dividido por su velocidad.
 */
export function breakSeconds(block, tool, env = {}) {
  if (block.unbreakable) return Infinity;
  if (block.hardness <= 0) return 0.0;
  const ok = canHarvest(block, tool);
  const correct = !!tool && block.tool !== null && tool.type === block.tool;
  const speed = correct ? tool.speed : 1;
  let t = block.hardness * (ok ? 1.5 : 5) / speed;
  if (env.headInWater) t *= 5;
  if (env.airborne) t *= 5;
  if (env.haste) t /= env.haste; // efecto "Prisa minera"
  return Math.max(t, 0.05);
}

export class Mining {
  constructor(game) {
    this.game = game;
    this.target = null; this.progress = 0; this.needed = 1; this.cooldown = 0;
    this.swing = 0; this._warnCd = 0;
    const g = game;
    // Texturas de grietas
    this.crackTex = buildCrackCanvases().map((c) => { const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; return t; });
    this.crackMat = new THREE.MeshBasicMaterial({ map: this.crackTex[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), this.crackMat);
    this.crackMesh.visible = false; this.crackMesh.renderOrder = 8;
    g.scene.add(this.crackMesh);
    // Contorno de selección
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.75 }));
    this.outline.visible = false; this.outline.renderOrder = 9;
    g.scene.add(this.outline);
  }

  dispose() {
    this.game.scene.remove(this.crackMesh); this.game.scene.remove(this.outline);
    for (const t of this.crackTex) t.dispose();
  }

  _showOutline(hit) {
    if (!hit) { this.outline.visible = false; return; }
    const b = hit.box;
    const e = 0.004;
    this.outline.scale.set((b[3] - b[0]) + e * 2, (b[4] - b[1]) + e * 2, (b[5] - b[2]) + e * 2);
    this.outline.position.set(hit.x + (b[0] + b[3]) / 2, hit.y + (b[1] + b[4]) / 2, hit.z + (b[2] + b[5]) / 2);
    this.outline.visible = true;
  }

  reset() { this.target = null; this.progress = 0; this.crackMesh.visible = false; }

  /** ¿Se puede romper en este modo? */
  canBreak(block) {
    const g = this.game;
    if (block.unbreakable && !(g.mode === 'creative' && block.interact === 'altar')) return false;
    if (g.mode === 'adventure') return block.group === 'plant' || block.group === 'crop';
    return true;
  }

  /** Llamar cada fotograma. hit = resultado del raycast de bloques (o null). */
  update(dt, hit, holding) {
    const g = this.game;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this._warnCd -= dt;
    this._showOutline(hit);
    if (!holding || !hit) { if (this.target) this.reset(); return; }
    const block = Blocks.get(hit.id);
    if (!this.canBreak(block)) {
      if (this.target) this.reset();
      if (g.mode === 'adventure' && this._warnCd <= 0) { g.ui.toast('Modo Aventura: no puedes romper este bloque'); this._warnCd = 1.5; }
      return;
    }
    this.swing = Math.max(this.swing, 0.01);
    if (g.mode === 'creative') {
      if (this.cooldown <= 0) { this.breakBlock(hit); this.cooldown = 0.22; this.g_swing(); }
      return;
    }
    const same = this.target && this.target.x === hit.x && this.target.y === hit.y && this.target.z === hit.z && this.target.id === hit.id;
    if (!same) {
      const stack = g.inventory.getSelected();
      const item = stack ? Items.get(stack.i) : null;
      this.target = { x: hit.x, y: hit.y, z: hit.z, id: hit.id };
      this.progress = 0;
      this.needed = breakSeconds(block, item && item.tool, { headInWater: g.player.headInWater, airborne: !g.player.onGround && !g.player.flying && !g.player.inWater, haste: g.survival.effects.miningMul() });
      this.stepAcc = 0;
    }
    // Si el jugador cambia de herramienta a mitad, se recalcula manteniendo la proporción
    const stack = g.inventory.getSelected();
    const item = stack ? Items.get(stack.i) : null;
    const needNow = breakSeconds(block, item && item.tool, { headInWater: g.player.headInWater, airborne: !g.player.onGround && !g.player.flying && !g.player.inWater, haste: g.survival.effects.miningMul() });
    this.needed = needNow;
    this.progress += dt / Math.max(needNow, 0.001);
    this.stepAcc = (this.stepAcc || 0) + dt;
    if (this.stepAcc > 0.22) {
      this.stepAcc = 0;
      g.audio && g.audio.blockSound('dig', block.sound, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      g.particles.emit(hit.px ?? hit.x + 0.5, hit.py ?? hit.y + 0.5, hit.pz ?? hit.z + 0.5, tileAverageColor(block.tiles[2]), 3, 1.6, 0.6);
    }
    const stage = Math.min(9, Math.floor(this.progress * 10));
    this.crackMat.map = this.crackTex[stage];
    this.crackMat.needsUpdate = true;
    const b = hit.box;
    this.crackMesh.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    this.crackMesh.position.set(hit.x + (b[0] + b[3]) / 2, hit.y + (b[1] + b[4]) / 2, hit.z + (b[2] + b[5]) / 2);
    this.crackMesh.visible = true;
    if (this.progress >= 1) {
      this.breakBlock(hit);
      this.reset();
      this.cooldown = 0.12;
    }
  }
  g_swing() { this.game.hand && this.game.hand.swing(); }

  /** Rompe realmente el bloque: drops, desgaste, sonido y partículas. */
  breakBlock(hit) {
    const g = this.game, w = g.world;
    const id = w.getBlock(hit.x, hit.y, hit.z);
    if (!id) return;
    const block = Blocks.get(id);
    if (!this.canBreak(block)) return;
    const stack = g.inventory.getSelected();
    const item = stack ? Items.get(stack.i) : null;
    const tool = item && item.tool;
    const creative = g.mode === 'creative';
    // Puertas: se rompen las dos mitades a la vez y sueltan una sola puerta (según la mitad inferior)
    let dropSpec = block.drops;
    if (block.family === 'door') {
      const oy = block.upper ? hit.y - 1 : hit.y + 1;
      const other = Blocks.get(w.getBlock(hit.x, oy, hit.z));
      if (other.family === 'door' && other.famBase === block.famBase && other.upper !== block.upper) {
        if (block.upper) dropSpec = other.drops;
        w.setBlock(hit.x, oy, hit.z, 0);
      }
    }
    const drops = (!creative && canHarvest(block, tool)) ? rollDrops(dropSpec) : [];
    w.setBlock(hit.x, hit.y, hit.z, 0);
    const cx = hit.x + 0.5, cy = hit.y + 0.5, cz = hit.z + 0.5;
    for (const d of drops) g.dropItem({ i: d.id, n: d.n, d: 0 }, cx, cy, cz);
    g.particles.emit(cx, cy, cz, tileAverageColor(block.tiles[2]), 14, 3.2, 0.8);
    g.audio && g.audio.blockSound('break', block.sound, cx, cy, cz);
    if (!creative) {
      if (tool && block.hardness > 0) {
        const broke = g.inventory.damageSelected(block.tool === tool.type ? 1 : 2);
        if (broke) { g.ui.toast('¡Se rompió ' + item.name.toLowerCase() + '!'); g.audio && g.audio.play('toolbreak'); }
      }
      g.survival.addExhaustion(0.005);
    }
    g.stats && g.stats.blocksBroken++;
    // Martillo del Titán: rompe también el anillo 3×3 perpendicular a la cara golpeada
    if (!creative && tool && tool.area && hit.nx !== undefined) this._breakArea(hit, block, tool);
  }

  _breakArea(hit, center, tool) {
    const g = this.game, w = g.world;
    const ax = hit.nx ? 0 : 1, ay = hit.ny ? 0 : 1, az = hit.nz ? 0 : 1; // ejes del plano
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      if (!a && !b) continue;
      let dx = 0, dy = 0, dz = 0;
      if (!ax) { dy = a; dz = b; } else if (!ay) { dx = a; dz = b; } else { dx = a; dy = b; }
      void az;
      const x = hit.x + dx, y = hit.y + dy, z = hit.z + dz;
      const id = w.getBlock(x, y, z);
      if (!id) continue;
      const bl = Blocks.get(id);
      if (!this.canBreak(bl) || bl.tool !== 'pickaxe' || bl.family || bl.container || bl.interact || !canHarvest(bl, tool)) continue;
      if (bl.hardness > center.hardness * 1.6 + 0.5) continue; // no atraviesa minerales mucho más duros
      const st = g.inventory.getSelected();
      if (!st || !Items.get(st.i).tool || !Items.get(st.i).tool.area) return; // el martillo se rompió
      w.setBlock(x, y, z, 0);
      for (const d of rollDrops(bl.drops)) g.dropItem({ i: d.id, n: d.n, d: 0 }, x + 0.5, y + 0.5, z + 0.5);
      g.particles.emit(x + 0.5, y + 0.5, z + 0.5, tileAverageColor(bl.tiles[2]), 5, 2.4, 0.8);
      if (g.inventory.damageSelected(1)) { g.ui.toast('¡Se rompió el Martillo del Titán!'); g.audio && g.audio.play('toolbreak'); return; }
      g.stats && g.stats.blocksBroken++;
    }
  }
}
void B_FLUID; void ID;
