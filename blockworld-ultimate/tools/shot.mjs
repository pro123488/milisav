// Utilidad de desarrollo: abre una URL local en Chromium headless y guarda una captura.
// Uso: node tools/shot.mjs <ruta> <salida.png> [espera_ms] [ancho] [alto]
import { createRequire } from 'node:module';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium } = require('playwright');
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [urlPath, out, wait = '1500', w = '1280', h = '720'] = process.argv.slice(2);
const port = 8123;
const srv = spawn('node', [path.join(root, 'tools/serve.mjs'), String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/${urlPath}`);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out, fullPage: true });
await browser.close(); srv.kill();
