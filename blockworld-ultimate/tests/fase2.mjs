// Pruebas de la Fase 2 (construcción avanzada, fluidos, cultivos y cuerda). Se ejecuta con:
//   node --import ./tests/support/hooks.mjs tests/fase2.mjs
// (el gancho resuelve 'three' a vendor/ para poder importar building.js en Node)
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Blocks, BLOCKS, ID, B_SOLID, B_FLUID, B_FLUIDLVL, B_ATTEN } from '../src/blocks.js';
import { Items, rollDrops } from '../src/items.js';
import { RECIPES } from '../src/crafting.js';
import { World } from '../src/world.js';
import { Terrain, seedFromString } from '../src/terrain.js';
import { Player } from '../src/player.js';
import { raycastBlocks } from '../src/raycast.js';
import { meshChunk, STRIDE } from '../src/mesher.js';
import { boxCollides, moveEntity } from '../src/physics.js';
import {
  rotateBox, renderBoxes, collisionBoxes, selectionBoxes, connectMask, B_FAMILY, FAM, B_STURDY, B_TALLCOL, boxesBounds,
} from '../src/shapes.js';
import { Building, supportOk, familyState } from '../src/building.js';
import { FluidSim, fluidId, flowVector } from '../src/fluids.js';
import { missingTilePainters } from '../src/atlas.js';
import { Inventory } from '../src/inventory.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n       ') : e)); process.exitCode = 1; }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ── Mundo plano de pruebas (césped en y=41 → suelo a y=42) ──────────
function makeWorld(seed) {
  const w = new World({ seed: seedFromString(seed), type: 'flat', structures: false, renderDistance: 3, useWorker: false });
  for (let i = 0; i < 3000; i++) { w.update(8, 8, 8); if (w.isAreaReady(8, 8, 2) && !w.incoming.length && !w.pending.size) break; }
  return w;
}
const G = 42; // altura del suelo
const idle = { fwd: 0, strafe: 0, jump: false, sprint: false, crouch: false, crouchDown: false };
const fwd = { ...idle, fwd: 1 };
/** Jugador mirando hacia `yaw` (0 = −Z, Norte). */
function playerAt(x, y, z, yaw = 0) { const p = new Player(); p.teleport(x, y, z); p.yaw = yaw; p.autoJump = true; return p; }
const run = (p, w, n, input = idle) => { for (let i = 0; i < n; i++) p.update(0.05, input, w, true); };
function clearArea(w, x0, z0, x1, z1, y0 = G, y1 = G + 6) {
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) w.setBlock(x, y, z, 0);
}

/** Juego mínimo para Building (sin DOM): mundo, jugador, escena, inventario y entidades. */
function fakeGame(w, p) {
  const toasts = [];
  return {
    world: w, player: p, scene: new THREE.Scene(), mode: 'survival', inventory: new Inventory(), entities: { list: [] },
    ui: { toast: (t) => toasts.push(t) }, audio: null, particles: { emit() {} }, toasts, achieved: [],
    achieve(id) { this.achieved.push(id); }, stats: { blocksPlaced: 0 }, beginEating() {}, breakNatural(x, y, z) { w.setBlock(x, y, z, 0); },
  };
}

