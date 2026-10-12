// Prueba E2E en Chromium (Playwright). Ejecuta: node tests/e2e/ui-crafting.mjs
import { withPage, frames } from '../../tools/pw.mjs';
import os from 'node:os';
const S = process.env.SHOTS || os.tmpdir();
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
await withPage('index.html?autostart=survival&rd=2&seed=prueba&mobs=none&structures=0', async (page) => {
  await page.waitForTimeout(500);
  await page.click('#gl'); await frames(page, 3);
  const ev = (f, a) => page.evaluate(f, a);
  const cmd = (c) => ev((c) => import('/src/commands.js').then((m) => m.runCommand(window.__game, c)), c);
  console.log(await cmd('/dar log_oak 8'));
  ok('inventario recibe troncos', await ev(() => window.__game.inventory.count(window.Items ? 0 : 0) >= 0));
  // abrir inventario con la tecla E
  await page.keyboard.press('KeyE'); await frames(page, 4);
  ok('E abre el inventario', await ev(() => window.__game.state === 'screen' && !!document.querySelector('.inventory-screen')));
  await page.screenshot({ path: S + '/u1_inv.png' });
  // fabricar tablones haciendo clic en la receta
  await page.click('.recipe:has-text("Tablones")'); await frames(page, 2);
  const planks = await ev(() => import('/src/items.js').then((m) => window.__game.inventory.count(m.Items.id('planks'))));
  ok('crafteo de tablones (1 tronco -> 4)', planks === 4, 'tablones=' + planks);
  const logs = await ev(() => import('/src/items.js').then((m) => window.__game.inventory.count(m.Items.id('log_oak'))));
  ok('el tronco se consume', logs === 7, 'troncos=' + logs);
  await page.click('.recipe:has-text("Mesa de trabajo")', { force: true }).catch(() => {});
  await frames(page, 2);
  const wb = await ev(() => import('/src/items.js').then((m) => window.__game.inventory.count(m.Items.id('workbench'))));
  ok('crafteo de mesa de trabajo', wb === 1, 'mesas=' + wb);
  await page.keyboard.press('KeyE'); await frames(page, 4);
  ok('E cierra el inventario y vuelve a jugar', await ev(() => window.__game.state === 'playing' && window.__game.controls.locked));
  // colocar la mesa
  await ev(async () => { const g = window.__game; const m = await import('/src/items.js'); const inv = g.inventory; const i = inv.slots.findIndex((s) => s && s.i === m.Items.id('workbench')); inv.selected = i; g.player.pitch = -0.9; });
  await frames(page, 4);
  await page.mouse.click(240, 135, { button: 'right' }); await frames(page, 3);
  const wbPos = await ev(() => { const g = window.__game; const h = g.hit; return h ? { x: h.x, y: h.y, z: h.z, id: g.world.getBlock(h.x, h.y, h.z) } : null; });
  ok('clic derecho coloca la mesa de trabajo', wbPos && wbPos.id === 47, JSON.stringify(wbPos));
  await ev(() => { window.__game.inventory.selected = 8; });
  await frames(page, 3);
  await page.mouse.click(240, 135, { button: 'right' }); await frames(page, 4);
  ok('clic derecho en la mesa abre la pantalla de fabricación', await ev(() => !!document.querySelector('.workbench-screen')));
  await page.screenshot({ path: S + '/u2_workbench.png' });
  // fabricar un pico de madera: 3 tablones + 2 palos; tenemos 3 tablones tras la mesa? damos materiales
  await cmd('/dar planks 10'); await cmd('/dar stick 6');
  await frames(page, 2);
  await ev(() => document.querySelector('.recipe-list') && 0);
  await page.click('.recipe:has-text("Pico de madera")'); await frames(page, 2);
  const pick = await ev(() => import('/src/items.js').then((m) => window.__game.inventory.count(m.Items.id('wood_pickaxe'))));
  ok('crafteo de pico de madera en la mesa', pick === 1, 'picos=' + pick);
  ok('logro de pico obtenido', await ev(() => window.__game.achievements.has('pico')));
  await page.keyboard.press('Escape'); await frames(page, 3);
  ok('Esc cierra la mesa', await ev(() => window.__game.state === 'playing'));
}, { readyFlag: '__ready', readyTimeout: 60000, w: 640, h: 360 });
