// Prueba E2E en Chromium (Playwright). Ejecuta: node tests/e2e/creatures.mjs
import { withPage, frames } from '../../tools/pw.mjs';
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
await withPage('index.html?autostart=survival&rd=3&seed=flat3&type=flat&mobs=all&structures=0', async (page) => {
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__game; g.renderer.setPixelRatio(0.2); g._resize(); g.settings.sensitivity = 0; /* la cámara la fija la prueba: el ratón capturado no debe girarla */ });
  await page.click('#gl'); await frames(page, 3);
  const r = await page.evaluate(async () => {
    const g = window.__game, w = g.world, out = {};
    const { makeStack, Items } = await import('/src/items.js');
    const step = (n, dt = 0.05) => { for (let i = 0; i < n; i++) { g.time = g.__fixedTime ?? g.time; g.simulate(dt); w.update(g.player.x, g.player.z, 3); g.sky.update(g.time, g.camera, dt); } };
    // limpiar fauna inicial
    for (const e of g.entities.list) if (e.type !== 'item') e.removed = true;
    g.spawner.enabledAnimals = false; g.spawner.enabledMonsters = false;
    const p = g.player; p.teleport(0.5, 42, 0.5); g.controls.keys.clear();
    g.__fixedTime = 0.25; g.time = 0.25; step(10);
    // ── Cría ──
    const a = g.spawnMob('prairie_bovid', 6, 42.01, 0), b = g.spawnMob('prairie_bovid', 8, 42.01, 1);
    g.inventory.slots[0] = makeStack('wheat', 4); g.inventory.selected = 0;
    out.feedA = a.feed(g.inventory.slots[0]); out.feedB = b.feed(g.inventory.slots[0]);
    step(200);
    out.babies = g.entities.list.filter((e) => e.type === 'prairie_bovid' && e.baby).length;
    out.adultsAfter = g.entities.list.filter((e) => e.type === 'prairie_bovid' && !e.baby).length;
    // no se puede volver a criar de inmediato
    out.cooldown = !a.feed(g.inventory.slots[0]) || a.breedCd > 0 ? true : false;
    // ── Zorro: domesticación con pescado ──
    const f = g.spawnMob('crystal_fox', 4, 42.01, 4);
    const fish = makeStack('raw_fish', 5);
    let tamed = 0; for (let i = 0; i < 3; i++) { if (f.feed(fish)) tamed++; }
    out.foxTamed = f.tamed === true && tamed === 3;
    step(60); const dFox = Math.hypot(f.x - p.x, f.z - p.z);
    out.foxFollows = dFox < 8; f.removed = true;
    // ── Zorro salvaje huye ──
    const f2 = g.spawnMob('crystal_fox', 6, 42.01, 0.5);
    step(40); out.foxFlees = Math.hypot(f2.x - p.x, f2.z - p.z) > 10; f2.removed = true;
    // ── Monstruo de noche ──
    g.__fixedTime = 0.7; g.time = 0.7; step(20);
    g.spawner.enabledMonsters = true;
    p.teleport(0.5, 42, 0.5); g.survival.reset(); g.inventory.slots[0] = null;
    const m = g.spawnMob('night_stalker', 5, 42.01, 0.5);
    const hp0 = g.survival.health; step(120);
    out.stalkerHurts = g.survival.health < hp0; out.info_stalkerHp = [hp0, g.survival.health];
    // armadura reduce el daño
    m.removed = true; g.survival.reset(); g.inventory.armor[0] = makeStack('iron_helmet'); g.inventory.armor[1] = makeStack('iron_chestplate'); g.inventory.armor[2] = makeStack('iron_leggings'); g.inventory.armor[3] = makeStack('iron_boots');
    const m2 = g.spawnMob('night_stalker', 1.5, 42.01, 0.5); m2.atkCd = 0; g.survival.invuln = 0;
    g.survival.damage(3, 'mob', m2);
    out.armorDmg = 20 - g.survival.health; g.inventory.armor.fill(null); m2.removed = true;
    // ── Matar con espada: drops y logro ──
    g.survival.reset();
    const m3 = g.spawnMob('night_stalker', 3, 42.01, 0.5); m3.hp = 5;
    g.inventory.slots[0] = makeStack('iron_sword'); g.inventory.selected = 0;
    g.entityTarget = m3; g.attackCharge = 2; g.tryAttack(true); step(30);
    out.killed = m3.removed || m3.deathTime >= 0; out.achMonster = g.achievements.has('monstruo');
    // ── Quemarse al sol ──
    g.__fixedTime = 0.25; g.time = 0.25; step(5);
    const m4 = g.spawnMob('night_stalker', 20, 42.01, 20); const hp4 = m4.hp; step(80); out.burns = m4.hp < hp4; m4.removed = true;
    // ── Esqueleto dispara y la dificultad pacífica elimina monstruos ──
    g.__fixedTime = 0.7; g.time = 0.7; g.survival.reset(); p.teleport(0.5, 42, 0.5);
    const sk = g.spawnMob('obsidian_skeleton', 10, 42.01, 0.5); sk.atkCd = 0; const hpS = g.survival.health; step(100);
    out.skeletonShoots = g.survival.health < hpS || g.entities.list.some((e) => e.type === 'projectile');
    g.setDifficulty('peaceful'); step(5);
    out.peacefulClears = g.entities.list.filter((e) => e.def && e.def.hp && e.type === 'obsidian_skeleton' && !e.removed).length === 0;
    return out;
  });
  for (const [k, v] of Object.entries(r)) { if (k.startsWith('info_')) { console.log('INFO ' + k + ' ' + JSON.stringify(v)); continue; } ok(k, v === true || (typeof v === 'number' && v > 0), JSON.stringify(v)); }
}, { readyFlag: '__ready', readyTimeout: 60000, w: 480, h: 270 });