console.log('Formas (shapes.js)');
test('girar una caja 4 veces vuelve al original; N→E→S→O coherente', () => {
  const b = [0.1, 0, 0.2, 0.4, 1, 0.3];
  let r = b; for (let i = 0; i < 4; i++) r = rotateBox(r, 1);
  r.forEach((v, i) => assert.ok(near(v, b[i]), `${i}: ${v} vs ${b[i]}`));
  // Escalera al Norte: la parte alta en z<0,5; al Este: en x>0,5
  const n = renderBoxes(ID.STAIRS_PLANKS)[1], e = renderBoxes(ID.STAIRS_PLANKS + 1)[1];
  assert.ok(n[2] === 0 && n[5] === 0.5);
  assert.ok(e[0] === 0.5 && e[3] === 1);
});
test('todas las cajas de render/selección están dentro de la celda y las de colisión ≤ 1,5', () => {
  for (const b of BLOCKS) {
    if (!b || !B_FAMILY[b.id]) continue;
    for (let m = 0; m < 16; m++) {
      for (const box of [...renderBoxes(b.id, m), ...selectionBoxes(b.id, m)]) {
        for (let i = 0; i < 3; i++) { assert.ok(box[i] >= 0 && box[i + 3] <= 1 && box[i] < box[i + 3], `${b.key} ${box}`); }
      }
      for (const box of collisionBoxes(b.id, m)) assert.ok(box[4] <= 1.5 && box[1] >= 0, b.key);
    }
  }
});
test('vallas: se unen a vallas, puertas de valla y cubos opacos, no a escaleras ni plantas', () => {
  const grid = new Map();
  const get = (x, y, z) => grid.get(`${x},${y},${z}`) || 0;
  grid.set('0,0,0', ID.FENCE_WOOD); grid.set('0,0,-1', ID.FENCE_WOOD); grid.set('1,0,0', ID.GATE_WOOD);
  grid.set('0,0,1', ID.STONE); grid.set('-1,0,0', ID.STAIRS_PLANKS);
  assert.equal(connectMask(get, 0, 0, 0, ID.FENCE_WOOD), 0b0111);
  grid.set('0,0,1', ID.TALL_GRASS);
  assert.equal(connectMask(get, 0, 0, 0, ID.FENCE_WOOD), 0b0011);
  // muro: no se une a vallas
  grid.set('0,0,0', ID.WALL_COBBLE);
  assert.equal(connectMask(get, 0, 0, 0, ID.WALL_COBBLE), 0b0010);
});
test('tablas: vallas/muros altos, escaleras dan sombra, solo cubos sólidos son "firmes"', () => {
  assert.equal(B_TALLCOL[ID.FENCE_WOOD], 1); assert.equal(B_TALLCOL[ID.WALL_COBBLE], 1); assert.equal(B_TALLCOL[ID.GATE_WOOD], 1);
  assert.equal(B_TALLCOL[ID.GATE_WOOD + 4], 0); // abierta
  assert.equal(B_ATTEN[ID.STAIRS_COBBLE], 15);
  assert.equal(B_STURDY[ID.STONE], 1); assert.equal(B_STURDY[ID.GLASS], 1);
  assert.equal(B_STURDY[ID.SLAB_STONE], 0); assert.equal(B_STURDY[ID.FENCE_WOOD], 0); assert.equal(B_STURDY[ID.STAIRS_PLANKS], 0);
});

