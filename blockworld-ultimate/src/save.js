// Guardado: IndexedDB para mundos y chunks modificados (compresión RLE), localStorage para opciones.
// Si IndexedDB no está disponible (modo privado, etc.) se usa memoria y se avisa de que no se guardará.
import { DEFAULT_SETTINGS, GENERATOR_VERSION, VERSION, CHUNK_VOLUME } from './config.js';

/** Formato de los chunks guardados: 1 = IDs de 8 bits (Fase 1), 2 = IDs de 16 bits (Fase 2+). */
export const CHUNK_FORMAT = 2;

const DB_NAME = 'blockworld-ultimate';
const DB_VERSION = 1;
const SETTINGS_KEY = 'bwu.settings.v1';

// ── Opciones (localStorage) ─────────────────────────────────────
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) { /* sin almacenamiento */ }
  return { ...DEFAULT_SETTINGS };
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignorar */ }
}

// ── Compresión RLE: pares (valor, repeticiones 1..255) ───────────
export function rleEncode(src) {
  const out = new Uint8Array(Math.min(src.length * 2, src.length + 1024) + 16);
  let o = 0, i = 0;
  const n = src.length;
  let buf = out;
  while (i < n) {
    const v = src[i]; let run = 1;
    while (i + run < n && src[i + run] === v && run < 255) run++;
    if (o + 2 > buf.length) { const nb = new Uint8Array(buf.length * 2); nb.set(buf); buf = nb; }
    buf[o++] = v; buf[o++] = run; i += run;
  }
  return buf.slice(0, o);
}
export function rleDecode(enc, size) {
  const out = new Uint8Array(size);
  let o = 0;
  for (let i = 0; i + 1 < enc.length && o < size; i += 2) {
    const v = enc[i], run = enc[i + 1];
    out.fill(v, o, Math.min(size, o + run)); o += run;
  }
  return out;
}

// ── RLE de 16 bits (formato 2): pares (ID, repeticiones 1..65535) en un Uint16Array ──
export function rleEncode16(src) {
  let buf = new Uint16Array(1024);
  let o = 0, i = 0;
  const n = src.length;
  while (i < n) {
    const v = src[i]; let run = 1;
    while (i + run < n && src[i + run] === v && run < 65535) run++;
    if (o + 2 > buf.length) { const nb = new Uint16Array(buf.length * 2); nb.set(buf); buf = nb; }
    buf[o++] = v; buf[o++] = run; i += run;
  }
  return buf.slice(0, o);
}
export function rleDecode16(enc, size) {
  const out = new Uint16Array(size);
  let o = 0;
  for (let i = 0; i + 1 < enc.length && o < size; i += 2) {
    const v = enc[i], run = enc[i + 1];
    out.fill(v, o, Math.min(size, o + run)); o += run;
  }
  return out;
}
/** Decodifica un registro de chunk guardado en cualquier formato (migra el formato 1 a 16 bits). */
export function decodeChunkRecord(rec) {
  if (!rec || !rec.b) return null;
  if (rec.f === 2) return rleDecode16(rec.b, CHUNK_VOLUME);
  return Uint16Array.from(rleDecode(rec.b, CHUNK_VOLUME));
}

function reqP(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
function txDone(tx) { return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); }

export class SaveStore {
  constructor(db) {
    this.db = db;
    this.persistent = !!db;
    this.memWorlds = new Map(); this.memChunks = new Map();
  }

