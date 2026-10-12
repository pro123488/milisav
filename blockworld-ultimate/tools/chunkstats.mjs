// Herramienta de desarrollo: genera chunks, mide tiempos, comprueba determinismo y cuenta bloques.
import { Terrain, seedFromString } from '../src/terrain.js';
import { Blocks } from '../src/blocks.js';
import { CHUNK_VOLUME } from '../src/config.js';

const seed = seedFromString(process.argv[2] ?? 'prueba');
const type = process.argv[3] ?? 'normal';
const R = parseInt(process.argv[4] ?? '6', 10);
const t = new Terrain(seed, { type });
const counts = new Float64Array(256);
let chests = 0, mobs = 0;
const t0 = performance.now();
let n = 0;
for (let cz = -R; cz < R; cz++) for (let cx = -R; cx < R; cx++) {
  const r = t.generateChunk(cx, cz);
  for (let i = 0; i < r.blocks.length; i++) counts[r.blocks[i]]++;
  chests += r.chests.length; mobs += r.mobs.length; n++;
}
const ms = performance.now() - t0;
console.log(`${n} chunks en ${ms.toFixed(0)} ms → ${(ms / n).toFixed(1)} ms/chunk; cofres=${chests} mobs=${mobs}`);
const total = n * CHUNK_VOLUME;
const rows = [];
for (let i = 1; i < 256; i++) if (counts[i]) rows.push([Blocks.get(i).key, counts[i]]);
rows.sort((a, b) => b[1] - a[1]);
for (const [k, c] of rows) console.log(k.padEnd(20), String(c).padStart(10), ((c / total) * 100).toFixed(3) + ' %');

// Determinismo
const a = new Terrain(seed, { type }).generateChunk(3, -2).blocks;
const b = new Terrain(seed, { type }).generateChunk(3, -2).blocks;
let same = a.length === b.length;
for (let i = 0; same && i < a.length; i++) if (a[i] !== b[i]) same = false;
console.log('Determinista (mismo chunk dos veces):', same);
