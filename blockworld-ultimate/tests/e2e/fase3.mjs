// Prueba E2E de la Fase 3 en Chromium: aldea generada, aldeanos, comercio con la interfaz real, campana,
// guardián contra un monstruo y brújula. Ejecuta: node tests/e2e/fase3.mjs
import { withPage, frames, ensurePlaying } from '../../tools/pw.mjs';
import os from 'node:os';
const S = process.env.SHOTS || os.tmpdir();
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));

await withPage('index.html?autostart=survival&rd=4&seed=aldea&type=normal&mobs=all&structures=1&diff=normal', async (page) => {
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__game; g.renderer.setPixelRatio(0.5); g._resize(); g.settings.sensitivity = 0; });
  await page.click('#gl'); await frames(page, 3); await page.mouse.move(640, 360); await frames(page, 3);
  const ev = (f, a) => page.evaluate(f, a);

  // ── Ir a la aldea más cercana ──
  const vinfo = await ev(async () => {
    const g = window.__game; const { nearestVillage } = await import('/src/villages.js'); const { runCommand } = await import('/src/commands.js');
    const v = nearestVillage(g.world.terrain, g.player.x, g.player.z, 6);
    const msg = runCommand(g, '/localizar aldea');
    g.time = 0.25; g.__fixedTime = 0.25;
    g.player.teleport(v.x + 0.5, v.y + 12, v.z + 6.5);
    return { id: v.id, x: v.x, y: v.y, z: v.z, n: v.villagers.length, msg };
  });
  ok('/localizar aldea encuentra una aldea', /Aldea de/.test(vinfo.msg), vinfo.msg);
  await page.waitForFunction(() => window.__game.world.isAreaReady(window.__game.player.x, window.__game.player.z, 3), null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  const st = await ev((id) => {
    const g = window.__game;
    const vill = g.entities.list.filter((e) => e.isVillager && e.village === id && !e.removed);
    const guard = g.entities.list.filter((e) => e.type === 'stone_guardian' && !e.removed);
    return { villagers: vill.length, guard: guard.length, found: g.villages.get(id) && g.villages.get(id).found, ach: g.achievements.has('aldea'), profs: vill.map((v) => v.prof) };
  }, vinfo.id);
  ok('aparecen los aldeanos y el guardián de piedra', st.villagers >= 2 && st.guard === 1, JSON.stringify(st));
  ok('la aldea se descubre (logro "Vecinos")', st.found && st.ach);

  // foto de la aldea desde arriba
  await ev((v) => { const p = window.__game.player; p.teleport(v.x + 0.5, v.y + 18, v.z + 22); p.yaw = 0; p.pitch = -0.55; p.flying = true; p.allowFlying = true; }, vinfo);
  await frames(page, 60);
  await page.screenshot({ path: S + '/f3_village.png' });

  // ── Comerciar con la interfaz ──
  const trade = await ev(async () => {
    const g = window.__game; const { Items } = await import('/src/items.js');
    const v = g.entities.list.find((e) => e.isVillager && e.prof !== 'none' && !e.removed);
    if (!v) return { err: 'sin aldeano con oficio' };
    const P = (await import('/src/trading.js')).PROFESSIONS[v.prof];
    // dar lo que pide su primera oferta de venta (objetos → monedas) en abundancia
    const sell = P.levels[0].find((o) => o.get[0] === 'sun_coin');
    g.inventory.add({ i: Items.id(sell.give[0][0]), n: sell.give[0][1] * 2, d: 0 });
    g.player.flying = false; g.player.teleport(v.x + 1.5, v.y, v.z + 0.5);
    g.entityTarget = v; g.hit = null; g.useItem(true);
    return { prof: v.prof, give: sell.give[0], screen: !!document.querySelector('.trade-screen') };
  });
  ok('clic derecho en un aldeano con oficio abre el comercio', trade.screen, JSON.stringify(trade));
  if (trade.screen) {
    await page.screenshot({ path: S + '/f3_trade.png' });
    const before = await ev(async () => { const { Items } = await import('/src/items.js'); return window.__game.inventory.count(Items.id('sun_coin')); });
    // clic en la oferta que da monedas
    const idx = await ev(() => [...document.querySelectorAll('.trade-screen .offer')].findIndex((o) => /Moneda de sol/.test(o.textContent) && !o.classList.contains('no')));
    if (idx >= 0) await page.locator('.trade-screen .offer').nth(idx).click();
    await frames(page, 4);
    const after = await ev(async () => { const { Items } = await import('/src/items.js'); return { coins: window.__game.inventory.count(Items.id('sun_coin')), ach: window.__game.achievements.has('comercio') }; });
    ok('el trato da una Moneda de sol y el logro "Trato hecho"', after.coins === before + 1 && after.ach, JSON.stringify({ before, ...after, idx }));
    await page.keyboard.press('Escape'); await frames(page, 4);
  }

  // ── Campana: alarma ──
  const bell = await ev(async (v) => {
    const g = window.__game; const { ID } = await import('/src/blocks.js');
    let pos = null;
    for (let dx = -6; dx <= 6 && !pos; dx++) for (let dz = -6; dz <= 6 && !pos; dz++) for (let dy = -2; dy <= 4; dy++) if (g.world.getBlock(v.x + dx, v.y + dy, v.z + dz) === ID.BELL) { pos = [v.x + dx, v.y + dy, v.z + dz]; break; }
    if (!pos) return { pos };
    g.building.interact({ x: pos[0], y: pos[1], z: pos[2] }, { interact: 'bell' });
    return { pos, alarm: g.villageAlarm(v.id) };
  }, vinfo);
  ok('la campana del pozo da la alarma', bell.pos && bell.alarm, JSON.stringify(bell));

  // ── Guardián contra un monstruo ──
  const fight = await ev(async (v) => {
    const g = window.__game; const { boxCollides } = await import('/src/physics.js'); const { B_SOLID } = await import('/src/blocks.js');
    g.mode = 'creative'; // que el monstruo no persiga al jugador
    const guard = g.entities.list.find((e) => e.type === 'stone_guardian' && !e.removed);
    // un sitio libre y con suelo junto al guardián (no dentro de una pared ni en otro nivel)
    let at = [guard.x + 3, guard.y, guard.z];
    for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2], [2, -2], [-2, 2], [4, 0], [0, 4]]) {
      const x = guard.x + dx, z = guard.z + dz, y = guard.y + 0.01;
      if (!boxCollides(g.world, x, y, z, 0.6, 1.8) && B_SOLID[g.world.getBlock(Math.floor(x), Math.floor(y) - 1, Math.floor(z))]) { at = [x, guard.y, z]; break; }
    }
    const m = g.spawnMob('night_stalker', at[0], at[1] + 0.05, at[2]);
    const hp0 = m.hp;
    for (let t = 0; t < 200 && m.hp >= hp0 && !m.removed; t++) await new Promise((r) => setTimeout(r, 100));
    return { hp0, hp: m.hp, dead: m.deathTime >= 0 || m.removed, dg: +Math.hypot(guard.x - g.player.x, guard.z - g.player.z).toFixed(1) };
  }, vinfo);
  ok('el guardián ataca al monstruo', fight.dead || fight.hp < fight.hp0, JSON.stringify(fight));
  await ev(() => { window.__game.mode = 'survival'; });

  // ── Brújula de aldeas ──
  await ensurePlaying(page);
  const comp = await ev(async () => {
    const g = window.__game; const { Items } = await import('/src/items.js');
    g.inventory.slots[8] = { i: Items.id('village_compass'), n: 1, d: 0 }; g.inventory.selected = 8;
    g.player.teleport(g.player.x + 150, g.player.y + 30, g.player.z); g.player.flying = true;
    // esperar a que la brújula se actualice (con WebGL por software los fotogramas pueden ir muy lentos)
    for (let i = 0; i < 200; i++) { const e = document.querySelector('.hud-compass'); if (e && !e.classList.contains('hidden') && e.textContent) break; await new Promise((r) => setTimeout(r, 100)); }
    const el = document.querySelector('.hud-compass');
    return { text: el && el.textContent, hidden: el && el.classList.contains('hidden') };
  });
  ok('la brújula indica la aldea más cercana', comp.text && !comp.hidden && /m al/.test(comp.text), JSON.stringify(comp));

  const errs = await ev(() => window.__errors || []);
  ok('sin errores de página', !errs.length, errs.join(' | '));
}, { readyFlag: '__ready', readyTimeout: 120000, w: 1280, h: 720 });