  static async open() {
    if (typeof indexedDB === 'undefined') return new SaveStore(null);
    try {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains('worlds')) d.createObjectStore('worlds', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('chunks')) d.createObjectStore('chunks');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB bloqueado'));
      });
      return new SaveStore(db);
    } catch (e) {
      console.warn('IndexedDB no disponible, los mundos no se guardarán:', e);
      return new SaveStore(null);
    }
  }

  // ── Mundos ──
  async listWorlds() {
    let list;
    if (!this.db) list = [...this.memWorlds.values()];
    else list = await reqP(this.db.transaction('worlds').objectStore('worlds').getAll());
    return list.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  }
  async getWorld(id) {
    if (!this.db) return this.memWorlds.get(id) || null;
    return (await reqP(this.db.transaction('worlds').objectStore('worlds').get(id))) || null;
  }
  async putWorld(meta) {
    meta.lastPlayed = Date.now();
    if (!this.db) { this.memWorlds.set(meta.id, meta); return; }
    const tx = this.db.transaction('worlds', 'readwrite');
    tx.objectStore('worlds').put(meta);
    await txDone(tx);
  }
  async deleteWorld(id) {
    if (!this.db) { this.memWorlds.delete(id); for (const k of [...this.memChunks.keys()]) if (k.startsWith(id + '/') || k.startsWith(id + '~')) this.memChunks.delete(k); return; }
    const tx = this.db.transaction(['worlds', 'chunks'], 'readwrite');
    tx.objectStore('worlds').delete(id);
    tx.objectStore('chunks').delete(IDBKeyRange.bound(id + '/', id + '/￿'));
    tx.objectStore('chunks').delete(IDBKeyRange.bound(id + '~', id + '~￿')); // otras dimensiones (id~dark/...)
    await txDone(tx);
  }

  /** Crea el almacén de chunks de un mundo (precarga qué chunks existen guardados). */
  async chunkStore(worldId) {
    const cs = new ChunkStore(this, worldId);
    await cs.init();
    return cs;
  }

  /** Estimación de uso (para mostrar en el menú), si el navegador lo permite. */
  async estimate() {
    try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (e) { /* nada */ }
    return null;
  }
}

class ChunkStore {
  constructor(store, worldId) { this.store = store; this.wid = worldId; this.keys = new Set(); this.pendingWrites = new Map(); this.flushing = null; }
  _k(cx, cz) { return `${this.wid}/${cx},${cz}`; }
  async init() {
    const s = this.store;
    if (!s.db) { for (const k of s.memChunks.keys()) if (k.startsWith(this.wid + '/')) this.keys.add(k); return; }
    const keys = await reqP(s.db.transaction('chunks').objectStore('chunks').getAllKeys(IDBKeyRange.bound(this.wid + '/', this.wid + '/￿')));
    for (const k of keys) this.keys.add(k);
  }
  hasChunk(cx, cz) { return this.keys.has(this._k(cx, cz)); }
  async loadChunk(cx, cz) {
    const key = this._k(cx, cz);
    const pend = this.pendingWrites.get(key);
    if (pend) return pend.slice();
    let rec;
    if (!this.store.db) rec = this.store.memChunks.get(key);
    else rec = await reqP(this.store.db.transaction('chunks').objectStore('chunks').get(key));
    return decodeChunkRecord(rec);
  }
  /** Encola la escritura (se agrupan en una sola transacción). Devuelve una promesa que se cumple al guardarse. */
  saveChunk(cx, cz, blocks) {
    const key = this._k(cx, cz);
    this.keys.add(key);
    this.pendingWrites.set(key, blocks.slice());
    return this._kick();
  }
  _kick() {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      await new Promise((r) => setTimeout(r, 40));
      while (this.pendingWrites.size) {
        const batch = [...this.pendingWrites.entries()];
        try { await this._flush(batch); } catch (e) { console.warn('Error guardando chunks', e); }
        for (const [k, v] of batch) if (this.pendingWrites.get(k) === v) this.pendingWrites.delete(k);
      }
      this.flushing = null;
    })();
    return this.flushing;
  }
  async _flush(batch) {
    if (!batch.length) return;
    if (!this.store.db) { for (const [k, v] of batch) this.store.memChunks.set(k, { b: rleEncode16(v), f: CHUNK_FORMAT, v: GENERATOR_VERSION }); return; }
    const tx = this.store.db.transaction('chunks', 'readwrite');
    const os = tx.objectStore('chunks');
    for (const [k, v] of batch) os.put({ b: rleEncode16(v), f: CHUNK_FORMAT, v: GENERATOR_VERSION, game: VERSION }, k);
    await txDone(tx);
  }
  async flush() { while (this.flushing) await this.flushing; }
}

export const newWorldId = () => 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
