// Steps through every chapter/step in headless Chromium, records console errors
// and saves a small screenshot per step (shots/walk/NN_c.s.png).
// env: SIZE=640x296 START=0 END=999
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'shots', 'walk');
fs.mkdirSync(outDir, { recursive: true });
const [w, h] = (process.env.SIZE || '640x296').split('x').map(Number);
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
if (process.env.QUALITY) await page.addInitScript((q) => localStorage.setItem('tdk-atlas-quality', q), process.env.QUALITY);
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|favicon/.test(m.text())) errors.push(`[console] ${m.text()}`);
});
await page.goto('file://' + path.join(root, 'docs/index.html'));
await page.waitForFunction(() => window.__atlas && window.__atlas.started, null, { timeout: 90000 });
await page.evaluate(() => (window.__atlas.transitionDur = 0.05));
const total = await page.evaluate(() => window.__atlas.flat.length);
const start = Number(process.env.START || 0), end = Math.min(total - 1, Number(process.env.END || 999));
console.log('steps', total);
for (let i = start; i <= end; i++) {
  const t0 = Date.now();
  const info = await page.evaluate((g) => {
    const a = window.__atlas;
    a.goTo(g);
    const f = a.flat[g];
    return `${f.chapter}.${f.step}`;
  }, i);
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__atlas.skip(3.5));
  await page.waitForTimeout(900);
  const file = path.join(outDir, `${String(i).padStart(2, '0')}_${info}.png`);
  await page.screenshot({ path: file });
  const mem = await page.evaluate(() => {
    const r = window.__atlas.renderer.info;
    return `geo ${r.memory.geometries} tex ${r.memory.textures} prog ${r.programs ? r.programs.length : '?'} calls ${r.render.calls} tris ${r.render.triangles}`;
  });
  console.log(i, info, `${Date.now() - t0}ms`, mem, errors.length ? `ERRORS: ${errors.splice(0).join(' | ')}` : '');
}
await browser.close();
