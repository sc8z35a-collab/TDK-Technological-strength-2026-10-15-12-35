// Bundles the app (three.js included) into a single self-contained HTML file
// in docs/ so it works on GitHub Pages and when opened locally.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs');
fs.mkdirSync(out, { recursive: true });
const dev = process.argv.includes('--dev');

const result = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  minify: !dev,
  sourcemap: false,
  target: ['es2020', 'safari15', 'chrome100'],
  write: false,
  legalComments: 'none',
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.json': 'json' },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
let js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
let html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
html = html.replace('/*__STYLE__*/', () => css).replace('/*__SCRIPT__*/', () => js);
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`docs/index.html ${(html.length / 1024).toFixed(0)} KB (js ${(js.length / 1024).toFixed(0)} KB)`);
