// Generación de mallas por chunk: eliminación de caras ocultas, oclusión ambiental (AO) y luz suave por vértice.
// Devuelve búferes intercalados [x,y,z,u,v,cielo,bloque,sombra] (8 floats por vértice) listos para three.js.
// Sin dependencias del DOM: se puede ejecutar en Node para pruebas.
import { CHUNK_SIZE as CS, WORLD_HEIGHT as WH } from './config.js';
import { B_OPAQUE, B_SHAPE, B_TRANS, B_CULLGRP, B_HEIGHT, B_LIGHT, ID, BLOCKS } from './blocks.js';
import { B_TILE, ATLAS_COLS } from './atlas.js';

export const STRIDE = 8;
const PW = CS + 2;
const PSTRIDE_Y = PW * PW;
const PB = new Uint8Array(PW * PW * (WH + 2));   // +1 capa de margen arriba y abajo
const PL = new Uint8Array(PW * PW * (WH + 2));

const SHAPE = { NONE: 0, CUBE: 1, CROSS: 2, FLUID: 3, TORCH: 4, SLAB: 5, FARMLAND: 6 };
const AO_CURVE = [0.5, 0.68, 0.84, 1.0];
const FACE_SHADE = [0.82, 0.82, 1.0, 0.55, 0.7, 0.7];
const EPS = 1 / 2048;

// Tabla de caras: normal, vértices (esquinas del cubo unidad) y UV (v hacia abajo en la textura).
const FACES = [
  { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], uv: [[0, 1], [1, 1], [1, 0], [0, 0]] },
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], uv: [[0, 1], [1, 1], [1, 0], [0, 0]] },
  { n: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], uv: [[0, 0], [0, 1], [1, 1], [1, 0]] },
  { n: [0, -1, 0], v: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]], uv: [[0, 0], [0, 1], [1, 1], [1, 0]] },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], uv: [[0, 1], [1, 1], [1, 0], [0, 0]] },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], uv: [[0, 1], [1, 1], [1, 0], [0, 0]] },
];
// Para cada cara y vértice: offsets (en celdas, desde la celda del bloque) del vecino frontal, lados y esquina.
const VOFF = FACES.map((f) => f.v.map((p) => {
  const n = f.n;
  const axes = [0, 1, 2].filter((a) => n[a] === 0);
  const e1 = [0, 0, 0], e2 = [0, 0, 0];
  e1[axes[0]] = p[axes[0]] ? 1 : -1;
  e2[axes[1]] = p[axes[1]] ? 1 : -1;
  const vec = (...vs) => { const r = [0, 0, 0]; for (const v of vs) { r[0] += v[0]; r[1] += v[1]; r[2] += v[2]; } return r; };
  const toIdx = (o) => o[0] + o[2] * PW + o[1] * PSTRIDE_Y;
  return { f: toIdx(n), s1: toIdx(vec(n, e1)), s2: toIdx(vec(n, e2)), c: toIdx(vec(n, e1, e2)), s1y: n[1] + e1[1], s2y: n[1] + e2[1], cy: n[1] + e1[1] + e2[1] };
}));
const NIDX = FACES.map((f) => f.n[0] + f.n[2] * PW + f.n[1] * PSTRIDE_Y);

class MeshBuf {
  constructor() { this.data = new Float32Array(STRIDE * 8192); this.idx = new Uint32Array(12288); this.nv = 0; this.ni = 0; }
  reset() { this.nv = 0; this.ni = 0; }
  _ensure(addV) {
    if ((this.nv + addV) * STRIDE > this.data.length) { const d = new Float32Array(this.data.length * 2); d.set(this.data); this.data = d; }
    if (this.ni + addV * 2 > this.idx.length) { const d = new Uint32Array(this.idx.length * 2); d.set(this.idx); this.idx = d; }
  }
  vert(x, y, z, u, v, s, b, sh) {
    const o = this.nv * STRIDE, d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = u; d[o + 4] = v; d[o + 5] = s; d[o + 6] = b; d[o + 7] = sh;
    this.nv++;
  }
  quad(flip) {
    const b = this.nv - 4, i = this.idx;
    let n = this.ni;
    if (flip) { i[n++] = b + 1; i[n++] = b + 2; i[n++] = b + 3; i[n++] = b + 1; i[n++] = b + 3; i[n++] = b; }
    else { i[n++] = b; i[n++] = b + 1; i[n++] = b + 2; i[n++] = b; i[n++] = b + 2; i[n++] = b + 3; }
    this.ni = n;
  }
  quad2() { // doble cara (plantas)
    const b = this.nv - 4, i = this.idx; let n = this.ni;
    i[n++] = b; i[n++] = b + 1; i[n++] = b + 2; i[n++] = b; i[n++] = b + 2; i[n++] = b + 3;
    i[n++] = b; i[n++] = b + 2; i[n++] = b + 1; i[n++] = b; i[n++] = b + 3; i[n++] = b + 2;
    this.ni = n;
  }
  finish() { return { data: this.data.slice(0, this.nv * STRIDE), index: this.idx.slice(0, this.ni), vertexCount: this.nv }; }
}
const OPQ = new MeshBuf(), TRN = new MeshBuf();

