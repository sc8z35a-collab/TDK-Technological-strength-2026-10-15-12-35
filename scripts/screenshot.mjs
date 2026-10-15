// Headless screenshots for visual QA: node scripts/screenshot.mjs [hash...]
// env: SIZES="844x390,1920x1080" WAIT=6000 OUT=shots
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(root, process.env.OUT || 'shots');
fs.mkdirSync(outDir, { recursive: true });
const sizes = (process.env.SIZES || '844x390').split(',').map((s) => s.split('x').map(Number));
const hashes = process.argv.slice(2).length ? process.argv.slice(2) : ['0.0'];
const wait = Number(process.env.WAIT || 6000);
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const url = 'file://' + path.join(root, 'docs/index.html');
for (const [w, h] of sizes) {
  const mobile = w < 1100;
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: Number(process.env.DPR || 1),
    isMobile: mobile && process.env.MOBILE !== '0',
    hasTouch: mobile,
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  for (const spec of hashes) {
    // spec: "chapter.step" or "chapter.step@seconds" to fast-forward the animation.
    // Optional query prefix: "?lab#18.0@2".
    const m = /^(\?[^#]*)?#?([^@]*)(?:@(.*))?$/.exec(spec);
    const query = m[1] || '', hash = m[2], skip = m[3];
    await page.goto(`${url}${query}#${hash}`);
    if (process.env.RELOAD !== '0') await page.reload();
    await page.waitForFunction(() => window.__atlas && window.__atlas.started, null, { timeout: 60000 });
    if (skip) await page.evaluate((s) => window.__atlas.skip(Number(s)), skip);
    await page.waitForTimeout(wait);
    const file = path.join(outDir, `${spec.replace(/[^\w.-]/g, '_')}_${w}x${h}.png`);
    await page.screenshot({ path: file });
    console.log('shot', file);
  }
  if (logs.length) console.log(logs.join('\n'));
  await ctx.close();
}
await browser.close();
