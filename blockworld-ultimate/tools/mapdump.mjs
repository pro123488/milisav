// Herramienta de desarrollo: genera un PNG de biomas/relieve y estadísticas del generador.
// Uso: node tools/mapdump.mjs [semilla] [tipo] [salida.png] [tamaño=1024] [paso=4]
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Terrain, seedFromString } from '../src/terrain.js';
import { BIOMES } from '../src/biomes.js';
import { SEA_LEVEL } from '../src/config.js';

const seedArg = process.argv[2] ?? 'prueba';
const type = process.argv[3] ?? 'normal';
const out = process.argv[4] ?? 'map.png';
const size = parseInt(process.argv[5] ?? '1024', 10);
const step = parseInt(process.argv[6] ?? '4', 10);
const seed = seedFromString(seedArg);
const terrain = new Terrain(seed, { type });

const W = Math.floor(size / step);
const raw = Buffer.alloc((W * 3 + 1) * W);
const counts = new Array(BIOMES.length).fill(0);
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
let t0 = Date.now();
for (let j = 0; j < W; j++) {
  raw[j * (W * 3 + 1)] = 0;
  for (let i = 0; i < W; i++) {
    const x = (i - W / 2) * step, z = (j - W / 2) * step;
    const c = terrain.column(x, z);
    counts[c.biome]++;
    let [r, g, b] = hex(BIOMES[c.biome].color);
    const hh = c.h;
    if (hh < SEA_LEVEL) {
      const d = Math.min(1, (SEA_LEVEL - hh) / 28);
      r = 30 * (1 - d); g = 90 * (1 - d) + 40 * d; b = 190 * (1 - d) + 110 * d;
      if (c.biome !== 0) { r = 40; g = 120; b = 220; }
    } else {
      const sh = 0.75 + 0.5 * Math.min(1, (hh - SEA_LEVEL) / 70);
      r *= sh; g *= sh; b *= sh;
    }
    const o = j * (W * 3 + 1) + 1 + i * 3;
    raw[o] = Math.min(255, r); raw[o + 1] = Math.min(255, g); raw[o + 2] = Math.min(255, b);
  }
}
const ms = Date.now() - t0;

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(out, Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
]));
const total = counts.reduce((a, b) => a + b, 0);
console.log(`semilla=${seedArg} (${seed}) tipo=${type} muestras=${total} en ${ms} ms → ${out}`);
for (const b of BIOMES) console.log(String(b.name).padEnd(20), ((counts[b.id] / total) * 100).toFixed(1).padStart(5) + ' %');