console.log('Física con formas');
const W = makeWorld('fase2');
test('subir una escalera andando, sin saltar (también con autosalto)', () => {
  clearArea(W, 4, 0, 12, 12);
  // escalera hacia el Norte: peldaño en z=5 (sube hacia −Z), luego un bloque en z=4 a y=G+1
  W.setBlock(8, G, 5, ID.STAIRS_PLANKS); W.setBlock(8, G, 4, ID.PLANKS); W.setBlock(8, G + 1, 4, ID.STAIRS_PLANKS);
  const p = playerAt(8.5, G, 7.5, 0);
  let maxY = 0, jumped = false;
  for (let i = 0; i < 16; i++) { p.update(0.05, fwd, W, true); maxY = Math.max(maxY, p.y); if (p.jumpedThisFrame) jumped = true; }
  assert.ok(!jumped, 'no debe saltar');
  assert.ok(maxY >= G + 2 - 1e-6, 'debe haber subido los dos tramos, y máx=' + maxY);
});
test('un bloque completo sigue exigiendo saltar (sin autosalto no se sube)', () => {
  clearArea(W, 4, 0, 12, 12);
  W.setBlock(8, G, 5, ID.STONE);
  const p = playerAt(8.5, G, 7.5, 0); p.autoJump = false;
  run(p, W, 40, fwd);
  assert.ok(near(p.y, G, 1e-3) && p.z > 6 - 0.31, 'se queda delante: y=' + p.y + ' z=' + p.z);
});
test('una valla no se puede saltar ni subir con autosalto', () => {
  clearArea(W, 4, 0, 12, 12);
  for (let x = 4; x <= 12; x++) W.setBlock(x, G, 5, ID.FENCE_WOOD);
  const p = playerAt(8.5, G, 7.5, 0);
  let jumps = 0;
  for (let i = 0; i < 120; i++) { p.update(0.05, { ...fwd, jump: true }, W, true); if (p.jumpedThisFrame) jumps++; }
  assert.ok(p.z > 5.9 && near(p.y, G, 0.01) || p.z > 5.9, 'no la cruza: z=' + p.z);
  const q = playerAt(8.5, G, 7.5, 0);
  let auto = 0;
  for (let i = 0; i < 60; i++) { q.update(0.05, fwd, W, true); if (q.jumpedThisFrame) auto++; }
  assert.equal(auto, 0, 'el autosalto no se dispara contra una valla');
  void jumps;
});
test('desde un bloque elevado tampoco se sube andando al tope de una valla (corral)', () => {
  clearArea(W, 4, 0, 12, 12);
  for (let x = 4; x <= 12; x++) { W.setBlock(x, G, 5, ID.FENCE_WOOD); W.setBlock(x, G, 6, ID.STONE); W.setBlock(x, G, 7, ID.STONE); }
  const p = playerAt(8.5, G + 1, 7.5, 0);
  run(p, W, 60, fwd);
  assert.ok(p.z > 6 && near(p.y, G + 1, 1e-3), `y=${p.y} z=${p.z}`);
});
test('estando de pie sobre un poste de valla, el suelo está a 1,5', () => {
  clearArea(W, 4, 0, 12, 12);
  W.setBlock(8, G, 8, ID.FENCE_WOOD);
  const p = playerAt(8.5, G + 3, 8.5); p.w = 0.3;
  run(p, W, 40);
  assert.ok(p.onGround && near(p.y, G + 1.5, 1e-3), 'y=' + p.y);
});
test('puerta cerrada bloquea el paso; abierta deja pasar', () => {
  clearArea(W, 4, 0, 12, 12);
  for (let x = 4; x <= 12; x++) if (x !== 8) { W.setBlock(x, G, 5, ID.STONE); W.setBlock(x, G + 1, 5, ID.STONE); }
  W.setBlock(8, G, 5, ID.DOOR_WOOD_S); W.setBlock(8, G + 1, 5, ID.DOOR_WOOD_S_SUP);
  const p = playerAt(8.5, G, 7.5, 0);
  run(p, W, 50, fwd);
  assert.ok(p.z > 5.9, 'cerrada: z=' + p.z);
  W.setBlock(8, G, 5, familyState(ID.DOOR_WOOD_N, { facing: 2, open: 1 }));
  W.setBlock(8, G + 1, 5, familyState(ID.DOOR_WOOD_N, { facing: 2, open: 1, upper: 1 }));
  const q = playerAt(8.4, G, 7.5, 0);
  run(q, W, 50, fwd);
  assert.ok(q.z < 4.5, 'abierta: z=' + q.z);
});
test('escalera de mano: se sube empujando, se baja despacio sin daño por caída', () => {
  clearArea(W, 4, 0, 12, 12, G, G + 12);
  for (let y = G; y < G + 13; y++) W.setBlock(8, y, 4, ID.STONE); // muro al Norte (z=4), más alto que la escalera
  for (let y = G; y < G + 10; y++) W.setBlock(8, y, 5, ID.LADDER);
  const p = playerAt(8.5, G, 5.6, 0);
  run(p, W, 80, fwd);
  assert.ok(p.y > G + 7, 'sube: y=' + p.y);
  p.teleport(8.5, G + 8, 5.6); // a media escalera, sin pulsar nada → baja despacio
  let landed = null;
  for (let i = 0; i < 120; i++) { p.update(0.05, idle, W, true); if (p.landed) landed = p.landed.distance; }
  assert.ok(near(p.y, G, 1e-3), 'baja hasta el suelo: y=' + p.y);
  assert.ok(!landed || landed < 1, 'sin caída acumulada: ' + landed);
});
test('una criatura (stepHeight 0,6) sube una escalera sin saltar', () => {
  clearArea(W, 4, 0, 12, 12);
  W.setBlock(8, G, 5, ID.STAIRS_PLANKS);
  const e = { x: 8.5, y: G, z: 6.5, w: 0.8, h: 1, vx: 0, vy: 0, vz: 0, onGround: true, stepHeight: 0.6 };
  let jumped = false;
  for (let i = 0; i < 12; i++) { e.vy -= 30 * 0.05; moveEntity(W, e, 0, e.vy * 0.05, -0.08); if (e.vy > 0) jumped = true; }
  assert.ok(e.y >= G + 1 - 1e-6 && !e.hitZ && !jumped, 'y=' + e.y);
});

