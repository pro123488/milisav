// Texturas procedurales (arte propio, sin imágenes externas) e iconos de objetos.
// Todo se dibuja en canvas al iniciar: atlas de bloques 16×16 px por tile, e iconos para la interfaz.
import { BLOCKS, Blocks, ID, MAX_BLOCKS } from './blocks.js';
import { Items, TIERS, ARMOR_TIERS } from './items.js';
import { hashString, mulberry32 } from './noise.js';
import { renderBoxes } from './shapes.js';

const N = 16;
export const ATLAS_COLS = 32;
export const ATLAS_SIZE = ATLAS_COLS * N;

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const shade = (c, f) => [clamp8(c[0] * f), clamp8(c[1] * f), clamp8(c[2] * f), c[3] ?? 255];
const add = (c, v) => [clamp8(c[0] + v), clamp8(c[1] + v), clamp8(c[2] + v), c[3] ?? 255];
const mix = (a, b, t) => [clamp8(a[0] + (b[0] - a[0]) * t), clamp8(a[1] + (b[1] - a[1]) * t), clamp8(a[2] + (b[2] - a[2]) * t), clamp8((a[3] ?? 255) + ((b[3] ?? 255) - (a[3] ?? 255)) * t)];

/** Rejilla de píxeles 16×16 con primitivas de dibujo. */
class Grid {
  constructor(n = N) { this.n = n; this.d = new Uint8ClampedArray(n * n * 4); }
  set(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return;
    const i = (y * this.n + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = c[3] ?? 255;
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return [0, 0, 0, 0];
    const i = (y * this.n + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  fill(c) { for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) this.set(x, y, c); }
  noise(base, amp, r) {
    for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) this.set(x, y, add(base, (r() - 0.5) * 2 * amp));
  }
  specks(c, r, n) { for (let i = 0; i < n; i++) this.set(r() * this.n, r() * this.n, c); }
  blobs(c, r, count, size) {
    for (let k = 0; k < count; k++) {
      const cx = r() * this.n, cy = r() * this.n, rad = 0.8 + r() * size;
      for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad * (0.6 + r() * 0.4)) this.set(((x % this.n) + this.n) % this.n, ((y % this.n) + this.n) % this.n, c);
      }
    }
  }
  cracks(c, r, count) {
    for (let k = 0; k < count; k++) {
      let x = r() * this.n, y = r() * this.n; let dx = r() < 0.5 ? 1 : -1, dy = 0;
      const len = 3 + r() * 5;
      for (let s = 0; s < len; s++) {
        this.set(x, y, c);
        if (r() < 0.5) { x += dx; } else { y += r() < 0.5 ? 1 : -1; }
      }
    }
  }
  rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  hline(x0, x1, y, c) { for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  vline(x, y0, y1, c) { for (let y = y0; y <= y1; y++) this.set(x, y, c); }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  circle(cx, cy, rad, c) {
    for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) this.set(x, y, c);
    }
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(x, y, c);
    }
  }
  poly(pts, c) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= y + 0.5 && b[1] > y + 0.5) || (b[1] <= y + 0.5 && a[1] > y + 0.5)) {
          xs.push(a[0] + ((y + 0.5 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.set(x, y, c);
    }
  }
  /** Contorno oscuro alrededor de los píxeles opacos (estilo de iconos coherente). */
  outline(c = [18, 14, 24, 255]) {
    const copy = this.d.slice();
    const op = (x, y) => x >= 0 && y >= 0 && x < this.n && y < this.n && copy[(y * this.n + x) * 4 + 3] > 40;
    for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) {
      if (!op(x, y) && (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1))) this.set(x, y, c);
    }
  }
}

// ── Pintores de tiles de bloque ──────────────────────────────────
const P = Object.create(null);
const rgb = (r, g, b, a = 255) => [r, g, b, a];

function dirtBase(g, r) {
  g.noise(rgb(118, 83, 56), 7, r);
  g.specks(rgb(92, 64, 43), r, 16); g.specks(rgb(143, 103, 72), r, 10); g.specks(rgb(128, 124, 120), r, 3);
}
function grassTop(base, hi, lo) {
  return (g, r) => { g.noise(base, 9, r); g.specks(hi, r, 22); g.specks(lo, r, 14); };
}
function grassSide(base, hi) {
  return (g, r) => {
    dirtBase(g, r);
    for (let x = 0; x < N; x++) {
      const depth = 3 + (r() < 0.5 ? 0 : 1) + (r() < 0.2 ? 1 : 0);
      for (let y = 0; y < depth; y++) g.set(x, y, add(base, (r() - 0.5) * 18));
      if (r() < 0.45) g.set(x, depth, shade(base, 0.8));
    }
    g.specks(hi, r, 6);
  };
}
P.dirt = dirtBase;
P.grass_top = grassTop(rgb(98, 162, 54), rgb(132, 192, 72), rgb(74, 130, 42));
P.grass_side = grassSide(rgb(98, 162, 54), rgb(132, 192, 72));
P.grass_lush_top = grassTop(rgb(54, 142, 52), rgb(92, 178, 66), rgb(34, 104, 40));
P.grass_lush_side = grassSide(rgb(54, 142, 52), rgb(92, 178, 66));
P.grass_dry_top = grassTop(rgb(170, 164, 76), rgb(204, 196, 100), rgb(138, 132, 58));
P.grass_dry_side = grassSide(rgb(170, 164, 76), rgb(204, 196, 100));
P.grass_swamp_top = grassTop(rgb(84, 108, 58), rgb(112, 136, 72), rgb(58, 82, 44));
P.grass_swamp_side = (g, r) => { P.mud(g, r); for (let x = 0; x < N; x++) { const d = 3 + (r() < 0.5 ? 0 : 1); for (let y = 0; y < d; y++) g.set(x, y, add(rgb(84, 108, 58), (r() - 0.5) * 16)); } };
P.snow = (g, r) => { g.noise(rgb(242, 247, 252), 4, r); g.specks(rgb(210, 226, 244), r, 14); };
P.grass_snow_side = (g, r) => {
  dirtBase(g, r);
  for (let x = 0; x < N; x++) {
    const depth = 4 + (r() < 0.5 ? 0 : 1) + (r() < 0.25 ? 1 : 0);
    for (let y = 0; y < depth; y++) g.set(x, y, add(rgb(240, 246, 252), (r() - 0.5) * 8));
    if (r() < 0.4) g.set(x, depth, rgb(214, 228, 244));
  }
};
P.mud = (g, r) => { g.noise(rgb(72, 55, 43), 5, r); g.blobs(rgb(56, 42, 34), r, 6, 2.2); g.specks(rgb(96, 76, 58), r, 8); };
P.sand = (g, r) => { g.noise(rgb(222, 204, 151), 6, r); g.specks(rgb(200, 182, 128), r, 18); g.specks(rgb(238, 224, 176), r, 10); };
P.red_sand = (g, r) => { g.noise(rgb(196, 112, 66), 6, r); g.specks(rgb(168, 88, 50), r, 18); g.specks(rgb(214, 134, 86), r, 10); };
P.gravel = (g, r) => {
  g.noise(rgb(124, 122, 120), 6, r);
  const cols = [rgb(150, 148, 146), rgb(104, 102, 104), rgb(168, 160, 150), rgb(132, 128, 126), rgb(92, 90, 96)];
  for (let k = 0; k < 16; k++) g.blobs(cols[k % cols.length], r, 1, 1.9);
  g.specks(rgb(70, 68, 72), r, 10);
};
P.clay = (g, r) => { g.noise(rgb(158, 166, 184), 3, r); g.blobs(rgb(170, 178, 196), r, 4, 3); g.specks(rgb(140, 148, 168), r, 8); };
P.ice = (g, r) => { g.noise(rgb(168, 212, 240, 215), 6, r); for (let k = 0; k < 4; k++) g.line(r() * 16, r() * 16, r() * 16, r() * 16, rgb(230, 246, 255, 235)); g.specks(rgb(120, 180, 220, 230), r, 8); };
P.stone = (g, r) => { g.noise(rgb(128, 130, 137), 8, r); g.blobs(rgb(112, 114, 122), r, 6, 3); g.blobs(rgb(148, 150, 157), r, 5, 2); g.cracks(rgb(92, 94, 103), r, 2); };
P.deepstone = (g, r) => { g.noise(rgb(66, 68, 82), 6, r); g.blobs(rgb(54, 56, 70), r, 6, 3); g.blobs(rgb(82, 84, 100), r, 4, 2); g.cracks(rgb(40, 42, 54), r, 2); };
P.baserock = (g, r) => { g.noise(rgb(30, 30, 36), 6, r); g.blobs(rgb(46, 46, 56), r, 8, 2); g.specks(rgb(96, 96, 112), r, 6); g.specks(rgb(14, 14, 18), r, 10); };
P.cobble = (g, r) => {
  const pts = []; for (let i = 0; i < 9; i++) pts.push([r() * N, r() * N, 0.82 + r() * 0.3]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let d1 = 99, d2 = 99, bi = 0;
    pts.forEach((p, i) => {
      let dx = Math.abs(x - p[0]); dx = Math.min(dx, N - dx); let dy = Math.abs(y - p[1]); dy = Math.min(dy, N - dy);
      const d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; bi = i; } else if (d < d2) d2 = d;
    });
    const base = 120 * pts[bi][2];
    g.set(x, y, d2 - d1 < 1.05 ? rgb(70, 72, 80) : rgb(base + (r() - 0.5) * 14, base + 2 + (r() - 0.5) * 14, base + 10 + (r() - 0.5) * 14));
  }
};
P.basalt = (g, r) => {
  g.noise(rgb(50, 46, 56), 5, r);
  for (const x of [4, 9, 13]) g.vline(x + (r() < 0.5 ? 0 : 1), 0, 15, rgb(32, 30, 38));
  g.blobs(rgb(66, 60, 72), r, 4, 2); g.specks(rgb(100, 60, 50), r, 4);
};
P.basalt_bricks = (g, r) => {
  g.noise(rgb(52, 48, 58), 4, r);
  g.hline(0, 15, 0, rgb(30, 28, 36)); g.hline(0, 15, 7, rgb(30, 28, 36));
  g.vline(3, 0, 7, rgb(30, 28, 36)); g.vline(11, 8, 15, rgb(30, 28, 36)); g.vline(8, 0, 7, rgb(30, 28, 36)); g.vline(3, 8, 15, rgb(30, 28, 36));
  g.specks(rgb(150, 62, 40), r, 6);
};
P.obsidian = (g, r) => { g.noise(rgb(30, 18, 46), 4, r); g.blobs(rgb(46, 26, 72), r, 5, 2.5); for (let k = 0; k < 3; k++) g.line(r() * 16, r() * 16, r() * 16, r() * 16, rgb(120, 80, 190)); };
P.ash = (g, r) => { g.noise(rgb(132, 128, 124), 5, r); g.specks(rgb(96, 92, 90), r, 18); g.specks(rgb(168, 164, 160), r, 12); };
P.sandstone = (g, r) => { g.noise(rgb(216, 192, 134), 5, r); for (const y of [3, 7, 11]) g.hline(0, 15, y, rgb(194, 168, 112)); g.specks(rgb(232, 210, 156), r, 10); };
P.sandstone_top = (g, r) => { g.noise(rgb(222, 200, 144), 4, r); g.specks(rgb(204, 180, 124), r, 12); };
P.red_sandstone = (g, r) => { g.noise(rgb(188, 98, 58), 5, r); for (const y of [2, 6, 10, 13]) g.hline(0, 15, y, rgb(150, 74, 44)); g.specks(rgb(210, 124, 78), r, 10); };
P.red_sandstone_top = (g, r) => { g.noise(rgb(196, 106, 64), 4, r); g.specks(rgb(168, 84, 50), r, 12); };

function oreTile(main, hi, dark, big = false) {
  return (g, r) => {
    P.stone(g, r);
    for (let k = 0; k < (big ? 3 : 4); k++) {
      const cx = 2 + r() * 11, cy = 2 + r() * 11;
      const cells = [];
      for (let s = 0; s < (big ? 6 : 4); s++) cells.push([Math.round(cx + (r() - 0.5) * 3), Math.round(cy + (r() - 0.5) * 3)]);
      for (const [x, y] of cells) { g.set(x, y, main); }
      for (const [x, y] of cells) { g.set(x + 1, y + 1, dark); }
      const [hx, hy] = cells[0]; g.set(hx, hy, hi);
    }
  };
}
P.ore_coal = oreTile(rgb(38, 38, 44), rgb(78, 78, 90), rgb(16, 16, 20));
P.ore_copper = oreTile(rgb(214, 120, 68), rgb(120, 200, 160), rgb(150, 74, 40));
P.ore_iron = oreTile(rgb(216, 176, 150), rgb(250, 230, 214), rgb(160, 118, 96));
P.ore_gold = oreTile(rgb(250, 210, 62), rgb(255, 245, 160), rgb(186, 140, 24));
P.ore_crystal = (g, r) => {
  P.stone(g, r);
  for (let k = 0; k < 3; k++) {
    const cx = 3 + r() * 10, cy = 3 + r() * 10;
    g.poly([[cx, cy - 3], [cx + 1.6, cy], [cx, cy + 3], [cx - 1.6, cy]], rgb(90, 222, 242));
    g.set(cx, cy - 1, rgb(230, 255, 255)); g.set(cx, cy + 1, rgb(40, 150, 190));
  }
};
P.ore_noctisite = (g, r) => {
  P.deepstone(g, r);
  for (let k = 0; k < 3; k++) {
    const cx = 3 + r() * 10, cy = 3 + r() * 10;
    g.poly([[cx - 2, cy - 1], [cx, cy - 3], [cx + 2, cy - 1], [cx + 1, cy + 2], [cx - 1, cy + 2]], rgb(142, 84, 232));
    g.set(cx, cy - 1, rgb(214, 180, 255)); g.set(cx + 1, cy + 1, rgb(70, 30, 140)); g.set(cx - 1, cy + 1, rgb(86, 40, 160));
  }
};
P.cave_crystal = (g, r) => {
  P.deepstone(g, r);
  for (let k = 0; k < 4; k++) {
    const x = 1 + r() * 13, y = 8 + r() * 6, h = 4 + r() * 5;
    g.poly([[x, y], [x + 1.4, y - h], [x + 2.8, y]], rgb(70, 214, 226));
    g.set(x + 1.4, y - h + 1, rgb(220, 255, 255)); g.set(x + 1, y - 1, rgb(30, 130, 170));
  }
};

