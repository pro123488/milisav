// Cielo, sol, luna, estrellas y nubes + ciclo día/noche. Calcula los parámetros de iluminación para los shaders.
import * as THREE from 'three';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const DAY_Z = [0.30, 0.55, 0.93], DAY_H = [0.68, 0.83, 0.97];
const DUSK_Z = [0.26, 0.30, 0.58], DUSK_H = [0.98, 0.58, 0.34];
const NIGHT_Z = [0.015, 0.022, 0.07], NIGHT_H = [0.055, 0.075, 0.17];

export const PHASES = [
  ['Amanecer', -0.04, 0.06], ['Mañana', 0.06, 0.2], ['Mediodía', 0.2, 0.3], ['Tarde', 0.3, 0.42], ['Atardecer', 0.42, 0.54],
];
/** Nombre de la fase del día para t∈[0,1) (0 = amanecer). */
export function phaseName(t) {
  t = ((t % 1) + 1) % 1;
  if (t >= 0.96 || t < 0.06) return 'Amanecer';
  if (t < 0.2) return 'Mañana';
  if (t < 0.3) return 'Mediodía';
  if (t < 0.42) return 'Tarde';
  if (t < 0.54) return 'Atardecer';
  return 'Noche';
}
/** Hora "reloj": t=0 → 06:00, t=0.25 → 12:00, t=0.5 → 18:00, t=0.75 → 00:00. */
export function clockString(t) {
  const h = (6 + ((t % 1) + 1) % 1 * 24) % 24;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function pixelTexture(draw, size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.atm = { sunH: 1, day: 1, fog: [0.7, 0.83, 0.97], sun: 1, skyTint: [1, 1, 1], ambient: 0.03, zenith: DAY_Z, horizon: DAY_H, dusk: 0 };

    // Cúpula con degradado
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uGlow: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform float uGlow;
        void main(){
          float h = max(vDir.y, 0.0);
          vec3 c = mix(uHorizon, uZenith, pow(h, 0.55));
          float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
          c += vec3(1.0, 0.62, 0.3) * pow(s, 6.0) * uGlow * 0.55;
          c = mix(c, uHorizon * 0.9, step(vDir.y, 0.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 14), this.domeMat);
    this.dome.renderOrder = -100; this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // Sol y luna (originales, de aspecto "pixel")
    const sunTex = pixelTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = 'rgba(255,230,140,0.25)'; g.fillRect(2, 2, s - 4, s - 4);
      g.fillStyle = '#ffe48a'; g.fillRect(6, 6, s - 12, s - 12);
      g.fillStyle = '#fff6c8'; g.fillRect(10, 10, s - 20, s - 20);
    }, 32);
    const moonTex = pixelTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#cfd8e8'; g.fillRect(6, 6, s - 12, s - 12);
      g.fillStyle = '#aab6cc'; g.fillRect(10, 12, 5, 5); g.fillRect(18, 18, 4, 4); g.fillRect(16, 9, 3, 3);
      g.fillStyle = '#e6edf8'; g.fillRect(8, 8, 8, 3);
    }, 32);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.sun = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false }));
    this.moon = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, depthWrite: false, fog: false }));
    this.sun.scale.setScalar(90); this.moon.scale.setScalar(70);
    this.sun.renderOrder = -90; this.moon.renderOrder = -90; this.sun.frustumCulled = false; this.moon.frustumCulled = false;
    this.group.add(this.sun, this.moon);

    // Estrellas
    const n = 700, pos = new Float32Array(n * 3);
    let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * r * 480; pos[i * 3 + 1] = Math.abs(u) * 480; pos[i * 3 + 2] = Math.sin(a) * r * 480;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.renderOrder = -95; this.stars.frustumCulled = false;
    this.group.add(this.stars);

    // Nubes en bloques
    const cloudTex = pixelTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      const cells = s / 4;
      let sd = 777; const r2 = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
      const grid = [];
      for (let y = 0; y < cells; y++) { grid.push([]); for (let x = 0; x < cells; x++) grid[y].push(r2()); }
      for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
        let v = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) v += grid[(y + dy + cells) % cells][(x + dx + cells) % cells];
        if (v / 9 > 0.5) { g.fillStyle = '#ffffff'; g.fillRect(x * 4, y * 4, 4, 4); }
      }
    }, 256);
    cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
    cloudTex.repeat.set(3, 3);
    this.cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.8, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2; this.clouds.renderOrder = -80; this.clouds.frustumCulled = false;
    this.scene.add(this.clouds);
    this.cloudTex = cloudTex;
    this.cloudsVisible = true;
    this._t = 0;
  }

  /** t∈[0,1): 0 amanecer, 0.25 mediodía, 0.5 atardecer, 0.75 medianoche. */
  update(t, camera, dt) {
    this._t += dt;
    const a = ((t % 1) + 1) % 1 * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.28 * Math.cos(a)).normalize();
    const sunH = sunDir.y;
    const day = smooth(-0.08, 0.28, sunH);
    const dusk = 1 - smooth(0.0, 0.4, Math.abs(sunH));
    let zen = mix3(NIGHT_Z, DAY_Z, day), hor = mix3(NIGHT_H, DAY_H, day);
    const dk = dusk * (0.35 + 0.65 * smooth(-0.3, 0.1, sunH) * (1 - smooth(0.2, 0.5, sunH)));
    zen = mix3(zen, DUSK_Z, dk * 0.55); hor = mix3(hor, DUSK_H, dk);
    const sunScale = 0.40 + 0.60 * day;
    const tintDay = [1, 1, 1], tintNight = [0.62, 0.74, 1.0], tintDusk = [1.0, 0.86, 0.72];
    let tint = mix3(tintNight, tintDay, day); tint = mix3(tint, tintDusk, dk * 0.6);

    this.domeMat.uniforms.uZenith.value.setRGB(zen[0], zen[1], zen[2]);
    this.domeMat.uniforms.uHorizon.value.setRGB(hor[0], hor[1], hor[2]);
    this.domeMat.uniforms.uSunDir.value.copy(sunDir);
    this.domeMat.uniforms.uGlow.value = dk;

    const cp = camera.position;
    this.group.position.copy(cp);
    this.sun.position.copy(sunDir).multiplyScalar(450); this.sun.lookAt(cp);
    this.moon.position.copy(sunDir).multiplyScalar(-450); this.moon.lookAt(cp);
    this.sun.material.opacity = smooth(-0.15, 0.05, sunH);
    this.moon.material.opacity = 1 - smooth(-0.1, 0.1, sunH);
    this.stars.material.opacity = Math.pow(1 - smooth(-0.2, 0.05, sunH), 2);
    this.stars.rotation.z = a * 0.5;

    this.clouds.visible = this.cloudsVisible;
    this.clouds.position.set(cp.x, 124, cp.z);
    this.cloudTex.offset.x = (this._t * 0.0016) + cp.x / 1200 * 0; // desplazamiento lento
    this.cloudTex.offset.y = cp.z / 1200 * 0;
    const cc = mix3([0.12, 0.14, 0.24], [1, 1, 1], day);
    const cd = mix3(cc, [1, 0.7, 0.55], dk * 0.6);
    this.cloudMat.color.setRGB(cd[0], cd[1], cd[2]);

    const atm = this.atm;
    atm.sunH = sunH; atm.day = day; atm.fog = hor; atm.sun = sunScale; atm.skyTint = tint; atm.ambient = 0.035 + 0.01 * day; atm.zenith = zen; atm.horizon = hor; atm.dusk = dk;
    atm.sunDir = sunDir;
    return atm;
  }
}
