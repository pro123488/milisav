// Prueba E2E en Chromium (Playwright). Ejecuta: node tests/e2e/save-load.mjs
import { withPage, frames } from '../../tools/pw.mjs';
import os from 'node:os';
const S = process.env.SHOTS || os.tmpdir();
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
await withPage('index.html?rd=2', async (page) => {
  const ev = (f, a) => page.evaluate(f, a);
  await page.waitForSelector('text=Inicio rápido');
  await page.evaluate(() => { const g = window.__game; g.renderer.setPixelRatio(0.3); g._resize(); });
  // Crear mundo desde el formulario
  await page.click('.menu-col >> text=Crear mundo');
  await page.fill('input[type=text] >> nth=0', 'Mundo de prueba');
  await page.fill('input[type=text] >> nth=1', 'semilla-persistente');
  await page.selectOption('select >> nth=2', 'peaceful');  // dificultad pacífico (tipo, modo, dificultad, tamaño → índice 2 = dificultad)
  await page.click('text=Crear mundo >> nth=1').catch(() => {});
  await page.waitForFunction(() => window.__game && window.__game.state === 'paused', null, { timeout: 90000 });
  ok('el mundo se carga y aparece la pantalla de "Jugar"', await ev(() => !!document.querySelector('.ready')));
  await page.click('.ready button'); await frames(page, 4);
  ok('tras pulsar Jugar el ratón queda capturado y se juega', await ev(() => window.__game.state === 'playing' && window.__game.controls.locked));
  const meta1 = await ev(() => ({ name: window.__game.meta.name, seed: window.__game.meta.seedText, diff: window.__game.difficulty, mode: window.__game.mode, id: window.__game.meta.id }));
  console.log(JSON.stringify(meta1));
  // modificar el mundo: colocar bloques lejos del origen y dar objetos
  const mark = await ev(async () => {
    const g = window.__game; const m = await import('/src/items.js'); const cm = await import('/src/commands.js');
    cm.runCommand(g, '/dar iron_pickaxe'); cm.runCommand(g, '/dar planks 33');
    const p = g.player; const x = Math.floor(p.x) + 3, z = Math.floor(p.z), y = Math.floor(p.y) + 5;
    g.world.setBlock(x, y, z, m.Items.id('bricks')); g.world.setBlock(x, y + 1, z, m.Items.id('block_gold'));
    g.world.blockEntities.set(g.world.beKey(x + 1, y, z), (await import('/src/inventory.js')).Container.deserialize({ type: 'chest', slots: [[m.Items.id('coal'), 7, 0], ...Array(26).fill(0)] }));
    g.world.setBlock(x + 1, y, z, m.Items.id('chest'));
    g.time = 0.33; g.survival.hunger = 11;
    return { x, y, z, px: p.x, py: p.y, pz: p.z };
  });
  await frames(page, 4);
  // pausa → Guardar y salir
  await ev(() => document.exitPointerLock()); await frames(page, 3);
  ok('al perder el ratón se abre la pausa', await ev(() => window.__game.state === 'paused' && !!document.querySelector('.screen-overlay .panel h2')));
  await page.click('text=Guardar y salir al menú');
  await page.waitForSelector('text=Continuar mundo', { timeout: 30000 });
  await page.waitForTimeout(800);
  ok('vuelve al menú principal', await ev(() => window.__game.state === 'menu'));
  // continuar
  await page.click('.menu-col >> text=Continuar mundo');
  await page.waitForFunction(() => window.__game.state === 'paused' && !!document.querySelector('.ready'), null, { timeout: 90000 });
  await page.click('.ready button'); await frames(page, 3);
  const st = await ev(async (mk) => {
    const g = window.__game; const m = await import('/src/items.js');
    return {
      brick: g.world.getBlock(mk.x, mk.y, mk.z) === m.Items.id('bricks'), gold: g.world.getBlock(mk.x, mk.y + 1, mk.z) === m.Items.id('block_gold'),
      chest: (() => { const be = g.world.blockEntities.get(g.world.beKey(mk.x + 1, mk.y, mk.z)); return be && be.slots[0] && be.slots[0].n; })(),
      pick: g.inventory.count(m.Items.id('iron_pickaxe')), planks: g.inventory.count(m.Items.id('planks')),
      pos: [g.player.x, g.player.y, g.player.z], time: g.time, hunger: g.survival.hunger, diff: g.difficulty, id: g.meta.id,
    };
  }, mark);
  console.log(JSON.stringify(st));
  ok('bloques colocados persisten (ladrillo y oro)', st.brick && st.gold);
  ok('el contenido del cofre persiste', st.chest === 7);
  ok('el inventario persiste', st.pick === 1 && st.planks === 33);
  ok('la posición persiste', Math.abs(st.pos[0] - mark.px) < 1.5 && Math.abs(st.pos[2] - mark.pz) < 1.5);
  ok('la hora y el hambre persisten', Math.abs(st.time - 0.33) < 0.1 && st.hunger > 10);
  ok('el mundo conserva su dificultad y su id', st.diff === 'peaceful' && st.id === meta1.id);
}, { w: 1100, h: 800 });