// Madera
function logSide(base) {
  return (g, r) => {
    for (let x = 0; x < N; x++) { const f = 0.82 + r() * 0.3; for (let y = 0; y < N; y++) g.set(x, y, shade(add(base, (r() - 0.5) * 8), f)); }
    for (let k = 0; k < 3; k++) { const x = r() * N, y = r() * 12; g.vline(x, y, y + 2 + r() * 3, shade(base, 0.55)); }
  };
}
function logTop(ring, bark) {
  return (g, r) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const c = d > 6.5 ? bark : (Math.floor(d) % 2 === 0 ? ring : shade(ring, 0.82));
      g.set(x, y, add(c, (r() - 0.5) * 6));
    }
  };
}
P.log_oak = logSide(rgb(112, 82, 48)); P.log_top = logTop(rgb(188, 148, 92), rgb(112, 82, 48));
P.log_dark = logSide(rgb(64, 46, 34)); P.log_top_dark = logTop(rgb(124, 92, 62), rgb(64, 46, 34));
P.log_jungle = (g, r) => { logSide(rgb(98, 74, 42))(g, r); g.blobs(rgb(64, 120, 48), r, 3, 1.6); };
P.log_top_jungle = logTop(rgb(176, 140, 86), rgb(98, 74, 42));
P.log_pine = logSide(rgb(90, 62, 46)); P.log_top_pine = logTop(rgb(176, 136, 98), rgb(90, 62, 46));
P.planks = (g, r) => {
  for (let b = 0; b < 4; b++) {
    const f = 0.9 + r() * 0.2; const off = Math.floor(r() * 12) + 2;
    for (let y = b * 4; y < b * 4 + 4; y++) for (let x = 0; x < N; x++) g.set(x, y, shade(add(rgb(180, 138, 86), (r() - 0.5) * 8), f * (y % 4 === 3 ? 0.72 : 1)));
    g.vline(off, b * 4, b * 4 + 2, rgb(120, 86, 50));
    g.set(1, b * 4 + 1, rgb(110, 78, 46)); g.set(14, b * 4 + 1, rgb(110, 78, 46));
  }
};
function leaves(base, hi, lo, hole = 0.2) {
  return (g, r) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (r() < hole) { g.set(x, y, [0, 0, 0, 0]); continue; }
      const t = r(); g.set(x, y, t < 0.3 ? lo : t > 0.75 ? hi : base);
    }
    g.blobs(hi, r, 3, 1.4);
  };
}
P.leaves_oak = leaves(rgb(70, 146, 50), rgb(104, 182, 66), rgb(46, 108, 38));
P.leaves_dark = leaves(rgb(34, 92, 42), rgb(54, 124, 56), rgb(20, 64, 32), 0.14);
P.leaves_jungle = leaves(rgb(40, 156, 46), rgb(88, 204, 70), rgb(24, 112, 38), 0.18);
P.leaves_pine = leaves(rgb(32, 102, 66), rgb(70, 150, 98), rgb(20, 72, 50), 0.16);
P.leaves_swamp = leaves(rgb(84, 112, 54), rgb(116, 142, 70), rgb(58, 82, 42), 0.2);
P.cactus_side = (g, r) => {
  for (let x = 0; x < N; x++) { const f = (x % 4 === 0 || x % 4 === 3) ? 0.82 : 1; for (let y = 0; y < N; y++) g.set(x, y, shade(add(rgb(62, 142, 72), (r() - 0.5) * 8), f)); }
  for (let k = 0; k < 7; k++) g.set(1 + r() * 14, r() * 15, rgb(232, 226, 190));
};
P.cactus_top = (g, r) => { g.noise(rgb(48, 120, 62), 5, r); g.rect(5, 5, 10, 10, rgb(70, 154, 80)); g.rect(7, 7, 8, 8, rgb(220, 90, 140)); };

// Construcción
P.bricks = (g, r) => {
  g.fill(rgb(178, 172, 164));
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 4 : 0;
    for (let x0 = -off; x0 < N; x0 += 8) {
      const c = add(rgb(168, 76, 58), (r() - 0.5) * 22);
      for (let y = row * 4; y < row * 4 + 3; y++) for (let x = Math.max(0, x0); x < Math.min(N, x0 + 7); x++) g.set(x, y, add(c, (r() - 0.5) * 8));
    }
  }
};
function stoneBricks(mossy) {
  return (g, r) => {
    g.fill(rgb(86, 88, 96));
    for (let row = 0; row < 2; row++) {
      const off = row % 2 ? 4 : 0;
      for (let x0 = -off; x0 < N; x0 += 8) {
        const c = add(rgb(134, 136, 144), (r() - 0.5) * 14);
        for (let y = row * 8; y < row * 8 + 7; y++) for (let x = Math.max(0, x0); x < Math.min(N, x0 + 7); x++) g.set(x, y, add(c, (r() - 0.5) * 8));
      }
    }
    if (mossy) { g.blobs(rgb(70, 124, 56), r, 5, 2.4); g.specks(rgb(96, 150, 70), r, 12); }
  };
}
P.stonebricks = stoneBricks(false); P.stonebricks_mossy = stoneBricks(true);
P.glass = (g) => {
  for (let i = 0; i < N; i++) { const c = rgb(200, 232, 245, 255); g.set(i, 0, c); g.set(i, 15, c); g.set(0, i, c); g.set(15, i, c); }
  g.set(3, 3, rgb(255, 255, 255, 200)); g.set(4, 4, rgb(255, 255, 255, 170)); g.set(5, 5, rgb(255, 255, 255, 140)); g.set(3, 5, rgb(255, 255, 255, 120));
  for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if ((x + y) % 7 === 0) g.set(x, y, rgb(214, 238, 250, 70));
};
P.workbench_top = (g, r) => {
  g.noise(rgb(176, 134, 84), 5, r);
  g.hline(0, 15, 0, rgb(98, 66, 38)); g.hline(0, 15, 15, rgb(98, 66, 38)); g.vline(0, 0, 15, rgb(98, 66, 38)); g.vline(15, 0, 15, rgb(98, 66, 38));
  g.hline(2, 13, 5, rgb(120, 86, 52)); g.hline(2, 13, 10, rgb(120, 86, 52)); g.vline(5, 2, 13, rgb(120, 86, 52)); g.vline(10, 2, 13, rgb(120, 86, 52));
};
P.workbench_side = (g, r) => {
  P.planks(g, r);
  g.rect(0, 0, 15, 3, rgb(120, 86, 52)); g.hline(0, 15, 3, rgb(88, 60, 34));
  g.rect(3, 6, 5, 7, rgb(150, 154, 160)); g.vline(4, 8, 12, rgb(96, 64, 36)); g.rect(9, 6, 13, 6, rgb(190, 192, 196)); g.hline(9, 13, 7, rgb(120, 122, 128));
};
P.furnace_top = (g, r) => { P.cobble(g, r); g.rect(0, 0, 15, 0, rgb(60, 62, 70)); };
P.furnace_side = (g, r) => { P.cobble(g, r); };
P.furnace_front = (g, r) => { P.cobble(g, r); g.rect(3, 4, 12, 12, rgb(24, 22, 26)); for (let x = 4; x < 12; x += 2) g.vline(x, 5, 11, rgb(70, 70, 78)); g.rect(3, 13, 12, 14, rgb(46, 48, 54)); };
P.furnace_front_lit = (g, r) => { P.furnace_front(g, r); g.rect(4, 6, 11, 11, rgb(236, 120, 30)); g.rect(5, 8, 10, 11, rgb(255, 196, 70)); for (let x = 4; x < 12; x += 2) g.vline(x, 5, 11, rgb(80, 60, 50)); };
P.chest_top = (g, r) => { P.planks(g, r); g.rect(0, 0, 15, 15, rgb(0, 0, 0, 0)); g.noise(rgb(150, 104, 58), 5, r); g.rect(0, 0, 15, 0, rgb(86, 56, 30)); g.rect(0, 15, 15, 15, rgb(86, 56, 30)); g.vline(0, 0, 15, rgb(86, 56, 30)); g.vline(15, 0, 15, rgb(86, 56, 30)); };
P.chest_side = (g, r) => { g.noise(rgb(150, 104, 58), 6, r); g.hline(0, 15, 0, rgb(86, 56, 30)); g.hline(0, 15, 15, rgb(86, 56, 30)); g.hline(0, 15, 6, rgb(100, 66, 36)); g.hline(0, 15, 7, rgb(120, 82, 46)); g.vline(0, 0, 15, rgb(100, 66, 36)); g.vline(15, 0, 15, rgb(100, 66, 36)); };
P.chest_front = (g, r) => { P.chest_side(g, r); g.rect(7, 5, 8, 9, rgb(214, 180, 70)); g.rect(7, 8, 8, 9, rgb(150, 120, 40)); g.set(7, 5, rgb(255, 230, 130)); };
P.bed_top = (g, r) => { g.noise(rgb(184, 58, 66), 5, r); g.rect(0, 0, 15, 4, rgb(240, 236, 226)); g.hline(0, 15, 5, rgb(150, 40, 48)); g.vline(0, 0, 15, rgb(120, 34, 42)); g.vline(15, 0, 15, rgb(120, 34, 42)); };
P.bed_side = (g, r) => { g.noise(rgb(176, 134, 84), 4, r); g.rect(0, 0, 15, 8, rgb(184, 58, 66)); g.hline(0, 15, 8, rgb(130, 40, 48)); g.rect(0, 12, 15, 15, rgb(110, 78, 46)); };
function metalBlock(base) {
  return (g, r) => {
    g.noise(base, 5, r);
    g.hline(0, 15, 0, add(base, 40)); g.vline(0, 0, 15, add(base, 30)); g.hline(0, 15, 15, add(base, -50)); g.vline(15, 0, 15, add(base, -44));
    g.rect(3, 3, 12, 12, add(base, -14)); g.hline(3, 12, 3, add(base, 20)); g.vline(3, 3, 12, add(base, 14)); g.set(5, 5, add(base, 70));
  };
}
P.block_copper = metalBlock(rgb(208, 120, 72)); P.block_iron = metalBlock(rgb(206, 210, 216)); P.block_gold = metalBlock(rgb(244, 204, 60));
P.block_crystal = metalBlock(rgb(96, 218, 236)); P.block_noctisite = metalBlock(rgb(120, 70, 206));
P.crystal_lamp = (g, r) => {
  g.fill(rgb(210, 250, 255));
  g.rect(0, 0, 15, 1, rgb(110, 190, 210)); g.rect(0, 14, 15, 15, rgb(110, 190, 210)); g.rect(0, 0, 1, 15, rgb(110, 190, 210)); g.rect(14, 0, 15, 15, rgb(110, 190, 210));
  g.rect(4, 4, 11, 11, rgb(255, 255, 255)); g.rect(6, 6, 9, 9, rgb(190, 246, 255)); g.vline(7, 2, 13, rgb(150, 220, 235)); g.hline(2, 13, 7, rgb(150, 220, 235));
};
P.farmland_dry = (g, r) => { g.noise(rgb(112, 80, 54), 5, r); for (let y = 1; y < N; y += 4) g.hline(0, 15, y, rgb(84, 58, 38)); g.specks(rgb(136, 100, 68), r, 12); };
P.farmland_wet = (g, r) => { g.noise(rgb(78, 54, 38), 4, r); for (let y = 1; y < N; y += 4) g.hline(0, 15, y, rgb(54, 36, 26)); g.specks(rgb(96, 70, 52), r, 12); };

// Puertas y escalera de mano (con transparencia en las ventanas / huecos)
function doorTile(wood, upper) {
  return (g, r) => {
    const base = wood ? rgb(150, 108, 62) : rgb(196, 200, 208);
    const dark = wood ? rgb(98, 66, 36) : rgb(120, 124, 134);
    const light = wood ? rgb(182, 138, 84) : rgb(232, 236, 242);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g.set(x, y, add(base, (r() - 0.5) * (wood ? 14 : 6)));
    // marco
    g.vline(0, 0, 15, dark); g.vline(15, 0, 15, dark);
    if (upper) g.hline(0, 15, 0, dark); else g.hline(0, 15, 15, dark);
    if (wood) {
      for (const x of [5, 10]) g.vline(x, 0, 15, shade(base, 0.8));
      if (upper) { g.rect(3, 3, 12, 8, [0, 0, 0, 0]); g.vline(7, 3, 8, dark); g.vline(8, 3, 8, dark); g.hline(3, 12, 5, dark); g.rect(2, 2, 13, 2, dark); g.rect(2, 9, 13, 9, dark); g.vline(2, 2, 9, dark); g.vline(13, 2, 9, dark); }
      else { g.rect(3, 3, 12, 6, shade(base, 0.85)); g.rect(3, 9, 12, 13, shade(base, 0.85)); g.hline(3, 12, 3, light); g.hline(3, 12, 9, light); g.set(12, 1, rgb(214, 180, 70)); g.set(12, 2, rgb(150, 120, 40)); }
    } else {
      for (let y = 2; y < 16; y += 4) g.hline(1, 14, y, light);
      if (upper) { g.rect(4, 3, 11, 9, [0, 0, 0, 0]); g.vline(7, 3, 9, dark); g.vline(8, 3, 9, dark); g.rect(3, 2, 12, 2, dark); g.rect(3, 10, 12, 10, dark); g.vline(3, 2, 10, dark); g.vline(12, 2, 10, dark); }
      else { g.rect(11, 0, 12, 2, rgb(70, 72, 80)); g.set(11, 1, rgb(220, 224, 230)); for (const [x, y] of [[3, 4], [12, 4], [3, 12], [12, 12]]) g.set(x, y, dark); }
    }
  };
}
P.door_wood_lower = doorTile(true, false); P.door_wood_upper = doorTile(true, true);
P.door_iron_lower = doorTile(false, false); P.door_iron_upper = doorTile(false, true);
P.ladder = (g, r) => {
  const c = rgb(150, 108, 62), d = rgb(104, 72, 40);
  for (const x of [2, 3, 12, 13]) for (let y = 0; y < N; y++) g.set(x, y, add(x === 3 || x === 13 ? d : c, (r() - 0.5) * 10));
  for (const y of [1, 5, 9, 13]) { g.hline(4, 11, y, add(c, (r() - 0.5) * 10)); g.hline(4, 11, y + 1, d); }
};

