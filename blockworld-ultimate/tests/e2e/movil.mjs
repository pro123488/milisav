// Prueba E2E de los controles táctiles con Chromium emulando un teléfono (pantalla táctil, sin ratón): detección
// automática, joystick, mirar arrastrando, tocar para colocar, mantener para romper, saltar, agacharse, barra rápida,
// inventario con toques (coger, dejar, la mitad, mover rápido) y botones de pausa y cerrar. También en vertical.
// Ejecuta: node tests/e2e/movil.mjs
import { withPage, frames } from '../../tools/pw.mjs';
import os from 'node:os';
const S = process.env.SHOTS || os.tmpdir();
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
const W = 844, H = 390;

await withPage('index.html?autostart=creative&rd=3&seed=movil&type=flat&mobs=none&structures=0', async (page) => {
  await page.waitForTimeout(500);
  const ev = (f, a) => page.evaluate(f, a);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
  const wait = (ms) => page.waitForTimeout(ms);

  // ── Detección y arranque ──
  const det = await ev(() => { const g = window.__game; return { active: g.touch.active, mode: g.controls.touchMode, body: document.body.classList.contains('touch'), coarse: matchMedia('(pointer: coarse)').matches }; });
  ok('en un teléfono los controles táctiles se activan solos', det.active && det.mode && det.body && det.coarse, JSON.stringify(det));
  await page.tap('#gl');
  await frames(page, 4);
  const st = await ev(() => { const g = window.__game; return { state: g.state, locked: g.controls.locked, ui: !document.getElementById('touch-ui').classList.contains('hidden') }; });
  ok('tocar la pantalla empieza a jugar y muestra los controles', st.state === 'playing' && st.locked && st.ui, JSON.stringify(st));
  await ev(async () => {
    const g = window.__game; const { ID } = await import('/src/blocks.js'); const { Items } = await import('/src/items.js');
    g.renderer.setPixelRatio(0.5); g._resize(); g.time = 0.3;
    const p = g.player, w = g.world; p.flying = false;
    const x0 = Math.floor(p.x), z0 = Math.floor(p.z), y = Math.floor(p.y);
    for (let x = x0 - 6; x <= x0 + 6; x++) for (let z = z0 - 12; z <= z0 + 6; z++) { for (let k = 0; k < 5; k++) w.setBlock(x, y + k, z, 0); w.setBlock(x, y - 1, z, ID.STONE); }
    p.teleport(x0 + 0.5, y, z0 + 0.5); p.yaw = 0; p.pitch = 0;
    g.inventory.slots[0] = { i: Items.id('planks'), n: 20, d: 0 }; g.inventory.slots[1] = { i: Items.id('cobble'), n: 10, d: 0 }; g.inventory.selected = 0;
  });
  await frames(page, 10);
  await page.screenshot({ path: S + '/m1_play.png' });

  // ── Joystick: arrastrar hacia arriba en la mitad izquierda ──
  const z0 = await ev(() => window.__game.player.z);
  await touch('touchStart', [[120, 300, 1]]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[120, 300 - i * 9, 1]]); await wait(16); }
  await wait(900);
  const moved = await ev(() => ({ z: window.__game.player.z, stick: window.__game.controls.stick }));
  await touch('touchEnd', []);
  await wait(200);
  const after = await ev(() => ({ z: window.__game.player.z, stick: window.__game.controls.stick }));
  ok('el joystick mueve hacia delante y al soltarlo se para', z0 - moved.z > 0.8 && moved.stick && !after.stick, JSON.stringify({ z0, z: moved.z, stick: moved.stick }));

  // ── Mirar: arrastrar en la mitad derecha ──
  const yaw0 = await ev(() => window.__game.player.yaw);
  await touch('touchStart', [[600, 200, 2]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[600 + i * 12, 200 + i * 4, 2]]); await wait(16); }
  await touch('touchEnd', []);
  await frames(page, 3);
  const look = await ev(() => ({ yaw: window.__game.player.yaw, pitch: window.__game.player.pitch }));
  ok('arrastrar el dedo gira la cámara', look.yaw < yaw0 - 0.2 && look.pitch < -0.05, JSON.stringify({ yaw0, ...look }));

  // ── Tocar para colocar, mantener para romper ──
  await ev(() => { const p = window.__game.player; p.yaw = 0; p.pitch = -0.75; });
  await frames(page, 6);
  const target = await ev(() => { const h = window.__game.hit; return h ? [h.x, h.y, h.z, h.ny] : null; });
  await page.touchscreen.tap(620, 180);
  await frames(page, 4);
  const placed = await ev(async (t) => { const g = window.__game; const { Blocks } = await import('/src/blocks.js'); return { block: t ? Blocks.get(g.world.getBlock(t[0], t[1] + 1, t[2])).key : null }; }, target);
  ok('tocar la pantalla coloca el bloque que se apunta', target && target[3] === 1 && placed.block === 'planks', JSON.stringify({ target, ...placed }));
  await frames(page, 4);
  const tgt2 = await ev(() => { const h = window.__game.hit; return h ? [h.x, h.y, h.z] : null; });
  await touch('touchStart', [[620, 180, 3]]);
  await wait(700);
  await touch('touchEnd', []);
  await frames(page, 3);
  const broke = await ev((t) => (t ? window.__game.world.getBlock(t[0], t[1], t[2]) : -1), tgt2);
  ok('mantener el dedo quieto rompe el bloque (Creativo)', tgt2 && broke === 0, JSON.stringify({ tgt2, broke }));

  // ── Botones: saltar, agacharse (fijo), barra rápida ──
  const box = async (sel) => { const b = await page.locator(sel).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const [jx, jy] = await box('.t-jump');
  const y0 = await ev(() => window.__game.player.y);
  await touch('touchStart', [[jx, jy, 4]]); await wait(120); await touch('touchEnd', []);
  let maxY = y0;
  for (let i = 0; i < 12; i++) { await wait(40); maxY = Math.max(maxY, await ev(() => window.__game.player.y)); }
  ok('el botón de saltar salta', maxY > y0 + 0.4, JSON.stringify({ y0, maxY }));
  const [cx, cy] = await box('.t-crouch');
  await page.touchscreen.tap(cx, cy); await frames(page, 4);
  const crouchOn = await ev(() => window.__game.player.crouching);
  await page.touchscreen.tap(cx, cy); await wait(250); await frames(page, 2); // la tecla se suelta a los 120 ms
  const crouchOff = await ev(() => window.__game.player.crouching);
  ok('un toque en agacharse lo deja fijo y otro lo quita', crouchOn && !crouchOff, JSON.stringify({ crouchOn, crouchOff }));
  const [hx, hy] = await box('#hotbar .slot.hot[data-i="4"]');
  await page.touchscreen.tap(hx, hy); await frames(page, 2);
  ok('tocar una ranura de la barra rápida la selecciona', await ev(() => window.__game.inventory.selected === 4));
  await ev(() => { window.__game.inventory.selected = 0; });

  // ── Inventario con toques ──
  const [ix, iy] = await box('.t-top .t-btn:nth-child(2)');
  await page.touchscreen.tap(ix, iy); await frames(page, 6);
  const inv = await ev(() => ({ state: window.__game.state, bar: !!document.querySelector('.touch-bar'), close: !document.querySelector('.t-close').classList.contains('hidden') }));
  ok('🎒 abre el inventario con el botón ✕ y «Mover rápido»', inv.state === 'screen' && inv.bar && inv.close, JSON.stringify(inv));
  await page.screenshot({ path: S + '/m2_inventory.png' });
  const fits = await ev(() => { const r = document.querySelector('.screen-overlay .panel').getBoundingClientRect(); const hb = [...document.querySelectorAll('.screen-overlay .slot-grid .slot')].pop().getBoundingClientRect(); return { panelH: Math.round(r.height), vh: innerHeight, hotBottom: Math.round(hb.bottom), catH: Math.round(document.querySelector('.catalog').getBoundingClientRect().height) }; });
  ok('en horizontal el inventario cabe: catálogo a un lado y la barra rápida a la vista', fits.panelH <= fits.vh && fits.hotBottom <= fits.vh && fits.catH > 120, JSON.stringify(fits));
  // los huecos del inventario: la barra rápida es la última fila de la cuadrícula del jugador
  const slotSel = (i) => `.screen-overlay .slot-grid .slot >> nth=${i}`;
  const hotIdx = await ev(() => { const all = [...document.querySelectorAll('.screen-overlay .slot-grid .slot')]; return all.length; });
  const tapEl = async (sel, ms = 0) => {
    await page.locator(sel).scrollIntoViewIfNeeded();
    const [x, y] = await box(sel); await touch('touchStart', [[x, y, 9]]); if (ms) await wait(ms); await touch('touchEnd', []); await frames(page, 2);
  };
  // hueco 0 de la barra rápida (tablones ×20; en Creativo colocar no gasta): mantener = coger la mitad
  const hot0 = hotIdx - 9;
  await tapEl(slotSel(hot0), 550);
  const half = await ev(() => { const g = window.__game; return { cursor: g.inventory.cursor ? g.inventory.cursor.n : 0, left: g.inventory.slots[0] ? g.inventory.slots[0].n : 0 }; });
  await tapEl(slotSel(0));
  const put = await ev(() => { const g = window.__game; return { cursor: g.inventory.cursor ? g.inventory.cursor.n : 0, s9: g.inventory.slots[9] ? g.inventory.slots[9].n : 0 }; });
  ok('mantener coge la mitad de la pila y tocar otro hueco la deja', half.cursor === 10 && half.left === 10 && put.cursor === 0 && put.s9 === 10, JSON.stringify({ half, put }));
  await page.locator('.touch-bar .btn').tap();
  await tapEl(slotSel(0));
  const quick = await ev(async () => { const g = window.__game; const { Items } = await import('/src/items.js'); const pl = Items.id('planks'); return { s9: g.inventory.slots[9], hot: g.inventory.slots.slice(0, 9).reduce((a, s) => a + (s && s.i === pl ? s.n : 0), 0) }; });
  ok('con «Mover rápido» un toque pasa la pila a la otra zona (se junta con la de la barra rápida)', !quick.s9 && quick.hot === 20, JSON.stringify(quick));
  await page.locator('.t-close').tap(); await frames(page, 4);
  const closed = await ev(() => ({ state: window.__game.state, locked: window.__game.controls.locked }));
  ok('✕ cierra el inventario y se sigue jugando', closed.state === 'playing' && closed.locked, JSON.stringify(closed));

  // ── Chat: abre el chat (no la pausa) y ✕ lo cierra ──
  const [chx, chy] = await box('.t-top .t-btn:nth-child(6)');
  await page.touchscreen.tap(chx, chy); await frames(page, 4);
  const chat = await ev(() => ({ open: window.__game.ui.chatOpen, state: window.__game.state, close: !document.querySelector('.t-close').classList.contains('hidden') }));
  await page.locator('.t-close').tap(); await frames(page, 4);
  const chat2 = await ev(() => ({ open: window.__game.ui.chatOpen, state: window.__game.state, locked: window.__game.controls.locked }));
  ok('💬 abre el chat sin pausar y ✕ lo cierra', chat.open && chat.state === 'playing' && chat.close && !chat2.open && chat2.state === 'playing' && chat2.locked, JSON.stringify({ chat, chat2 }));

  // ── Vehículo: ⤓ baja sin dejar el agachado fijo, y se puede volver a subir ──
  const ride = await ev(async () => {
    const g = window.__game; const { Boat } = await import('/src/vehicles.js');
    const b = new Boat(g); b.setPos(g.player.x + 2, g.player.y, g.player.z); g.entities.add(b);
    g.mount(b);
    return { riding: g.riding === b };
  });
  await page.touchscreen.tap(cx, cy); await frames(page, 6);
  const off = await ev(() => ({ riding: !!window.__game.riding, crouchKey: window.__game.controls.keys.has('KeyC'), latched: window.__game.touch.crouchLatched }));
  await ev(() => { const g = window.__game; const b = g.entities.list.find((e) => e.type === 'boat' && !e.removed); g.mount(b); });
  await frames(page, 8);
  const again = await ev(() => !!window.__game.riding);
  await page.touchscreen.tap(cx, cy); await frames(page, 6);
  ok('⤓ baja del vehículo sin quedarse agachado y se puede volver a subir', ride.riding && !off.riding && !off.crouchKey && !off.latched && again, JSON.stringify({ ride, off, again }));

  // ── Esc con un teclado (tableta): pausa ──
  await page.keyboard.press('Escape'); await frames(page, 4);
  const escP = await ev(() => window.__game.state);
  await page.keyboard.press('Escape'); await frames(page, 4);
  ok('con teclado, Esc pausa y reanuda también en modo táctil', escP === 'paused' && (await ev(() => window.__game.state)) === 'playing', escP);

  // ── Pausa ──
  const [px, py] = await box('.t-top .t-btn:nth-child(1)');
  await page.touchscreen.tap(px, py); await frames(page, 4);
  const paused = await ev(() => window.__game.state);
  await page.getByText('Continuar', { exact: true }).tap(); await frames(page, 4);
  const resumed = await ev(() => ({ state: window.__game.state, ui: !document.getElementById('touch-ui').classList.contains('hidden') }));
  ok('⏸ pausa y «Continuar» vuelve al juego con los controles', paused === 'paused' && resumed.state === 'playing' && resumed.ui, JSON.stringify({ paused, ...resumed }));

  const errs = await ev(() => window.__errors || []);
  ok('sin errores de página', !errs.length, errs.join(' | '));
}, { readyFlag: '__ready', readyTimeout: 120000, w: W, h: H, mobile: true });

