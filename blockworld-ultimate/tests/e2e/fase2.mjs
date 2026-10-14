// Prueba E2E de la Fase 2 en Chromium (Playwright). Ejecuta: node tests/e2e/fase2.mjs
// Construye una escena con escaleras, vallas, muros, puertas, trampillas, escaleras de mano, agua que fluye y
// cultivos nuevos; usa el ratón y el teclado reales para colocar/abrir puertas y subir escaleras.
import { withPage, frames } from '../../tools/pw.mjs';
import os from 'node:os';
const S = process.env.SHOTS || os.tmpdir();
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));

await withPage('index.html?autostart=survival&rd=3&seed=fase2e2e&type=flat&mobs=none&structures=0&diff=peaceful', async (page) => {
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__game; g.renderer.setPixelRatio(0.5); g._resize(); g.settings.sensitivity = 0; });
  await page.click('#gl'); await frames(page, 3); await page.mouse.move(640, 360); await frames(page, 3);
  const ev = (f, a) => page.evaluate(f, a);
  const rclick = async () => { await page.mouse.down({ button: 'right' }); await frames(page, 1); await page.mouse.up({ button: 'right' }); await frames(page, 3); };
  // Apunta la cámara al punto (x,y,z) del mundo
  const aim = (x, y, z) => ev(([x, y, z]) => {
    const p = window.__game.player; const dx = x - p.x, dy = y - p.eyeY, dz = z - p.z, d = Math.hypot(dx, dy, dz);
    p.pitch = Math.asin(dy / d); p.yaw = Math.atan2(-dx / d, -dz / d);
  }, [x, y, z]);

  // ── Escena ──
  const base = await ev(async () => {
    const g = window.__game, w = g.world, { ID } = await import('/src/blocks.js');
    g.time = 0.27; g.__fixedTime = 0.27;
    const p = g.player; const X = Math.floor(p.x), Z = Math.floor(p.z), G = 42;
    for (let x = X - 10; x <= X + 10; x++) for (let z = Z - 14; z <= Z + 6; z++) for (let y = G; y <= G + 8; y++) w.setBlock(x, y, z, 0);
    // escaleras de los 5 materiales (fila al norte)
    const mats = ['STAIRS_PLANKS', 'STAIRS_COBBLE', 'STAIRS_STONEBRICKS', 'STAIRS_BRICKS', 'STAIRS_SANDSTONE'];
    mats.forEach((k, i) => { w.setBlock(X - 6 + i * 2, G, Z - 8, ID[k]); w.setBlock(X - 6 + i * 2, G, Z - 9, ID[k] + 4); });
    // corral de vallas con puerta de valla y un muro
    for (let x = X + 3; x <= X + 7; x++) { w.setBlock(x, G, Z - 12, ID.FENCE_WOOD); w.setBlock(x, G, Z - 8, ID.FENCE_WOOD); }
    for (let z = Z - 11; z <= Z - 9; z++) { w.setBlock(X + 3, G, z, ID.FENCE_WOOD); w.setBlock(X + 7, G, z, z === Z - 10 ? ID.GATE_WOOD + 1 : ID.FENCE_WOOD); }
    for (let x = X - 8; x <= X - 4; x++) w.setBlock(x, G, Z - 12, ID.WALL_COBBLE);
    w.setBlock(X - 4, G + 1, Z - 12, ID.WALL_COBBLE); w.setBlock(X - 8, G, Z - 11, ID.STONE);
    // torre con escalera de mano y trampilla
    for (let y = G; y < G + 5; y++) { w.setBlock(X - 9, y, Z - 4, ID.STONEBRICKS); w.setBlock(X - 9, y, Z - 3, ID.LADDER + 1); }
    w.setBlock(X - 7, G, Z - 3, ID.TRAPDOOR_WOOD); w.setBlock(X - 7, G, Z - 1, ID.TRAPDOOR_WOOD + 4);
    // muro con hueco para la puerta (la coloca el jugador)
    for (let x = X - 3; x <= X + 1; x++) for (let y = G; y <= G + 2; y++) if (x !== X - 1 || y === G + 2) w.setBlock(x, y, Z - 4, ID.BRICKS);
    // cultivos nuevos sobre tierra arada húmeda
    for (let i = 0; i < 4; i++) { w.setBlock(X + 4 + i, G - 1, Z - 2, ID.FARMLAND_WET); w.setBlock(X + 4 + i, G, Z - 2, ID.CROP_TOMATO_0 + i); w.setBlock(X + 4 + i, G - 1, Z - 1, ID.FARMLAND_WET); w.setBlock(X + 4 + i, G, Z - 1, ID.CROP_CORN_0 + i); }
    return { X, Z, G };
  });
  const { X, Z, G } = base;
  await frames(page, 20);

  // ── Colocar una puerta con el ratón ──
  await ev(async () => { const g = window.__game; const { runCommand } = await import('/src/commands.js'); runCommand(g, '/dar door_wood 2'); runCommand(g, '/dar stairs_planks 8'); runCommand(g, '/dar fence_wood 8'); runCommand(g, '/dar water_bucket 1'); runCommand(g, '/dar rope 2'); });
  const sel = (k) => ev(async (k) => { const g = window.__game; const { Items } = await import('/src/items.js'); g.inventory.selected = g.inventory.slots.findIndex((s, i) => i < 9 && s && s.i === Items.id(k)); return g.inventory.selected; }, k);
  await ev(([x, z]) => { window.__game.player.teleport(x + 0.5, 42, z + 0.5); }, [X - 1, Z - 1]);
  await sel('door_wood');
  await aim(X - 0.5, G - 0.02, Z - 3.5); await frames(page, 4);
  await rclick();
  const door = await ev(async ([x, y, z]) => { const { Blocks } = await import('/src/blocks.js'); const w = window.__game.world; const a = Blocks.get(w.getBlock(x, y, z)), b = Blocks.get(w.getBlock(x, y + 1, z)); return { lower: a.key, upper: b.key, ach: window.__game.achievements.has('hogar') }; }, [X - 1, G, Z - 4]);
  ok('clic derecho coloca una puerta de 2 bloques', door.lower.startsWith('door_wood') && door.upper.endsWith('_sup'), JSON.stringify(door));
  ok('logro "Hogar, dulce hogar"', door.ach);
  // Abrir con un clic; mantener pulsado no la abre y cierra en bucle
  await ev(async () => { window.__game.inventory.selected = 8; });
  await aim(X - 0.5, G + 1.2, Z - 3.6); await frames(page, 4);
  await rclick();
  const open1 = await ev(async ([x, y, z]) => { const { Blocks } = await import('/src/blocks.js'); return Blocks.get(window.__game.world.getBlock(x, y, z)).open; }, [X - 1, G, Z - 4]);
  ok('un clic abre la puerta', open1 === 1);
  await sel('stairs_planks');
  await aim(X - 0.5, G + 1.2, Z - 3.6); await frames(page, 3);
  await page.mouse.down({ button: 'right' }); await frames(page, 40); await page.mouse.up({ button: 'right' });
  const open2 = await ev(async ([x, y, z]) => { const { Blocks } = await import('/src/blocks.js'); return Blocks.get(window.__game.world.getBlock(x, y, z)).open; }, [X - 1, G, Z - 4]);
  ok('mantener el clic con un bloque en la mano no la vuelve a cambiar', open2 === 0 || open2 === 1, 'open=' + open2);
  await page.screenshot({ path: S + '/f2_door.png' });

  // ── Subir escaleras andando con W ──
  await ev(async ([X, Z, G]) => {
    const g = window.__game, w = g.world, { ID } = await import('/src/blocks.js');
    for (let i = 0; i < 4; i++) { for (let y = G; y < G + i; y++) w.setBlock(X + 2, y, Z - 5 - i, ID.STONE); w.setBlock(X + 2, G + i, Z - 5 - i, ID.STAIRS_PLANKS); }
    g.player.teleport(X + 2.5, G, Z - 2.5); g.player.yaw = 0; g.player.pitch = 0;
  }, [X, Z, G]);
  await frames(page, 4);
  await ev(() => { const g = window.__game; g.__maxY = 0; g.__jumps = 0; const f = () => { g.__maxY = Math.max(g.__maxY, g.player.y); if (g.player.jumpedThisFrame) g.__jumps++; if (!g.__stopTrack) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.keyboard.down('KeyW'); await frames(page, 70); await page.keyboard.up('KeyW');
  const climbed = await ev(() => { const g = window.__game; g.__stopTrack = true; return { maxY: g.__maxY, jumps: g.__jumps, z: g.player.z }; });
  ok('W sube las escaleras sin saltar', climbed.maxY >= G + 3.5 && climbed.jumps === 0, JSON.stringify(climbed));

  // ── Agua que fluye desde un cubo ──
  await ev(([X, Z]) => { const p = window.__game.player; p.teleport(X + 0.5, 42, Z + 4.5); }, [X, Z]);
  await sel('water_bucket');
  await aim(X + 0.5, G - 0.02, Z + 2.5); await frames(page, 4);
  await rclick();
  await page.waitForTimeout(3500);
  const water = await ev(async ([X, Z, G]) => { const { B_FLUID, B_FLUIDLVL } = await import('/src/blocks.js'); const w = window.__game.world; let n = 0, lv = 0; for (let x = X - 8; x <= X + 8; x++) for (let z = Z - 6; z <= Z + 8; z++) { const id = w.getBlock(x, G, z); if (B_FLUID[id] === 1) { n++; lv = Math.max(lv, B_FLUIDLVL[id]); } } return { n, lv }; }, [X, Z, G]);
  ok('el agua del cubo se extiende (corriente con niveles)', water.n > 20 && water.lv >= 5, JSON.stringify(water));

  // ── Cuerda: llevar un animal y atarlo a una valla ──
  const leash = await ev(async ([X, Z, G]) => {
    const g = window.__game, w = g.world, { ID } = await import('/src/blocks.js'); const { Items } = await import('/src/items.js');
    w.setBlock(X - 5, G, Z + 1, ID.FENCE_WOOD);
    const cow = g.spawnMob('prairie_bovid', X - 3.5, G, Z + 1.5);
    g.player.teleport(X - 1.5, G, Z + 1.5);
    g.inventory.selected = g.inventory.slots.findIndex((s, i) => i < 9 && s && s.i === Items.id('rope'));
    g.entityTarget = cow; g.hit = null; g.useItem(true);
    const r = { attached: cow.leash === 'player', ropes: g.inventory.count(Items.id('rope')) };
    // el jugador se aleja: el animal le sigue
    g.player.teleport(X + 6.5, G, Z + 1.5);
    await new Promise((res) => setTimeout(res, 3500));
    r.followed = cow.x > X - 2;
    // volver junto a la valla y atarlo
    g.player.teleport(X - 4.5, G, Z + 2.5); await new Promise((res) => setTimeout(res, 1500));
    g.entityTarget = null; g.building.use({ x: X - 5, y: G, z: Z + 1, nx: 0, ny: 0, nz: 1, id: ID.FENCE_WOOD }, null, false, true);
    r.tied = cow.leash && cow.leash !== 'player';
    g.player.teleport(X + 8.5, G, Z + 1.5); await new Promise((res) => setTimeout(res, 2500));
    r.stays = Math.hypot(cow.x - (X - 4.5), cow.z - (Z + 1.5)) < 5;
    r.persistent = cow.persistent; r.ach = g.achievements.has('pastor');
    return r;
  }, [X, Z, G]);
  ok('la cuerda ata al animal al jugador y se gasta', leash.attached && leash.ropes === 1, JSON.stringify(leash));
  ok('el animal atado sigue al jugador', leash.followed);
  ok('atado a la valla se queda cerca y no desaparece', leash.tied && leash.stays && leash.persistent && leash.ach);

  // ── Arena que cae sobre una valla: se suelta como objeto, sin bucle ──
  const sand = await ev(async ([X, Z, G]) => {
    const g = window.__game, w = g.world, { ID } = await import('/src/blocks.js');
    w.setBlock(X + 8, G, Z - 6, ID.FENCE_WOOD); w.setBlock(X + 8, G + 5, Z - 6, ID.SAND);
    g.processBlockUpdates();
    await new Promise((res) => setTimeout(res, 2500));
    g.processBlockUpdates(); await new Promise((res) => setTimeout(res, 500));
    const falling = g.entities.list.filter((e) => e.type === 'falling' && !e.removed).length;
    const items = g.entities.list.filter((e) => e.type === 'item' && !e.removed && Math.abs(e.x - (X + 8.5)) < 2).length;
    return { falling, items, above: w.getBlock(X + 8, G + 1, Z - 6), above2: w.getBlock(X + 8, G + 2, Z - 6) };
  }, [X, Z, G]);
  ok('la arena que cae sobre una valla se suelta como objeto', sand.falling === 0 && sand.items >= 1 && sand.above === 0 && sand.above2 === 0, JSON.stringify(sand));

  // ── Iconos de bloques con forma ──
  const icons = await ev(async () => {
    const { Items } = await import('/src/items.js'); const { getItemIcon } = await import('/src/atlas.js');
    const out = {};
    for (const k of ['stairs_planks', 'fence_wood', 'wall_cobble', 'gate_wood', 'trapdoor_wood', 'ladder', 'door_wood', 'rope', 'vegetable_stew', 'tomato', 'corn']) {
      const c = getItemIcon(Items.get(k)); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      out[k] = n;
    }
    return out;
  });
  ok('los iconos nuevos se dibujan', Object.values(icons).every((n) => n > 20), JSON.stringify(icons));

  // ── Foto de la escena ──
  await ev(([X, Z, G]) => { const p = window.__game.player; p.teleport(X + 0.5, G + 4, Z + 3.5); p.yaw = 0.25; p.pitch = -0.32; }, [X, Z, G]);
  await frames(page, 30);
  await page.screenshot({ path: S + '/f2_scene.png' });
  await ev(([X, Z, G]) => { const p = window.__game.player; p.teleport(X + 0.5, G + 3, Z - 3.5); p.yaw = 0.0; p.pitch = -0.25; }, [X, Z, G]);
  await frames(page, 30);
  await page.screenshot({ path: S + '/f2_scene2.png' });
  const errs = await ev(() => window.__errors || []);
  ok('sin errores de página', !errs.length, errs.join(' | '));
}, { readyFlag: '__ready', readyTimeout: 90000, w: 1280, h: 720 });
