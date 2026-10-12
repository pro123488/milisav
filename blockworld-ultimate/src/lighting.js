// Iluminación por vóxeles: luz del cielo (0-15) + luz de bloque (0-15) empaquetadas en un byte por celda
// (nibble alto = cielo, bajo = bloque). Propagación BFS que cruza chunks y actualización incremental
// al colocar/romper bloques. Sin dependencias del DOM.
import { CHUNK_SIZE as CS, WORLD_HEIGHT as WH } from './config.js';
import { B_OPAQUE, B_ATTEN, B_LIGHT } from './blocks.js';

const SKY = 0, BLK = 1;
const DX = [1, -1, 0, 0, 0, 0], DY = [0, 0, 1, -1, 0, 0], DZ = [0, 0, 0, 0, 1, -1];

class Queue {
  constructor(stride) { this.stride = stride; this.a = new Int32Array(stride * 4096); this.n = 0; this.head = 0; }
  push3(x, y, z) {
    if ((this.n + 1) * 3 > this.a.length) this._grow();
    const i = this.n * 3; this.a[i] = x; this.a[i + 1] = y; this.a[i + 2] = z; this.n++;
  }
  push4(x, y, z, l) {
    if ((this.n + 1) * 4 > this.a.length) this._grow();
    const i = this.n * 4; this.a[i] = x; this.a[i + 1] = y; this.a[i + 2] = z; this.a[i + 3] = l; this.n++;
  }
  _grow() { const b = new Int32Array(this.a.length * 2); b.set(this.a); this.a = b; }
  clear() { this.n = 0; this.head = 0; }
}

export class Lighting {
  /** @param world objeto con chunkAt(cx,cz) → Chunk|undefined */
  constructor(world) {
    this.world = world;
    this.addQ = new Queue(3);
    this.remQ = new Queue(4);
    this._cx = 1e9; this._cz = 1e9; this._c = null;
  }

  _chunk(x, z) {
    const cx = x >> 4, cz = z >> 4;
    if (cx === this._cx && cz === this._cz) return this._c;
    this._cx = cx; this._cz = cz; this._c = this.world.chunkAt(cx, cz) || null;
    return this._c;
  }
  _resetCache() { this._cx = 1e9; this._cz = 1e9; this._c = null; }

  getLight(x, y, z, ch) {
    if (y < 0 || y >= WH) return ch === SKY ? 15 : 0;
    const c = this._chunk(x, z);
    if (!c || !c.light) return ch === SKY ? 15 : 0;
    const v = c.light[(x & 15) | ((z & 15) << 4) | (y << 8)];
    return ch === SKY ? v >> 4 : v & 15;
  }
  _set(x, y, z, ch, val) {
    const c = this._chunk(x, z);
    if (!c || !c.light) return false;
    const i = (x & 15) | ((z & 15) << 4) | (y << 8);
    const old = c.light[i];
    c.light[i] = ch === SKY ? (val << 4) | (old & 15) : (old & 0xf0) | val;
    c.meshDirty = true;
    // si está en el borde, el vecino también cambia su malla
    const lx = x & 15, lz = z & 15;
    if (lx === 0 || lx === 15 || lz === 0 || lz === 15) this.world.markNeighborsDirty(c.cx, c.cz, lx, lz);
    return true;
  }

  /** Propaga luz desde las celdas de addQ (leyendo su nivel actual). */
  _runAdd(ch) {
    const q = this.addQ;
    const blocksOf = (x, z) => { const c = this._chunk(x, z); return c && c.blocks && c.light ? c : null; };
    while (q.head < q.n) {
      const i = q.head * 3; q.head++;
      const x = q.a[i], y = q.a[i + 1], z = q.a[i + 2];
      const L = this.getLight(x, y, z, ch);
      if (L <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
        if (ny < 0 || ny >= WH) continue;
        const nc = blocksOf(nx, nz);
        if (!nc) continue;
        const nidx = (nx & 15) | ((nz & 15) << 4) | (ny << 8);
        const nb = nc.blocks[nidx];
        if (B_OPAQUE[nb]) continue;
        const at = B_ATTEN[nb];
        let nl;
        if (ch === SKY && d === 3 && L === 15 && at === 0) nl = 15;
        else nl = L - 1 - at;
        if (nl <= 0) continue;
        const cur = ch === SKY ? nc.light[nidx] >> 4 : nc.light[nidx] & 15;
        if (cur < nl) {
          nc.light[nidx] = ch === SKY ? (nl << 4) | (nc.light[nidx] & 15) : (nc.light[nidx] & 0xf0) | nl;
          nc.meshDirty = true;
          const lx = nx & 15, lz = nz & 15;
          if (lx === 0 || lx === 15 || lz === 0 || lz === 15) this.world.markNeighborsDirty(nc.cx, nc.cz, lx, lz);
          q.push3(nx, ny, nz);
        }
      }
    }
    q.clear();
  }