P.trapdoor_wood = (g, r) => {
  const c = rgb(156, 112, 64), d = rgb(98, 66, 36);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g.set(x, y, add(c, (r() - 0.5) * 12));
  g.rect(0, 0, 15, 0, d); g.rect(0, 15, 15, 15, d); g.vline(0, 0, 15, d); g.vline(15, 0, 15, d);
  for (const [x0, y0] of [[2, 2], [9, 2], [2, 9], [9, 9]]) { g.rect(x0, y0, x0 + 4, y0 + 4, [0, 0, 0, 0]); g.rect(x0 + 2, y0, x0 + 2, y0 + 4, d); }
  g.hline(1, 14, 7, d); g.hline(1, 14, 8, shade(c, 0.85));
};

// ── Fase 3: aldeas ──
P.path_top = (g, r) => { g.noise(rgb(150, 122, 74), 6, r); g.specks(rgb(120, 96, 58), r, 22); g.specks(rgb(178, 150, 100), r, 12); };
P.path_side = (g, r) => { dirtBase(g, r); for (let x = 0; x < N; x++) { g.set(x, 0, rgb(150, 122, 74)); if (r() < 0.5) g.set(x, 1, rgb(140, 112, 68)); } for (let x = 0; x < N; x++) g.set(x, 15, [0, 0, 0, 0]); };
P.hay_top = (g, r) => { g.noise(rgb(200, 170, 70), 8, r); for (let k = 0; k < 18; k++) { const x = r() * 16, y = r() * 16; g.line(x, y, x + (r() - 0.5) * 6, y + (r() - 0.5) * 6, rgb(222, 196, 96)); } g.rect(0, 0, 15, 0, rgb(150, 110, 40)); g.rect(0, 15, 15, 15, rgb(150, 110, 40)); };
P.hay_side = (g, r) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g.set(x, y, add(rgb(206, 176, 76), (r() - 0.5) * 22 + ((x * 7 + y) % 5 === 0 ? -20 : 0))); for (const y of [3, 12]) g.hline(0, 15, y, rgb(140, 40, 34)); };
P.barrel_side = (g, r) => { for (let x = 0; x < N; x++) { const f = x % 4 === 0 ? 0.75 : 1; for (let y = 0; y < N; y++) g.set(x, y, shade(add(rgb(132, 92, 52), (r() - 0.5) * 10), f)); } for (const y of [2, 13]) { g.hline(0, 15, y, rgb(70, 70, 76)); g.hline(0, 15, y + 1, rgb(110, 110, 118)); } };
P.barrel_top = (g, r) => { g.noise(rgb(146, 104, 60), 6, r); g.rect(0, 0, 15, 15, rgb(0, 0, 0, 0)); g.noise(rgb(146, 104, 60), 6, r); g.circle(7.5, 7.5, 7.6, rgb(70, 70, 76)); g.circle(7.5, 7.5, 6.4, rgb(146, 104, 60)); for (let y = 3; y < 13; y += 3) g.hline(3, 12, y, rgb(112, 78, 42)); g.rect(6, 6, 9, 9, rgb(60, 40, 22)); };
P.barrel_bottom = (g, r) => { P.barrel_top(g, r); };
P.anvil = (g, r) => { g.noise(rgb(74, 76, 82), 5, r); g.hline(0, 15, 0, rgb(120, 122, 130)); g.specks(rgb(54, 56, 62), r, 14); g.specks(rgb(100, 102, 110), r, 8); };
P.anvil_top = (g, r) => { g.noise(rgb(86, 88, 94), 4, r); g.rect(2, 2, 13, 13, rgb(104, 106, 114)); g.specks(rgb(130, 132, 140), r, 6); };
P.lantern = (g, r) => {
  g.fill([0, 0, 0, 0]);
  g.rect(5, 9, 10, 15, rgb(40, 40, 46)); g.rect(6, 10, 9, 14, rgb(255, 196, 80)); g.rect(7, 11, 8, 13, rgb(255, 244, 190));
  g.rect(6, 7, 9, 8, rgb(52, 52, 60)); g.hline(5, 10, 9, rgb(70, 70, 78)); void r;
};
P.lantern_top = (g, r) => { g.fill([0, 0, 0, 0]); g.rect(5, 5, 10, 10, rgb(40, 40, 46)); g.rect(6, 6, 9, 9, rgb(70, 70, 78)); g.rect(7, 7, 8, 8, rgb(255, 210, 110)); void r; };
P.compost_side = (g, r) => { P.planks(g, r); for (let x = 0; x < N; x += 5) g.vline(x, 0, 15, rgb(96, 66, 36)); };
P.compost_top = (g, r) => { g.noise(rgb(80, 60, 40), 6, r); g.specks(rgb(70, 110, 44), r, 20); g.specks(rgb(48, 34, 22), r, 14); };
P.lectern_side = (g, r) => { P.planks(g, r); g.rect(4, 0, 11, 15, rgb(150, 108, 60)); g.vline(4, 0, 15, rgb(110, 76, 42)); g.vline(11, 0, 15, rgb(110, 76, 42)); };
P.lectern_top = (g, r) => { g.noise(rgb(162, 120, 70), 5, r); g.rect(2, 3, 13, 12, rgb(232, 224, 200)); g.vline(7, 3, 12, rgb(170, 150, 120)); for (let y = 5; y < 12; y += 2) { g.hline(3, 6, y, rgb(120, 110, 100)); g.hline(9, 12, y, rgb(120, 110, 100)); } };
P.loom_side = (g, r) => { P.planks(g, r); g.rect(2, 2, 13, 13, rgb(0, 0, 0, 0)); g.noise(rgb(150, 108, 62), 4, r); for (let x = 3; x < 13; x += 2) g.vline(x, 2, 13, rgb(220, 210, 190)); g.rect(0, 0, 15, 1, rgb(110, 76, 42)); g.rect(0, 14, 15, 15, rgb(110, 76, 42)); };
P.loom_front = (g, r) => { P.loom_side(g, r); g.rect(4, 6, 11, 9, rgb(190, 60, 90)); g.rect(5, 7, 10, 8, rgb(230, 120, 140)); };
P.loom_top = (g, r) => { P.planks(g, r); g.rect(3, 4, 12, 11, rgb(210, 200, 180)); for (let y = 5; y < 11; y += 2) g.hline(4, 11, y, rgb(190, 60, 90)); };
P.alchemy_side = (g, r) => { P.cobble(g, r); g.rect(0, 0, 15, 5, rgb(96, 98, 106)); g.hline(0, 15, 5, rgb(60, 62, 70)); };
P.alchemy_top = (g, r) => { g.noise(rgb(110, 112, 120), 5, r); g.rect(6, 6, 9, 9, rgb(80, 220, 210)); g.set(7, 7, rgb(220, 255, 250)); g.circle(3, 12, 1.5, rgb(200, 80, 200)); g.circle(12, 3, 1.5, rgb(240, 180, 60)); };
P.bell = (g, r) => { g.fill([0, 0, 0, 0]); g.rect(5, 5, 10, 13, rgb(226, 180, 50)); g.rect(5, 12, 10, 13, rgb(180, 132, 30)); g.vline(6, 5, 11, rgb(255, 236, 140)); g.rect(6, 3, 9, 4, rgb(200, 150, 40)); g.rect(7, 13, 8, 15, rgb(90, 70, 50)); void r; };
P.bell_top = (g, r) => { g.fill([0, 0, 0, 0]); g.rect(5, 5, 10, 10, rgb(226, 180, 50)); g.rect(6, 6, 9, 9, rgb(250, 220, 110)); void r; };
P.plaster = (g, r) => { g.noise(rgb(236, 232, 222), 4, r); g.specks(rgb(218, 212, 200), r, 16); g.specks(rgb(250, 248, 242), r, 8); };
P.bookshelf = (g, r) => {
  P.planks(g, r);
  const cols = [rgb(150, 40, 40), rgb(40, 80, 150), rgb(40, 120, 60), rgb(160, 120, 40), rgb(100, 50, 120), rgb(60, 60, 70)];
  for (const y0 of [1, 9]) {
    g.rect(1, y0, 14, y0 + 5, rgb(60, 40, 22));
    for (let x = 1; x <= 14;) { const w = 1 + (r() < 0.4 ? 1 : 0); const c = cols[Math.floor(r() * cols.length)]; const h = 4 + (r() < 0.5 ? 1 : 0); g.rect(x, y0 + 6 - h, Math.min(14, x + w - 1), y0 + 5, c); g.set(x, y0 + 6 - h + 1, add(c, 60)); x += w + (r() < 0.2 ? 1 : 0); }
  }
};

// ── Fase 4: altares y arenas de los jefes ──
function altarSide(base, rune, glow) {
  return (g, r) => {
    g.noise(base, 7, r); g.specks(shade(base, 0.75), r, 18);
    g.hline(0, 15, 0, add(base, 30)); g.hline(0, 15, 15, shade(base, 0.6));
    g.rect(5, 4, 10, 11, shade(base, 0.7));
    g.vline(7, 5, 10, rune); g.vline(8, 5, 10, rune); g.hline(6, 9, 6, rune); g.hline(6, 9, 9, rune); g.set(7, 7, glow); g.set(8, 8, glow);
  };
}
function altarTop(base, rune, glow) {
  return (g, r) => {
    g.noise(base, 6, r);
    g.circle(7.5, 7.5, 5.5, shade(base, 0.7)); g.circle(7.5, 7.5, 4.2, rune); g.circle(7.5, 7.5, 2.6, shade(base, 0.6)); g.circle(7.5, 7.5, 1.4, glow);
    for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) g.set(x, y, rune);
  };
}
P.altar_forest_side = altarSide(rgb(104, 112, 92), rgb(84, 170, 70), rgb(190, 255, 150));
P.altar_forest_top = altarTop(rgb(104, 112, 92), rgb(84, 170, 70), rgb(200, 255, 160));
P.altar_crystal_side = altarSide(rgb(92, 90, 118), rgb(88, 214, 232), rgb(220, 255, 255));
P.altar_crystal_top = altarTop(rgb(92, 90, 118), rgb(88, 214, 232), rgb(230, 255, 255));
P.altar_tide_side = altarSide(rgb(70, 112, 120), rgb(60, 140, 230), rgb(180, 230, 255));
P.altar_tide_top = altarTop(rgb(70, 112, 120), rgb(60, 140, 230), rgb(200, 240, 255));
P.altar_ember_side = altarSide(rgb(58, 46, 50), rgb(255, 110, 30), rgb(255, 230, 120));
P.altar_ember_top = altarTop(rgb(58, 46, 50), rgb(255, 110, 30), rgb(255, 240, 150));
P.ancient_bark = (g, r) => {
  for (let x = 0; x < N; x++) { const c = add(rgb(78, 66, 48), (r() - 0.5) * 18); for (let y = 0; y < N; y++) g.set(x, y, add(c, (r() - 0.5) * 10)); }
  for (let k = 0; k < 5; k++) { const x = Math.floor(r() * 16); g.vline(x, 0, 15, rgb(52, 42, 30)); }
  g.blobs(rgb(76, 120, 56), r, 4, 1.6); g.specks(rgb(140, 200, 110), r, 4);
};
P.ancient_bark_top = (g, r) => { P.log_top(g, r); g.circle(7.5, 7.5, 2.2, rgb(120, 200, 90)); g.set(7, 7, rgb(220, 255, 180)); };
P.geode = (g, r) => { g.noise(rgb(70, 60, 96), 8, r); g.blobs(rgb(110, 90, 160), r, 6, 2); g.specks(rgb(170, 140, 230), r, 14); g.specks(rgb(230, 210, 255), r, 4); };
P.sea_stone = (g, r) => {
  g.noise(rgb(78, 140, 136), 8, r);
  for (let y = 0; y < N; y += 4) g.hline(0, 15, y, rgb(56, 108, 106));
  for (let y = 0; y < N; y += 4) for (let x = (y / 4) % 2 ? 2 : 6; x < N; x += 8) g.vline(x, y, y + 3, rgb(56, 108, 106));
  g.specks(rgb(120, 190, 180), r, 10);
};
P.sea_lantern = (g, r) => {
  g.noise(rgb(190, 230, 230), 8, r);
  g.rect(0, 0, 15, 0, rgb(120, 170, 170)); g.rect(0, 15, 15, 15, rgb(120, 170, 170)); g.rect(0, 0, 0, 15, rgb(120, 170, 170)); g.rect(15, 0, 15, 15, rgb(120, 170, 170));
  g.rect(5, 5, 10, 10, rgb(240, 255, 255)); g.specks(rgb(160, 220, 255), r, 12);
};
P.magma_brick = (g, r) => {
  g.noise(rgb(64, 40, 38), 6, r);
  for (let y = 3; y < N; y += 4) g.hline(0, 15, y, rgb(255, 110, 30));
  for (let y = 0; y < N; y += 4) for (let x = (y / 4) % 2 ? 3 : 11; x < N; x += 8) g.vline(x, y, y + 2, rgb(230, 80, 20));
  g.specks(rgb(255, 200, 80), r, 6);
};
P.runestone = (g, r) => {
  g.noise(rgb(112, 114, 124), 6, r); g.specks(rgb(90, 92, 100), r, 14);
  g.rect(3, 3, 12, 12, rgb(96, 98, 108)); g.line(5, 5, 10, 10, rgb(170, 140, 255)); g.line(10, 5, 5, 10, rgb(170, 140, 255)); g.hline(5, 10, 7, rgb(170, 140, 255)); g.set(7, 7, rgb(240, 220, 255));
};

