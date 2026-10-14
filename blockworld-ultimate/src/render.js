// Renderizado del mundo: material con luz por vértice (cielo/antorchas/AO), niebla, agua animada y
// gestión de las mallas de cada chunk. Las mallas se posicionan en coordenadas locales de chunk.
import * as THREE from 'three';
import { CHUNK_SIZE as CS, WORLD_HEIGHT as WH } from './config.js';
import { getAtlasCanvas, ATLAS_COLS } from './atlas.js';

const VERT = `
attribute vec3 aLight;
varying vec2 vUv;
varying vec3 vLight;
varying float vDepth;
void main() {
  vUv = uv;
  vLight = aLight;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
precision highp float;
#define ATLAS_N ${ATLAS_COLS.toFixed(1)}
uniform sampler2D uMap;
uniform float uSun;
uniform vec3 uSkyTint;
uniform vec3 uTorch;
uniform float uAmbient;
uniform float uBright;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
uniform float uAlpha;
varying vec2 vUv;
varying vec3 vLight;
varying float vDepth;
float curve(float l) { return pow(0.80, 15.0 * (1.0 - clamp(l, 0.0, 1.0))); }
void main() {
  vec2 uv = vUv;
  #ifdef WATER
    vec2 tile = floor(uv * ATLAS_N) / ATLAS_N;
    vec2 f = fract(uv * ATLAS_N);
    f = fract(f + vec2(uTime * 0.035, uTime * 0.02 + 0.06 * sin(uTime * 0.7 + f.x * 6.2831)));
    uv = tile + f / ATLAS_N;
  #endif
  vec4 tex = texture2D(uMap, uv);
  #ifdef ALPHA_TEST
    if (tex.a < 0.5) discard;
  #endif
  float sky = vLight.x * uSun;
  vec3 l = max(vec3(curve(sky)) * uSkyTint, vec3(curve(vLight.y)) * uTorch);
  l = max(l, vec3(uAmbient));
  l = pow(l, vec3(1.0 / uBright));
  vec3 col = tex.rgb * l * vLight.z;
  float fog = smoothstep(uFogNear, uFogFar, vDepth);
  col = mix(col, uFogColor, fog);
  #ifdef WATER
    gl_FragColor = vec4(col, tex.a * uAlpha * (1.0 - fog * 0.6));
  #else
    gl_FragColor = vec4(col, 1.0);
  #endif
}`;

export class WorldRenderer {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    const tex = new THREE.CanvasTexture(getAtlasCanvas());
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    this.atlasTexture = tex;
    this.uniforms = {
      uMap: { value: tex }, uSun: { value: 1 }, uSkyTint: { value: new THREE.Vector3(1, 1, 1) }, uTorch: { value: new THREE.Vector3(1.0, 0.84, 0.58) },
      uAmbient: { value: 0.04 }, uBright: { value: 1 }, uFogColor: { value: new THREE.Color(0.7, 0.83, 0.97) },
      uFogNear: { value: 60 }, uFogFar: { value: 110 }, uTime: { value: 0 }, uAlpha: { value: 0.85 },
    };
    this.matOpaque = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, defines: { ALPHA_TEST: 1 } });
    this.matTrans = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, defines: { ALPHA_TEST: 1, WATER: 1 } });
    this.matTrans.side = THREE.DoubleSide;
    this.drawnChunks = 0;
    world.onMeshReady = (c, m) => this.setChunkMesh(c, m);
    world.onChunkUnload = (c) => this.removeChunk(c);
  }

  _makeMesh(data, mat, c) {
    const g = new THREE.BufferGeometry();
    const ib = new THREE.InterleavedBuffer(data.data, 8);
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    g.setAttribute('uv', new THREE.InterleavedBufferAttribute(ib, 2, 3));
    g.setAttribute('aLight', new THREE.InterleavedBufferAttribute(ib, 3, 5));
    g.setIndex(new THREE.BufferAttribute(data.index, 1));
    const h = Math.min(WH, c.maxY + 3);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CS / 2, h / 2, CS / 2), Math.sqrt(2 * (CS / 2) ** 2 + (h / 2) ** 2) + 1);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(CS, h, CS));
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(c.cx * CS, 0, c.cz * CS);
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    if (mat === this.matTrans) mesh.renderOrder = 5;
    return mesh;
  }

  setChunkMesh(c, m) {
    const v = c.view || (c.view = { opaque: null, trans: null });
    for (const k of ['opaque', 'trans']) {
      if (v[k]) { this.group.remove(v[k]); v[k].geometry.dispose(); v[k] = null; }
      if (m[k]) { v[k] = this._makeMesh(m[k], k === 'opaque' ? this.matOpaque : this.matTrans, c); this.group.add(v[k]); }
    }
  }

  removeChunk(c) {
    const v = c.view;
    if (!v) return;
    for (const k of ['opaque', 'trans']) if (v[k]) { this.group.remove(v[k]); v[k].geometry.dispose(); }
    c.view = null;
  }

  /** Actualiza uniformes de iluminación y niebla. */
  setAtmosphere(atm, fogNear, fogFar, brightness, time) {
    const u = this.uniforms;
    u.uSun.value = atm.sun;
    u.uSkyTint.value.set(atm.skyTint[0], atm.skyTint[1], atm.skyTint[2]);
    u.uAmbient.value = atm.ambient;
    u.uBright.value = brightness;
    u.uFogColor.value.setRGB(atm.fog[0], atm.fog[1], atm.fog[2]);
    u.uFogNear.value = fogNear; u.uFogFar.value = fogFar;
    u.uTime.value = time;
  }
}