const TILE_UV = new Float32Array(256 * 3);
for (let t = 0; t < 256; t++) {
  const col = t % ATLAS_COLS, row = (t / ATLAS_COLS) | 0, s = 1 / ATLAS_COLS;
  TILE_UV[t * 3] = col * s + EPS; TILE_UV[t * 3 + 1] = row * s + EPS; TILE_UV[t * 3 + 2] = s - 2 * EPS;
}
const SK = [0, 0, 0, 0], BL = [0, 0, 0, 0], SH = [0, 0, 0, 0];

/** Copia los datos del chunk y sus vecinos (con 1 celda de margen) a los búferes rellenados. */
function fillPadded(world, c) {
  PB.fill(0); PL.fill(0xf0);
  let top = c.maxY;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const n = dx === 0 && dz === 0 ? c : world.chunkAt(c.cx + dx, c.cz + dz);
    if (!n || !n.blocks) continue;
    if (n.maxY > top) top = n.maxY;
  }
  top = Math.min(WH - 1, top + 1);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const n = dx === 0 && dz === 0 ? c : world.chunkAt(c.cx + dx, c.cz + dz);
    if (!n || !n.blocks || !n.light) continue;
    const x0 = dx === -1 ? 15 : 0, x1 = dx === 1 ? 0 : dx === -1 ? 15 : 15;
    const z0 = dz === -1 ? 15 : 0, z1 = dz === 1 ? 0 : dz === -1 ? 15 : 15;
    for (let y = 0; y <= top; y++) {
      for (let z = z0; z <= z1; z++) {
        const src = (z << 4) | (y << 8);
        const dst = (z + dz * 16 + 1) * PW + (y + 1) * PSTRIDE_Y + 1 + dx * 16;
        for (let x = x0; x <= x1; x++) { PB[dst + x] = n.blocks[src + x]; PL[dst + x] = n.light[src + x]; }
      }
    }
  }
  return top;
}

const CACTUS = ID.CACTUS;

/**
 * Genera las mallas opaca y translúcida de un chunk.
 * @param world {chunkAt(cx,cz)}
 * @param opts {fancyLeaves?:boolean}
 */