// ── Fase 5: Dimensión Oscura ──
P.umbral_stone = (g, r) => { g.noise(rgb(58, 46, 72), 7, r); g.blobs(rgb(48, 38, 60), r, 4, 2); g.specks(rgb(86, 70, 104), r, 12); g.cracks(rgb(36, 28, 46), r, 3); };
P.umbral_moss_top = (g, r) => { g.noise(rgb(86, 52, 120), 10, r); g.specks(rgb(140, 90, 190), r, 18); g.specks(rgb(60, 34, 86), r, 14); g.specks(rgb(170, 230, 255), r, 3); };
P.umbral_moss_side = (g, r) => {
  P.umbral_stone(g, r);
  for (let x = 0; x < N; x++) { const h = 2 + Math.floor(r() * 3); for (let y = 0; y < h; y++) g.set(x, y, add(rgb(86, 52, 120), (r() - 0.5) * 18)); }
};
P.umbral_bricks = (g, r) => {
  g.noise(rgb(52, 40, 66), 5, r);
  for (let y = 0; y < N; y += 4) g.hline(0, 15, y, rgb(30, 22, 40));
  for (let y = 0; y < N; y += 4) for (let x = (y / 4) % 2 ? 4 : 0; x < N; x += 8) g.vline(x, y, y + 3, rgb(30, 22, 40));
  g.specks(rgb(74, 58, 92), r, 10);
};
P.umbral_brick_carved = (g, r) => {
  g.noise(rgb(56, 42, 72), 5, r);
  g.rect(0, 0, 15, 0, rgb(30, 22, 40)); g.rect(0, 15, 15, 15, rgb(30, 22, 40)); g.rect(0, 0, 0, 15, rgb(30, 22, 40)); g.rect(15, 0, 15, 15, rgb(30, 22, 40));
  g.rect(3, 3, 12, 12, rgb(40, 30, 54)); g.line(4, 4, 11, 11, rgb(170, 110, 255)); g.line(11, 4, 4, 11, rgb(170, 110, 255)); g.circle(7.5, 7.5, 1.6, rgb(220, 190, 255));
};
P.void_crystal = (g, r) => {
  g.noise(rgb(30, 20, 46), 4, r);
  for (let k = 0; k < 5; k++) { const x = 1 + r() * 12, y = 9 + r() * 6, h = 5 + r() * 6; g.poly([[x, y], [x + 1.6, y - h], [x + 3.2, y]], rgb(178, 110, 255)); g.set(x + 1.6, y - h + 1, rgb(240, 220, 255)); g.set(x + 1, y - 1, rgb(90, 40, 160)); }
};
P.ore_noctisite_umbral = (g, r) => {
  P.umbral_stone(g, r);
  for (let k = 0; k < 3; k++) {
    const cx = 3 + r() * 10, cy = 3 + r() * 10;
    g.poly([[cx - 2, cy - 1], [cx, cy - 3], [cx + 2, cy - 1], [cx + 1, cy + 2], [cx - 1, cy + 2]], rgb(160, 96, 250));
    g.set(cx, cy - 1, rgb(230, 200, 255)); g.set(cx + 1, cy + 1, rgb(80, 36, 150));
  }
};
P.fungus_stem = (g, r) => { for (let x = 0; x < N; x++) { const c = add(rgb(196, 186, 210), (r() - 0.5) * 16); for (let y = 0; y < N; y++) g.set(x, y, add(c, (r() - 0.5) * 8)); } for (let k = 0; k < 4; k++) g.vline(Math.floor(r() * 16), 0, 15, rgb(160, 148, 180)); g.specks(rgb(120, 230, 255), r, 4); };
P.fungus_stem_top = (g, r) => { g.noise(rgb(176, 166, 192), 6, r); g.circle(7.5, 7.5, 5, rgb(150, 140, 168)); g.circle(7.5, 7.5, 2.5, rgb(130, 220, 240)); };
P.fungus_cap = (g, r) => { g.noise(rgb(120, 50, 170), 10, r); g.blobs(rgb(150, 70, 210), r, 5, 2); for (let k = 0; k < 7; k++) { const x = r() * 15, y = r() * 15; g.rect(x, y, x + 1, y + 1, rgb(120, 240, 255)); } };
P.umbral_grass = (g, r) => {
  for (let x = 1; x < 15; x += 1 + (r() < 0.5 ? 1 : 0)) {
    const h = 4 + Math.floor(r() * 8); const lean = r() < 0.5 ? -1 : 1;
    for (let k = 0; k < h; k++) g.set(x + (k > h * 0.6 ? lean : 0), 15 - k, k > h - 2 ? rgb(150, 220, 255) : add(rgb(110, 60, 150), (r() - 0.5) * 20));
  }
};
P.portal_core_side = (g, r) => { g.noise(rgb(40, 28, 56), 5, r); g.rect(0, 0, 15, 2, rgb(142, 84, 232)); g.rect(0, 13, 15, 15, rgb(30, 20, 40)); g.rect(5, 5, 10, 10, rgb(70, 46, 100)); g.rect(7, 7, 8, 8, rgb(110, 70, 160)); };
P.portal_core_top = (g, r) => { g.noise(rgb(46, 32, 64), 5, r); g.circle(7.5, 7.5, 6, rgb(142, 84, 232)); g.circle(7.5, 7.5, 4.5, rgb(40, 28, 56)); g.circle(7.5, 7.5, 2, rgb(90, 60, 130)); };
P.portal_core_active_side = (g, r) => { P.portal_core_side(g, r); g.rect(5, 5, 10, 10, rgb(190, 130, 255)); g.rect(7, 7, 8, 8, rgb(250, 230, 255)); };
P.portal_core_active_top = (g, r) => { g.noise(rgb(46, 32, 64), 5, r); g.circle(7.5, 7.5, 6, rgb(190, 130, 255)); g.circle(7.5, 7.5, 4.5, rgb(120, 60, 220)); g.circle(7.5, 7.5, 2.4, rgb(250, 230, 255)); };
P.portal_veil = (g, r) => {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = Math.sin(x * 0.9 + y * 0.5) + Math.sin(y * 1.3 - x * 0.4) + (r() - 0.5) * 0.8;
    g.set(x, y, [130 + v * 30, 70 + v * 20, 220 + v * 15, 150 + v * 20]);
  }
};
P.altar_sovereign_side = altarSide(rgb(52, 40, 66), rgb(178, 110, 255), rgb(250, 230, 255));
P.altar_sovereign_top = altarTop(rgb(52, 40, 66), rgb(178, 110, 255), rgb(255, 240, 255));

// ── Fase 6: energía, máquinas y raíles ──
const COPPER = rgb(214, 120, 68), COPPER_D = rgb(150, 74, 40), COPPER_L = rgb(250, 170, 110), GLOW = rgb(255, 210, 90);
P.lever = (g, r) => { P.cobble(g, r); g.rect(6, 2, 9, 13, rgb(160, 116, 60)); g.rect(6, 2, 9, 4, rgb(200, 60, 50)); };
P.lever_on = (g, r) => { P.cobble(g, r); g.rect(6, 2, 9, 13, rgb(160, 116, 60)); g.rect(6, 2, 9, 4, rgb(80, 220, 90)); };
P.lever_top = (g, r) => { P.cobble(g, r); g.rect(5, 4, 10, 11, rgb(90, 90, 96)); };
P.button = (g, r) => { g.noise(rgb(130, 130, 136), 5, r); g.rect(0, 0, 15, 0, rgb(160, 160, 168)); g.rect(0, 15, 15, 15, rgb(90, 90, 96)); };
P.button_on = (g, r) => { g.noise(rgb(110, 110, 116), 5, r); g.rect(5, 5, 10, 10, rgb(255, 210, 90)); };
P.pressure_plate = (g, r) => { g.noise(rgb(124, 124, 130), 4, r); g.rect(0, 0, 15, 0, rgb(150, 150, 158)); g.rect(0, 0, 0, 15, rgb(150, 150, 158)); g.rect(15, 0, 15, 15, rgb(90, 90, 96)); g.rect(0, 15, 15, 15, rgb(90, 90, 96)); };
P.pressure_plate_on = (g, r) => { P.pressure_plate(g, r); g.rect(6, 6, 9, 9, rgb(255, 210, 90)); };
P.power_block = (g, r) => { g.noise(COPPER_D, 6, r); g.rect(2, 2, 13, 13, COPPER); g.rect(4, 4, 11, 11, rgb(90, 50, 30)); g.rect(6, 6, 9, 9, GLOW); g.set(7, 7, rgb(255, 250, 200)); for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) g.set(x, y, COPPER_L); };
P.cable = (g, r) => { g.fill([0, 0, 0, 0]); g.noise(COPPER, 10, r); g.specks(COPPER_D, r, 30); g.specks(COPPER_L, r, 12); };
P.cable_on = (g, r) => { g.fill([0, 0, 0, 0]); g.noise(rgb(250, 160, 80), 10, r); g.specks(GLOW, r, 40); g.specks(rgb(255, 250, 200), r, 12); };
for (const kind of ['repeater', 'inverter']) {
  P[kind + '_side'] = (g, r) => { g.noise(rgb(140, 140, 146), 4, r); g.rect(0, 0, 15, 2, rgb(110, 110, 116)); };
  for (const on of ['', '_on']) for (let f = 0; f < 4; f++) {
    P[`${kind}${on}_top_${f}`] = (g, r) => {
      g.noise(rgb(150, 150, 156), 4, r);
      // flecha hacia la salida (f: 0 N arriba, 1 E derecha, 2 S abajo, 3 O izquierda)
      const pts = [[8, 2], [12, 7], [10, 7], [10, 13], [6, 13], [6, 7], [4, 7]];
      const rot = (x, y) => { let X = x - 8, Y = y - 8; for (let k = 0; k < f; k++) { const t = X; X = -Y; Y = t; } return [X + 8, Y + 8]; };
      g.poly(pts.map(([x, y]) => rot(x, y)), on ? GLOW : (kind === 'repeater' ? COPPER : rgb(120, 70, 160)));
      if (kind === 'inverter') { const [cx, cy] = rot(8, 11); g.circle(cx, cy, 1.5, on ? rgb(255, 250, 200) : rgb(60, 30, 80)); }
    };
  }
}
P.energy_lamp = (g, r) => { g.noise(rgb(110, 96, 70), 5, r); g.rect(1, 1, 14, 14, rgb(70, 60, 44)); g.rect(3, 3, 12, 12, rgb(120, 110, 90)); for (let k = 3; k <= 12; k += 3) { g.hline(3, 12, k, rgb(90, 80, 60)); g.vline(k, 3, 12, rgb(90, 80, 60)); } };
P.energy_lamp_on = (g, r) => { g.noise(rgb(255, 220, 120), 8, r); g.rect(1, 1, 14, 14, rgb(200, 150, 60)); g.rect(3, 3, 12, 12, rgb(255, 236, 160)); for (let k = 3; k <= 12; k += 3) { g.hline(3, 12, k, rgb(240, 190, 90)); g.vline(k, 3, 12, rgb(240, 190, 90)); } };
P.piston_side = (g, r) => { P.cobble(g, r); g.rect(0, 0, 15, 3, rgb(150, 110, 60)); g.hline(0, 15, 3, rgb(110, 80, 40)); };
P.piston_front = (g, r) => { P.planks(g, r); g.rect(5, 5, 10, 10, rgb(110, 110, 118)); g.rect(6, 6, 9, 9, rgb(150, 150, 158)); };
P.piston_front_open = (g, r) => { P.cobble(g, r); g.rect(5, 5, 10, 10, rgb(60, 60, 66)); g.rect(6, 6, 9, 9, rgb(150, 150, 158)); };
P.piston_head_side = (g, r) => { P.planks(g, r); g.rect(0, 4, 15, 11, rgb(150, 150, 158)); };
P.machine_side = (g, r) => { P.cobble(g, r); g.rect(0, 0, 15, 1, rgb(90, 90, 96)); g.rect(0, 14, 15, 15, rgb(90, 90, 96)); g.vline(7, 2, 13, COPPER_D); g.vline(8, 2, 13, COPPER); };
P.machine_top = (g, r) => { P.cobble(g, r); g.rect(4, 4, 11, 11, rgb(90, 90, 96)); g.rect(6, 6, 9, 9, COPPER); };
P.dispenser_front = (g, r) => { P.machine_side(g, r); g.rect(4, 4, 11, 11, rgb(40, 40, 44)); g.rect(5, 5, 10, 10, rgb(20, 20, 24)); g.set(4, 4, COPPER_L); };
P.harvester_front = (g, r) => { P.machine_side(g, r); for (let k = 0; k < 4; k++) { g.line(2 + k * 3, 3, 4 + k * 3, 12, rgb(210, 210, 220)); g.line(3 + k * 3, 3, 5 + k * 3, 12, rgb(140, 140, 150)); } };
P.hopper_side = (g, r) => { g.noise(rgb(70, 70, 76), 4, r); g.rect(0, 0, 15, 1, rgb(100, 100, 108)); g.specks(rgb(50, 50, 56), r, 10); };
P.hopper_top = (g, r) => { g.noise(rgb(70, 70, 76), 4, r); g.rect(2, 2, 13, 13, rgb(30, 30, 34)); g.rect(5, 5, 10, 10, rgb(50, 50, 56)); };
function railTile(conn, base, rail, tie) {
  return (g, r) => {
    g.fill([0, 0, 0, 0]);
    // traviesas y carriles: conn = lista de direcciones (0 N, 1 E, 2 S, 3 O)
    const set = (x, y, c) => g.set(x, y, c);
    const has = (d) => conn.includes(d);
    if (has(0) && has(2)) { for (let y = 1; y < 16; y += 3) g.rect(2, y, 13, y + 1, tie); for (let y = 0; y < 16; y++) { set(4, y, rail); set(11, y, rail); } }
    else if (has(1) && has(3)) { for (let x = 1; x < 16; x += 3) g.rect(x, 2, x + 1, 13, tie); for (let x = 0; x < 16; x++) { set(x, 4, rail); set(x, 11, rail); } }
    else {
      // curva: arcos de radio 4 y 11 centrados en la esquina común
      const cx = has(1) ? 16 : -1, cy = has(2) ? 16 : -1;
      for (let a = 0; a < 16; a++) { const t = a / 15 * Math.PI / 2; for (const R of [4.5, 11.5]) { const x = cx + (cx > 0 ? -1 : 1) * Math.cos(t) * R, y = cy + (cy > 0 ? -1 : 1) * Math.sin(t) * R; set(x, y, rail); } }
      for (let k = 0; k < 5; k++) { const t = (k + 0.5) / 5 * Math.PI / 2; const x0 = cx + (cx > 0 ? -1 : 1) * Math.cos(t) * 2.5, y0 = cy + (cy > 0 ? -1 : 1) * Math.sin(t) * 2.5, x1 = cx + (cx > 0 ? -1 : 1) * Math.cos(t) * 13.5, y1 = cy + (cy > 0 ? -1 : 1) * Math.sin(t) * 13.5; g.line(x0, y0, x1, y1, tie); }
      for (let a = 0; a < 24; a++) { const t = a / 23 * Math.PI / 2; for (const R of [4.5, 11.5]) { const x = cx + (cx > 0 ? -1 : 1) * Math.cos(t) * R, y = cy + (cy > 0 ? -1 : 1) * Math.sin(t) * R; set(x, y, rail); } }
    }
    void base; void r;
  };
}
const RAIL_C = rgb(170, 170, 180), TIE = rgb(110, 76, 44);
P.rail_ns = railTile([0, 2], null, RAIL_C, TIE); P.rail_ew = railTile([1, 3], null, RAIL_C, TIE);
P.rail_ne = railTile([0, 1], null, RAIL_C, TIE); P.rail_es = railTile([1, 2], null, RAIL_C, TIE);
P.rail_sw = railTile([2, 3], null, RAIL_C, TIE); P.rail_wn = railTile([3, 0], null, RAIL_C, TIE);
P.booster_ns = railTile([0, 2], null, rgb(240, 200, 60), rgb(70, 50, 30)); P.booster_ew = railTile([1, 3], null, rgb(240, 200, 60), rgb(70, 50, 30));
P.booster_on_ns = railTile([0, 2], null, rgb(255, 240, 140), rgb(200, 90, 40)); P.booster_on_ew = railTile([1, 3], null, rgb(255, 240, 140), rgb(200, 90, 40));

