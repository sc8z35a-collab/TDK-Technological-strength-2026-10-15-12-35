// Renders the social preview image docs/og.jpg (1200x630) from the opening
// scene at high quality with the navigation chrome hidden.
//   node scripts/gen-og.mjs   (after node scripts/build.mjs)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.addInitScript(() => localStorage.setItem('tdk-atlas-quality', 'high'));
await page.goto('file://' + path.join(root, 'docs/index.html') + '#0.0');
await page.waitForFunction(() => window.__atlas && window.__atlas.started, null, { timeout: 90000 });
// Fast-forward to the finished, wound core.
await page.evaluate(() => window.__atlas.skip(10.5));
await page.addStyleTag({ content: '.rail,.hint,.labels,.cap-actions,.top-actions,.top-chapter,.chapter-mark,.toast{display:none!important}' });
await page.waitForTimeout(5000);
await page.screenshot({ path: path.join(root, 'docs/og.jpg'), type: 'jpeg', quality: 90 });
// Same image at the repository root, so the og:image URL also resolves when
// GitHub Pages publishes the root (index.html there forwards to docs/).
fs.copyFileSync(path.join(root, 'docs/og.jpg'), path.join(root, 'og.jpg'));
await browser.close();
console.log('docs/og.jpg written');
