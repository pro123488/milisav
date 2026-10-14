// Un chunk: columna de 16×16×128 bloques con su luz, estado de malla y bloques "tickeables".
import { CHUNK_SIZE as CS, WORLD_HEIGHT as WH } from './config.js';
import { BLOCKS, MAX_BLOCKS } from './blocks.js';

/** Bloques que reciben "random ticks" (cultivos, brotes, tierra arada...). La hierba se trata aparte. */
export const TICKABLE = new Uint8Array(MAX_BLOCKS);
for (const b of BLOCKS) if (b && b.randomTick && !b.key.startsWith('grass')) TICKABLE[b.id] = 1;

export const chunkKey = (cx, cz) => ((cx & 0xffff) << 16) | (cz & 0xffff);

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.key = chunkKey(cx, cz);
    this.blocks = null;      // Uint16Array(16*16*128) de IDs de bloque, índice = x | z<<4 | y<<8
    this.light = null;       // Uint8Array, nibble alto = cielo, bajo = bloque
    this.lightReady = false;
    this.maxY = 0;           // y más alta con un bloque no-aire
    this.modified = false;   // ¿hay que guardarlo?
    this.meshDirty = true;
    this.meshed = false;
    this.fresh = true;       // generado ahora (no cargado de un guardado)
    this.tickables = new Set();
    this.view = null;        // objeto de render (three.js) asignado por el renderizador
    this.biomes = null;
  }

  setBlocks(blocks) {
    this.blocks = blocks;
    this.computeMaxY();
    this.scanTickables();
  }

  computeMaxY() {
    const b = this.blocks;
    let y = WH - 1;
    outer: for (; y > 0; y--) {
      const base = y << 8;
      for (let i = 0; i < 256; i++) if (b[base + i] !== 0) break outer;
    }
    this.maxY = y;
  }

  scanTickables() {
    this.tickables.clear();
    const b = this.blocks;
    const end = Math.min(WH, this.maxY + 2) << 8;
    for (let i = 0; i < end; i++) if (TICKABLE[b[i]]) this.tickables.add(i);
  }

  get(lx, y, lz) { return this.blocks[lx | (lz << 4) | (y << 8)]; }
}

export { CS, WH };