// Vegetación (con transparencia)
function blade(g, x, y0, y1, c) { for (let y = y0; y <= y1; y++) g.set(x, y, c); }
P.tall_grass = (g, r) => {
  for (let x = 1; x < 15; x += 1 + (r() < 0.5 ? 1 : 0)) {
    const h = 6 + Math.floor(r() * 7); const lean = r() < 0.5 ? -1 : 1;
    for (let k = 0; k < h; k++) g.set(x + (k > h * 0.6 ? lean : 0), 15 - k, k > h - 3 ? rgb(130, 196, 80) : add(rgb(84, 156, 54), (r() - 0.5) * 20));
  }
};
P.fern = (g, r) => {
  g.vline(8, 6, 15, rgb(58, 120, 52));
  for (let k = 0; k < 7; k++) { const y = 15 - k * 1.5; const w = 6 - Math.abs(k - 3) * 0.5; for (let d = 1; d <= w; d++) { g.set(8 - d, y - d * 0.4, rgb(70, 146, 62)); g.set(8 + d, y - d * 0.4, rgb(82, 160, 70)); } }
};
function flower(petal, center, tall = 8) {
  return (g) => {
    g.vline(8, 15 - tall, 15, rgb(62, 130, 56)); g.set(7, 13, rgb(80, 150, 60)); g.set(9, 11, rgb(80, 150, 60)); g.set(6, 12, rgb(62, 130, 56));
    const cy = 15 - tall;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1]]) g.set(8 + dx, cy + dy, petal);
    g.set(8, cy, center);
  };
}
P.flower_red = flower(rgb(226, 52, 52), rgb(250, 214, 60)); P.flower_yellow = flower(rgb(252, 214, 56), rgb(220, 140, 30), 7);
P.flower_blue = flower(rgb(72, 112, 232), rgb(230, 240, 255), 9); P.flower_pink = flower(rgb(244, 132, 186), rgb(255, 230, 120), 8);
P.flower_moon = (g) => {
  flower(rgb(226, 238, 255), rgb(190, 214, 255), 8)(g);
  for (const [x, y] of [[5, 5], [11, 6], [7, 3], [10, 3], [4, 8]]) g.set(x, y, rgb(170, 200, 255, 160));
};
P.mushroom_glow = (g, r) => {
  g.rect(7, 10, 8, 15, rgb(214, 230, 224)); g.ellipse(7.5, 9, 4.5, 3, rgb(48, 214, 180)); g.rect(2, 10, 13, 10, rgb(24, 150, 128));
  g.set(5, 8, rgb(190, 255, 240)); g.set(9, 7, rgb(190, 255, 240)); g.set(10, 9, rgb(190, 255, 240));
};
P.mushroom_dark = (g) => { g.rect(7, 10, 8, 15, rgb(206, 190, 168)); g.ellipse(7.5, 9, 4.5, 3, rgb(120, 70, 52)); g.rect(2, 10, 13, 10, rgb(84, 48, 36)); g.set(5, 8, rgb(200, 150, 120)); g.set(9, 7, rgb(200, 150, 120)); };
P.dead_bush = (g, r) => {
  const c = rgb(120, 88, 52);
  g.line(8, 15, 8, 9, c); g.line(8, 12, 4, 8, c); g.line(8, 11, 12, 6, c); g.line(4, 8, 3, 5, c); g.line(12, 6, 13, 3, c); g.line(8, 9, 7, 5, c); g.line(6, 10, 4, 12, shade(c, 0.8));
};
P.reed = (g, r) => {
  for (const x of [3, 7, 11]) { const h = 11 + Math.floor(r() * 4); g.vline(x, 15 - h, 15, rgb(110, 154, 70)); g.vline(x + 1, 16 - h, 15, rgb(84, 126, 54)); g.rect(x, 15 - h - 1, x + 1, 15 - h + 1, rgb(142, 96, 60)); }
};
function sapling(leaf, leafHi) {
  return (g, r) => {
    g.vline(8, 9, 15, rgb(110, 80, 46));
    g.ellipse(8, 7, 4, 3.5, leaf);
    for (const [x, y] of [[6, 6], [9, 5], [8, 8], [10, 7], [6, 8]]) g.set(x, y, leafHi);
  };
}
P.sapling_oak = sapling(rgb(70, 146, 50), rgb(112, 190, 70)); P.sapling_dark = sapling(rgb(34, 92, 42), rgb(60, 130, 60));
P.sapling_jungle = sapling(rgb(40, 156, 46), rgb(96, 210, 76)); P.sapling_pine = (g, r) => { g.vline(8, 11, 15, rgb(90, 62, 46)); g.poly([[8, 2], [12, 11], [4, 11]], rgb(32, 102, 66)); g.set(8, 5, rgb(70, 150, 98)); g.set(7, 8, rgb(70, 150, 98)); g.set(10, 9, rgb(70, 150, 98)); };
function bush(berries) {
  return (g, r) => {
    g.ellipse(8, 10, 6.5, 5, rgb(46, 110, 46)); g.ellipse(8, 9, 5, 3.5, rgb(66, 140, 56));
    g.vline(8, 13, 15, rgb(100, 72, 42));
    if (berries) for (const [x, y] of [[5, 8], [8, 6], [10, 9], [7, 11], [11, 7], [4, 11]]) { g.set(x, y, rgb(214, 38, 70)); g.set(x + 1, y, rgb(150, 20, 52)); }
  };
}
P.berry_bush = bush(true); P.berry_bush_empty = bush(false);
P.torch = (g) => {
  g.vline(7, 9, 15, rgb(120, 84, 46)); g.vline(8, 9, 15, rgb(92, 62, 34));
  g.rect(7, 6, 8, 8, rgb(255, 200, 60)); g.set(7, 6, rgb(255, 245, 170)); g.set(8, 8, rgb(240, 120, 30));
};
// Cultivos
function crop(kind, stage) {
  return (g, r) => {
    const rows = [3, 6, 9, 12][stage];
    if (kind === 'wheat') {
      for (let x = 1; x < 15; x += 3) {
        const h = Math.max(2, rows - (x % 2)); const ripe = stage === 3;
        const c = stage < 2 ? rgb(86, 168, 60) : stage === 2 ? rgb(150, 178, 60) : rgb(218, 184, 70);
        g.vline(x, 15 - h, 15, c); g.vline(x + 1, 16 - h, 15, shade(c, 0.85));
        if (ripe) { g.set(x, 15 - h - 1, rgb(236, 206, 90)); g.set(x + 1, 15 - h, rgb(190, 148, 50)); g.set(x - 1, 15 - h + 1, rgb(236, 206, 90)); }
      }
    } else if (kind === 'carrot') {
      for (let x = 2; x < 15; x += 4) {
        const h = Math.max(2, rows - 1);
        for (let k = 0; k < h; k++) { g.set(x, 15 - k, rgb(70, 156, 54)); g.set(x - 1 - (k % 2), 15 - k, rgb(92, 178, 66)); g.set(x + 1 + (k % 2), 15 - k - 1, rgb(60, 138, 48)); }
        if (stage === 3) { g.set(x, 15, rgb(240, 130, 30)); g.set(x + 1, 15, rgb(240, 130, 30)); g.set(x, 14, rgb(250, 160, 50)); }
      }
    } else {
      for (let x = 3; x < 15; x += 5) {
        const h = Math.max(2, rows);
        g.ellipse(x, 14 - h * 0.4, 2 + stage * 0.6, Math.max(1.2, h * 0.5), rgb(60, 140, 54)); g.vline(x, 13, 15, rgb(80, 120, 50));
        if (stage === 3) { g.set(x, 10, rgb(250, 250, 240)); g.set(x + 1, 11, rgb(250, 250, 240)); g.set(x - 1, 12, rgb(230, 200, 120)); }
      }
    }
  };
}
for (const k of ['wheat', 'carrot', 'potato']) for (let s = 0; s < 4; s++) P[`crop_${k}_${s}`] = crop(k, s);
// Tomatera: tallos con tutor y frutos rojos al madurar
function tomatoCrop(stage) {
  return (g, r) => {
    const h = [4, 7, 10, 12][stage];
    for (const x of [4, 11]) {
      g.vline(x, 15 - h - 1, 15, rgb(150, 118, 70)); // tutor de madera
      for (let k = 0; k < h; k++) { g.set(x + 1, 15 - k, rgb(66, 140, 50)); if (k % 3 === 1) { g.set(x + 2, 15 - k, rgb(84, 168, 62)); g.set(x - 1, 14 - k, rgb(58, 128, 46)); } }
      if (stage >= 2) for (const [dx, dy] of [[2, 4], [-1, 7], [2, 9]]) {
        const c = stage === 3 ? rgb(220, 46, 40) : rgb(150, 186, 70);
        g.set(x + dx, 15 - dy, c); g.set(x + dx, 16 - dy, shade(c, 0.8)); if (stage === 3) g.set(x + dx + 1, 15 - dy, rgb(246, 110, 96));
      }
    }
    void r;
  };
}
// Maíz: cañas altas con hojas largas y mazorcas amarillas
function cornCrop(stage) {
  return (g, r) => {
    const h = [5, 9, 13, 15][stage];
    for (const x of [3, 8, 13]) {
      g.vline(x, 16 - h, 15, rgb(92, 158, 58)); g.vline(x + 1, 17 - h, 15, rgb(70, 130, 46));
      for (let k = 2; k < h; k += 3) { g.line(x, 15 - k, x - 2, 13 - k, rgb(108, 176, 70)); g.line(x + 1, 14 - k, x + 3, 12 - k, rgb(84, 150, 56)); }
      if (stage === 3) { g.rect(x + 1, 7, x + 2, 10, rgb(242, 206, 64)); g.set(x + 1, 6, rgb(206, 170, 90)); g.set(x + 2, 8, rgb(255, 232, 120)); }
      if (stage >= 2) g.set(x, 15 - h, rgb(220, 200, 120));
    }
    void r;
  };
}
for (let s = 0; s < 4; s++) { P[`crop_tomato_${s}`] = tomatoCrop(s); P[`crop_corn_${s}`] = cornCrop(s); }
// Fluidos (periódicos para poder animarlos desplazando el UV dentro del tile)
P.water = (g) => {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const w = Math.sin((x / N) * Math.PI * 2 * 2 + y * 0.3) * 0.5 + Math.sin((y / N) * Math.PI * 2 * 3 - x * 0.2) * 0.5 + Math.sin(((x + y) / N) * Math.PI * 2 * 2) * 0.4;
    g.set(x, y, rgb(40 + w * 12, 108 + w * 14, 204 + w * 14, 190));
  }
};
P.lava = (g) => {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const w = Math.sin((x / N) * Math.PI * 2 * 2 + Math.cos((y / N) * Math.PI * 2 * 2) * 1.5) + Math.sin((y / N) * Math.PI * 2 * 3 + (x / N) * Math.PI * 2);
    const t = (w + 2) / 4;
    g.set(x, y, mix(rgb(176, 36, 10), rgb(255, 214, 60), Math.pow(t, 1.6)));
  }
};
P.missing = (g) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g.set(x, y, ((x >> 2) + (y >> 2)) % 2 ? rgb(255, 0, 255) : rgb(20, 20, 20)); };

// ── Construcción del atlas ───────────────────────────────────────
const tileNames = [];
const tileIndex = new Map();
function addTile(name) {
  if (!tileIndex.has(name)) { tileIndex.set(name, tileNames.length); tileNames.push(name); }
  return tileIndex.get(name);
}
addTile('missing');
for (const b of BLOCKS) if (b) for (const t of b.tiles) addTile(P[t] ? t : 'missing');
if (tileNames.length > ATLAS_COLS * ATLAS_COLS) throw new Error('Demasiados tiles para el atlas');

