// Objeto en la mano (primera persona): cubo con texturas del atlas para bloques, lámina con el icono para
// herramientas y objetos, brazo desnudo si no hay nada. Con balanceo al andar, golpe y animación al cambiar de ranura.
import * as THREE from 'three';
import { Items } from './items.js';
import { Blocks, B_SHAPE } from './blocks.js';
import { B_TILE, ATLAS_COLS, getItemIcon } from './atlas.js';

const FACE_TINT = [0.82, 0.82, 1.0, 0.6, 0.7, 0.7];

export class HandRenderer {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.01, 10);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.cache = new Map();
    this.current = null; this.currentKey = null;
    this.swingT = 1; this.equip = 0; this.bob = 0;
    this.matLight = new THREE.Color(1, 1, 1);
  }

  swing() { this.swingT = 0; }

  _blockMesh(block, atlasTex) {
    const g = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    const uv = g.attributes.uv, col = new Float32Array(24 * 3);
    const ts = 1 / ATLAS_COLS;
    for (let f = 0; f < 6; f++) {
      const tile = B_TILE[block.id * 6 + f];
      const u0 = (tile % ATLAS_COLS) * ts, v0 = Math.floor(tile / ATLAS_COLS) * ts;
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, u0 + uv.getX(i) * ts, v0 + (1 - uv.getY(i)) * ts);
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = FACE_TINT[f];
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, transparent: true, alphaTest: 0.5 }));
    m.rotation.set(0.35, -0.7, 0.05);
    const o = new THREE.Group(); o.add(m);
    o.userData.mat = m.material;
    return o;
  }

  _spriteMesh(item, w = 0.62) {
    const tex = new THREE.CanvasTexture(getItemIcon(item));
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w), mat);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, w), mat); back.position.z = -0.012;
    const o = new THREE.Group(); o.add(m, back);
    o.rotation.set(0.0, -0.55, 0.0);
    o.userData.mat = mat;
    return o;
  }

  _armMesh() {
    const g = new THREE.BoxGeometry(0.13, 0.13, 0.6);
    const col = new Float32Array(24 * 3);
    const c = new THREE.Color('#d8a67a');
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; col[i * 3] = c.r * FACE_TINT[f]; col[i * 3 + 1] = c.g * FACE_TINT[f]; col[i * 3 + 2] = c.b * FACE_TINT[f]; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true }));
    m.rotation.set(0.35, -0.35, 0.05);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.24), new THREE.MeshBasicMaterial({ color: 0x3a6fc0 }));
    sleeve.position.z = 0.24; m.add(sleeve);
    const o = new THREE.Group(); o.add(m); o.userData.mat = m.material; o.userData.extra = sleeve.material;
    return o;
  }

  _make(stack) {
    if (!stack) return { obj: this._armMesh(), kind: 'arm' };
    const it = Items.get(stack.i);
    if (it.kind === 'block') {
      const b = Blocks.get(it.block);
      const shape = B_SHAPE[b.id];
      if (shape === 2 || shape === 4 || shape === 7) return { obj: this._spriteMesh(it, 0.55), kind: 'sprite' }; // plantas, antorchas y formas de cajas: su icono
      return { obj: this._blockMesh(b, this.game.wr.atlasTexture), kind: 'block' };
    }
    return { obj: this._spriteMesh(it, it.kind === 'tool' ? 0.46 : 0.42), kind: it.kind === 'tool' ? 'tool' : 'sprite' };
  }

  update(dt, stack, speed, walkPhase, aspect) {
    const key = stack ? stack.i : -1;
    if (key !== this.currentKey) {
      if (this.current) this.holder.remove(this.current.obj);
      let c = this.cache.get(key);
      if (!c) { c = this._make(stack); this.cache.set(key, c); }
      this.current = c; this.currentKey = key;
      this.holder.add(c.obj);
      this.equip = 1;
    }
    this.equip = Math.max(0, this.equip - dt * 4.5);
    if (this.swingT < 1) this.swingT = Math.min(1, this.swingT + dt / 0.32);
    const sw = Math.sin(this.swingT * Math.PI);
    const eat = this.game.eating ? Math.sin(this.game.eating.t * 14) * 0.03 : 0;
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    const bobAmt = this.game.settings.bobbing ? Math.min(1, speed) : 0;
    const bx = Math.cos(walkPhase * 0.5) * 0.02 * bobAmt, by = -Math.abs(Math.sin(walkPhase * 0.5)) * 0.03 * bobAmt;
    const kind = this.current.kind;
    const baseX = kind === 'arm' ? 0.36 : 0.46, baseY = kind === 'arm' ? -0.4 : -0.36, baseZ = kind === 'arm' ? -0.75 : -0.8;
    this.holder.position.set(baseX + bx - sw * 0.12, baseY + by - this.equip * 0.5 + eat - sw * 0.1, baseZ - sw * 0.25);
    this.holder.rotation.set(-sw * 0.9 + (kind === 'tool' ? -0.1 : 0), sw * 0.3, -sw * 0.2);
    const l = this.game.handLight;
    const mat = this.current.obj.userData.mat;
    if (mat) mat.color.setScalar(l);
    if (this.current.obj.userData.extra) this.current.obj.userData.extra.color.setRGB(0.23 * l, 0.44 * l, 0.75 * l);
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