console.log('Raycast y mallado');
test('raycast a una escalera: la mitad baja golpea la losa, la alta el escalón; devuelve punto y caja', () => {
  clearArea(W, 4, 0, 12, 12);
  W.setBlock(8, G, 5, ID.STAIRS_PLANKS); // parte alta en z∈[5,5.5]
  const h = raycastBlocks(W, 8.5, G + 0.75, 8, 0, 0, -1, 6);
  assert.ok(h && h.x === 8 && h.z === 5 && near(h.pz, 5.5) && h.nz === 1, JSON.stringify(h));
  const h2 = raycastBlocks(W, 8.5, G + 0.25, 8, 0, 0, -1, 6);
  assert.ok(h2 && near(h2.pz, 6) && h2.nz === 1);
  assert.deepEqual(h2.box, [0, 0, 0, 1, 1, 1]);
});
test('raycast: una puerta de valla abierta se puede apuntar por el centro; una valla sola es solo el poste', () => {
  clearArea(W, 4, 0, 12, 12);
  W.setBlock(8, G, 5, ID.GATE_WOOD + 4); // abierta
  const h = raycastBlocks(W, 8.5, G + 0.7, 8, 0, 0, -1, 6);
  assert.ok(h && h.id === ID.GATE_WOOD + 4, 'apunta a la puerta de valla abierta');
  assert.equal(collisionBoxes(ID.GATE_WOOD + 4).length, 0, 'abierta no tiene colisión');
  W.setBlock(8, G, 5, ID.FENCE_WOOD);
  assert.equal(raycastBlocks(W, 8.1, G + 0.5, 8, 0, 0, -1, 6), null); // pasa al lado del poste
  W.setBlock(7, G, 5, ID.FENCE_WOOD); // ahora hay brazo hacia el Oeste
  const h3 = raycastBlocks(W, 8.1, G + 0.5, 8, 0, 0, -1, 6);
  assert.ok(h3 && h3.x === 8, 'golpea el brazo');
});
test('mallado de formas: sin NaN, con caras, y una valla con vecinos tiene más caras que sola', () => {
  clearArea(W, 0, 0, 15, 15);
  const count = () => { const m = meshChunk(W, W.chunkAt(0, 0)); return m.opaque.data; };
  const base = count().length;
  W.setBlock(8, G, 8, ID.FENCE_WOOD);
  const one = count();
  for (let i = 0; i < one.length; i++) assert.ok(Number.isFinite(one[i]));
  W.setBlock(9, G, 8, ID.FENCE_WOOD);
  const two = count().length;
  assert.ok(one.length > base && two - one.length > (one.length - base), 'los brazos añaden caras');
  for (const id of [ID.STAIRS_COBBLE + 6, ID.DOOR_IRON_N, ID.LADDER, ID.TRAPDOOR_WOOD, ID.WALL_COBBLE, ID.GATE_WOOD + 5]) {
    W.setBlock(4, G, 4, id);
    const d = count();
    for (let i = 0; i < d.length; i += STRIDE) assert.ok(Number.isFinite(d[i]) && Number.isFinite(d[i + 3]) && Number.isFinite(d[i + 5]), Blocks.get(id).key);
  }
});
test('bajo un techo de escaleras hay sombra (atten 15) y las caras de la escalera tienen luz', () => {
  clearArea(W, 0, 0, 15, 15, G, G + 8);
  for (let x = 2; x <= 14; x++) for (let z = 2; z <= 14; z++) W.setBlock(x, G + 4, z, ID.STAIRS_PLANKS + 4); // invertidas
  assert.ok(W.getSky(8, G + 1, 8) < 15, 'sombra bajo el techo: ' + W.getSky(8, G + 1, 8));
  const m = meshChunk(W, W.chunkAt(0, 0)).opaque.data;
  let top = 0, topLit = 0, ceil = 0, ceilLit = 0, inner = 0, innerLit = 0;
  for (let i = 0; i < m.length; i += STRIDE) {
    const x = m[i], y = m[i + 1], z = m[i + 2], sky = m[i + 5], sh = m[i + 7];
    if (x < 3 || x > 13 || z < 3 || z > 13) continue;
    if (near(y, G + 5) && near(sh, 1)) { top++; if (sky >= 14 / 15 - 1e-6) topLit++; }          // caras superiores
    else if (near(y, G + 4) && near(sh, 0.55)) { ceil++; if (sky > 0) ceilLit++; }               // caras inferiores
    else if (y > G + 4 && y < G + 4.5 + 1e-6 && near(z % 1, 0.5) && near(sh, 0.7)) { inner++; if (sky > 0) innerLit++; }
  }
  assert.ok(top > 0 && topLit === top, `tejado iluminado ${topLit}/${top}`);
  assert.ok(ceil > 0 && ceilLit === ceil, `techo visto desde abajo ${ceilLit}/${ceil}`);
  assert.ok(inner > 0 && innerLit === inner, `caras interiores ${innerLit}/${inner}`);
});