// ── Teléfono en vertical: la barra rápida cabe y los botones no la tapan ──
await withPage('index.html?autostart=survival&rd=2&seed=movil2&type=flat&mobs=none&structures=0', async (page) => {
  await page.waitForTimeout(500);
  await page.tap('#gl'); await frames(page, 6);
  const lay = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const hb = r('#hotbar'), j = r('.t-jump'), u = r('.t-use'), st = r('#stats-row');
    const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return { w: innerWidth, hbL: Math.round(hb.left), hbR: Math.round(hb.right), stL: Math.round(st.left), stR: Math.round(st.right), jumpOver: overlap(hb, j), useOver: overlap(hb, u), state: window.__game.state };
  });
  await page.screenshot({ path: S + '/m3_portrait.png' });
  ok('en vertical la barra rápida y los corazones caben y los botones no los tapan', lay.hbL >= 0 && lay.hbR <= lay.w && lay.stL >= 0 && lay.stR <= lay.w && !lay.jumpOver && !lay.useOver && lay.state === 'playing', JSON.stringify(lay));
  // inventario en vertical (Creativo): todo dentro del panel, también la columna de armadura
  await page.evaluate(() => { const g = window.__game; g.setMode('creative'); g.openInventory(); });
  await frames(page, 6);
  const pinv = await page.evaluate(() => {
    const panel = document.querySelector('.screen-overlay .panel').getBoundingClientRect();
    const arm = document.querySelector('.armor-col').getBoundingClientRect();
    const grid = [...document.querySelectorAll('.screen-overlay .slot-grid')].pop().getBoundingClientRect();
    return { pl: Math.round(panel.left), pr: Math.round(panel.right), al: Math.round(arm.left), gr: Math.round(grid.right) };
  });
  await page.screenshot({ path: S + '/m4_portrait_inv.png' });
  ok('en vertical el inventario de Creativo cabe (armadura incluida)', pinv.al >= pinv.pl && pinv.gr <= pinv.pr, JSON.stringify(pinv));
}, { readyFlag: '__ready', readyTimeout: 120000, w: 390, h: 844, mobile: true });
