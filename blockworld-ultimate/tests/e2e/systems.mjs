// Prueba E2E en Chromium (Playwright). Ejecuta: node tests/e2e/systems.mjs
import { withPage, frames } from '../../tools/pw.mjs';
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
await withPage('index.html?autostart=survival&rd=3&seed=flat3&type=flat&mobs=all&structures=0', async (page) => {
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__game; g.renderer.setPixelRatio(0.25); g._resize(); });
  await page.click('#gl'); await frames(page, 3);
  const r = await page.evaluate(async () => {
    const g = window.__game, w = g.world, out = {};
    const { ID } = await import('/src/blocks.js'); const { Items, makeStack } = await import('/src/items.js');
    g.time = 0.25; g.difficulty = 'normal';
    const p = g.player; const bx = Math.floor(p.x) + 4, bz = Math.floor(p.z), gy = 41; // suelo de césped en y=41
    // ── Agricultura ──
    w.setBlock(bx, gy, bz, ID.DIRT); w.setBlock(bx + 1, gy, bz, ID.WATER); // agua vecina
    g.inventory.slots[0] = makeStack('stone_hoe'); g.inventory.selected = 0;
    g.hit = { x: bx, y: gy, z: bz, nx: 0, ny: 1, nz: 0, id: ID.DIRT };
    out.hoe = g.building.use(g.hit, null, false) && w.getBlock(bx, gy, bz) === ID.FARMLAND;
    g.inventory.slots[1] = makeStack('seed_wheat', 3); g.inventory.selected = 1;
    g.hit = { x: bx, y: gy, z: bz, nx: 0, ny: 1, nz: 0, id: ID.FARMLAND };
    out.seed = g.building.use(g.hit, null, false) && w.getBlock(bx, gy + 1, bz) === ID.CROP_WHEAT_0;
    out.seedUsed = g.inventory.slots[1].n === 2;
    for (let i = 0; i < 80; i++) { w.getBlock(bx, gy, bz) === ID.FARMLAND && g.ticks.tickBlock(bx, gy, bz, ID.FARMLAND); const id = w.getBlock(bx, gy + 1, bz); if (id >= ID.CROP_WHEAT_0 && id < ID.CROP_WHEAT_3) g.ticks.tickBlock(bx, gy + 1, bz, id); }
    out.wet = w.getBlock(bx, gy, bz) === ID.FARMLAND_WET;
    out.grown = w.getBlock(bx, gy + 1, bz) === ID.CROP_WHEAT_3;
    // cosecha con la mano
    g.hit = { x: bx, y: gy + 1, z: bz, nx: 0, ny: 0, nz: 0, id: ID.CROP_WHEAT_3 };
    g.inventory.slots[2] = null; g.inventory.selected = 2; g.mining.breakBlock(g.hit);
    await new Promise((r) => setTimeout(r, 1200));
    out.harvest = w.getBlock(bx, gy + 1, bz) === 0;
    // de noche no crece
    g.time = 0.7; await new Promise((r) => setTimeout(r, 700)); w.setBlock(bx, gy + 1, bz, ID.CROP_WHEAT_0); let nightGrow = false;
    for (let i = 0; i < 60; i++) { g.ticks.tickBlock(bx, gy + 1, bz, w.getBlock(bx, gy + 1, bz)); if (w.getBlock(bx, gy + 1, bz) !== ID.CROP_WHEAT_0) nightGrow = true; }
    out.noNightGrowth = !nightGrow; g.time = 0.25;
    // ── Árbol: replantar ──
    const tx = bx, tz = bz + 6;
    w.setBlock(tx, gy, tz, ID.GRASS); w.setBlock(tx, gy + 1, tz, ID.SAPLING_OAK);
    out.tree = g.ticks.growTree(tx, gy + 1, tz, 'oak') && w.getBlock(tx, gy + 2, tz) === ID.LOG_OAK;
    // ── Arena que cae ──
    const sx = bx - 3, sz = bz - 3;
    w.setBlock(sx, gy + 6, sz, ID.SAND);
    g.processBlockUpdates();
    await new Promise((r) => setTimeout(r, 2500));
    g.processBlockUpdates();
    out.sandFell = w.getBlock(sx, gy + 6, sz) === 0 && w.getBlock(sx, gy + 1, sz) === ID.SAND;
    // ── Antorcha de pared y soporte ──
    w.setBlock(bx + 8, gy + 1, bz, ID.STONE); w.setBlock(bx + 8, gy + 2, bz, ID.STONE);
    g.inventory.slots[3] = makeStack('torch', 5); g.inventory.selected = 3;
    g.hit = { x: bx + 8, y: gy + 2, z: bz, nx: -1, ny: 0, nz: 0, id: ID.STONE };
    out.wallTorch = g.building.use(g.hit, null, false) && w.getBlock(bx + 7, gy + 2, bz) === ID.TORCH_E;
    out.torchLight = w.getBlockLight(bx + 7, gy + 2, bz);
    w.setBlock(bx + 8, gy + 2, bz, 0); g.processBlockUpdates();
    await new Promise((r) => setTimeout(r, 300)); g.processBlockUpdates();
    out.torchDrops = w.getBlock(bx + 7, gy + 2, bz) === 0;
    // ── Cubo de agua ──
    g.inventory.slots[4] = makeStack('bucket'); g.inventory.selected = 4;
    g.hit = { x: bx + 1, y: gy, z: bz, nx: 0, ny: 0, nz: 0, id: ID.WATER };
    const before = w.getBlock(bx + 1, gy, bz);
    out.bucketFill = g.building.use(null, g.hit, false) && g.inventory.slots[4] && Items.get(g.inventory.slots[4].i).key === 'water_bucket' && before === ID.WATER && w.getBlock(bx + 1, gy, bz) === 0;
    g.hit = { x: bx + 2, y: gy, z: bz, nx: 0, ny: 1, nz: 0, id: ID.GRASS };
    out.bucketPour = g.building.use(null, g.hit, false) && w.getBlock(bx + 2, gy + 1, bz) === ID.WATER && Items.get(g.inventory.slots[4].i).key === 'bucket';
    // ── Colocar bloque dentro del jugador debe fallar ──
    g.inventory.slots[5] = makeStack('stone', 5); g.inventory.selected = 5;
    g.hit = { x: Math.floor(p.x), y: Math.floor(p.y) - 1, z: Math.floor(p.z), nx: 0, ny: 1, nz: 0, id: ID.GRASS };
    out.noPlaceInPlayer = !g.building.use(g.hit, null, false) && g.inventory.slots[5].n === 5;
    // ── Romper con herramienta correcta: tiempos ──
    const { breakSeconds } = await import('/src/mining.js'); const { Blocks } = await import('/src/blocks.js');
    const T = (k) => Items.get(k).tool;
    out.times = { handStone: +breakSeconds(Blocks.get('stone'), null).toFixed(2), woodPick: +breakSeconds(Blocks.get('stone'), T('wood_pickaxe')).toFixed(2), ironPick: +breakSeconds(Blocks.get('stone'), T('iron_pickaxe')).toFixed(2), handDirt: +breakSeconds(Blocks.get('dirt'), null).toFixed(2), shovelDirt: +breakSeconds(Blocks.get('dirt'), T('iron_shovel')).toFixed(2), obsidianIron: +breakSeconds(Blocks.get('obsidian'), T('iron_pickaxe')).toFixed(1) };
    return out;
  });
  console.log(JSON.stringify(r.times));
  for (const [k, v] of Object.entries(r)) if (k !== 'times') ok(k, v === true || (typeof v === 'number' && v >= 13), String(v));
}, { readyFlag: '__ready', readyTimeout: 60000, w: 640, h: 360 });