/** Índice de tile (0..ATLAS_COLS²−1) de un nombre; 0 = textura "faltante". */
export const tileOf = (name) => tileIndex.get(name) ?? 0;
/** Tile de cada cara de cada bloque: B_TILE[id*6 + cara] */
export const B_TILE = new Uint16Array(MAX_BLOCKS * 6);
for (const b of BLOCKS) if (b) for (let f = 0; f < 6; f++) B_TILE[b.id * 6 + f] = tileOf(P[b.tiles[f]] ? b.tiles[f] : 'missing');

let atlasCanvas = null;
export function getAtlasCanvas() {
  if (atlasCanvas) return atlasCanvas;
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS_SIZE;
  const ctx = c.getContext('2d');
  tileNames.forEach((name, i) => {
    const g = new Grid(N);
    const r = mulberry32(hashString('tile:' + name));
    (P[name] || P.missing)(g, r);
    const img = new ImageData(g.d, N, N);
    ctx.putImageData(img, (i % ATLAS_COLS) * N, Math.floor(i / ATLAS_COLS) * N);
  });
  atlasCanvas = c;
  return c;
}
/** Color medio opaco de un tile (para partículas de rotura). */
const avgCache = new Map();
export function tileAverageColor(name) {
  if (avgCache.has(name)) return avgCache.get(name);
  const g = new Grid(N); (P[name] || P.missing)(g, mulberry32(hashString('tile:' + name)));
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < g.d.length; i += 4) if (g.d[i + 3] > 128) { r += g.d[i]; gg += g.d[i + 1]; b += g.d[i + 2]; n++; }
  const col = n ? (Math.round(r / n) << 16) | (Math.round(gg / n) << 8) | Math.round(b / n) : 0x888888;
  avgCache.set(name, col);
  return col;
}

// ── Iconos de objetos ────────────────────────────────────────────
const TIER_COL = {};
for (const [k, t] of Object.entries(TIERS)) TIER_COL[k] = { m: hex(t.color), d: hex(t.dark), l: hex(t.light) };
const ARMOR_COL = {};
for (const [k, t] of Object.entries(ARMOR_TIERS)) ARMOR_COL[k] = { m: hex(t.color), d: hex(t.dark), l: hex(t.light) };
const HANDLE = hex('#a0743c'), HANDLE_D = hex('#6a4824');

function toolSprite(type, tier) {
  const g = new Grid(16);
  const C = TIER_COL[tier];
  // mango diagonal
  const hand = (x0, y0, x1, y1) => { g.line(x0, y0, x1, y1, HANDLE); g.line(x0, y0 + 1, x1 - 1, y1 + 1, HANDLE_D); };
  if (type === 'pickaxe') {
    hand(2, 14, 11, 5);
    // cabeza curva
    const pts = [[3, 6], [4, 4], [6, 3], [8, 2], [10, 2], [12, 3], [13, 5], [14, 8]];
    for (let i = 0; i < pts.length; i++) { g.set(pts[i][0], pts[i][1], C.m); g.set(pts[i][0], pts[i][1] + 1, C.d); g.set(pts[i][0] + (i > 3 ? 0 : 0), pts[i][1] - 1, C.l); }
    g.set(3, 7, C.d); g.set(14, 9, C.d); g.set(11, 4, C.m); g.set(10, 3, C.m); g.set(9, 3, C.m);
  } else if (type === 'axe') {
    hand(2, 14, 10, 6);
    g.poly([[6, 2], [11, 1], [14, 3], [14, 7], [11, 9], [9, 7], [8, 5]], C.m);
    g.poly([[6, 2], [11, 1], [10, 3]], C.l); g.line(14, 3, 14, 7, C.l); g.line(9, 7, 11, 9, C.d); g.line(11, 9, 14, 7, C.d);
  } else if (type === 'shovel') {
    hand(2, 14, 10, 6);
    g.poly([[10, 1], [13, 2], [14, 5], [12, 8], [9, 7], [8, 4]], C.m);
    g.line(10, 1, 13, 2, C.l); g.line(8, 4, 10, 1, C.l); g.line(12, 8, 14, 5, C.d); g.line(9, 7, 12, 8, C.d);
  } else if (type === 'sword') {
    g.line(3, 12, 13, 2, C.m); g.line(4, 12, 14, 2, C.m); g.line(3, 11, 12, 2, C.l); g.line(5, 12, 14, 3, C.d); g.set(14, 1, C.l); g.set(13, 1, C.m); g.set(14, 2, C.l);
    g.line(3, 9, 7, 13, hex('#b9893f')); g.line(2, 9, 6, 13, hex('#7a5a28'));
    g.line(2, 14, 4, 12, HANDLE); g.line(1, 15, 2, 14, HANDLE_D); g.set(1, 14, HANDLE_D);
  } else if (type === 'hoe') {
    hand(2, 14, 11, 5);
    g.poly([[7, 2], [13, 2], [14, 3], [14, 5], [12, 4], [8, 4], [6, 5], [5, 4]], C.m);
    g.line(7, 2, 13, 2, C.l); g.line(14, 4, 14, 6, C.d); g.line(12, 5, 14, 6, C.d);
  }
  g.outline();
  return g;
}
function armorSprite(slot, tier) {
  const g = new Grid(16);
  const C = ARMOR_COL[tier];
  if (slot === 'head') {
    g.poly([[3, 12], [3, 6], [5, 3], [8, 2], [11, 3], [13, 6], [13, 12], [10, 12], [10, 9], [6, 9], [6, 12]], C.m);
    g.poly([[5, 3], [8, 2], [11, 3], [10, 4], [6, 4]], C.l); g.vline(3, 7, 12, C.d); g.vline(13, 7, 12, C.d); g.rect(6, 9, 9, 9, C.d); g.vline(6, 9, 12, C.d); g.vline(9, 9, 12, C.d);
    g.set(8, 5, C.l); g.set(7, 5, C.l);
  } else if (slot === 'chest') {
    g.poly([[1, 4], [5, 2], [7, 4], [9, 4], [11, 2], [15, 4], [14, 8], [12, 7], [12, 14], [4, 14], [4, 7], [2, 8]], C.m);
    g.poly([[5, 2], [7, 4], [9, 4], [11, 2], [9, 3], [7, 3]], C.l); g.vline(4, 8, 14, C.d); g.hline(5, 11, 14, C.d); g.vline(8, 5, 13, C.d); g.hline(5, 11, 9, C.d);
    g.set(2, 5, C.l); g.set(13, 5, C.l);
  } else if (slot === 'legs') {
    g.poly([[3, 2], [13, 2], [13, 8], [11, 14], [9, 14], [8, 8], [7, 8], [6, 14], [4, 14], [3, 8]], C.m);
    g.hline(3, 12, 2, C.l); g.hline(3, 12, 3, C.l); g.vline(8, 8, 8, C.d); g.vline(4, 9, 14, C.d); g.vline(11, 9, 14, C.d); g.hline(3, 12, 6, C.d);
  } else {
    g.poly([[2, 8], [6, 8], [6, 12], [7, 14], [2, 14]], C.m); g.poly([[9, 8], [13, 8], [14, 14], [9, 14], [9, 12]], C.m);
    g.hline(2, 6, 8, C.l); g.hline(9, 13, 8, C.l); g.hline(2, 7, 14, C.d); g.hline(9, 14, 14, C.d); g.vline(2, 9, 14, C.d);
  }
  g.outline();
  return g;
}

const INGOT_COL = { copper_ingot: '#d9814b', iron_ingot: '#d6d9de', gold_ingot: '#f5cd3b', noctisite_ingot: '#8f5be0' };
const RAW_COL = { raw_copper: ['#d9814b', '#79c9a2'], raw_iron: ['#d6b098', '#f0dcc8'], raw_gold: ['#f2cf4a', '#fff2a0'], raw_noctisite: ['#8f5be0', '#d6b8ff'] };

