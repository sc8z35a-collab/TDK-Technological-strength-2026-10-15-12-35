// Rasterizes Natural Earth 1:50m land (world-atlas) into an equirectangular
// texture: R = anti-aliased land mask, G = soft bevel (small blur), B = shelf (wide blur).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { encodePNG } from './png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = Number(process.env.LAND_W || 4096);
const H = W / 2;
const SUB = 4; // vertical sub-scanlines per pixel

const topo = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/world-atlas/land-50m.json'), 'utf8'));
const land = feature(topo, topo.objects.land);

// Collect edges in pixel space.
const edges = [];
function addRing(ring) {
  // Unwrap longitudes so rings crossing the antimeridian stay continuous.
  const pts = ring.map(([lon, lat]) => [lon, lat]);
  for (let i = 1; i < pts.length; i++) {
    while (pts[i][0] - pts[i - 1][0] > 180) pts[i][0] -= 360;
    while (pts[i][0] - pts[i - 1][0] < -180) pts[i][0] += 360;
  }
  const n = pts.length;
  if (Math.abs(pts[n - 1][0] - pts[0][0]) > 180) {
    // Ring encircles a pole (Antarctica): close it along the pole.
    let mean = 0;
    for (const p of pts) mean += p[1];
    const pole = mean / n < 0 ? -90 : 90;
    pts.push([pts[n - 1][0], pole], [pts[0][0], pole], [pts[0][0], pts[0][1]]);
  }
  for (const off of [-360, 0, 360]) {
    for (let i = 0; i < pts.length - 1; i++) {
      const lon0 = pts[i][0] + off, lat0 = pts[i][1];
      const lon1 = pts[i + 1][0] + off, lat1 = pts[i + 1][1];
      const x0 = ((lon0 + 180) / 360) * W, y0 = ((90 - lat0) / 180) * H;
      const x1 = ((lon1 + 180) / 360) * W, y1 = ((90 - lat1) / 180) * H;
      if (y0 === y1) continue;
      edges.push(y0 < y1 ? [x0, y0, x1, y1] : [x1, y1, x0, y0]);
    }
  }
}
for (const f of land.features) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of polys) for (const ring of poly) addRing(ring);
}
// Bucket edges by row for speed.
const buckets = Array.from({ length: H }, () => []);
for (const e of edges) {
  const r0 = Math.max(0, Math.floor(e[1]));
  const r1 = Math.min(H - 1, Math.floor(e[3]));
  for (let r = r0; r <= r1; r++) buckets[r].push(e);
}

const mask = new Float32Array(W * H);
const rowAcc = new Float32Array(W + 1);
const xs = [];
for (let y = 0; y < H; y++) {
  rowAcc.fill(0);
  for (let s = 0; s < SUB; s++) {
    const sy = y + (s + 0.5) / SUB;
    xs.length = 0;
    for (const e of buckets[y]) {
      if (sy >= e[1] && sy < e[3]) {
        const t = (sy - e[1]) / (e[3] - e[1]);
        xs.push(e[0] + t * (e[2] - e[0]));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      let a = Math.max(0, Math.min(W, xs[i]));
      let b = Math.max(0, Math.min(W, xs[i + 1]));
      if (b <= a) continue;
      const ia = Math.floor(a), ib = Math.floor(b);
      if (ia === ib) { rowAcc[ia] += (b - a); continue; }
      rowAcc[ia] += (ia + 1 - a);
      for (let k = ia + 1; k < ib; k++) rowAcc[k] += 1;
      if (ib < W) rowAcc[ib] += (b - ib);
    }
  }
  for (let x = 0; x < W; x++) mask[y * W + x] = Math.min(1, rowAcc[x] / SUB);
}

function blur(src, sigma) {
  const r = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  // horizontal (wraps around longitude)
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += src[o + ((x + i + W) % W)] * k[i + r];
      tmp[o + x] = v;
    }
  }
  // vertical (clamped)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) {
        const yy = Math.min(H - 1, Math.max(0, y + i));
        v += tmp[yy * W + x] * k[i + r];
      }
      out[y * W + x] = v;
    }
  }
  return out;
}

const bevel = blur(mask, W / 1400);
const shelf = blur(mask, W / 180);
const px = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
  px[i * 3] = Math.round(mask[i] * 255);
  px[i * 3 + 1] = Math.round(Math.min(1, bevel[i]) * 255);
  px[i * 3 + 2] = Math.round(Math.min(1, shelf[i] * 1.6) * 255);
}
const png = encodePNG(px, W, H, 3);
const out = path.join(root, 'src/assets/land.png');
fs.writeFileSync(out, png);
console.log(`land.png ${W}x${H} edges=${edges.length} bytes=${png.length}`);
