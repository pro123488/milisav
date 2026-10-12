// Utilidades de pruebas en navegador (Playwright + Chromium headless con WebGL por software).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function withPage(urlPath, fn, { w = 1280, h = 720, port = 8123, readyFlag = null, readyTimeout = 90000 } = {}) {
  const srv = spawn('node', [path.join(root, 'tools/serve.mjs'), String(port)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 400));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const logs = [];
  page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); if (['error', 'warning'].includes(m.type())) console.log(`[console ${m.type()}]`, m.text()); });
  page.on('pageerror', (e) => { logs.push('[pageerror] ' + e.message); console.log('[pageerror]', e.message, e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : ''); });
  try {
    await page.goto(`http://localhost:${port}/${urlPath}`);
    if (readyFlag) await page.waitForFunction(`window.${readyFlag} === true`, null, { timeout: readyTimeout });
    return await fn(page, logs);
  } finally {
    await browser.close(); srv.kill();
  }
}
/** Espera n fotogramas de renderizado del navegador. */
export const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let c = 0; const f = () => { if (++c >= k) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
export { root };