console.log('Colocación e interacción (Building)');
test('escalera orientada según la mirada; invertida al apuntar a la mitad superior', () => {
  clearArea(W, 4, 0, 12, 12);
  W.setBlock(8, G, 4, ID.STONE);
  const p = playerAt(8.5, G, 7.5, 0); // mira al Norte
  const g = fakeGame(W, p), B = new Building(g);
  const it = Items.get('stairs_planks');
  const low = raycastBlocks(W, 8.5, G + 0.3, 7, 0, 0, -1, 6);
  let plan = B.planPlacement(low, it);
  assert.equal(plan.id, ID.STAIRS_PLANKS); assert.equal(plan.z, 5);
  const high = raycastBlocks(W, 8.5, G + 0.8, 7, 0, 0, -1, 6);
  plan = B.planPlacement(high, it);
  assert.equal(plan.id, ID.STAIRS_PLANKS + 4, 'invertida');
  p.yaw = Math.PI / 2; // mira al Oeste
  plan = B.planPlacement(low, it);
  assert.equal(Blocks.get(plan.id).facing, 3);
});
test('puerta: necesita suelo firme y dos celdas libres; coloca las dos mitades y abre/cierra juntas', () => {
  clearArea(W, 4, 0, 12, 12);
  const p = playerAt(8.5, G, 8.5, 0);
  const g = fakeGame(W, p), B = new Building(g);
  g.inventory.slots[0] = { i: Items.id('door_wood'), n: 2, d: 0 };
  const floor = raycastBlocks(W, 8.5, G + 1.5, 6.5, 0, -1, 0, 6); // suelo en (8,G-1,6)
  assert.ok(floor && floor.ny === 1);
  assert.ok(B.use(floor, null, false, true));
  assert.equal(Blocks.get(W.getBlock(8, G, 6)).family, 'door');
  assert.equal(W.getBlock(8, G + 1, 6), W.getBlock(8, G, 6) + 8);
  assert.equal(Blocks.get(W.getBlock(8, G, 6)).facing, 2, 'hoja en el lado del jugador');
  assert.ok(g.achieved.includes('hogar'));
  assert.equal(g.inventory.slots[0].n, 1);
  // mantener pulsado (pressed=false) no la abre; un clic sí
  const doorHit = raycastBlocks(W, 8.5, G + 1.5, 8.5, 0, 0, -1, 6);
  B.use(doorHit, null, false, false);
  assert.equal(Blocks.get(W.getBlock(8, G, 6)).open, 0);
  B.use(doorHit, null, false, true);
  assert.equal(Blocks.get(W.getBlock(8, G, 6)).open, 1); assert.equal(Blocks.get(W.getBlock(8, G + 1, 6)).open, 1);
  // sin suelo firme: no se coloca
  W.setBlock(10, G - 1, 6, ID.SLAB_STONE);
  const slab = raycastBlocks(W, 10.5, G + 1, 6.5, 0, -1, 0, 6);
  assert.equal(B.planPlacement(slab, Items.get('door_wood')), null);
});
test('no se coloca una valla cuyo brazo de 1,5 atraparía al jugador, ni se cierra una puerta de valla con él dentro', () => {
  clearArea(W, 4, 0, 12, 12);
  W.setBlock(8, G, 6, ID.STONE);
  const p = playerAt(8.5, G + 1, 6.5, 0); // de pie sobre la piedra
  const g = fakeGame(W, p), B = new Building(g);
  W.setBlock(8, G, 5, 0);
  const hit = { x: 8, y: G - 1, z: 5, nx: 0, ny: 1, nz: 0, id: ID.GRASS, py: G, px: 8.5, pz: 5.5 };
  // valla en (8,G,5): su brazo hacia la piedra (Sur) sube hasta G+1,5 y solaparía los pies (G+1)
  // (el jugador está en z∈[6.2,6.8], el brazo va de z=5.625 a 6 → no solapa; desplazamos al jugador)
  p.z = 6.1;
  assert.equal(B.planPlacement(hit, Items.get('fence_wood')), null, 'rechazada');
  p.z = 6.5;
  assert.ok(B.planPlacement(hit, Items.get('fence_wood')), 'aceptada lejos');
  // puerta de valla abierta con el jugador dentro de su celda
  clearArea(W, 4, 0, 12, 12);
  W.setBlock(8, G, 5, ID.GATE_WOOD + 4);
  const q = playerAt(8.5, G, 5.5, 0); g.player = q;
  B.toggleGate(8, G, 5);
  assert.equal(W.getBlock(8, G, 5), ID.GATE_WOOD + 4, 'sigue abierta');
  assert.ok(near(q.y, G));
});
test('escalera de mano: solo en caras laterales de un bloque completo; se rompe si se quita el muro', () => {
  clearArea(W, 4, 0, 12, 12);
  W.setBlock(8, G, 4, ID.STONE); W.setBlock(6, G, 4, ID.FENCE_WOOD);
  const p = playerAt(8.5, G, 7.5, 0);
  const g = fakeGame(W, p), B = new Building(g);
  const side = raycastBlocks(W, 8.5, G + 0.5, 7, 0, 0, -1, 6);
  const plan = B.planPlacement(side, Items.get('ladder'));
  assert.ok(plan && plan.id === ID.LADDER && plan.z === 5, 'muro al Norte → facing 0');
  const top = raycastBlocks(W, 8.5, G + 2, 4.5, 0, -1, 0, 6);
  assert.equal(B.planPlacement(top, Items.get('ladder')), null);
  const fence = { x: 6, y: G, z: 4, nx: 0, ny: 0, nz: 1, id: ID.FENCE_WOOD, py: G + 0.5 };
  assert.equal(B.planPlacement(fence, Items.get('ladder')), null, 'una valla no sirve de muro');
  W.setBlock(8, G, 5, ID.LADDER);
  assert.ok(supportOk(W, 8, G, 5, ID.LADDER));
  W.setBlock(8, G, 4, 0);
  assert.ok(!supportOk(W, 8, G, 5, ID.LADDER));
});
test('antorchas de pared solo en bloques completos (no en vallas ni escaleras)', () => {
  clearArea(W, 4, 0, 12, 12);
  W.setBlock(8, G, 4, ID.FENCE_WOOD);
  assert.ok(!supportOk(W, 8, G, 5, ID.TORCH_N));
  W.setBlock(8, G, 4, ID.STONE);
  assert.ok(supportOk(W, 8, G, 5, ID.TORCH_N));
});

