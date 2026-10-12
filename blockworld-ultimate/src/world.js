// Mundo: gestiona los chunks (carga progresiva, descarga con guardado, mallado con presupuesto de tiempo),
// acceso a bloques/luz y generación en un Web Worker (con alternativa síncrona por tiempo).
// No depende de three.js: el renderizado se conecta con el callback onMeshReady.
import { CHUNK_SIZE as CS, WORLD_HEIGHT as WH } from './config.js';
import { Chunk, chunkKey, TICKABLE } from './chunk.js';
import { Lighting } from './lighting.js';
import { meshChunk } from './mesher.js';
import { Terrain } from './terrain.js';
import { B_SOLID, B_FLUID, B_HEIGHT } from './blocks.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Generador síncrono repartido en el tiempo (alternativa si no hay Workers). */
class SyncGen {
  constructor(terrain, onResult) { this.terrain = terrain; this.onResult = onResult; this.q = []; this.mode = 'sync'; }
  request(cx, cz) { this.q.push([cx, cz]); }
  pump(ms) {
    const t0 = now();
    while (this.q.length && now() - t0 < ms) {
      const [cx, cz] = this.q.shift();
      const r = this.terrain.generateChunk(cx, cz);
      this.onResult({ cx, cz, blocks: r.blocks, chests: r.chests, mobs: r.mobs, biomes: r.biomes });
    }
  }
  cancelAll() { this.q.length = 0; }
  dispose() { this.q.length = 0; }
}