export function meshChunk(world, c, opts = {}) {
  const top = fillPadded(world, c);
  OPQ.reset(); TRN.reset();
  const fancy = !!opts.fancyLeaves;

  for (let y = 0; y <= top; y++) {
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        const pi = (x + 1) + (z + 1) * PW + (y + 1) * PSTRIDE_Y;
        const id = PB[pi];
        if (id === 0) continue;
        const shape = B_SHAPE[id];
        if (shape === SHAPE.NONE) continue;
        const buf = B_TRANS[id] ? TRN : OPQ;

        if (shape === SHAPE.CUBE || shape === SHAPE.SLAB || shape === SHAPE.FARMLAND) {
          const h = shape === SHAPE.CUBE ? 1 : B_HEIGHT[id];
          const opaqueBlock = B_OPAQUE[id] === 1;
          const inset = id === CACTUS ? 0.0625 : 0;
          const grp = B_CULLGRP[id];
          for (let f = 0; f < 6; f++) {
            if (y === 0 && f === 3) continue;
            const nb = PB[pi + NIDX[f]];
            let vis;
            if (nb === 0) vis = true;
            else if (B_OPAQUE[nb]) vis = false;
            else if (B_CULLGRP[nb] === grp && !opaqueBlock) {
              if (shape === SHAPE.CUBE) vis = grp === 1000 && fancy;
              else vis = f >= 2 && f <= 3; // losas/tierra arada: solo se ocultan los laterales
            } else vis = true;
            if (!vis) continue;
            if (f === 2 && h < 1 && PB[pi + NIDX[2]] !== 0 && B_OPAQUE[PB[pi + NIDX[2]]]) continue;
            const face = FACES[f];
            const tile = B_TILE[id * 6 + f];
            const u0 = TILE_UV[tile * 3], v0 = TILE_UV[tile * 3 + 1], ts = TILE_UV[tile * 3 + 2];
            const fo = pi + NIDX[f];
            const baseSky = PL[fo] >> 4, baseBlk = PL[fo] & 15;
            const fs = FACE_SHADE[f];
            const smooth = opaqueBlock;
            const sk = SK, bl = BL, sh = SH;
            for (let k = 0; k < 4; k++) {
              if (smooth) {
                const o = VOFF[f][k];
                const iF = pi + o.f, i1 = pi + o.s1, i2 = pi + o.s2, iC = pi + o.c;
                const oF = B_OPAQUE[PB[iF]], o1 = B_OPAQUE[PB[i1]], o2 = B_OPAQUE[PB[i2]], oC = B_OPAQUE[PB[iC]];
                const lF = PL[iF], l1 = o1 ? lF : PL[i1], l2 = o2 ? lF : PL[i2];
                let lC;
                if (o1 && o2) lC = lF; else lC = oC ? lF : PL[iC];
                void oF;
                sk[k] = ((lF >> 4) + (l1 >> 4) + (l2 >> 4) + (lC >> 4)) / 60;
                bl[k] = ((lF & 15) + (l1 & 15) + (l2 & 15) + (lC & 15)) / 60;
                const ao = o1 && o2 ? 0 : 3 - (o1 + o2 + oC);
                sh[k] = fs * AO_CURVE[ao];
              } else {
                sk[k] = baseSky / 15; bl[k] = baseBlk / 15; sh[k] = fs;
              }
            }
            const flip = sh[0] + sh[2] < sh[1] + sh[3];
            for (let k = 0; k < 4; k++) {
              const p = face.v[k], uv = face.uv[k];
              let px = p[0], py = p[1], pz = p[2];
              if (inset) { px = inset + px * (1 - 2 * inset); pz = inset + pz * (1 - 2 * inset); }
              py *= h;
              let vv = uv[1];
              if (h < 1 && f !== 2 && f !== 3) vv = 1 - h * (1 - uv[1]);
              buf._ensure(4);
              buf.vert(x + px, y + py, z + pz, u0 + uv[0] * ts, v0 + vv * ts, sk[k], bl[k], sh[k]);
            }
            buf.quad(flip);
          }
        } else if (shape === SHAPE.FLUID) {
          const isWater = B_TRANS[id] === 1;
          const above = PB[pi + PSTRIDE_Y];
          const topH = (above === id) ? 1 : 0.875;
          for (let f = 0; f < 6; f++) {
            if (y === 0 && f === 3) continue;
            const nb = PB[pi + NIDX[f]];
            if (nb === id || (nb !== 0 && B_OPAQUE[nb])) continue;
            const face = FACES[f];
            const tile = B_TILE[id * 6 + f];
            const u0 = TILE_UV[tile * 3], v0 = TILE_UV[tile * 3 + 1], ts = TILE_UV[tile * 3 + 2];
            const fo = pi + NIDX[f];
            const lv = PL[fo];
            const sk = (lv >> 4) / 15, bl = (isWater ? lv & 15 : 15) / 15;
            const fs = FACE_SHADE[f];
            buf._ensure(4);
            for (let k = 0; k < 4; k++) {
              const p = face.v[k], uv = face.uv[k];
              buf.vert(x + p[0], y + p[1] * topH, z + p[2], u0 + uv[0] * ts, v0 + uv[1] * ts, sk, bl, fs);
            }
            buf.quad(false);
          }
        } else if (shape === SHAPE.CROSS) {
          const lv = PL[pi];
          const sk = (lv >> 4) / 15, bl = (lv & 15) / 15;
          const tile = B_TILE[id * 6];
          const u0 = TILE_UV[tile * 3], v0 = TILE_UV[tile * 3 + 1], ts = TILE_UV[tile * 3 + 2];
          const hsh = (Math.imul(c.cx * 16 + x, 73856093) ^ Math.imul(c.cz * 16 + z, 19349663)) >>> 0;
          const jx = BLOCKS[id].group === 'crop' ? 0 : ((hsh & 255) / 255 - 0.5) * 0.3;
          const jz = BLOCKS[id].group === 'crop' ? 0 : (((hsh >> 8) & 255) / 255 - 0.5) * 0.3;
          const yoff = BLOCKS[id].group === 'crop' ? -0.0625 : 0;
          const a = 0.1, b2 = 0.9;
          const q = [[[a, a], [b2, b2]], [[a, b2], [b2, a]]];
          for (const [p0, p1] of q) {
            buf._ensure(4);
            buf.vert(x + p0[0] + jx, y + yoff, z + p0[1] + jz, u0, v0 + ts, sk, bl, 0.95);
            buf.vert(x + p1[0] + jx, y + yoff, z + p1[1] + jz, u0 + ts, v0 + ts, sk, bl, 0.95);
            buf.vert(x + p1[0] + jx, y + 1 + yoff, z + p1[1] + jz, u0 + ts, v0, sk, bl, 0.95);
            buf.vert(x + p0[0] + jx, y + 1 + yoff, z + p0[1] + jz, u0, v0, sk, bl, 0.95);
            buf.quad2();
          }
        } else if (shape === SHAPE.TORCH) {
          const blk = BLOCKS[id];
          const lv = PL[pi];
          const sk = (lv >> 4) / 15;
          const tl = B_TILE[id * 6], u0 = TILE_UV[tl * 3], v0 = TILE_UV[tl * 3 + 1], ts = TILE_UV[tl * 3 + 2];
          // caja de 2×2 px y 10 px de alto; las antorchas de pared se inclinan alejándose del muro
          let bx = 0.5, bz = 0.5, tx = 0.5, tz = 0.5, by = 0, hgt = 0.625;
          const dirs = { 1: [1, 0], 2: [-1, 0], 3: [0, 1], 4: [0, -1] };
          if (blk.dir) { const d = dirs[blk.dir]; bx += 0.34 * d[0]; bz += 0.34 * d[1]; tx += 0.1 * d[0]; tz += 0.1 * d[1]; by = 0.22; }
          const w = 0.0625;
          const corners = (cx_, cz_) => [[cx_ - w, cz_ - w], [cx_ + w, cz_ - w], [cx_ + w, cz_ + w], [cx_ - w, cz_ + w]];
          const bot = corners(bx, bz), tp = corners(tx, tz);
          const uA = u0 + (7 / 16) * ts, uB = u0 + (9 / 16) * ts, vA = v0 + (6 / 16) * ts, vB = v0 + ts;
          for (let s = 0; s < 4; s++) {
            const s2 = (s + 1) % 4;
            buf._ensure(4);
            buf.vert(x + bot[s][0], y + by, z + bot[s][1], uA, vB, sk, 1, 1);
            buf.vert(x + bot[s2][0], y + by, z + bot[s2][1], uB, vB, sk, 1, 1);
            buf.vert(x + tp[s2][0], y + by + hgt, z + tp[s2][1], uB, vA, sk, 1, 1);
            buf.vert(x + tp[s][0], y + by + hgt, z + tp[s][1], uA, vA, sk, 1, 1);
            buf.quad2();
          }
          // tapa
          buf._ensure(4);
          const tuA = u0 + (7 / 16) * ts, tuB = u0 + (9 / 16) * ts, tvA = v0 + (6 / 16) * ts, tvB = v0 + (8 / 16) * ts;
          buf.vert(x + tp[0][0], y + by + hgt, z + tp[0][1], tuA, tvA, sk, 1, 1);
          buf.vert(x + tp[3][0], y + by + hgt, z + tp[3][1], tuA, tvB, sk, 1, 1);
          buf.vert(x + tp[2][0], y + by + hgt, z + tp[2][1], tuB, tvB, sk, 1, 1);
          buf.vert(x + tp[1][0], y + by + hgt, z + tp[1][1], tuB, tvA, sk, 1, 1);
          buf.quad2();
        }
      }
    }
  }
  return { opaque: OPQ.nv ? OPQ.finish() : null, trans: TRN.nv ? TRN.finish() : null };
}
void B_LIGHT;
