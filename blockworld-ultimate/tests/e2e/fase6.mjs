// Prueba E2E de la Fase 6 en Chromium: circuito con palanca (clic real), cable, lámpara y puerta de hierro;
// raíles que se orientan al colocarlos con el ratón, vagoneta montada que avanza con W, barca en el agua.
// Ejecuta: node tests/e2e/fase6.mjs
import { withPage, frames, ensurePlaying } from '../../tools/pw.mjs';
import os from 'node:os';
const S = process.env.SHOTS || os.tmpdir();
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));

await withPage('index.html?autostart=creative&rd=3&seed=maquinas&type=flat&mobs=none&structures=0', async (page) => {
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__game; g.renderer.setPixelRatio(0.5); g._resize(); g.settings.sensitivity = 0; g.time = 0.6; });
  await page.click('#gl'); await frames(page, 3); await page.mouse.move(640, 360); await frames(page, 3);
  const ev = (f, a) => page.evaluate(f, a);

  // ── Circuito: palanca → cable → puerta de hierro y lámpara ──
  const c = await ev(async () => {
    const g = window.__game; const { ID } = await import('/src/blocks.js');
    const p = g.player, w = g.world;
    const x0 = Math.floor(p.x) + 2, z0 = Math.floor(p.z) - 3, y = Math.floor(p.y);
    for (let x = x0 - 1; x <= x0 + 8; x++) for (let z = z0 - 2; z <= z0 + 2; z++) for (let k = 0; k < 4; k++) w.setBlock(x, y + k, z, 0);
    w.setBlock(x0, y, z0, ID.LEVER);
    for (let x = x0 + 1; x <= x0 + 5; x++) w.setBlock(x, y, z0, ID.CABLE);
    w.setBlock(x0 + 6, y, z0, ID.DOOR_IRON_E); w.setBlock(x0 + 6, y + 1, z0, ID.DOOR_IRON_E_SUP);
    w.setBlock(x0 + 3, y, z0 + 1, ID.ENERGY_LAMP);
    // mirar a la palanca desde cerca
    p.teleport(x0 + 0.5, y, z0 + 2.5); p.yaw = 0;
    p.pitch = Math.atan2(y + 0.12 - p.eyeY, 2.0); // apuntar a la base de la palanca
    return { x0, y, z0 };
  });
  await frames(page, 10);
  await ensurePlaying(page);
  // clic derecho real sobre la palanca (el rayo sale de la cámara)
  const target = await ev(() => { const g = window.__game; return g.hit ? [g.hit.x, g.hit.y, g.hit.z, g.hit.id] : null; });
  await page.mouse.click(640, 360, { button: 'right' });
  await page.waitForFunction((cc) => { const g = window.__game; const d = g.world.getBlock(cc.x0 + 6, cc.y, cc.z0); return g.energy && (d % 8) >= 4 + 0 && false || g.world.getBlock(cc.x0 + 3, cc.y, cc.z0 + 1) !== g.world.getBlock(cc.x0 + 3, cc.y, cc.z0 + 2) && g.world.getBlock(cc.x0 + 3, cc.y, cc.z0 + 1) > 925; }, c, { timeout: 15000 }).catch(() => {});
  const st = await ev(async (cc) => {
    const g = window.__game; const { ID, Blocks } = await import('/src/blocks.js'); const w = g.world;
    return { lever: w.getBlock(cc.x0, cc.y, cc.z0) === ID.LEVER_ON, lamp: w.getBlock(cc.x0 + 3, cc.y, cc.z0 + 1) === ID.ENERGY_LAMP_ON, cable: w.getBlock(cc.x0 + 2, cc.y, cc.z0) === ID.CABLE_ON, door: Blocks.get(w.getBlock(cc.x0 + 6, cc.y, cc.z0)).open };
  }, c);
  ok('clic derecho en la palanca: el cable se activa, la lámpara se enciende y la puerta de hierro se abre', st.lever && st.lamp && st.cable && st.door === 1, JSON.stringify({ ...st, target }));
  await ev((cc) => { const p = window.__game.player; p.teleport(cc.x0 + 3.5, cc.y + 3, cc.z0 + 6.5); p.yaw = 0; p.pitch = -0.5; }, c);
  await frames(page, 20);
  await page.screenshot({ path: S + '/f6_circuit.png' });
  const off = await ev(async (cc) => {
    const g = window.__game; const { ID, Blocks } = await import('/src/blocks.js'); const w = g.world;
    g.energy.toggleLever(cc.x0, cc.y, cc.z0);
    await new Promise((r) => setTimeout(r, 1200));
    const door = Blocks.get(w.getBlock(cc.x0 + 6, cc.y, cc.z0)).open;
    // a mano no se abre
    g.building.interact({ x: cc.x0 + 6, y: cc.y, z: cc.z0 }, Blocks.get(w.getBlock(cc.x0 + 6, cc.y, cc.z0)));
    return { door, lamp: w.getBlock(cc.x0 + 3, cc.y, cc.z0 + 1) === ID.ENERGY_LAMP, hand: Blocks.get(w.getBlock(cc.x0 + 6, cc.y, cc.z0)).open };
  }, c);
  ok('al apagar la palanca se cierra la puerta y la lámpara se apaga; a mano la puerta de hierro no se abre', off.door === 0 && off.lamp && off.hand === 0, JSON.stringify(off));

  // ── Raíles colocados con el ratón (se orientan solos) y vagoneta ──
  const rails = await ev(async () => {
    const g = window.__game; const { Items } = await import('/src/items.js'); const { RAIL } = await import('/src/rails.js');
    const p = g.player, w = g.world;
    const x0 = Math.floor(p.x) - 20, z0 = Math.floor(p.z) + 10, y = Math.floor(p.y) - 3;
    // suelo despejado
    for (let x = x0 - 2; x <= x0 + 30; x++) for (let z = z0 - 3; z <= z0 + 3; z++) for (let k = 0; k < 5; k++) w.setBlock(x, y + k, z, 0);
    g.inventory.slots[0] = { i: Items.id('rail'), n: 64, d: 0 }; g.inventory.selected = 0;
    // colocar raíles con el sistema de colocación real (como un clic derecho sobre el suelo)
    for (let x = x0; x <= x0 + 24; x++) {
      const hit = { x, y: y - 1, z: z0, nx: 0, ny: 1, nz: 0, id: w.getBlock(x, y - 1, z0), px: x + 0.5, py: y, pz: z0 + 0.5, dist: 2 };
      g.building.use(hit, null, false, true);
    }
    // una curva al final
    for (let z = z0 + 1; z <= z0 + 4; z++) { const hit = { x: x0 + 24, y: y - 1, z, nx: 0, ny: 1, nz: 0, id: w.getBlock(x0 + 24, y - 1, z), px: x0 + 24.5, py: y, pz: z + 0.5, dist: 2 }; g.building.use(hit, null, false, true); }
    const shapes = [x0 + 3, x0 + 24].map((x) => RAIL[w.getBlock(x, y, z0)]);
    return { x0, y, z0, straight: shapes[0] && shapes[0].a % 2 === 1, curve: shapes[1] && [shapes[1].a, shapes[1].b].sort().join() === '2,3' };
  });
  ok('los raíles colocados forman una recta y una curva al girar', rails.straight && rails.curve, JSON.stringify(rails));
  const cart = await ev(async (r) => {
    const g = window.__game; const { Items } = await import('/src/items.js');
    const p = g.player;
    p.flying = false; p.teleport(r.x0 + 0.5, r.y + 0.1, r.z0 + 1.5); p.yaw = -Math.PI / 2; p.pitch = -0.6; // mira al Este y abajo
    g.inventory.slots[1] = { i: Items.id('minecart'), n: 1, d: 0 }; g.inventory.selected = 1;
    g.hit = { x: r.x0 + 1, y: r.y, z: r.z0, nx: 0, ny: 1, nz: 0, id: g.world.getBlock(r.x0 + 1, r.y, r.z0) }; g.entityTarget = null;
    g.useItem(true);
    const c = g.entities.list.find((e) => e.type === 'minecart' && !e.removed);
    if (!c) return { ok: false };
    g.entityTarget = c; g.useItem(true);
    return { ok: true, riding: g.riding === c, x: c.x };
  }, rails);
  ok('la vagoneta se pone en el raíl y se monta con clic derecho', cart.ok && cart.riding, JSON.stringify(cart));
  await ensurePlaying(page);
  await page.keyboard.down('KeyW');
  await page.waitForFunction((x0) => { const g = window.__game; return g.riding && g.riding.x > x0 + 8; }, rails.x0, { timeout: 30000 }).catch(() => {});
  await page.screenshot({ path: S + '/f6_cart.png' });
  await page.keyboard.up('KeyW');
  const ride = await ev(() => { const g = window.__game; const c = g.riding; return c ? { x: +c.x.toFixed(1), px: +g.player.x.toFixed(1), speed: +c.speed.toFixed(2) } : null; });
  ok('con W la vagoneta avanza por la vía y lleva al jugador', ride && ride.x > rails.x0 + 8 && Math.abs(ride.px - ride.x) < 0.5, JSON.stringify(ride));
  await page.keyboard.down('KeyC'); await frames(page, 6); await page.keyboard.up('KeyC');
  const down = await ev(() => ({ riding: !!window.__game.riding }));
  ok('C baja de la vagoneta', !down.riding);

  // ── Barca ──
  const boat = await ev(async () => {
    const g = window.__game; const { ID } = await import('/src/blocks.js'); const { Items } = await import('/src/items.js');
    const p = g.player, w = g.world;
    const x0 = Math.floor(p.x) + 5, z0 = Math.floor(p.z) - 30, y = Math.floor(p.y) - 1;
    for (let x = x0 - 8; x <= x0 + 8; x++) for (let z = z0 - 16; z <= z0 + 4; z++) { w.setBlock(x, y, z, ID.WATER); w.setBlock(x, y - 1, z, ID.WATER); for (let k = 1; k < 4; k++) w.setBlock(x, y + k, z, 0); }
    p.teleport(x0 + 0.5, y + 3, z0 + 3.5); p.flying = true; p.yaw = 0; p.pitch = -0.9;
    g.inventory.slots[2] = { i: Items.id('boat'), n: 1, d: 0 }; g.inventory.selected = 2;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    g.entityTarget = null; g.useItem(true);
    const b = g.entities.list.find((e) => e.type === 'boat' && !e.removed);
    if (!b) return { ok: false };
    p.flying = false; g.entityTarget = b; g.useItem(true);
    return { ok: true, riding: g.riding === b, z: b.z, x0, z0, y };
  });
  ok('la barca se pone en el agua y se monta', boat.ok && boat.riding, JSON.stringify(boat));
  await ensurePlaying(page);
  await page.keyboard.down('KeyW');
  await page.waitForFunction((z) => { const g = window.__game; return g.riding && g.riding.z < z - 4; }, boat.z, { timeout: 30000 }).catch(() => {});
  await page.screenshot({ path: S + '/f6_boat.png' });
  await page.keyboard.up('KeyW');
  const sail = await ev((b) => { const g = window.__game; const v = g.riding; return v ? { dz: +(b.z - v.z).toFixed(1), y: +v.y.toFixed(2), water: b.y } : null; }, boat);
  ok('con W la barca navega y flota', sail && sail.dz > 4 && Math.abs(sail.y - (sail.water + 0.575)) < 0.4, JSON.stringify(sail));
  await page.keyboard.down('KeyC'); await frames(page, 6); await page.keyboard.up('KeyC');

  // ── Correcciones de la revisión: teletransporte y muerte montado, barca aparcada lejos ──
  const fixes = await ev(async () => {
    const g = window.__game; const p = g.player;
    const b = g.entities.list.find((e) => e.type === 'boat' && !e.removed);
    const wait = () => new Promise((r) => setTimeout(r, 400));
    g.mount(b); await wait();
    const bx = b.x, bz = b.z;
    p.teleport(bx + 6.5, p.y + 4, bz + 0.5); p.flying = true; await wait();
    const tp = { riding: !!g.riding, dx: +(p.x - (bx + 6.5)).toFixed(2) };
    // aparcada a más de 80 bloques con su chunk aún cargado: no desaparece
    p.teleport(bx + 86, p.y, bz); await wait(); await wait();
    const loaded = g.world.isLoaded(Math.floor(bx), Math.floor(bz));
    p.teleport(bx + 3, p.y, bz); await wait();
    const back = g.entities.list.some((e) => e === b && !e.removed);
    // morir montado: se reaparece fuera de la barca
    g.mount(b); await wait();
    g.survival.health = 0; g.survival.die('cmd'); await wait();
    const dead = { riding: !!g.riding };
    g.respawn(); await wait(); await wait();
    // con una barca en la mano, clic derecho a un cofre lo abre (no pone la barca encima)
    const { ID } = await import('/src/blocks.js'); const { Items } = await import('/src/items.js');
    const cx = Math.floor(p.x) + 2, cy = Math.floor(p.y), cz = Math.floor(p.z);
    g.world.setBlock(cx, cy, cz, ID.CHEST);
    g.inventory.slots[2] = { i: Items.id('boat'), n: 1, d: 0 }; g.inventory.selected = 2;
    const boats0 = g.entities.list.filter((e) => e.type === 'boat' && !e.removed).length;
    g.hit = { x: cx, y: cy, z: cz, nx: 0, ny: 1, nz: 0, id: ID.CHEST, dist: 2 }; g.entityTarget = null;
    g.useItem(true);
    const chest = { opened: g.state === 'screen', boats: g.entities.list.filter((e) => e.type === 'boat' && !e.removed).length - boats0 };
    if (g.ui.screen) g.ui.closeScreen();
    return { tp, loaded, back, dead, after: !!g.riding, dist: +Math.hypot(p.x - b.x, p.z - b.z).toFixed(1), chest };
  });
  ok('teletransportarse o morir montado baja del vehículo; una barca aparcada lejos no desaparece', !fixes.tp.riding && Math.abs(fixes.tp.dx) < 0.6 && fixes.back && !fixes.dead.riding && !fixes.after, JSON.stringify(fixes));
  ok('con una barca en la mano, clic derecho a un cofre lo abre', fixes.chest.opened && fixes.chest.boats === 0, JSON.stringify(fixes.chest));
  await ensurePlaying(page);

  // ── Guardar: la vagoneta y la barca se guardan como entidades ──
  const saved = await ev(async () => { const g = window.__game; await g.saveGame(true); const all = Object.values(g.meta.sleeping || {}).flat(); return { cart: all.some((e) => e.t === 'minecart'), boat: all.some((e) => e.t === 'boat') }; });
  ok('vagoneta y barca se guardan con el mundo', saved.cart && saved.boat, JSON.stringify(saved));

  const errs = await ev(() => window.__errors || []);
  ok('sin errores de página', !errs.length, errs.join(' | '));
}, { readyFlag: '__ready', readyTimeout: 120000, w: 1280, h: 720 });