class WorkerGen {
  constructor(seed, opts, onResult, onFail, count) {
    this.mode = 'worker'; this.workers = []; this.rr = 0; this.failed = false;
    for (let i = 0; i < count; i++) {
      const w = new Worker(new URL('./terrain.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => { if (e.data.type === 'chunk') onResult(e.data); };
      w.onerror = (e) => { if (!this.failed) { this.failed = true; onFail(e); } };
      w.postMessage({ type: 'init', seed, opts });
      this.workers.push(w);
    }
  }
  request(cx, cz) { this.workers[this.rr++ % this.workers.length].postMessage({ type: 'gen', cx, cz }); }
  pump() {}
  dispose() { for (const w of this.workers) w.terminate(); this.workers = []; }
}

export class World {
  /**
   * @param {{seed:number,type:string,structures:boolean,size:number,renderDistance:number,store?:object,useWorker?:boolean}} o
   */
  constructor(o) {
    this.seed = o.seed >>> 0; this.type = o.type || 'normal'; this.structures = o.structures !== false;
    this.size = o.size || 0; // 0 = infinito
    this.renderDistance = o.renderDistance ?? 6;
    this.store = o.store || null;
    this.terrain = new Terrain(this.seed, { type: this.type, structures: this.structures });
    this.chunks = new Map();
    this.lighting = new Lighting(this);
    this.blockEntities = new Map();
    this.incoming = [];
    this.pending = new Set();
    this.urgent = new Set();
    this.wanted = [];
    this._pcx = 1e9; this._pcz = 1e9; this._rebuild = true;
    this._lc = null; this._lcx = 1e9; this._lcz = 1e9;
    this.fancyLeaves = false;
    this.maxInflight = 6;
    this.stats = { generated: 0, loadedFromSave: 0, meshed: 0, meshMs: 0 };
    // Callbacks (los asigna el juego/renderizador)
    this.onMeshReady = null;       // (chunk, {opaque, trans})
    this.onChunkUnload = null;     // (chunk)
    this.onFreshChunk = null;      // (chunk, {chests, mobs}) — chunk generado por primera vez
    this.onChunkLoaded = null;     // (chunk)
    this.onBlockChange = null;     // (x,y,z,oldId,newId)
    this.useWorker = o.useWorker !== false && typeof Worker !== 'undefined';
    this.gen = null;
    this._startGen();
  }

  _startGen() {
    const opts = { type: this.type, structures: this.structures };
    const onResult = (r) => this.incoming.push(r);
    const fallback = () => {
      if (this.gen && this.gen.mode === 'sync') return;
      console.warn('Web Worker no disponible: se genera el terreno en el hilo principal repartido en el tiempo.');
      const pend = [...this.pending];
      if (this.gen) this.gen.dispose();
      this.gen = new SyncGen(this.terrain, onResult);
      for (const k of pend) { const cx = (k << 0) >> 16, cz = (k << 16) >> 16; this.gen.request(cx, cz); }
    };
    if (this.useWorker) {
      try {
        const n = Math.max(1, Math.min(3, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4) - 2));
        this.gen = new WorkerGen(this.seed, opts, onResult, fallback, n);
      } catch (e) { fallback(); }
    } else this.gen = new SyncGen(this.terrain, onResult);
  }

  dispose() {
    if (this.gen) this.gen.dispose();
    for (const c of this.chunks.values()) if (this.onChunkUnload) this.onChunkUnload(c);
    this.chunks.clear();
  }

  // ── Acceso a chunks y bloques ─────────────────────────────────
  chunkAt(cx, cz) {
    if (cx === this._lcx && cz === this._lcz) return this._lc;
    const c = this.chunks.get(chunkKey(cx, cz));
    this._lcx = cx; this._lcz = cz; this._lc = c;
    return c;
  }
  _invalidateCache() { this._lcx = 1e9; this._lcz = 1e9; this._lc = null; }

  inBounds(cx, cz) {
    if (!this.size) return true;
    const h = this.size / 2 / CS;
    return cx >= -h && cx < h && cz >= -h && cz < h;
  }

  getBlock(x, y, z) {
    if (y < 0 || y >= WH) return 0;
    const c = this.chunkAt(x >> 4, z >> 4);
    return c && c.blocks ? c.blocks[(x & 15) | ((z & 15) << 4) | (y << 8)] : 0;
  }
  isLoaded(x, z) { const c = this.chunkAt(x >> 4, z >> 4); return !!(c && c.blocks); }

  /** Para físicas: un chunk sin cargar cuenta como sólido (nadie atraviesa el mundo sin generar). */
  solidAt(x, y, z) {
    if (y < 0) return true;
    if (y >= WH) return false;
    const c = this.chunkAt(x >> 4, z >> 4);
    if (!c || !c.blocks) return true;
    return B_SOLID[c.blocks[(x & 15) | ((z & 15) << 4) | (y << 8)]] === 1;
  }
  /** Altura de colisión de la celda (0 = vacío, 1 = completa, 0.5 = losa...). */
  collisionHeight(x, y, z) {
    if (y < 0) return 1;
    if (y >= WH) return 0;
    const c = this.chunkAt(x >> 4, z >> 4);
    if (!c || !c.blocks) return 1;
    const id = c.blocks[(x & 15) | ((z & 15) << 4) | (y << 8)];
    return B_SOLID[id] ? B_HEIGHT[id] : 0;
  }
  fluidAt(x, y, z) { return B_FLUID[this.getBlock(x, y, z)]; }

  getSky(x, y, z) {
    if (y >= WH) return 15; if (y < 0) return 0;
    const c = this.chunkAt(x >> 4, z >> 4);
    return c && c.light ? c.light[(x & 15) | ((z & 15) << 4) | (y << 8)] >> 4 : 15;
  }
  getBlockLight(x, y, z) {
    if (y >= WH || y < 0) return 0;
    const c = this.chunkAt(x >> 4, z >> 4);
    return c && c.light ? c.light[(x & 15) | ((z & 15) << 4) | (y << 8)] & 15 : 0;
  }

  /** Y del bloque sólido o líquido más alto de la columna (o -1). */
  surfaceY(x, z) {
    const c = this.chunkAt(x >> 4, z >> 4);
    if (!c || !c.blocks) return -1;
    const lx = x & 15, lz = z & 15;
    for (let y = c.maxY; y >= 0; y--) {
      const id = c.blocks[lx | (lz << 4) | (y << 8)];
      if (id !== 0 && (B_SOLID[id] || B_FLUID[id])) return y;
    }
    return -1;
  }

  setBlock(x, y, z, id, opts = {}) {
    if (y < 0 || y >= WH) return false;
    const c = this.chunkAt(x >> 4, z >> 4);
    if (!c || !c.blocks) return false;
    const lx = x & 15, lz = z & 15;
    const idx = lx | (lz << 4) | (y << 8);
    const old = c.blocks[idx];
    if (old === id) return false;
    c.blocks[idx] = id;
    if (id !== 0 && y > c.maxY) c.maxY = y;
    else if (id === 0 && y === c.maxY) c.computeMaxY();
    if (!opts.silent) c.modified = true;
    if (TICKABLE[id]) c.tickables.add(idx); else if (TICKABLE[old]) c.tickables.delete(idx);
    this.lighting.onBlockChanged(x, y, z, old, id);
    c.meshDirty = true; this.urgent.add(c);
    this.markNeighborsDirty(c.cx, c.cz, lx, lz, true);
    if (this.onBlockChange && !opts.silent) this.onBlockChange(x, y, z, old, id);
    return true;
  }

  markNeighborsDirty(cx, cz, lx, lz, urgent = false) {
    const mark = (dx, dz) => {
      const n = this.chunkAt(cx + dx, cz + dz);
      if (n) { n.meshDirty = true; if (urgent) this.urgent.add(n); }
    };
    const dx = lx === 0 ? -1 : lx === 15 ? 1 : 0;
    const dz = lz === 0 ? -1 : lz === 15 ? 1 : 0;
    if (dx) mark(dx, 0);
    if (dz) mark(0, dz);
    if (dx && dz) mark(dx, dz);
    this._invalidateCache();
  }
  markNeighborsDirtyAll(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const n = this.chunks.get(chunkKey(cx + dx, cz + dz));
      if (n) n.meshDirty = true;
    }
  }