  /** Elimina luz alrededor de las celdas de remQ y deja en addQ las fuentes que hay que re-propagar. */
  _runRemove(ch) {
    const rq = this.remQ, aq = this.addQ;
    while (rq.head < rq.n) {
      const i = rq.head * 4; rq.head++;
      const x = rq.a[i], y = rq.a[i + 1], z = rq.a[i + 2], L = rq.a[i + 3];
      for (let d = 0; d < 6; d++) {
        const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
        if (ny < 0 || ny >= WH) continue;
        const nc = this._chunk(nx, nz);
        if (!nc || !nc.blocks || !nc.light) continue;
        const nidx = (nx & 15) | ((nz & 15) << 4) | (ny << 8);
        if (B_OPAQUE[nc.blocks[nidx]]) continue;
        const nl = ch === SKY ? nc.light[nidx] >> 4 : nc.light[nidx] & 15;
        if (nl === 0) continue;
        if (nl < L || (ch === SKY && d === 3 && L === 15 && nl === 15)) {
          this._set(nx, ny, nz, ch, 0);
          rq.push4(nx, ny, nz, nl);
        } else {
          aq.push3(nx, ny, nz);
        }
      }
    }
    rq.clear();
  }

  /** Calcula la luz inicial de un chunk recién cargado (y la mezcla con la de los vecinos). */
  initChunk(c) {
    this._resetCache();
    const b = c.blocks;
    const L = c.light = new Uint8Array(b.length);
    const top = Math.min(WH - 1, c.maxY + 2);
    // Luz del cielo: columnas de arriba abajo
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      let lvl = 15;
      for (let y = WH - 1; y >= 0; y--) {
        const idx = x | (z << 4) | (y << 8);
        const id = b[idx];
        if (B_OPAQUE[id]) break;
        const at = B_ATTEN[id];
        if (at > 0) { lvl -= at; if (lvl <= 0) break; }
        L[idx] = lvl << 4;
      }
    }
    const aqSky = this.addQ;
    aqSky.clear();
    const x0 = c.cx * CS, z0 = c.cz * CS;
    // Fuentes de luz de bloque
    const blkSeeds = [];
    for (let y = 0; y <= top; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const idx = x | (z << 4) | (y << 8);
      const em = B_LIGHT[b[idx]];
      if (em > 0) { L[idx] = (L[idx] & 0xf0) | em; blkSeeds.push(x0 + x, y, z0 + z); }
    }
    c.lightReady = true;
    // Semillas de cielo: celdas iluminadas con vecinos más oscuros
    const skyAt = (x, y, z) => {
      if (x >= 0 && x < CS && z >= 0 && z < CS) return L[x | (z << 4) | (y << 8)] >> 4;
      const nc = this.world.chunkAt(c.cx + (x < 0 ? -1 : x >= CS ? 1 : 0), c.cz + (z < 0 ? -1 : z >= CS ? 1 : 0));
      if (!nc || !nc.light) return 15; // no hay vecino: no empujamos luz hacia él
      return nc.light[(x & 15) | ((z & 15) << 4) | (y << 8)] >> 4;
    };
    for (let y = 0; y <= top; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const s = L[x | (z << 4) | (y << 8)] >> 4;
      if (s < 2) continue;
      if (skyAt(x + 1, y, z) < s - 1 || skyAt(x - 1, y, z) < s - 1 || skyAt(x, y, z + 1) < s - 1 || skyAt(x, y, z - 1) < s - 1 || (y > 0 && skyAt(x, y - 1, z) < s - 1)) {
        aqSky.push3(x0 + x, y, z0 + z);
      }
    }
    // Luz que entra desde los vecinos (sus celdas del borde)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = this.world.chunkAt(c.cx + dx, c.cz + dz);
      if (!nc || !nc.light) continue;
      const ntop = Math.min(WH - 1, Math.max(nc.maxY, c.maxY) + 2);
      for (let k = 0; k < CS; k++) {
        const lx = dx === 1 ? CS - 1 : dx === -1 ? 0 : k;
        const lz = dz === 1 ? CS - 1 : dz === -1 ? 0 : k;
        // celda del vecino adyacente a nuestro borde
        const nlx = dx === 1 ? 0 : dx === -1 ? CS - 1 : k;
        const nlz = dz === 1 ? 0 : dz === -1 ? CS - 1 : k;
        for (let y = 0; y <= ntop; y++) {
          const v = nc.light[nlx | (nlz << 4) | (y << 8)];
          if (v > 0x20 || (v & 15) > 1) aqSky.push3(nc.cx * CS + nlx, y, nc.cz * CS + nlz);
        }
        void lx; void lz;
      }
    }
    // Ejecutar ambos canales (los seeds de vecino sirven a los dos canales)
    const seeds = aqSky.a.slice(0, aqSky.n * 3);
    const nSeeds = aqSky.n;
    this._runAdd(SKY);
    for (let i = 0; i < nSeeds; i++) aqSky.push3(seeds[i * 3], seeds[i * 3 + 1], seeds[i * 3 + 2]);
    for (let i = 0; i < blkSeeds.length; i += 3) aqSky.push3(blkSeeds[i], blkSeeds[i + 1], blkSeeds[i + 2]);
    this._runAdd(BLK);
    c.meshDirty = true;
    this.world.markNeighborsDirtyAll(c.cx, c.cz);
  }

  /** Actualiza la luz tras cambiar el bloque de (x,y,z). `old` y `nw` son IDs de bloque. */
  onBlockChanged(x, y, z, old, nw) {
    this._resetCache();
    const c = this._chunk(x, z);
    if (!c || !c.light) return;
    const idx = (x & 15) | ((z & 15) << 4) | (y << 8);
    // ── Luz de bloque ──
    const oldBL = c.light[idx] & 15;
    if (oldBL > 0 || B_OPAQUE[nw] || B_LIGHT[old] > 0) {
      c.light[idx] &= 0xf0;
      this.remQ.clear(); this.addQ.clear();
      if (oldBL > 0) { this.remQ.push4(x, y, z, oldBL); this._runRemove(BLK); }
      else this._seedNeighbors(x, y, z, BLK);
      this._runAdd(BLK);
    }
    if (B_LIGHT[nw] > 0) {
      c.light[idx] = (c.light[idx] & 0xf0) | B_LIGHT[nw];
      this.addQ.clear(); this.addQ.push3(x, y, z); this._runAdd(BLK);
    } else if (!B_OPAQUE[nw]) {
      this.addQ.clear(); this._seedNeighbors(x, y, z, BLK); this._runAdd(BLK);
    }
    // ── Luz del cielo ──
    const oldSky = c.light[idx] >> 4;
    this.remQ.clear(); this.addQ.clear();
    if (oldSky > 0) {
      c.light[idx] &= 0x0f;
      this.remQ.push4(x, y, z, oldSky);
      this._runRemove(SKY);
    }
    if (!B_OPAQUE[nw]) {
      const at = B_ATTEN[nw];
      const above = y + 1 >= WH ? 15 : this.getLight(x, y + 1, z, SKY);
      if (above === 15 && at === 0) {
        // columna abierta: 15 hacia abajo hasta chocar con algo
        let yy = y;
        while (yy >= 0) {
          const ii = (x & 15) | ((z & 15) << 4) | (yy << 8);
          const bid = c.blocks[ii];
          if (B_OPAQUE[bid] || B_ATTEN[bid] > 0) break;
          if ((c.light[ii] >> 4) !== 15) { c.light[ii] = (c.light[ii] & 0x0f) | 0xf0; this.addQ.push3(x, yy, z); }
          yy--;
        }
        if (this.addQ.n === 0) this.addQ.push3(x, y, z);
      } else {
        this._seedNeighbors(x, y, z, SKY);
      }
    }
    // Re-propagar las fuentes que dejó la eliminación (están ya en addQ)
    this._runAdd(SKY);
    c.meshDirty = true;
    this.world.markNeighborsDirty(c.cx, c.cz, x & 15, z & 15);
  }

  _seedNeighbors(x, y, z, ch) {
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
      if (ny < 0 || ny >= WH) continue;
      if (this.getLight(nx, ny, nz, ch) > 1) this.addQ.push3(nx, ny, nz);
    }
  }
}