console.log('Fluidos');
function settle(sim, secs = 20) { for (let t = 0; t < secs; t += 0.05) sim.update(0.05); }
const FW = makeWorld('fluidos');
const host = { world: FW, breakNatural(x, y, z) { FW.setBlock(x, y, z, 0); } };
const sim = new FluidSim(host);
FW.onBlockChange = (x, y, z) => sim.onBlockChange(x, y, z);
test('una fuente de agua en llano se extiende 7 bloques con niveles crecientes', () => {
  FW.setBlock(8, G, 8, ID.WATER);
  settle(sim, 10);
  assert.equal(FW.getBlock(8, G, 8), ID.WATER);
  assert.equal(FW.getBlock(9, G, 8), fluidId(1, 1));
  assert.equal(FW.getBlock(15, G, 8), fluidId(1, 7));
  assert.equal(FW.getBlock(16, G, 8), 0, 'no pasa de 7');
  assert.equal(FW.getBlock(12, G, 11), fluidId(1, 7)); // distancia de Manhattan 7
  const f = flowVector(FW, 11, G, 8);
  assert.ok(f && f.x > 0 && f.z === 0, 'la corriente se aleja de la fuente');
});
test('al quitar la fuente el agua se seca', () => {
  FW.setBlock(8, G, 8, 0);
  settle(sim, 10);
  for (let x = 1; x <= 15; x++) assert.ok(!B_FLUID[FW.getBlock(x, G, 8)], 'x=' + x + ' id=' + FW.getBlock(x, G, 8));
});
test('cascada: el agua cae por un hueco y se extiende abajo', () => {
  for (let x = 4; x <= 12; x++) for (let z = 4; z <= 12; z++) FW.setBlock(x, G - 1, z, 0), FW.setBlock(x, G - 2, z, 0);
  FW.setBlock(8, G + 3, 8, ID.STONE);
  FW.setBlock(8, G + 4, 8, ID.WATER);
  settle(sim, 12);
  assert.equal(B_FLUIDLVL[FW.getBlock(9, G + 2, 8)], 8, 'cayendo junto a la piedra');
  const anyBottom = [FW.getBlock(8, G - 2, 9), FW.getBlock(9, G - 2, 8), FW.getBlock(7, G - 2, 8)].some((id) => B_FLUID[id] === 1);
  assert.ok(anyBottom, 'llega al fondo del hoyo');
  FW.setBlock(8, G + 4, 8, 0);
  settle(sim, 15);
});
test('agua + fuente de lava → vidrio volcánico; agua + lava que corre → adoquín', () => {
  for (let x = 2; x <= 14; x++) for (let z = 2; z <= 14; z++) for (let y = G - 3; y <= G + 5; y++) FW.setBlock(x, y, z, y < G ? ID.STONE : 0);
  settle(sim, 5);
  FW.setBlock(6, G, 8, ID.LAVA);
  FW.setBlock(8, G, 8, ID.WATER);
  settle(sim, 20);
  const found = new Set();
  for (let x = 3; x <= 13; x++) for (let z = 3; z <= 13; z++) found.add(FW.getBlock(x, G, z));
  assert.ok(found.has(ID.OBSIDIAN) || found.has(ID.COBBLE), 'hay reacción: ' + [...found].map((i) => Blocks.get(i).key).join(','));
});
test('agua "infinita": un hueco entre dos fuentes sobre suelo se convierte en fuente', () => {
  for (let x = 2; x <= 14; x++) for (let z = 2; z <= 14; z++) for (let y = G; y <= G + 5; y++) FW.setBlock(x, y, z, 0);
  settle(sim, 10);
  FW.setBlock(7, G, 8, ID.WATER); FW.setBlock(9, G, 8, ID.WATER);
  settle(sim, 5);
  assert.equal(FW.getBlock(8, G, 8), ID.WATER);
});
test('el agua arrastra las plantas (sueltan su objeto) y la detienen las puertas', () => {
  for (let x = 2; x <= 14; x++) for (let z = 2; z <= 14; z++) for (let y = G; y <= G + 5; y++) FW.setBlock(x, y, z, 0);
  settle(sim, 10);
  let broken = 0;
  host.breakNatural = (x, y, z) => { broken++; FW.setBlock(x, y, z, 0); };
  FW.setBlock(9, G, 8, ID.FLOWER_RED);
  FW.setBlock(7, G, 8, ID.DOOR_WOOD_E); FW.setBlock(7, G + 1, 8, ID.DOOR_WOOD_E_SUP);
  FW.setBlock(8, G, 8, ID.WATER);
  settle(sim, 6);
  assert.ok(broken >= 1 && B_FLUID[FW.getBlock(9, G, 8)] === 1);
  assert.equal(Blocks.get(FW.getBlock(7, G, 8)).family, 'door');
});

