// Prueba E2E de la Fase 4 en Chromium: tónicos y efectos, mesa de alquimia, santuario generado, invocación en el
// altar, barra de jefe y música de combate, los cuatro jefes en acción, bola de nieve, recompensas y bestiario.
// Ejecuta: node tests/e2e/fase4.mjs
import { withPage, frames, ensurePlaying } from '../../tools/pw.mjs';
import os from 'node:os';
const S = process.env.SHOTS || os.tmpdir();
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));

await withPage('index.html?autostart=survival&rd=4&seed=aldea&type=normal&mobs=all&structures=1&diff=normal', async (page) => {
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__game; g.renderer.setPixelRatio(0.5); g._resize(); g.settings.sensitivity = 0; });
  await page.click('#gl'); await frames(page, 3); await page.mouse.move(640, 360); await frames(page, 3);
  const ev = (f, a) => page.evaluate(f, a);

  // ── Tónico: beber manteniendo el clic derecho ──
  await ev(async () => {
    const g = window.__game; const { Items } = await import('/src/items.js');
    g.inventory.slots[0] = { i: Items.id('tonic_speed'), n: 1, d: 0 }; g.inventory.selected = 0;
    g.player.pitch = 1.4; // mirar al cielo: nada con lo que interactuar
  });
  await frames(page, 4);
  await ensurePlaying(page);
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => window.__game.survival.effects.has('speed'), null, { timeout: 30000 }).catch(() => {});
  await page.mouse.up({ button: 'right' }); await frames(page, 3);
  const drink = await ev(async () => {
    const g = window.__game; const { Items } = await import('/src/items.js');
    const s = g.inventory.slots[0];
    return { speed: g.survival.effects.level('speed'), mul: g.player.speedMul, hud: document.querySelector('.effects-hud').textContent, back: s && Items.get(s.i).key, ach: g.achievements.has('alquimia') };
  });
  ok('beber un tónico aplica el efecto, se ve en el HUD y devuelve el frasco', drink.speed === 1 && drink.mul > 1.15 && /Velocidad/.test(drink.hud) && drink.back === 'glass_bottle' && drink.ach, JSON.stringify(drink));

  // ── Mesa de alquimia ──
  const alch = await ev(async () => {
    const g = window.__game; const { Items } = await import('/src/items.js'); const { ID } = await import('/src/blocks.js');
    const p = g.player; const x = Math.floor(p.x) + 2, y = Math.floor(p.y), z = Math.floor(p.z);
    g.world.setBlock(x, y, z, ID.ALCHEMY_TABLE);
    g.openAlchemy(x, y, z);
    const be = g.world.blockEntities.get(g.world.beKey(x, y, z));
    be.slots[0] = { i: Items.id('crystal_shard'), n: 1, d: 0 };
    be.slots[1] = { i: Items.id('water_flask'), n: 1, d: 0 };
    be.slots[2] = { i: Items.id('water_flask'), n: 1, d: 0 };
    return { screen: !!document.querySelector('.alchemy-screen'), book: document.querySelectorAll('.brew-row').length, pos: [x, y, z] };
  });
  await page.screenshot({ path: S + '/f4_alchemy.png' });
  await page.waitForTimeout(11000);
  const brewed = await ev(async (pos) => {
    const g = window.__game; const { Items } = await import('/src/items.js');
    const be = g.world.blockEntities.get(g.world.beKey(...pos));
    return be.slots.map((s) => (s ? Items.get(s.i).key : null));
  }, alch.pos);
  ok('la mesa de alquimia abre su pantalla con el libro de recetas', alch.screen && alch.book >= 10, JSON.stringify(alch));
  ok('destila dos tónicos rúnicos con un fragmento de cristal', brewed[1] === 'tonic_base' && brewed[2] === 'tonic_base' && brewed[0] === null, JSON.stringify(brewed));
  await page.keyboard.press('Escape'); await frames(page, 4);

  // ── Santuario del bosque ──
  const sh = await ev(async () => {
    const g = window.__game; const { runCommand } = await import('/src/commands.js'); const { nearestShrine } = await import('/src/shrines.js');
    const msg = runCommand(g, '/localizar santuario bosque');
    const s = nearestShrine(g.world.terrain, g.player.x, g.player.z, 'bosque', 8);
    g.time = 0.25;
    g.player.teleport(s.x + 0.5, s.y + 14, s.z + 9.5); g.player.flying = true; g.player.allowFlying = true;
    return { msg, x: s.x, y: s.y, z: s.z };
  });
  ok('/localizar santuario encuentra el Santuario del Bosque', /Santuario del Bosque/.test(sh.msg), sh.msg);
  await page.waitForFunction(() => window.__game.world.isAreaReady(window.__game.player.x, window.__game.player.z, 3), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const altar = await ev((s) => { const g = window.__game; return g.world.getBlock(s.x, s.y + 1, s.z); }, sh);
  const altarId = await ev(async () => (await import('/src/blocks.js')).ID.ALTAR_FOREST);
  ok('el altar del bosque está en el centro del claro', altar === altarId, `${altar} vs ${altarId}`);
  await ev((s) => { const p = window.__game.player; p.teleport(s.x + 0.5, s.y + 9, s.z + 16); p.yaw = 0; p.pitch = -0.45; }, sh);
  await frames(page, 50);
  await page.screenshot({ path: S + '/f4_shrine_forest.png' });

  // ── Invocación con la ofrenda ──
  const summon = await ev(async (s) => {
    const g = window.__game; const { Items } = await import('/src/items.js'); const { Blocks } = await import('/src/blocks.js');
    const p = g.player; p.flying = false; p.teleport(s.x + 0.5, s.y + 1, s.z + 9.5);
    g.inventory.slots[1] = { i: Items.id('ancient_seed'), n: 1, d: 0 }; g.inventory.selected = 1;
    const r = g.building.interact({ x: s.x, y: s.y + 1, z: s.z }, Blocks.get(g.world.getBlock(s.x, s.y + 1, s.z)));
    const b = g.entities.list.find((e) => e.isBoss && !e.removed);
    return { r, boss: b && b.type, left: g.inventory.slots[1] };
  }, sh);
  ok('ofrecer la Semilla ancestral en el altar despierta al Guardián y gasta la ofrenda', summon.r && summon.boss === 'forest_guardian' && !summon.left, JSON.stringify(summon));
  await page.waitForTimeout(3500);
  const bar = await ev(() => {
    const g = window.__game; const el = document.querySelector('.boss-bar');
    return { visible: el && !el.classList.contains('hidden'), text: el && el.textContent, music: !!g.audio.combat, hp: g.player && g.survival.health };
  });
  ok('barra de vida del jefe y música de combate', bar.visible && /Guardián del Bosque Antiguo/.test(bar.text) && bar.music, JSON.stringify(bar));
  await ev(() => { const g = window.__game; const b = g.activeBoss; const p = g.player; p.yaw = Math.atan2(-(b.x - p.x), -(b.z - p.z)); p.pitch = 0.05; });
  await frames(page, 30);
  await page.screenshot({ path: S + '/f4_boss_forest.png' });
  // dejar que pelee unos segundos (el jugador en creativo para no morir)
  await ev(() => { window.__game.setMode('creative'); });
  await page.waitForTimeout(5000);
  const fight = await ev(async () => {
    const g = window.__game; const { Items } = await import('/src/items.js');
    const b = g.activeBoss;
    g.setMode('survival');
    g.inventory.slots[2] = { i: Items.id('iron_axe'), n: 1, d: 0 }; g.inventory.selected = 2;
    // golpe real con el arma: debilidad del Guardián (hacha ×2)
    b.hurtTime = 0; b.transition = 0; const h0 = b.hp;
    g.entityTarget = b; g.attackCharge = 2; g.tryAttack(true);
    const dmg = h0 - b.hp, expect = Items.get('iron_axe').tool.damage * 2;
    b.hurtTime = 0; b.transition = 0; b.hp = 1; b.hurt(20, g.player.x, g.player.z, 1, g.player);
    return { dmg, expect, dead: b.deathTime >= 0, fps: g.frameStats.fps };
  });
  ok('el hacha hace daño doble y el jefe muere', Math.abs(fight.dmg - fight.expect) < 0.01 && fight.dead, JSON.stringify(fight));
  // la animación de muerte dura 2,4 s de juego (con WebGL por software el juego puede ir lento)
  // (las recompensas y el logro llegan al morir; la barra y la música se quitan en cuanto el jefe deja de estar activo)
  await page.waitForFunction(() => { const g = window.__game; return g.achievements.has('jefe_bosque') && !g.activeBoss && !g.audio.combat; }, null, { timeout: 60000 }).catch(() => {});
  const reward = await ev(async () => {
    const g = window.__game; const { Items } = await import('/src/items.js');
    const drops = g.entities.list.filter((e) => e.type === 'item' && !e.removed).map((e) => Items.get(e.stack.i).key);
    return { drops, ach: g.achievements.has('jefe_bosque'), kills: g.bossKills.forest_guardian, bar: document.querySelector('.boss-bar').classList.contains('hidden'), music: !!g.audio.combat };
  });
  ok('recompensas (Cristal vital, esencia, Báculo de raíces) y logro', ['heart_crystal', 'essence_forest', 'root_staff'].every((k) => reward.drops.includes(k)) && reward.ach && reward.kills === 1, JSON.stringify(reward));
  ok('al morir se ocultan la barra y la música de combate', reward.bar && !reward.music);

  // ── Cristal vital ──
  const heart = await ev(async () => {
    const g = window.__game; const { Items } = await import('/src/items.js');
    g.inventory.slots[3] = { i: Items.id('heart_crystal'), n: 1, d: 0 }; g.inventory.selected = 3;
    g.entityTarget = null; g.hit = null; g.useItem(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { max: g.survival.maxHealth, hearts: document.querySelectorAll('#hearts img').length };
  });
  ok('el Cristal vital da un corazón más', heart.max === 22 && heart.hearts === 11, JSON.stringify(heart));

  // ── Los otros tres jefes en acción ──
  await ensurePlaying(page);
  for (const [type, key] of [['cristal', 'crystal_colossus'], ['fuego', 'volcanic_titan'], ['mar', 'deep_queen']]) {
    const r = await ev(async ([t, k]) => {
      const g = window.__game; const { runCommand } = await import('/src/commands.js');
      g.setMode('creative');
      for (const e of g.entities.list) if (e.isBoss) e.removed = true;
      const msg = runCommand(g, '/jefe ' + t);
      const b = g.entities.list.find((e) => e.type === k && !e.removed);
      return { msg, ok: !!b };
    }, [type, key]);
    await page.waitForFunction((k) => { const b = window.__game.entities.list.find((e) => e.type === k && !e.removed); return !b || (b.intro <= 0 && (b.action !== null || b.atkCd < 1.5)); }, key, { timeout: 60000 }).catch(() => {});
    const st = await ev(async (k) => {
      const g = window.__game; const b = g.entities.list.find((e) => e.type === k && !e.removed);
      const p = g.player; if (b) { p.yaw = Math.atan2(-(b.x - p.x), -(b.z - p.z)); p.pitch = -0.1; }
      const proj = g.entities.list.filter((e) => e.type === 'projectile' && !e.removed).length;
      return { alive: !!b && b.deathTime < 0, intro: b && b.intro, acted: b && (b.action !== null || b.atkCd < 2), proj, x: b && +b.x.toFixed(1), z: b && +b.z.toFixed(1) };
    }, key);
    await frames(page, 20);
    await page.screenshot({ path: S + `/f4_boss_${type}.png` });
    ok(`/jefe ${type}: ${key} aparece y ataca sin errores`, r.ok && st.alive && st.intro <= 0 && st.acted, JSON.stringify({ ...r, ...st }));
  }

  // ── Coloso: pilares y escudo ──
  const col = await ev(async () => {
    const g = window.__game; const { runCommand } = await import('/src/commands.js');
    for (const e of g.entities.list) if (e.isBoss) e.removed = true;
    runCommand(g, '/jefe cristal');
    const b = g.entities.list.find((e) => e.type === 'crystal_colossus' && !e.removed);
    b.intro = 0; b.hp = b.maxHp * 0.62; b.hurt(10, 0, 0, 1, null);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    return { phase: b.phase, pylons: g.entities.list.filter((e) => e.isPylon && !e.removed).length, shield: b.shield, bar: document.querySelector('.boss-phase').textContent };
  });
  ok('el Coloso levanta 4 pilares y se protege con su escudo', col.phase === 2 && col.pylons === 4 && col.shield && /Escudo/.test(col.bar), JSON.stringify(col));

  // ── Titán: bola de nieve ──
  await ensurePlaying(page);
  const snow = await ev(async () => {
    const g = window.__game; const { runCommand } = await import('/src/commands.js'); const { Items } = await import('/src/items.js');
    for (const e of g.entities.list) if (e.isBoss || e.isPylon) e.removed = true;
    runCommand(g, '/jefe fuego');
    const b = g.entities.list.find((e) => e.type === 'volcanic_titan' && !e.removed);
    b.intro = 0;
    const p = g.player; p.flying = false;
    p.teleport(b.x, b.y, b.z + 6); p.yaw = 0; p.pitch = -0.25;
    g.inventory.slots[4] = { i: Items.id('snowball'), n: 4, d: 0 }; g.inventory.selected = 4;
    g.entityTarget = null; g.hit = null; g.useItem(true);
    const proj = g.entities.list.filter((e) => e.kind === 'snow' && !e.removed).length;
    for (let i = 0; i < 300 && b.cool <= 0; i++) await new Promise((r) => setTimeout(r, 50));
    const m = g.entities.list.find((e) => e.kind === 'snow');
    return { cool: b.cool, proj, fps: g.frameStats.fps, b: [b.x, b.y, b.z].map((v) => +v.toFixed(1)), p: [p.x, p.y, p.z].map((v) => +v.toFixed(1)), m: m && [m.x, m.y, m.z, m.removed] };
  });
  ok('una bola de nieve lanzada enfría al Titán', snow.cool > 0, JSON.stringify(snow));

  // ── Bestiario ──
  await ev(() => { const g = window.__game; for (const e of g.entities.list) if (e.isBoss) e.removed = true; g.setMode('survival'); });
  await frames(page, 5);
  await page.keyboard.press('KeyB'); await frames(page, 5);
  const best = await ev(() => {
    const rows = [...document.querySelectorAll('.best-row')];
    const g = window.__game;
    return { rows: rows.length, known: rows.filter((r) => !r.classList.contains('unk')).length, guardian: g.bestiary.seen.has('forest_guardian'), page: document.querySelector('.best-page') && document.querySelector('.best-page').textContent.slice(0, 80) };
  });
  ok('el bestiario (tecla B) muestra las fichas y la del Guardián con su historia', best.rows >= 20 && best.guardian && /Guardián del Bosque Antiguo/.test(best.page), JSON.stringify(best));
  await page.screenshot({ path: S + '/f4_bestiary.png' });
  await page.keyboard.press('Escape'); await frames(page, 4);

  // ── Guardar y recargar los datos de la Fase 4 ──
  const saved = await ev(async () => {
    const g = window.__game; await g.saveGame(true);
    return { best: g.meta.player.best.s.length, kills: g.meta.bossKills.forest_guardian, mh: g.meta.player.sv.mh, fx: g.meta.player.sv.fx.length };
  });
  ok('se guardan bestiario, jefes derrotados, corazones extra y efectos', saved.best > 3 && saved.kills === 1 && saved.mh === 22, JSON.stringify(saved));

  const errs = await ev(() => window.__errors || []);
  ok('sin errores de página', !errs.length, errs.join(' | '));
}, { readyFlag: '__ready', readyTimeout: 120000, w: 1280, h: 720 });
