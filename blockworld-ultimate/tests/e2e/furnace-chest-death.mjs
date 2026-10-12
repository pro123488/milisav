// Prueba E2E en Chromium (Playwright). Ejecuta: node tests/e2e/furnace-chest-death.mjs
import { withPage, frames } from '../../tools/pw.mjs';
import os from 'node:os';
const S = process.env.SHOTS || os.tmpdir();
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
await withPage('index.html?autostart=survival&rd=2&seed=prueba&mobs=none&structures=0', async (page) => {
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__game; g.renderer.setPixelRatio(0.3); g._resize(); });
  await page.click('#gl'); await frames(page, 3); await page.mouse.move(640, 360); await frames(page, 3);
  const ev = (f, a) => page.evaluate(f, a);
  const cmd = (c) => ev((c) => import('/src/commands.js').then((m) => m.runCommand(window.__game, c)), c);
  const count = (k) => ev((k) => import('/src/items.js').then((m) => window.__game.inventory.count(m.Items.id(k))), k);
  // ── Horno ──
  await cmd('/dar furnace 1'); await cmd('/dar cobble 5'); await cmd('/dar coal 2'); await cmd('/dar raw_iron 2');
  await ev(async () => { const g = window.__game; const m = await import('/src/items.js'); g.inventory.selected = g.inventory.slots.findIndex((s) => s && s.i === m.Items.id('furnace')); g.player.pitch = -0.9; });
  await frames(page, 8);
  await page.mouse.click(640, 360, { button: 'right' }); await frames(page, 5);
  await ev(() => { window.__game.inventory.selected = 8; }); await frames(page, 4);
  await page.mouse.click(640, 360, { button: 'right' }); await frames(page, 6);
  ok('el horno abre su pantalla', await ev(() => !!document.querySelector('.furnace-screen')));
  // meter hierro en bruto y carbón por la interfaz con mayús+clic
  const slotsInfo = await ev(async () => { const m = await import('/src/items.js'); const inv = window.__game.inventory; return { iron: inv.slots.findIndex((s) => s && s.i === m.Items.id('raw_iron')), coal: inv.slots.findIndex((s) => s && s.i === m.Items.id('coal')) }; });
  const invSlots = await page.$$('.furnace-screen .inv-block .slot');
  // las 27 de la mochila van primero, luego la barra rápida (9): índice visual = slot-9 si >=9, si no 27+slot
  const vis = (i) => (i >= 9 ? i - 9 : 27 + i);
  await invSlots[vis(slotsInfo.iron)].click({ modifiers: ['Shift'] }); await frames(page, 2);
  await invSlots[vis(slotsInfo.coal)].click({ modifiers: ['Shift'] }); await frames(page, 2);
  const be = await ev(() => { const be = [...window.__game.world.blockEntities.values()].find((b) => b.type === 'furnace'); return be ? { slots: be.slots.map((s) => s && [s.i, s.n]) } : null; });
  ok('mayús+clic mueve hierro y carbón al horno', be && be.slots[0] && be.slots[1], JSON.stringify(be));
  await page.screenshot({ path: S + '/u3_furnace.png' });
  // simular el paso del tiempo del horno (20 s)
  await ev(async () => { const g = window.__game; const t = await import('/src/ticks.js'); const be = [...g.world.blockEntities.values()].find((b) => b.type === 'furnace'); for (let i = 0; i < 100; i++) t.tickFurnace(be, 0.25); });
  await frames(page, 3);
  const out = await ev(() => { const be = [...window.__game.world.blockEntities.values()].find((b) => b.type === 'furnace'); return be.slots.map((s) => s && [s.i, s.n]); });
  ok('el horno funde hierro en lingotes (2 en ~25 s con carbón)', out[2] && out[2][1] === 2, JSON.stringify(out));
  await page.keyboard.press('Escape'); await frames(page, 3);
  // ── Cofre ──
  await cmd('/dar chest 1'); await cmd('/dar diamond 1');
  await ev(async () => { const g = window.__game; const m = await import('/src/items.js'); g.inventory.selected = g.inventory.slots.findIndex((s) => s && s.i === m.Items.id('chest')); g.player.yaw += 1.6; g.player.pitch = -0.9; });
  await frames(page, 8);
  await page.mouse.click(640, 360, { button: 'right' }); await frames(page, 5);
  await ev(() => { window.__game.inventory.selected = 8; }); await frames(page, 4);
  await page.mouse.click(640, 360, { button: 'right' }); await frames(page, 6);
  ok('el cofre abre su pantalla', await ev(() => !!document.querySelector('.chest-screen')));
  await page.screenshot({ path: S + '/u4_chest.png' });
  await page.keyboard.press('Escape'); await frames(page, 3);
  // ── Comer ──
  await ev(() => { window.__game.player.pitch = 0.6; });
  await cmd('/dar cooked_beef 3');
  await ev(async () => { const g = window.__game; const m = await import('/src/items.js'); g.survival.hunger = 8; g.inventory.selected = g.inventory.slots.findIndex((s) => s && s.i === m.Items.id('cooked_beef')); });
  const h0 = await ev(() => window.__game.survival.hunger);
  await page.mouse.move(640, 360); await page.mouse.down({ button: 'right' });
  await frames(page, 70);
  await page.mouse.up({ button: 'right' });
  const h1 = await ev(() => window.__game.survival.hunger);
  ok('mantener clic derecho con comida restaura hambre', h1 > h0, `${h0} -> ${h1}`);
  ok('la comida se consume', (await count('cooked_beef')) === 2);
  // ── Caída y muerte ──
  await ev(() => { const g = window.__game; g.inventory.selected = 8; g.player.teleport(g.player.x, g.player.y + 30, g.player.z); });
  await frames(page, 80);
  const dead = await ev(() => ({ dead: window.__game.survival.dead, st: window.__game.state, hp: window.__game.survival.health }));
  ok('la caída desde 30 bloques mata (pantalla de muerte)', dead.dead && dead.st === 'dead', JSON.stringify(dead));
  await page.screenshot({ path: S + '/u5_death.png' });
  const dropped = await ev(() => window.__game.entities.list.filter((e) => e.type === 'item').length);
  ok('al morir se sueltan los objetos', dropped > 0, 'objetos en el suelo=' + dropped);
  await page.click('text=Reaparecer'); await frames(page, 6);
  const alive = await ev(() => ({ dead: window.__game.survival.dead, st: window.__game.state, hp: window.__game.survival.health, hunger: window.__game.survival.hunger }));
  ok('reaparecer restaura salud y estado', !alive.dead && alive.st === 'playing' && alive.hp === 20, JSON.stringify(alive));
}, { readyFlag: '__ready', readyTimeout: 60000, w: 1280, h: 720 });
