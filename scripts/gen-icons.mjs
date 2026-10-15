// App icons for the PWA (Add to Home Screen): a ferrite ring with a copper
// winding hint on a dark field. Pure JS rasteriser, writes PNGs into docs/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs');
fs.mkdirSync(out, { recursive: true });

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function icon(size, { pad = 0.0 } = {}) {
  const px = new Uint8Array(size * size * 4);
  const S = 4; // supersampling
  const c = size / 2;
  const scale = (1 - pad * 2) * size;
  const r0 = scale * 0.2, r1 = scale * 0.33;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let R = 0, G = 0, B = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const fx = x + (sx + 0.5) / S - c, fy = y + (sy + 0.5) / S - c;
          // background: deep graphite with a soft warm glow
          const bg = 1 - Math.min(1, Math.hypot(fx + size * 0.08, fy + size * 0.1) / (size * 0.75));
          let r = 14 + 30 * bg * bg, g = 15 + 20 * bg * bg, b = 18 + 12 * bg * bg;
          const d = Math.hypot(fx, fy);
          const inRing = smooth(r0 - 0.8, r0 + 0.8, d) * (1 - smooth(r1 - 0.8, r1 + 0.8, d));
          if (inRing > 0) {
            // ferrite body: dark grey with a top-left highlight
            const nx = fx / d, ny = fy / d;
            const t = (d - r0) / (r1 - r0);
            const lift = Math.sin(t * Math.PI);
            const light = 0.35 + 0.65 * Math.max(0, -nx * 0.5 - ny * 0.8) * lift;
            let cr = 48 + 70 * light, cg = 49 + 68 * light, cb = 54 + 66 * light;
            // copper winding: 20 turns as bands
            const ang = Math.atan2(fy, fx);
            const turns = 20;
            const w = Math.cos(ang * turns);
            const band = smooth(0.55, 0.8, w);
            cr = cr * (1 - band) + (190 + 50 * light) * band;
            cg = cg * (1 - band) + (110 + 40 * light) * band;
            cb = cb * (1 - band) + (70 + 30 * light) * band;
            r = r * (1 - inRing) + cr * inRing;
            g = g * (1 - inRing) + cg * inRing;
            b = b * (1 - inRing) + cb * inRing;
          }
          R += r; G += g; B += b;
        }
      const i = (y * size + x) * 4;
      px[i] = Math.round(R / (S * S));
      px[i + 1] = Math.round(G / (S * S));
      px[i + 2] = Math.round(B / (S * S));
      px[i + 3] = 255;
    }
  return encodePNG(px, size, size, 4);
}

for (const [name, size, pad] of [['icon-180.png', 180, 0.04], ['icon-192.png', 192, 0.04], ['icon-512.png', 512, 0.04], ['icon-maskable-512.png', 512, 0.14]]) {
  fs.writeFileSync(path.join(out, name), icon(size, { pad }));
}
const manifest = {
  name: 'TDK Technology Atlas 2026',
  short_name: 'TDK Atlas',
  description: 'TDKの技術力と世界シェアを3Dで巡る非公式の学習サイト（2026年10月15日時点）',
  lang: 'ja',
  start_url: './',
  scope: './',
  display: 'fullscreen',
  orientation: 'landscape',
  background_color: '#0b0c0e',
  theme_color: '#0b0c0e',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
console.log('icons + manifest written');