  beKey(x, y, z) { return `${x},${y},${z}`; }

  // ── Streaming ────────────────────────────────────────────────
  setRenderDistance(r) { this.renderDistance = r; this._rebuild = true; }

  /** ¿Están listos los 8 vecinos (luz calculada) para poder mallar sin artefactos en los bordes? */
  _neighborsReady(c) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const cx = c.cx + dx, cz = c.cz + dz;
      const n = this.chunks.get(chunkKey(cx, cz));
      if (n) { if (!n.lightReady) return false; }
      else if (this.inBounds(cx, cz)) return false;
    }
    return true;
  }

  /**
   * Un paso de actualización. px,pz = posición del jugador (bloques).
   * budgetMs = tiempo máximo del paso en integrar + mallar chunks.
   */
  update(px, pz, budgetMs = 6) {
    const t0 = now();
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    if (pcx !== this._pcx || pcz !== this._pcz || this._rebuild) {
      this._pcx = pcx; this._pcz = pcz; this._rebuild = false;
      // Radio de generación: el de mallado + 2 chunks (los vecinos de un chunk mallado deben existir)
      const R = this.renderDistance + 2;
      const list = [];
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 <= R * R + 0.5 && this.inBounds(pcx + dx, pcz + dz)) list.push([pcx + dx, pcz + dz, d2]);
      }
      list.sort((a, b) => a[2] - b[2]);
      this.wanted = list;
      this._unloadFar(pcx, pcz);
    }
    // Pedir chunks nuevos
    let inflight = this.pending.size;
    for (const [cx, cz] of this.wanted) {
      if (inflight >= this.maxInflight) break;
      const key = chunkKey(cx, cz);
      if (this.chunks.has(key) || this.pending.has(key)) continue;
      this._request(cx, cz, key);
      inflight++;
    }
    if (this.gen && this.gen.pump) this.gen.pump(Math.max(1, budgetMs * 0.5));
    // Integrar los generados / cargados
    let n = 0;
    while (this.incoming.length && n < 3 && now() - t0 < budgetMs) {
      const r = this.incoming.shift();
      this._integrate(r, pcx, pcz);
      n++;
    }
    // Mallado urgente (ediciones del jugador): mismo fotograma
    if (this.urgent.size) {
      let k = 0;
      for (const c of this.urgent) {
        if (k++ > 10) break;
        if (c.meshDirty && c.lightReady && this._neighborsReady(c)) this._mesh(c);
      }
      this.urgent.clear();
    }
    // Mallado progresivo de los chunks sucios, los más cercanos primero
    const R = this.renderDistance;
    const cand = [];
    for (const c of this.chunks.values()) {
      if (!c.meshDirty || !c.lightReady) continue;
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
      cand.push(c);
    }
    if (cand.length) {
      cand.sort((a, b) => ((a.cx - pcx) ** 2 + (a.cz - pcz) ** 2) - ((b.cx - pcx) ** 2 + (b.cz - pcz) ** 2));
      let meshed = 0;
      for (const c of cand) {
        if (meshed > 0 && now() - t0 > budgetMs) break;
        if (!this._neighborsReady(c)) continue;
        this._mesh(c); meshed++;
      }
    }
  }

  _request(cx, cz, key) {
    this.pending.add(key);
    if (this.store && this.store.hasChunk(cx, cz)) {
      this.store.loadChunk(cx, cz).then((blocks) => {
        if (blocks) this.incoming.push({ cx, cz, blocks, fresh: false });
        else this.gen.request(cx, cz);
      }).catch(() => this.gen.request(cx, cz));
    } else this.gen.request(cx, cz);
  }

  _integrate(r, pcx, pcz) {
    const key = chunkKey(r.cx, r.cz);
    this.pending.delete(key);
    if (this.chunks.has(key)) return;
    const dx = r.cx - pcx, dz = r.cz - pcz;
    if (Math.max(Math.abs(dx), Math.abs(dz)) > this.renderDistance + 3) return;
    const c = new Chunk(r.cx, r.cz);
    const blocks = r.blocks instanceof Uint8Array ? r.blocks : new Uint8Array(r.blocks);
    c.setBlocks(blocks);
    c.fresh = r.fresh !== false;
    c.biomes = r.biomes || null;
    this.chunks.set(key, c);
    this._invalidateCache();
    if (c.fresh) this.stats.generated++; else this.stats.loadedFromSave++;
    if (c.fresh && this.onFreshChunk) this.onFreshChunk(c, { chests: r.chests || [], mobs: r.mobs || [] });
    this.lighting.initChunk(c);
    if (this.onChunkLoaded) this.onChunkLoaded(c);
  }

  _mesh(c) {
    const t = now();
    const m = meshChunk(this, c, { fancyLeaves: this.fancyLeaves });
    c.meshDirty = false; c.meshed = true;
    this.stats.meshed++; this.stats.meshMs += now() - t;
    if (this.onMeshReady) this.onMeshReady(c, m);
  }

  _unloadFar(pcx, pcz) {
    const U = this.renderDistance + 3;
    for (const [key, c] of this.chunks) {
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > U) this.unloadChunk(c);
      void key;
    }
  }

  unloadChunk(c) {
    if (c.modified && this.store) { this.store.saveChunk(c.cx, c.cz, c.blocks); c.modified = false; }
    if (this.onChunkUnload) this.onChunkUnload(c);
    this.chunks.delete(c.key);
    this._invalidateCache();
  }

  /** Guarda todos los chunks modificados. */
  saveModified() {
    if (!this.store) return Promise.resolve();
    const ps = [];
    for (const c of this.chunks.values()) {
      if (c.modified) { ps.push(this.store.saveChunk(c.cx, c.cz, c.blocks)); c.modified = false; }
    }
    return Promise.all(ps);
  }

  /** ¿Está el área alrededor de (x,z) cargada, iluminada y mallada? (pantalla de carga) */
  isAreaReady(x, z, radius = 2) {
    const pcx = Math.floor(x / CS), pcz = Math.floor(z / CS);
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      if (!this.inBounds(pcx + dx, pcz + dz)) continue;
      if (dx * dx + dz * dz > (radius + 0.5) * (radius + 0.5)) continue;
      const c = this.chunks.get(chunkKey(pcx + dx, pcz + dz));
      if (!c || !c.meshed) return false;
    }
    return true;
  }

  /** Busca un hueco seguro de pie cerca de (x,z) desde la altura y0 hacia abajo/arriba. */
  findStandY(x, z, y0 = WH - 2) {
    for (let y = Math.min(WH - 3, y0); y > 1; y--) {
      if (this.solidAt(x, y - 1, z) && !this.solidAt(x, y, z) && !this.solidAt(x, y + 1, z) && !B_FLUID[this.getBlock(x, y, z)]) return y;
    }
    return -1;
  }

  /**
   * Busca un lugar de pie sobre el SUELO natural (no sobre copas de árboles ni techos) cerca de (x,z).
   * Devuelve {x,y,z} (centro del bloque, y de los pies) o null si el terreno aún no está cargado.
   */
  findGroundStand(x, z, maxR = 10) {
    for (let r = 0; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const bx = Math.floor(x) + dx, bz = Math.floor(z) + dz;
        if (!this.isLoaded(bx, bz)) continue;
        const hh = Math.floor(this.terrain.column(bx, bz).h);
        const sy = this.surfaceY(bx, bz);
        if (sy < 1 || sy !== hh || B_FLUID[this.getBlock(bx, sy, bz)]) continue;
        if (this.getBlock(bx, sy + 1, bz) !== 0 || this.getBlock(bx, sy + 2, bz) !== 0) continue;
        return { x: bx + 0.5, y: sy + 1, z: bz + 0.5 };
      }
    }
    return null;
  }
}