function ingot(g, col) {
  const m = hex(col), l = add(m, 50), d = shade(m, 0.62);
  g.poly([[2, 10], [5, 6], [14, 6], [11, 10]], l); g.poly([[2, 10], [11, 10], [11, 13], [2, 13]], m); g.poly([[11, 10], [14, 6], [14, 9], [11, 13]], d);
  g.hline(3, 10, 10, add(m, 25)); g.set(6, 7, add(l, 30)); g.set(7, 7, add(l, 30));
}
function doorItem(g, key) {
  const lo = new Grid(16), up = new Grid(16);
  P[key + '_lower'](lo, mulberry32(hashString('tile:' + key + '_lower')));
  P[key + '_upper'](up, mulberry32(hashString('tile:' + key + '_upper')));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
    g.set(4 + x, y >> 1, up.get(x * 2, y));
    g.set(4 + x, 8 + (y >> 1), lo.get(x * 2, y));
  }
}
function flask(g, liquid) {
  g.rect(6, 2, 9, 4, hex('#c8d4e0')); g.rect(6, 1, 9, 1, hex('#8a6a40'));
  g.circle(7.5, 10, 5, hex('#d8e4f0')); g.circle(7.5, 10, 4, liquid ? hex(liquid) : hex('#eef4fa'));
  if (liquid) { g.hline(4, 11, 7, add(hex(liquid), 40)); g.circle(6, 9, 1, add(hex(liquid), 90)); }
  g.set(5, 8, hex('#ffffff'));
}
function essence(g, col, hi) {
  g.poly([[8, 1], [12, 5], [12, 11], [8, 15], [4, 11], [4, 5]], shade(hex(col), 0.6));
  g.poly([[8, 3], [11, 6], [11, 10], [8, 13], [5, 10], [5, 6]], hex(col));
  g.poly([[8, 3], [11, 6], [8, 8]], hex(hi)); g.set(7, 10, hex(hi));
}
/** Color del líquido de cada tónico (según su efecto principal). */
const TONIC_COL = {
  tonic_healing: '#e8304a', tonic_regeneration: '#e8609a', tonic_strength: '#a8282a', tonic_speed: '#7ac8ff', tonic_haste: '#e8c84a',
  tonic_fire: '#ff8a2a', tonic_water: '#2a5ad0', tonic_night: '#5a5ae0', tonic_resistance: '#8a8ca0',
};
function bowlWith(g, soup, bits) {
  g.poly([[2, 7], [14, 7], [12, 12], [4, 12]], hex('#9a6a3a')); g.hline(5, 11, 13, hex('#7a522a'));
  g.ellipse(8, 7, 6, 1.6, hex(soup));
  for (const [c, x, y] of bits) { g.set(x, y, hex(c)); g.set(x + 1, y, hex(c)); }
}
function sprites(key) {
  const g = new Grid(16);
  const S = { // dibujos concretos
    stick: () => { g.line(3, 13, 12, 3, HANDLE); g.line(4, 13, 13, 3, HANDLE_D); },
    coal: () => { g.poly([[4, 5], [9, 3], [13, 6], [12, 12], [7, 13], [3, 10]], hex('#2c2c34')); g.poly([[4, 5], [9, 3], [8, 6], [5, 7]], hex('#58586a')); g.set(10, 8, hex('#6c6c80')); g.set(6, 10, hex('#14141a')); g.set(11, 10, hex('#14141a')); },
    charcoal: () => { g.poly([[3, 6], [8, 4], [13, 7], [12, 12], [6, 13], [3, 10]], hex('#3a3238')); g.poly([[3, 6], [8, 4], [7, 7]], hex('#665a64')); g.set(10, 9, hex('#7a6a78')); g.set(6, 10, hex('#1c1618')); },
    flint: () => { g.poly([[5, 3], [11, 5], [13, 10], [8, 13], [4, 9]], hex('#5c6068')); g.poly([[5, 3], [11, 5], [9, 7]], hex('#8c929c')); g.set(8, 9, hex('#30343a')); },
    snowball: () => { g.circle(8, 8, 5, hex('#eef4fb')); g.circle(6.5, 6.5, 2, hex('#ffffff')); g.line(10, 12, 12, 9, hex('#b8cfe6')); },
    clay_ball: () => { g.circle(8, 8, 5, hex('#9ba3ba')); g.circle(6.5, 6.5, 2, hex('#b7bed2')); g.line(10, 12, 12, 9, hex('#7a8298')); },
    brick: () => { g.poly([[2, 5], [13, 5], [14, 6], [14, 11], [3, 11], [2, 10]], hex('#a8483a')); g.hline(3, 13, 5, hex('#cc6a54')); g.hline(3, 13, 6, hex('#bc5a46')); g.hline(3, 13, 10, hex('#7a3226')); g.set(6, 8, hex('#8a3a2c')); g.set(10, 8, hex('#8a3a2c')); },
    leather: () => { g.poly([[2, 3], [13, 3], [14, 7], [12, 13], [4, 13], [2, 8]], hex('#a8672d')); g.poly([[2, 3], [13, 3], [12, 5], [3, 5]], hex('#c88b4a')); g.line(4, 8, 11, 8, hex('#7e4c1e')); g.set(6, 6, hex('#7e4c1e')); g.set(10, 11, hex('#7e4c1e')); },
    feather: () => { g.line(3, 13, 13, 3, hex('#e8e8f0')); g.poly([[4, 10], [8, 4], [13, 3], [10, 7], [6, 11]], hex('#f4f4fa')); g.line(5, 11, 12, 4, hex('#b8b8c8')); g.line(8, 5, 12, 4, hex('#d8d8e4')); },
    scute: () => { g.ellipse(8, 8, 6, 5, hex('#5e7a3e')); g.ellipse(8, 7, 5, 3.5, hex('#7ca050')); g.vline(8, 4, 11, hex('#3e5428')); g.line(5, 6, 11, 6, hex('#3e5428')); g.line(5, 9, 11, 9, hex('#3e5428')); },
    seed_wheat: () => { for (const [x, y] of [[4, 5], [8, 4], [11, 7], [6, 9], [10, 11], [4, 11]]) { g.set(x, y, hex('#c9a44e')); g.set(x + 1, y, hex('#e4c670')); g.set(x, y + 1, hex('#8a6a28')); } },
    wheat: () => { for (let i = 0; i < 3; i++) { const x = 4 + i * 3; g.line(x, 14, x + 1, 5, hex('#c9a44e')); for (let k = 0; k < 4; k++) { g.set(x - 1 + (k % 2) * 2, 4 + k, hex('#e8c870')); g.set(x + 1 + (k % 2), 5 + k, hex('#e8c870')); } } g.line(3, 12, 11, 12, hex('#8a6a28')); },
    carrot: () => { g.poly([[5, 5], [11, 5], [8, 15]], hex('#ee7a1c')); g.line(6, 7, 9, 7, hex('#c85c0a')); g.line(7, 10, 9, 10, hex('#c85c0a')); g.line(8, 5, 6, 1, hex('#4aa03a')); g.line(8, 5, 9, 1, hex('#5cbc48')); g.line(8, 5, 11, 2, hex('#3c8a30')); },
    potato: () => { g.ellipse(8, 9, 5.5, 4, hex('#b8894c')); g.ellipse(7, 8, 3, 2, hex('#d1a468')); g.set(10, 10, hex('#7c5826')); g.set(6, 11, hex('#7c5826')); g.set(11, 8, hex('#7c5826')); },
    baked_potato: () => { g.ellipse(8, 9, 5.5, 4, hex('#8a5a2a')); g.ellipse(7, 8, 3, 2, hex('#b8844a')); g.line(5, 8, 10, 10, hex('#f2e2a0')); g.set(10, 8, hex('#4c3016')); },
    berries: () => { for (const [x, y, c] of [[5, 6, '#8a2cc8'], [10, 5, '#a63ee0'], [8, 10, '#8a2cc8'], [4, 11, '#6a1ca0'], [11, 11, '#a63ee0']]) { g.circle(x, y, 2, hex(c)); g.set(x - 1, y - 1, hex('#d8a8f8')); } },
    apple: () => { g.circle(8, 9, 5, hex('#d8342c')); g.circle(6, 7, 1.6, hex('#ff7c68')); g.line(8, 4, 9, 2, hex('#6a4220')); g.poly([[9, 3], [12, 2], [11, 5]], hex('#58b040')); g.set(9, 14, hex('#9c1c1c')); g.set(11, 11, hex('#9c1c1c')); },
    bread: () => { g.ellipse(8, 9, 6.5, 4, hex('#c88a44')); g.ellipse(8, 8, 5.5, 3, hex('#e0aa62')); for (const x of [5, 8, 11]) g.line(x, 6, x - 1, 9, hex('#a86e2e')); },
    raw_beef: () => { g.poly([[2, 6], [7, 3], [13, 5], [14, 10], [9, 13], [3, 11]], hex('#c2403e')); g.poly([[3, 6], [7, 4], [10, 5], [6, 8]], hex('#e0605a')); g.line(5, 10, 11, 8, hex('#f2c8c0')); g.line(6, 7, 10, 10, hex('#f2c8c0')); },
    cooked_beef: () => { g.poly([[2, 6], [7, 3], [13, 5], [14, 10], [9, 13], [3, 11]], hex('#7a4228')); g.poly([[3, 6], [7, 4], [10, 5], [6, 8]], hex('#a8663c')); g.line(5, 10, 11, 8, hex('#4a2614')); g.line(6, 7, 10, 10, hex('#4a2614')); },
    raw_pork: () => { g.poly([[2, 5], [10, 3], [14, 7], [12, 12], [5, 13], [2, 9]], hex('#e8949a')); g.poly([[3, 5], [9, 4], [8, 7], [4, 8]], hex('#f8c0c4')); g.rect(10, 6, 12, 8, hex('#f6ece0')); g.set(11, 7, hex('#d4c6b6')); },
    cooked_pork: () => { g.poly([[2, 5], [10, 3], [14, 7], [12, 12], [5, 13], [2, 9]], hex('#a06034')); g.poly([[3, 5], [9, 4], [8, 7], [4, 8]], hex('#c8844c')); g.rect(10, 6, 12, 8, hex('#e8d4b0')); g.set(11, 7, hex('#b8a280')); },
    raw_bird: () => { g.ellipse(7, 8, 5, 4, hex('#e6b8a0')); g.ellipse(6, 7, 3, 2, hex('#f6d4c2')); g.line(11, 10, 14, 13, hex('#f4ece0')); g.circle(14, 14, 1.5, hex('#e6dccc')); },
    cooked_bird: () => { g.ellipse(7, 8, 5, 4, hex('#a8682c')); g.ellipse(6, 7, 3, 2, hex('#cc8a40')); g.line(11, 10, 14, 13, hex('#f4ece0')); g.circle(14, 14, 1.5, hex('#e6dccc')); },
    raw_fish: () => { g.ellipse(7, 8, 5.5, 3.5, hex('#58d0e8')); g.poly([[11, 8], [15, 4], [15, 12]], hex('#3aa8c8')); g.set(4, 7, hex('#102030')); g.line(5, 10, 10, 10, hex('#b8f2ff')); g.line(4, 9, 8, 6, hex('#a8f0ff')); },
    cooked_fish: () => { g.ellipse(7, 8, 5.5, 3.5, hex('#b8783c')); g.poly([[11, 8], [15, 4], [15, 12]], hex('#8a542a')); g.set(4, 7, hex('#201408')); g.line(5, 10, 10, 10, hex('#e0b070')); g.line(4, 9, 8, 6, hex('#d29a58')); },
    raw_venison: () => { g.poly([[2, 6], [7, 3], [13, 5], [14, 10], [9, 13], [3, 11]], hex('#a8344a')); g.poly([[3, 6], [7, 4], [10, 5], [6, 8]], hex('#c85468')); g.line(5, 10, 11, 8, hex('#e8b8c0')); },
    cooked_venison: () => { g.poly([[2, 6], [7, 3], [13, 5], [14, 10], [9, 13], [3, 11]], hex('#6a3a30')); g.poly([[3, 6], [7, 4], [10, 5], [6, 8]], hex('#94584a')); g.line(5, 10, 11, 8, hex('#3e1e18')); },
    sun_coin: () => { g.circle(8, 8, 6, hex('#e8b830')); g.circle(8, 8, 4.6, hex('#ffd860')); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.set(8 + Math.cos(a) * 3, 8 + Math.sin(a) * 3, hex('#c88a10')); } g.circle(8, 8, 1.6, hex('#fff2b0')); g.set(6, 5, hex('#ffffff')); },
    fertilizer: () => { g.poly([[3, 6], [13, 6], [12, 14], [4, 14]], hex('#8a6a40')); g.poly([[3, 6], [13, 6], [11, 3], [5, 3]], hex('#a8844e')); g.ellipse(8, 5, 4, 1.4, hex('#5a3c20')); for (const [x, y] of [[6, 4], [9, 5], [8, 4]]) g.set(x, y, hex('#6ab040')); g.line(5, 9, 11, 9, hex('#6a4c28')); },
    paper: () => { g.poly([[3, 2], [12, 2], [13, 14], [4, 14]], hex('#f0ead8')); for (let y = 5; y < 13; y += 2) g.line(5, y, 11, y, hex('#c8c0a8')); g.line(12, 2, 13, 14, hex('#cfc6ae')); },
    book: () => { g.poly([[3, 3], [12, 2], [13, 13], [4, 14]], hex('#8a3030')); g.poly([[4, 4], [12, 3], [12, 4], [4, 5]], hex('#b84848')); g.line(4, 13, 13, 12, hex('#f0ead8')); g.line(4, 12, 12, 11, hex('#f0ead8')); g.rect(7, 6, 9, 8, hex('#e8c050')); },
    bandage: () => { g.poly([[2, 9], [9, 2], [14, 7], [7, 14]], hex('#f2eee4')); g.line(4, 9, 9, 4, hex('#d8d0c0')); g.line(7, 12, 12, 7, hex('#d8d0c0')); g.rect(7, 7, 9, 9, hex('#d84040')); },
    village_compass: () => { g.circle(8, 8, 6.5, hex('#9a9ca4')); g.circle(8, 8, 5.2, hex('#e8e2d0')); g.line(8, 8, 11, 4, hex('#d83030')); g.line(8, 8, 5, 12, hex('#3050a0')); g.set(8, 8, hex('#202020')); g.set(8, 3, hex('#5a7a3c')); g.set(13, 8, hex('#5a7a3c')); },
    door_wood: () => doorItem(g, 'door_wood'),
    door_iron: () => doorItem(g, 'door_iron'),
    rope: () => { for (let k = 0; k < 3; k++) g.ellipse(8, 5 + k * 3, 5 - k, 2, hex('#c8a46a')); for (let k = 0; k < 3; k++) g.ellipse(8, 5 + k * 3, 3 - k, 1, [0, 0, 0, 0]); g.line(8, 12, 11, 15, hex('#b08a50')); g.line(4, 5, 12, 5, hex('#e0c08a')); },
    bowl: () => { g.poly([[2, 7], [14, 7], [12, 12], [4, 12]], hex('#9a6a3a')); g.hline(2, 14, 7, hex('#c8955a')); g.hline(3, 13, 8, hex('#5c3c1c')); g.hline(5, 11, 13, hex('#7a522a')); },
    tomato: () => { g.circle(8, 9, 5, hex('#e03a2e')); g.circle(6, 7, 1.6, hex('#ff8a74')); g.poly([[6, 4], [10, 4], [8, 6]], hex('#3e9a3a')); g.set(8, 3, hex('#2e7a2a')); g.set(10, 12, hex('#a4201a')); },
    corn: () => { g.poly([[6, 3], [10, 3], [11, 12], [8, 14], [5, 12]], hex('#f2cc40')); for (let y = 4; y < 13; y += 2) g.hline(6, 10, y, hex('#d8a82a')); g.line(4, 14, 7, 6, hex('#6aaa48')); g.line(12, 14, 10, 6, hex('#58963c')); },
    roasted_corn: () => { g.poly([[6, 3], [10, 3], [11, 12], [8, 14], [5, 12]], hex('#d89a30')); for (let y = 4; y < 13; y += 2) g.hline(6, 10, y, hex('#9a5c18')); g.set(7, 6, hex('#5a3410')); g.set(9, 10, hex('#5a3410')); },
    corn_bread: () => { g.poly([[2, 8], [5, 5], [11, 5], [14, 8], [14, 12], [2, 12]], hex('#e8b448')); g.hline(3, 13, 6, hex('#f6d27a')); g.hline(2, 14, 12, hex('#a8741e')); g.set(6, 9, hex('#c88a2a')); g.set(10, 8, hex('#c88a2a')); },
    vegetable_stew: () => { bowlWith(g, '#c8642a', [['#f08a2a', 5, 7], ['#e03a2e', 9, 6], ['#e8d090', 11, 8]]); },
    mushroom_stew: () => { bowlWith(g, '#a8784a', [['#8a5a3a', 5, 7], ['#7ae0d0', 10, 6], ['#d8c0a0', 8, 8]]); },
    salad: () => { bowlWith(g, '#5aa844', [['#e03a2e', 6, 6], ['#f08a2a', 10, 7], ['#8ad06a', 8, 5]]); },
    glass_bottle: () => flask(g, null),
    water_flask: () => flask(g, '#3a78e0'),
    tonic_base: () => flask(g, '#9ab0d8'),
    sun_apple: () => { g.circle(8, 9, 5, hex('#f2c230')); g.circle(6, 7, 1.6, hex('#fff2a0')); g.line(8, 4, 9, 2, hex('#6a4220')); g.poly([[9, 3], [12, 2], [11, 5]], hex('#58b040')); g.set(10, 12, hex('#c88a10')); g.set(12, 9, hex('#c88a10')); g.set(4, 5, hex('#fffbe0')); g.set(13, 4, hex('#fffbe0')); },
    ancient_seed: () => { g.ellipse(8, 9, 4, 5, hex('#8a5a2a')); g.ellipse(8, 5, 4.5, 2, hex('#5a3a1a')); g.ellipse(7, 9, 1.5, 2.5, hex('#b07a40')); g.line(8, 13, 8, 15, hex('#3e9a3a')); g.set(9, 8, hex('#9aff7a')); g.set(6, 11, hex('#9aff7a')); },
    geode_heart: () => { g.circle(8, 8, 6, hex('#5a4a7a')); g.circle(8, 8, 4.4, hex('#8a6ac8')); g.poly([[8, 4], [11, 8], [8, 12], [5, 8]], hex('#58d6e8')); g.poly([[8, 4], [11, 8], [8, 8]], hex('#c4f7ff')); },
    tide_pearl: () => { g.circle(8, 8, 5.5, hex('#d8e8f0')); g.circle(8, 8, 4, hex('#a8c8e8')); g.circle(6.5, 6.5, 1.8, hex('#ffffff')); g.line(4, 11, 8, 13, hex('#6a9ac8')); g.set(11, 10, hex('#5a8ab8')); },
    eternal_ember: () => { g.poly([[8, 1], [12, 6], [12, 11], [8, 14], [4, 11], [4, 6]], hex('#c8400c')); g.poly([[8, 4], [10, 7], [10, 11], [8, 12], [6, 11], [6, 7]], hex('#ff9a20')); g.poly([[8, 7], [9, 9], [8, 11], [7, 9]], hex('#fff0a0')); },
    heart_crystal: () => { g.poly([[8, 14], [2, 7], [3, 3], [6, 2], [8, 4], [10, 2], [13, 3], [14, 7]], hex('#e0304a')); g.poly([[4, 4], [6, 3], [7, 5], [5, 7]], hex('#ff8aa0')); g.line(8, 5, 8, 12, hex('#a81830')); g.set(11, 5, hex('#ffd0d8')); },
    essence_forest: () => essence(g, '#5ac040', '#d8ffb0'),
    essence_crystal: () => essence(g, '#58d6e8', '#e8ffff'),
    essence_tide: () => essence(g, '#3a7ae0', '#c8e8ff'),
    essence_ember: () => essence(g, '#ff7a1a', '#fff0a0'),
    root_staff: () => { g.line(3, 14, 11, 4, hex('#6a4a24')); g.line(4, 14, 12, 4, hex('#4a3214')); g.circle(12, 3, 2.4, hex('#3e9a3a')); g.set(12, 3, hex('#c8ff9a')); g.line(10, 6, 8, 4, hex('#5aa840')); g.line(6, 10, 4, 8, hex('#5aa840')); g.set(13, 1, hex('#8ae070')); },
    prism_blade: () => { g.line(3, 12, 13, 2, hex('#a8f0ff')); g.line(4, 12, 14, 2, hex('#58d6e8')); g.line(3, 11, 12, 2, hex('#ffffff')); g.line(5, 12, 14, 3, hex('#2a8aa6')); g.set(14, 1, hex('#ffffff')); g.line(3, 9, 7, 13, hex('#c8a0ff')); g.line(2, 9, 6, 13, hex('#7a5ac8')); g.line(2, 14, 4, 12, HANDLE); g.line(1, 15, 2, 14, HANDLE_D); g.set(6, 8, hex('#ff9af0')); },
    coral_crown: () => { g.poly([[2, 13], [2, 8], [4, 9], [5, 4], [7, 8], [8, 2], [9, 8], [11, 4], [12, 9], [14, 8], [14, 13]], hex('#f06a7a')); g.hline(2, 14, 12, hex('#c84a5a')); g.hline(2, 14, 13, hex('#c84a5a')); g.set(8, 10, hex('#3a7ae0')); g.set(5, 11, hex('#e8e8f0')); g.set(11, 11, hex('#e8e8f0')); g.set(8, 3, hex('#ffb0b8')); },
    titan_hammer: () => { g.line(2, 14, 9, 7, HANDLE); g.line(3, 14, 10, 7, HANDLE_D); g.poly([[6, 5], [10, 1], [15, 6], [11, 10]], hex('#3a3236')); g.poly([[6, 5], [10, 1], [11, 2], [7, 6]], hex('#6a5a60')); g.line(8, 7, 12, 3, hex('#ff7a1a')); g.set(10, 5, hex('#ffd060')); },
    shadow_shard: () => { g.poly([[7, 1], [11, 5], [9, 14], [5, 12], [4, 5]], hex('#5a2a8a')); g.poly([[7, 1], [11, 5], [7, 7]], hex('#c8a0ff')); g.poly([[7, 7], [11, 5], [9, 14]], hex('#2a1040')); g.set(7, 9, hex('#ff9af0')); },
    umbral_key: () => { g.circle(5, 5, 3.5, hex('#8e5be0')); g.circle(5, 5, 1.8, [0, 0, 0, 0]); g.line(7, 7, 13, 13, hex('#c8a0ff')); g.line(8, 7, 14, 13, hex('#6a3aa8')); g.rect(11, 12, 12, 14, hex('#c8a0ff')); g.rect(13, 10, 14, 11, hex('#c8a0ff')); g.set(5, 2, hex('#5ac040')); g.set(2, 5, hex('#58d6e8')); g.set(8, 5, hex('#3a7ae0')); g.set(5, 8, hex('#ff7a1a')); },
    sovereign_sigil: () => { g.circle(8, 8, 6.5, hex('#3a2a52')); g.circle(8, 8, 5, hex('#8e5be0')); g.circle(8, 8, 3, hex('#2a1a3a')); g.poly([[8, 4], [10, 8], [8, 12], [6, 8]], hex('#e8c0ff')); g.set(8, 8, hex('#ffffff')); },
    eclipse_scepter: () => { g.line(3, 14, 10, 7, hex('#3a2a52')); g.line(4, 14, 11, 7, hex('#1a1028')); g.circle(12, 4, 3, hex('#8e5be0')); g.circle(12, 4, 1.6, hex('#1a1028')); g.set(13, 3, hex('#f0e0ff')); g.line(8, 9, 10, 11, hex('#c8a0ff')); },
    fungus_slice: () => { g.ellipse(8, 9, 6, 4, hex('#8a3ab0')); g.ellipse(8, 8, 5, 2.6, hex('#d8c8e8')); g.set(6, 8, hex('#7af0ff')); g.set(10, 7, hex('#7af0ff')); },
    roasted_fungus: () => { g.ellipse(8, 9, 6, 4, hex('#5a2a6a')); g.ellipse(8, 8, 5, 2.6, hex('#b08a70')); g.set(6, 8, hex('#3a1a10')); g.set(10, 7, hex('#3a1a10')); },
    minecart: () => { g.poly([[2, 5], [14, 5], [13, 11], [3, 11]], hex('#7a7c86')); g.rect(3, 6, 12, 7, hex('#4a4c56')); g.hline(2, 14, 5, hex('#b0b2bc')); g.circle(5, 12, 1.8, hex('#2a2a30')); g.circle(11, 12, 1.8, hex('#2a2a30')); },
    boat: () => { g.poly([[1, 8], [15, 8], [12, 13], [4, 13]], hex('#9a6a3a')); g.hline(1, 15, 8, hex('#c8955a')); g.hline(4, 12, 13, hex('#6a4420')); g.line(9, 2, 6, 11, hex('#6a4420')); g.rect(9, 2, 10, 3, hex('#c8955a')); },
    crystal_shard: () => { g.poly([[8, 1], [12, 6], [9, 14], [5, 11], [4, 6]], hex('#58d6e8')); g.poly([[8, 1], [12, 6], [8, 7]], hex('#c4f7ff')); g.poly([[8, 7], [12, 6], [9, 14]], hex('#2a8aa6')); g.line(8, 1, 8, 13, hex('#8aeaf6')); },
  };
  if (S[key]) { S[key](); g.outline(); return g; }
  if (INGOT_COL[key]) { ingot(g, INGOT_COL[key]); g.outline(); return g; }
  if (RAW_COL[key]) {
    const [base, hi] = RAW_COL[key];
    g.poly([[3, 5], [8, 2], [13, 5], [13, 10], [9, 13], [3, 11]], hex('#6c6e78')); g.poly([[3, 5], [8, 2], [9, 5], [5, 7]], hex('#8c8e98'));
    for (const [x, y] of [[5, 6], [9, 5], [10, 9], [6, 10], [8, 8]]) { g.set(x, y, hex(base)); g.set(x + 1, y, hex(base)); g.set(x, y - 1, hex(hi)); }
    g.outline(); return g;
  }
  return null;
}
function bucketSprite(fluid) {
  const g = new Grid(16);
  g.poly([[3, 4], [13, 4], [11, 14], [5, 14]], hex('#b9bdc6')); g.poly([[3, 4], [13, 4], [12, 6], [4, 6]], hex('#e4e8ee'));
  g.line(4, 6, 6, 14, hex('#8d929c')); g.line(12, 6, 11, 14, hex('#8d929c'));
  g.line(3, 4, 5, 1, hex('#8d929c')); g.line(5, 1, 11, 1, hex('#8d929c')); g.line(11, 1, 13, 4, hex('#8d929c'));
  if (fluid === 'water') { g.rect(4, 5, 12, 5, hex('#3a78e0')); g.rect(5, 6, 11, 6, hex('#2a5cc0')); g.set(6, 5, hex('#a8d0ff')); }
  if (fluid === 'lava') { g.rect(4, 5, 12, 5, hex('#ff9a20')); g.rect(5, 6, 11, 6, hex('#d8400c')); g.set(6, 5, hex('#ffe070')); }
  g.outline();
  return g;
}