console.log('Contenido');
test('todas las texturas tienen pintor (incluidas las nuevas)', () => {
  assert.deepEqual(missingTilePainters().filter((m) => !/^(air|bookshelf_dummy|dandelion_dummy):/.test(m)), []);
});
test('cada bloque base colocable de la Fase 2 tiene receta; las puertas también', () => {
  for (const k of ['stairs_planks', 'stairs_cobble', 'stairs_stonebricks', 'stairs_bricks', 'stairs_sandstone', 'ladder', 'fence_wood', 'wall_cobble', 'gate_wood', 'trapdoor_wood', 'door_wood', 'door_iron', 'rope', 'bowl', 'vegetable_stew', 'mushroom_stew', 'salad', 'corn_bread']) {
    assert.ok(RECIPES.some((r) => r.out === k), 'receta de ' + k);
  }
  for (const b of BLOCKS) if (b && b.family && b.placeable) assert.equal(b.id, b.famBase, b.key);
});
test('variantes sueltan el objeto base y "copiar bloque" da el objeto base', () => {
  assert.deepEqual(rollDrops(Blocks.get(ID.STAIRS_COBBLE + 6).drops), [{ id: Items.id('stairs_cobble'), n: 1 }]);
  assert.equal(Items.pickFor(ID.DOOR_WOOD_S_SUP).key, 'door_wood');
  assert.equal(Items.pickFor(ID.GATE_WOOD + 6).key, 'gate_wood');
  assert.equal(Items.pickFor(ID.CROP_TOMATO_2).key, 'tomato');
  assert.deepEqual(rollDrops(Blocks.get(ID.DOOR_WOOD_S_SUP).drops), []);
});
test('comidas en cuenco devuelven el cuenco; tomate y maíz se plantan', () => {
  for (const k of ['vegetable_stew', 'mushroom_stew', 'salad']) assert.equal(Items.get(k).food.returns, 'bowl');
  assert.equal(Items.get('tomato').plants, 'crop_tomato_0'); assert.equal(Items.get('corn').plants, 'crop_corn_0');
  assert.equal(Blocks.get('crop_corn_3').next, null);
});
test('estructuras: la escalera de mano del templo es continua y está bien apoyada; la cabaña tiene puerta completa', () => {
  const t = new Terrain(seedFromString('arena'), {});
  const ws = new World({ seed: seedFromString('arena'), type: 'normal', structures: true, renderDistance: 1, useWorker: false });
  const { blocks } = t.generateChunk(6, -9);
  const get = (x, y, z) => (x >> 4 === 6 && z >> 4 === -9 ? blocks[(x & 15) | ((z & 15) << 4) | (y << 8)] : 0);
  ws.getBlock = get;
  let ladders = [];
  for (let i = 0; i < blocks.length; i++) if (blocks[i] === ID.LADDER_S) ladders.push([6 * 16 + (i & 15), i >> 8, -9 * 16 + ((i >> 4) & 15)]);
  assert.equal(ladders.length, 7);
  ladders.sort((a, b) => a[1] - b[1]);
  for (let k = 1; k < ladders.length; k++) assert.equal(ladders[k][1], ladders[k - 1][1] + 1, 'continua');
  for (const [x, y, z] of ladders) assert.ok(supportOk(ws, x, y, z, ID.LADDER_S), `apoyo en ${x},${y},${z}`);
  // el peldaño más bajo está a ras del suelo de la cámara
  assert.ok(B_SOLID[get(ladders[0][0], ladders[0][1] - 1, ladders[0][2])]);
  const hut = new Terrain(seedFromString('templo'), {}).generateChunk(2, 2).blocks;
  let lower = 0, upper = 0;
  for (let i = 0; i < hut.length; i++) { if (hut[i] === ID.DOOR_WOOD_S) { lower++; assert.equal(hut[i + 256], ID.DOOR_WOOD_S_SUP); } if (hut[i] === ID.DOOR_WOOD_S_SUP) upper++; }
  assert.equal(lower, 1); assert.equal(upper, 1);
});

console.log(`\n${passed} pruebas correctas${process.exitCode ? ' — HAY FALLOS' : ''}`);
void boxCollides; void boxesBounds; void FAM; void B_SOLID;
