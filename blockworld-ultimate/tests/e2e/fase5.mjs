// Prueba E2E de la Fase 5 en Chromium: portal umbrío (marco, llave, velo), viaje a la Dimensión Oscura y vuelta,
// guardado separado por dimensión (también al salir y continuar), ciudadela, Soberano y su recompensa.
// Ejecuta: node tests/e2e/fase5.mjs
import { withPage, frames, ensurePlaying } from '../../tools/pw.mjs';
import os from 'node:os';
const S = process.env.SHOTS || os.tmpdir();
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));

await withPage('index.html?autostart=survival&rd=3&seed=umbral&type=normal&mobs=all&structures=1&diff=normal', async (page) => {
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__game; g.renderer.setPixelRatio(0.5); g._resize(); g.settings.sensitivity = 0; });
  await page.click('#gl'); await frames(page, 3); await page.mouse.move(640, 360); await frames(page, 3);
  const ev = (f, a) => page.evaluate(f, a);

  // ── Construir y activar un portal ──
  const portal = await ev(async () => {
    const g = window.__game; const { ID, Blocks } = await import('/src/blocks.js'); const { Items } = await import('/src/items.js');
    const p = g.player, w = g.world;
    const x = Math.floor(p.x) + 4, z = Math.floor(p.z), y = w.findStandY(x, z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { w.setBlock(x + dx, y - 1, z + dz, ID.STONE); w.setBlock(x + dx, y, z + dz, dx || dz ? ID.OBSIDIAN : ID.PORTAL_CORE); for (let k = 1; k <= 3; k++) w.setBlock(x + dx, y + k, z + dz, 0); }
    // marca para comprobar que el mundo normal se conserva
    w.setBlock(x - 3, y + 2, z, ID.BLOCK_GOLD);
    g.inventory.slots[0] = null;
    const r1 = g.building.interact({ x, y, z }, Blocks.get(w.getBlock(x, y, z))); // sin llave: solo explica
    const noKey = w.getBlock(x, y + 1, z);
    g.inventory.slots[0] = { i: Items.id('umbral_key'), n: 1, d: 0 }; g.inventory.selected = 0;
    g.building.interact({ x, y, z }, Blocks.get(w.getBlock(x, y, z)));
    return { x, y, z, r1, noKey, core: w.getBlock(x, y, z) === ID.PORTAL_CORE_ACTIVE, veil: w.getBlock(x, y + 1, z) === ID.PORTAL_VEIL && w.getBlock(x, y + 2, z) === ID.PORTAL_VEIL };
  });
  ok('el núcleo rodeado de vidrio volcánico se activa con la Llave umbría y levanta el velo', portal.r1 && portal.noKey === 0 && portal.core && portal.veil, JSON.stringify(portal));
  await ev((pt) => { const p = window.__game.player; p.teleport(pt.x + 0.5, pt.y + 4, pt.z + 6.5); p.yaw = 0; p.pitch = -0.35; }, portal);
  await frames(page, 30);
  await page.screenshot({ path: S + '/f5_portal.png' });

  // ── Entrar en el velo ──
  await ensurePlaying(page);
  await ev((pt) => { window.__game.player.teleport(pt.x + 0.5, pt.y + 1, pt.z + 0.5); }, portal);
  await page.waitForFunction(() => window.__game.dimension === 'dark' && !window.__game._traveling, null, { timeout: 120000 }).catch(() => {});
  const dark = await ev(async () => {
    const g = window.__game; const { ID } = await import('/src/blocks.js');
    const p = g.player, w = g.world;
    const core = g.meta.portals && g.meta.portals.dark;
    let umbral = 0;
    for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) for (let y = 1; y < 100; y++) { const b = w.getBlock(Math.floor(p.x) + dx, y, Math.floor(p.z) + dz); if (b === ID.UMBRAL_STONE || b === ID.UMBRAL_MOSS) umbral++; }
    return { dim: g.dimension, sky: g.sky.dark, core, coreOk: core && w.getBlock(core[0], core[1], core[2]) === ID.PORTAL_CORE_ACTIVE, umbral, ach: g.achievements.has('portal'), state: g.state, y: p.y };
  });
  ok('el velo lleva a la Dimensión Oscura (cielo propio, piedra umbría) con un portal de vuelta', dark.dim === 'dark' && dark.sky && dark.coreOk && dark.umbral > 100 && dark.ach, JSON.stringify(dark));
  await ev(() => { const p = window.__game.player; p.yaw = Math.PI; p.pitch = -0.1; });
  await frames(page, 40);
  await page.screenshot({ path: S + '/f5_dark.png' });
  // marca en la dimensión oscura
  const darkMark = await ev(async () => {
    const g = window.__game; const { ID } = await import('/src/blocks.js'); const c = g.meta.portals.dark;
    g.world.setBlock(c[0] + 3, c[1] + 2, c[2], ID.BLOCK_IRON);
    return { x: c[0] + 3, y: c[1] + 2, z: c[2] };
  });

  // ── Volver por el velo ──
  await ensurePlaying(page);
  await ev(() => { const g = window.__game; const c = g.meta.portals.dark; g.portalCooldown = 0; g.player.teleport(c[0] + 0.5, c[1] + 1, c[2] + 0.5); });
  await page.waitForFunction(() => window.__game.dimension === 'overworld' && !window.__game._traveling, null, { timeout: 120000 }).catch(() => {});
  const back = await ev(async (pt) => {
    const g = window.__game; const { ID } = await import('/src/blocks.js'); const w = g.world;
    return { dim: g.dimension, sky: g.sky.dark, gold: w.getBlock(pt.x - 3, pt.y + 2, pt.z) === ID.BLOCK_GOLD, core: w.getBlock(pt.x, pt.y, pt.z) === ID.PORTAL_CORE_ACTIVE, near: Math.hypot(g.player.x - pt.x, g.player.z - pt.z) };
  }, portal);
  ok('el velo de vuelta lleva al mundo normal junto al portal de partida y el mundo se conserva', back.dim === 'overworld' && !back.sky && back.gold && back.core && back.near < 5, JSON.stringify(back));

  // ── Ir de nuevo y comprobar que la Dimensión Oscura guarda sus cambios ──
  await ev(async () => { const { runCommand } = await import('/src/commands.js'); runCommand(window.__game, '/dimension oscura'); });
  await page.waitForFunction(() => window.__game.dimension === 'dark' && !window.__game._traveling, null, { timeout: 120000 }).catch(() => {});
  await page.waitForFunction((m) => window.__game.world.isAreaReady(m.x, m.z, 1), darkMark, { timeout: 60000 }).catch(() => {});
  const iron = await ev(async (m) => { const { ID } = await import('/src/blocks.js'); return window.__game.world.getBlock(m.x, m.y, m.z) === ID.BLOCK_IRON; }, darkMark);
  ok('los cambios en la Dimensión Oscura se guardan aparte y siguen ahí al volver', iron);

  // ── Guardar, salir al menú y continuar: se reaparece en la Dimensión Oscura ──
  await ev(async () => { const g = window.__game; await g.saveGame(true); document.exitPointerLock(); });
  await frames(page, 4);
  await page.click('text=Guardar y salir al menú').catch(() => {});
  await page.waitForSelector('text=Continuar mundo', { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.click('.menu-col >> text=Continuar mundo');
  await page.waitForFunction(() => window.__game.state === 'paused' && !!document.querySelector('.ready'), null, { timeout: 120000 });
  await page.click('.ready button'); await frames(page, 3);
  const cont = await ev(async (m) => { const g = window.__game; const { ID } = await import('/src/blocks.js'); return { dim: g.dimension, sky: g.sky.dark, iron: g.world.getBlock(m.x, m.y, m.z) === ID.BLOCK_IRON }; }, darkMark);
  ok('al continuar el mundo se vuelve a la Dimensión Oscura con sus bloques', cont.dim === 'dark' && cont.sky && cont.iron, JSON.stringify(cont));

  // ── Ciudadela y Soberano ──
  const cit = await ev(async () => {
    const g = window.__game; const { runCommand } = await import('/src/commands.js');
    const msg = runCommand(g, '/localizar ciudadela');
    const a = g.world.terrain.citadelAltar();
    g.setMode('creative'); g.player.flying = true; g.player.allowFlying = true;
    g.player.teleport(a.x + 0.5, a.y + 10, a.z + 24.5);
    return { msg, a };
  });
  await page.waitForFunction((a) => window.__game.world.isAreaReady(a.x, a.z, 2), cit.a, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await ev((a) => { const p = window.__game.player; p.teleport(a.x + 0.5, a.y + 12, a.z + 30.5); p.yaw = 0; p.pitch = -0.32; }, cit.a);
  await frames(page, 40);
  await page.screenshot({ path: S + '/f5_citadel.png' });
  const throne = await ev(async (a) => { const { ID } = await import('/src/blocks.js'); const g = window.__game; return { altar: g.world.getBlock(a.x, a.y, a.z) === ID.ALTAR_SOVEREIGN, ach: g.achievements.has('ciudadela') }; }, cit.a);
  ok('/localizar ciudadela y el Trono del Soberano en lo alto de la ciudadela', /Ciudadela/.test(cit.msg) && throne.altar && throne.ach, JSON.stringify({ ...throne, msg: cit.msg }));

  const sov = await ev(async (a) => {
    const g = window.__game; const { Items } = await import('/src/items.js'); const { Blocks } = await import('/src/blocks.js');
    g.setMode('survival'); g.player.flying = false;
    g.player.teleport(a.x + 0.5, a.y, a.z + 6.5);
    g.inventory.slots[1] = { i: Items.id('sovereign_sigil'), n: 1, d: 0 }; g.inventory.selected = 1;
    g.building.interact({ x: a.x, y: a.y, z: a.z }, Blocks.get(g.world.getBlock(a.x, a.y, a.z)));
    const b = g.entities.list.find((e) => e.type === 'sovereign' && !e.removed);
    g.setMode('creative');
    return { boss: !!b };
  }, cit.a);
  ok('el Sello del Soberano en el trono lo despierta', sov.boss);
  await page.waitForFunction(() => { const b = window.__game.entities.list.find((e) => e.type === 'sovereign' && !e.removed); return b && b.intro <= 0 && (b.action || b.atkCd < 1.5); }, null, { timeout: 60000 }).catch(() => {});
  await ev(() => { const g = window.__game; const b = g.activeBoss; const p = g.player; if (b) { p.yaw = Math.atan2(-(b.x - p.x), -(b.z - p.z)); p.pitch = 0.3; } });
  await frames(page, 25);
  await page.screenshot({ path: S + '/f5_sovereign.png' });
  const fight = await ev(() => {
    const g = window.__game; const b = g.entities.list.find((e) => e.type === 'sovereign' && !e.removed);
    const bar = document.querySelector('.boss-bar');
    const out = { bar: bar && !bar.classList.contains('hidden') && /Soberano/.test(bar.textContent), music: !!g.audio.combat };
    b.hurtTime = 0; b.transition = 0; b.hp = 1; b.hurt(30, g.player.x, g.player.z, 1, g.player);
    return { ...out, dead: b.deathTime >= 0 };
  });
  await page.waitForFunction(() => window.__game.achievements.has('jefe_soberano'), null, { timeout: 60000 }).catch(() => {});
  const reward = await ev(async () => {
    const g = window.__game; const { Items } = await import('/src/items.js');
    const drops = g.entities.list.filter((e) => e.type === 'item' && !e.removed).map((e) => Items.get(e.stack.i).key);
    return { drops, ach: g.achievements.has('jefe_soberano'), kills: g.bossKills.sovereign };
  });
  ok('barra y música del Soberano; al derrotarlo suelta el Cetro del eclipse y da el logro final', fight.bar && fight.music && fight.dead && reward.drops.includes('eclipse_scepter') && reward.ach, JSON.stringify({ ...fight, ...reward }));

  // ── Cetro del eclipse ──
  const scepter = await ev(async () => {
    const g = window.__game; const { Items } = await import('/src/items.js');
    g.inventory.slots[2] = { i: Items.id('eclipse_scepter'), n: 1, d: 0 }; g.inventory.selected = 2;
    g.entityTarget = null; g.hit = null; g.player.pitch = 0;
    g.useItem(true);
    return g.entities.list.filter((e) => e.type === 'projectile' && e.kind === 'shadow' && e.owner === g.player && !e.removed).length;
  });
  ok('el Cetro del eclipse dispara proyectiles de sombra', scepter >= 1, String(scepter));

  const errs = await ev(() => window.__errors || []);
  ok('sin errores de página', !errs.length, errs.join(' | '));
}, { readyFlag: '__ready', readyTimeout: 120000, w: 1280, h: 720 });
