// Web Worker: genera el terreno fuera del hilo principal para que explorar no congele el juego.
import { Terrain } from './terrain.js';

let terrain = null;
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    terrain = new Terrain(m.seed, m.opts);
    self.postMessage({ type: 'ready' });
  } else if (m.type === 'gen') {
    const r = terrain.generateChunk(m.cx, m.cz);
    self.postMessage(
      { type: 'chunk', cx: m.cx, cz: m.cz, blocks: r.blocks, chests: r.chests, mobs: r.mobs, biomes: r.biomes },
      [r.blocks.buffer, r.biomes.buffer],
    );
  }
};