const iconCache = new Map();
function gridToCanvas(g, scale = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = g.n * scale;
  const ctx = c.getContext('2d');
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = g.n;
  tmp.getContext('2d').putImageData(new ImageData(g.d, g.n, g.n), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, g.n * scale, g.n * scale);
  return c;
}

/** Dibuja un cubo isométrico (o sprite plano) de un bloque en un canvas de 32×32. */
function blockIcon(block) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const atlas = getAtlasCanvas();
  const src = (name) => { const i = tileOf(P[name] ? name : 'missing'); return [(i % ATLAS_COLS) * N, Math.floor(i / ATLAS_COLS) * N]; };
  if (block.shape === 'cross' || block.shape === 'torch' || block.family === 'ladder' || block.family === 'rail' || block.family === 'cable') {
    const [sx, sy] = src(block.tiles[0]);
    ctx.drawImage(atlas, sx, sy, N, N, 2, 2, 28, 28);
    return c;
  }
  if (block.shape === 'box') { boxIcon(block, ctx, atlas, src); return c; }
  const hFrac = block.shape === 'slab' ? Math.max(0.5, block.height) : block.shape === 'farmland' ? 0.9375 : 1;
  const oy = 13 * (1 - hFrac) + 0; // desplazamiento vertical por altura reducida
  const draw = (tileName, m, dark) => {
    const [sx, sy] = src(tileName);
    ctx.save();
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(atlas, sx, sy, N, N, 0, 0, N, N);
    if (dark > 0) { ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(0, 0, N, N); }
    ctx.restore();
  };
  const k = 13 / 16;
  // cara izquierda (+Z), derecha (+X), superior
  draw(block.tiles[4], [k, k / 2, 0, k * hFrac, 3, 9.5 + oy], 0.22);
  draw(block.tiles[0], [k, -k / 2, 0, k * hFrac, 16, 16 + oy], 0.42);
  draw(block.tiles[2], [k, k / 2, -k, k / 2, 16, 3 + oy], 0);
  return c;
}

/**
 * Icono isométrico de un bloque formado por cajas (escaleras, vallas, muros, puertas de valla, trampillas).
 * Proyección igual que la del cubo: P(X,Y,Z) = (16 + 13(X − Z), 16 + 6,5(X + Z) − 13Y).
 */
function boxIcon(block, ctx, atlas, src) {
  const id = block.family === 'stairs' ? block.famBase + 3 : block.id; // escalón alto a la izquierda
  const boxes = renderBoxes(id, 2 | 8).slice().sort((a, b) => (a[0] + a[3] + a[1] + a[4] + a[2] + a[5]) - (b[0] + b[3] + b[1] + b[4] + b[2] + b[5]));
  const P = (X, Y, Z) => [16 + 13 * (X - Z), 16 + 6.5 * (X + Z) - 13 * Y];
  const k = 13 / 16, h = 6.5 / 16;
  const face = (tile, sx, sy, sw, sh, m, dark) => {
    if (sw < 0.5 || sh < 0.5) return;
    const [ax, ay] = src(tile);
    const t = document.createElement('canvas'); t.width = Math.ceil(sw); t.height = Math.ceil(sh);
    const tc = t.getContext('2d');
    tc.drawImage(atlas, ax + sx, ay + sy, sw, sh, 0, 0, sw, sh);
    if (dark > 0) { tc.globalCompositeOperation = 'source-atop'; tc.fillStyle = `rgba(0,0,0,${dark})`; tc.fillRect(0, 0, sw, sh); }
    ctx.save(); ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); ctx.drawImage(t, 0, 0); ctx.restore();
  };
  for (const b of boxes) {
    const [x0, y0, z0, x1, y1, z1] = b;
    face(block.tiles[4], x0 * N, (1 - y1) * N, (x1 - x0) * N, (y1 - y0) * N, [k, h, 0, k, ...P(x0, y1, z1)], 0.22);
    face(block.tiles[0], (1 - z1) * N, (1 - y1) * N, (z1 - z0) * N, (y1 - y0) * N, [k, -h, 0, k, ...P(x1, y1, z1)], 0.42);
    face(block.tiles[2], x0 * N, z0 * N, (x1 - x0) * N, (z1 - z0) * N, [k, h, -k, h, ...P(x0, y1, z0)], 0);
  }
}

/** Icono de un objeto como canvas (16×16 para objetos, 32×32 para bloques). */
export function getItemIcon(item) {
  if (!item) return null;
  if (iconCache.has(item.id)) return iconCache.get(item.id);
  let canvas;
  if (item.kind === 'block') canvas = blockIcon(Blocks.get(item.block));
  else {
    const [kind, a, b] = item.icon.split(':');
    let g = null;
    if (kind === 'tool') g = toolSprite(a, b);
    else if (kind === 'armor') g = armorSprite(a, b);
    else if (kind === 'bucket') g = bucketSprite(a === 'empty' ? null : a);
    else if (kind === 'sprite') g = sprites(a);
    else if (kind === 'tonic') { g = new Grid(16); flask(g, TONIC_COL[a] || '#c040c0'); g.outline(); }
    if (!g) { g = new Grid(16); P.missing(g); }
    canvas = gridToCanvas(g, 1);
  }
  iconCache.set(item.id, canvas);
  return canvas;
}
const urlCache = new Map();
export function getItemIconURL(item) {
  if (!item) return '';
  if (urlCache.has(item.id)) return urlCache.get(item.id);
  const u = getItemIcon(item).toDataURL();
  urlCache.set(item.id, u);
  return u;
}

/** Texturas de grietas de rotura (10 etapas) como canvases 16×16. */
export function buildCrackCanvases() {
  const out = [];
  const r = mulberry32(777);
  const g = new Grid(16);
  const segs = [];
  for (let k = 0; k < 9; k++) {
    const pts = []; let x = 8 + (r() - 0.5) * 3, y = 8 + (r() - 0.5) * 3; let a = r() * Math.PI * 2;
    for (let s = 0; s < 8; s++) { pts.push([x, y]); x += Math.cos(a) * 1.4; y += Math.sin(a) * 1.4; a += (r() - 0.5) * 1.1; }
    segs.push(pts);
  }
  for (let stage = 0; stage < 10; stage++) {
    const upto = Math.ceil(((stage + 1) / 10) * segs.length * 8);
    let n = 0;
    for (const pts of segs) for (let i = 0; i < pts.length; i++) { if (n++ < upto) g.set(pts[i][0], pts[i][1], rgb(10, 8, 10, 215)); }
    out.push(gridToCanvas(g, 1));
  }
  return out;
}

/** Lista de todos los tiles (para pruebas: no debe haber nombres sin pintor). */
export function missingTilePainters() {
  const miss = new Set();
  for (const b of BLOCKS) if (b) for (const t of b.tiles) if (!P[t]) miss.add(`${b.key}:${t}`);
  return [...miss];
}
export { tileNames };
