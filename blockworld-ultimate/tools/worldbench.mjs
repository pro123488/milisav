// Benchmark del mundo en Node (generador síncrono): tiempos de generación, luz y mallado.
import { World } from '../src/world.js';
import { seedFromString } from '../src/terrain.js';
const w = new World({ seed: seedFromString(process.argv[2] ?? 'prueba'), type: 'normal', structures: true, renderDistance: 5, useWorker: false });
const sp = w.terrain.findSpawn();
console.log('spawn', sp);
let meshes = 0, verts = 0, tverts = 0;
w.onMeshReady = (c, m) => { meshes++; if (m.opaque) verts += m.opaque.vertexCount; if (m.trans) tverts += m.trans.vertexCount; };
const t0 = performance.now();
let frames = 0, maxFrame = 0;
while (frames < 2000) {
  const f0 = performance.now();
  w.update(sp.x, sp.z, 6);
  maxFrame = Math.max(maxFrame, performance.now() - f0);
  frames++;
  if (w.isAreaReady(sp.x, sp.z, 4) && !w.incoming.length && w.pending.size === 0) break;
}
console.log(`frames=${frames} tiempo=${(performance.now() - t0).toFixed(0)}ms chunks=${w.chunks.size} mallas=${meshes} vértices opacos=${verts} translúcidos=${tverts}`);
console.log(`peor fotograma de streaming: ${maxFrame.toFixed(1)} ms; mallado medio ${(w.stats.meshMs / w.stats.meshed).toFixed(2)} ms/chunk`);
// Luz
const y = w.surfaceY(sp.x, sp.z);
console.log('superficie', y, 'cielo arriba', w.getSky(sp.x, y + 1, sp.z), 'bajo tierra (y-8)', w.getSky(sp.x, y - 8, sp.z));
// Colocar una antorcha en una cueva imaginaria y comprobar luz de bloque
const ty = y + 1;
w.setBlock(sp.x, ty, sp.z, 52 /* torch */);
console.log('luz de bloque en antorcha', w.getBlockLight(sp.x, ty, sp.z), 'a 3 bloques', w.getBlockLight(sp.x + 3, ty, sp.z));
w.setBlock(sp.x, ty, sp.z, 0);
console.log('tras quitarla', w.getBlockLight(sp.x, ty, sp.z), w.getBlockLight(sp.x + 3, ty, sp.z));
console.log('pending', w.pending.size, 'incoming', w.incoming.length, 'gen queue', w.gen.q && w.gen.q.length);
const notMeshed = [];
for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) { const c = w.chunkAt(Math.floor(sp.x/16)+dx, Math.floor(sp.z/16)+dz); if (!c || !c.meshed) notMeshed.push([dx,dz,!!c, c && c.lightReady, c && c.meshDirty, c && w._neighborsReady(c)]); }
console.log('no mallados', notMeshed.slice(0,6));
for (let dx=0; dx<5; dx++) console.log('x+'+dx, 'bloque', w.getBlock(sp.x+dx, ty, sp.z), 'sky', w.getSky(sp.x+dx,ty,sp.z));
