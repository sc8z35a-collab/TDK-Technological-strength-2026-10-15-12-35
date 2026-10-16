// Rasterizes Natural Earth 1:10m land (world-atlas) for a lon/lat window around
// Japan into an equirectangular texture used by the "世界のTDK" close-up:
//   R = anti-aliased land mask
//   G = relief height (sharp coastal bevel + a gentle inland shoulder)
//   B = continental shelf (wide blur, same 2° scale as land.png)
// The window is rasterized with padding so blurs near the border still see the
// land outside it, then cropped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { encodePNG } from './png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Keep in sync with JP_BOX in src/chapters/Global.js.
const LON0 = 125, LON1 = 151, LAT0 = 26, LAT1 = 48;
const W = Number(process.env.JP_W || 1408);
const H = Number(process.env.JP_H || 1464);
const SUB = 4; // vertical sub-scanlines per pixel

const pxPerLon = W / (LON1 - LON0);
const pxPerLat = H / (LAT1 - LAT0);
const PAD_DEG = 6.5; // > 3 sigma of the shelf blur
const padX = Math.ceil(PAD_DEG * pxPerLon);
const padY = Math.ceil(PAD_DEG * pxPerLat);
const PW = W + padX * 2;
const PH = H + padY * 2;
const plon0 = LON0 - padX / pxPerLon;
const plat1 = LAT1 + padY / pxPerLat;
const plon1 = plon0 + PW / pxPerLon;
const plat0 = plat1 - PH / pxPerLat;

const topo = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/world-atlas/land-10m.json'), 'utf8'));
const land = feature(topo, topo.objects.land);

// Collect polygon edges (in padded pixel space) of rings that touch the window.
const edges = [];
function addRing(ring) {
  const pts = ring.map(([lon, lat]) => [lon, lat]);
  for (let i = 1; i < pts.length; i++) {
    while (pts[i][0] - pts[i - 1][0] > 180) pts[i][0] -= 360;
    while (pts[i][0] - pts[i - 1][0] < -180) pts[i][0] += 360;
  }
  const n = pts.length;
  if (Math.abs(pts[n - 1][0] - pts[0][0]) > 180) {
    // Ring encircles a pole: close it along the pole (Antarctica only).
    let mean = 0;
    for (const p of pts) mean += p[1];
    const pole = mean / n < 0 ? -90 : 90;
    pts.push([pts[n - 1][0], pole], [pts[0][0], pole], [pts[0][0], pts[0][1]]);
  }
  for (const off of [-360, 0, 360]) {
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lon, lat] of pts) {
      minLon = Math.min(minLon, lon + off);
      maxLon = Math.max(maxLon, lon + off);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
    if (maxLon < plon0 || minLon > plon1 || maxLat < plat0 || minLat > plat1) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const x0 = (pts[i][0] + off - plon0) * pxPerLon, y0 = (plat1 - pts[i][1]) * pxPerLat;
      const x1 = (pts[i + 1][0] + off - plon0) * pxPerLon, y1 = (plat1 - pts[i + 1][1]) * pxPerLat;
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

// Scanline fill with exact horizontal coverage and vertical supersampling.
const buckets = Array.from({ length: PH }, () => []);
for (const e of edges) {
  const r0 = Math.max(0, Math.floor(e[1]));
  const r1 = Math.min(PH - 1, Math.floor(e[3]));
  for (let r = r0; r <= r1; r++) buckets[r].push(e);
}
const mask = new Float32Array(PW * PH);
const rowAcc = new Float32Array(PW + 1);
const xs = [];
for (let y = 0; y < PH; y++) {
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
      const a = Math.max(0, Math.min(PW, xs[i]));
      const b = Math.max(0, Math.min(PW, xs[i + 1]));
      if (b <= a) continue;
      const ia = Math.floor(a), ib = Math.floor(b);
      if (ia === ib) {
        rowAcc[ia] += b - a;
        continue;
      }
      rowAcc[ia] += ia + 1 - a;
      for (let k = ia + 1; k < ib; k++) rowAcc[k] += 1;
      if (ib < PW) rowAcc[ib] += b - ib;
    }
  }
  for (let x = 0; x < PW; x++) mask[y * PW + x] = Math.min(1, rowAcc[x] / SUB);
}

/** Gaussian approximated by three box blurs (running sums, clamp-to-edge). */
function boxesForGauss(sigma, n = 3) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wu));
}
function boxPass(src, dst, w, h, r, horizontal) {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const stride = horizontal ? 1 : w;
  const inv = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const base = horizontal ? l * w : l;
    const at = (i) => src[base + Math.min(len - 1, Math.max(0, i)) * stride];
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += at(i);
    for (let i = 0; i < len; i++) {
      dst[base + i * stride] = acc * inv;
      acc += at(i + r + 1) - at(i - r);
    }
  }
}
function blur(src, w, h, sx, sy) {
  let a = Float32Array.from(src);
  let b = new Float32Array(src.length);
  for (const bw of boxesForGauss(sx)) {
    boxPass(a, b, w, h, (bw - 1) >> 1, true);
    [a, b] = [b, a];
  }
  for (const bh of boxesForGauss(sy)) {
    boxPass(a, b, w, h, (bh - 1) >> 1, false);
    [a, b] = [b, a];
  }
  return a;
}

// Blur radii are given in degrees so they match land.png's look.
const bevelFine = blur(mask, PW, PH, 0.07 * pxPerLon, 0.07 * pxPerLat);
const bevelWide = blur(mask, PW, PH, 0.3 * pxPerLon, 0.3 * pxPerLat);
const shelf = blur(mask, PW, PH, 2.0 * pxPerLon, 2.0 * pxPerLat);

const px = new Uint8Array(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const s = (y + padY) * PW + (x + padX);
    const o = (y * W + x) * 3;
    px[o] = Math.round(mask[s] * 255);
    px[o + 1] = Math.round(Math.min(1, 0.62 * bevelFine[s] + 0.38 * bevelWide[s]) * 255);
    px[o + 2] = Math.round(Math.min(1, shelf[s] * 1.6) * 255);
  }
}
const png = encodePNG(px, W, H, 3);
const out = path.join(root, 'src/assets/japan.png');
fs.writeFileSync(out, png);
console.log(`japan.png ${W}x${H} lon ${LON0}..${LON1} lat ${LAT0}..${LAT1} edges=${edges.length} bytes=${png.length}`);
