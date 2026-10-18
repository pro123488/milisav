// Captura una puerta de madera y una de hierro por las dos caras (comprobación visual del pomo).
// Ejecuta: node tools/doorshot.mjs [carpeta]
import { withPage, frames } from './pw.mjs';
import os from 'node:os';
const S = process.argv[2] || os.tmpdir();
await withPage('index.html?autostart=creative&rd=2&seed=puertas&type=flat&mobs=none&structures=0', async (page) => {
  await page.waitForTimeout(500);
  const setup = await page.evaluate(async () => {
    const g = window.__game; const { ID } = await import('/src/blocks.js');
    g.renderer.setPixelRatio(0.5); g._resize(); g.time = 0.5;
    const p = g.player, w = g.world;
    const x0 = Math.floor(p.x), z0 = Math.floor(p.z) - 4, y = Math.floor(p.y);
    for (let x = x0 - 3; x <= x0 + 3; x++) for (let z = z0 - 4; z <= z0 + 4; z++) for (let k = 0; k < 4; k++) w.setBlock(x, y + k, z, 0);
    w.setBlock(x0 - 1, y, z0, ID.DOOR_WOOD_N); w.setBlock(x0 - 1, y + 1, z0, ID.DOOR_WOOD_N_SUP);
    w.setBlock(x0 + 1, y, z0, ID.DOOR_IRON_N); w.setBlock(x0 + 1, y + 1, z0, ID.DOOR_IRON_N_SUP);
    return { x0, y, z0 };
  });
  for (const [name, dz, yaw] of [['front', 3, 0], ['back', -3, Math.PI]]) {
    await page.evaluate(({ c, dz, yaw }) => { const p = window.__game.player; p.flying = true; p.teleport(c.x0 + 0.5, c.y, c.z0 + 0.5 + dz); p.yaw = yaw; p.pitch = -0.1; }, { c: setup, dz, yaw });
    await frames(page, 25);
    await page.screenshot({ path: `${S}/door_${name}.png` });
  }
}, { readyFlag: '__ready', readyTimeout: 120000, w: 800, h: 500 });
