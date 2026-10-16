// CH.15 Culture — the company motto carved into three gilded granite steles,
// a round table with no head seat (functional equality), a night athletics
// track (World Athletics partner since the first championships in 1983), a
// pitch in Nikaho at sunset with Mt. Chōkai and the Sea of Japan, and a dawn
// landscape of wind turbines and solar panels.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Chapter } from '../core/Chapter.js';
import { materials, roundedBox } from '../core/kit.js';
import { canvasTexture, fbmField, grainNormal } from '../core/textures.js';
import { lightShaft, softShadow } from '../core/fx.js';
import { clamp01, easeOutCubic, easeInOutCubic, smoothstep, mulberry32, damp, lerp } from '../core/math.js';
import { spot } from './common.js';

const TAU = Math.PI * 2;
const ST = { stele: 0, table: 16, track: 46, pitch: 120, eco: 220 };

/* ------------------------------------------------------------------ fonts */

const BRUSH = 'Yuji Boku';
const sheets = new Map();
/** Google Fonts can serve a subset with only the requested glyphs (a few KB). */
function fontSubset(family, text) {
  const key = `${family}|${text}`;
  if (!sheets.has(key)) {
    sheets.set(
      key,
      new Promise((resolve) => {
        try {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}&text=${encodeURIComponent(text)}&display=block`;
          link.onload = () => resolve(true);
          link.onerror = () => resolve(false);
          document.head.appendChild(link);
        } catch (e) {
          resolve(false);
        }
        setTimeout(() => resolve(false), 5000);
      })
    );
  }
  return sheets.get(key);
}

/** Resolves true once a face for `text` in `font` is loaded (canvas can use it). */
function loadGlyphs(font, text, timeout = 5000) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve(false);
  return Promise.race([
    document.fonts.load(font, text).then((f) => f.length > 0, () => false),
    new Promise((r) => setTimeout(() => r(false), timeout)),
  ]);
}

/* ------------------------------------------------------------------ canvas helpers */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasTex(canvas, { srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** A canvas texture that can be repainted later (e.g. when a web font arrives). */
function paintedTexture(w, h, paint, { srgb = true } = {}) {
  const canvas = makeCanvas(w, h);
  const tex = canvasTex(canvas, { srgb });
  tex.userData.repaint = () => {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    paint(ctx, w, h);
    tex.needsUpdate = true;
  };
  tex.userData.repaint();
  return tex;
}

/** Draw only the blurred shadow of a shape (soft masks, engraving halos). */
function blurredShape(ctx, blur, color, kx, paint) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 6000 * kx;
  ctx.fillStyle = '#000';
  paint(-6000);
  ctx.restore();
}

/** Planar box-projected UVs so a tiling texture keeps its scale on every face. */
function boxUV(geo, scale = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i) * scale, p.getY(i) * scale);
    else if (ay >= az) uv.setXY(i, p.getX(i) * scale, p.getZ(i) * scale);
    else uv.setXY(i, p.getX(i) * scale, p.getY(i) * scale);
  }
  uv.needsUpdate = true;
  return geo;
}

function merge(list) {
  return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/* ------------------------------------------------------------------ sky dome */

/** Camera-centred sky: gradient by elevation, sun glow, sun disk, stratus streaks. */
function buildSky() {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
    blending: THREE.CustomBlending,
    uniforms: {
      uZenith: { value: new THREE.Color() },
      uMid: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uGlowPow: { value: 8 },
      uDisk: { value: 0 },
      uCloud: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uZenith, uMid, uHorizon, uGlow, uCloudLit, uSunDir;
      uniform float uGlowPow, uDisk, uCloud, uOpacity;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
        return s;
      }
      void main() {
        vec3 d = normalize(vDir);
        float e = d.y;
        vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.18, e));
        c = mix(c, uZenith, smoothstep(0.12, 0.75, e));
        vec3 sdir = normalize(uSunDir);
        float sd = max(dot(d, sdir), 0.0);
        float low = 1.0 - smoothstep(-0.05, 0.55, e);
        c += uGlow * (pow(sd, uGlowPow) * 0.9 + pow(sd, 2.0) * 0.18) * low;
        // Stratus streaks near the horizon, lit from below on the sun side.
        if (uCloud > 0.0) {
          float az = atan(d.x, -d.z);
          float n = fbm(vec2(az * 3.2, e * 30.0) + vec2(1.7, 3.0));
          float band = smoothstep(0.025, 0.08, e) * (1.0 - smoothstep(0.12, 0.3, e));
          float cl = smoothstep(0.5, 0.78, n) * band * uCloud;
          vec3 lit = mix(uMid * 0.8, uCloudLit, clamp(pow(sd, 3.0) * 1.2 + 0.15, 0.0, 1.0));
          c = mix(c, lit, cl);
        }
        // Sun disk with a soft corona (kept moderate: it is a light source, not an accent).
        float disk = smoothstep(0.99962, 0.99985, dot(d, sdir));
        c += uGlow * (disk * 3.0 + pow(sd, 400.0) * 1.2) * uDisk;
        c = mix(uHorizon * 0.92, c, smoothstep(-0.03, 0.0, e));
        gl_FragColor = vec4(c, uOpacity);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(120, 48, 24), mat);
  mesh.renderOrder = -999;
  mesh.frustumCulled = false;
  return mesh;
}

/* ------------------------------------------------------------------ steles */

const STELE = { w: 0.84, h: 1.98, d: 0.2 };
const FACE = { w: 0.8, h: 1.94 };
const WORDS = ['夢', '勇気', '信頼'];

function goldPattern(ctx, seed) {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  const rand = mulberry32(seed);
  const lg = g.createLinearGradient(0, 0, 128, 128);
  lg.addColorStop(0, '#dcb767');
  lg.addColorStop(0.5, '#c69a4c');
  lg.addColorStop(1, '#e4c47c');
  g.fillStyle = lg;
  g.fillRect(0, 0, 128, 128);
  // Gold leaf is laid in overlapping squares: faint seams and burnish marks.
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = `rgba(120,80,30,${0.1 + rand() * 0.1})`;
    g.lineWidth = 1;
    const o = rand() * 128;
    g.beginPath();
    g.moveTo(o, 0);
    g.lineTo(o + rand() * 6 - 3, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(0, o);
    g.lineTo(128, o + rand() * 6 - 3);
    g.stroke();
  }
  for (let i = 0; i < 420; i++) {
    g.fillStyle = rand() < 0.5 ? `rgba(255,236,180,${rand() * 0.25})` : `rgba(110,70,25,${rand() * 0.22})`;
    g.fillRect(rand() * 128, rand() * 128, 1 + rand() * 2, 1 + rand() * 2);
  }
  return ctx.createPattern(c, 'repeat');
}

let _stoneNoise = null;
function stoneNoise() {
  if (!_stoneNoise) _stoneNoise = fbmField(256, { octaves: 4, base: 4, seed: 91, gain: 0.55 });
  return _stoneNoise;
}

/**
 * Paint one stele face: polished black granite with an incised, gold-leafed word.
 * colour canvas (sRGB) + data canvas (R height for bump, G roughness, B metalness).
 */
function paintStele(colorCanvas, dataCanvas, word, family, seed) {
  const W = colorCanvas.width, H = colorCanvas.height;
  const kx = W / FACE.w / (H / FACE.h); // texels per unit, horizontal vs vertical
  const LW = W / kx;
  const chars = [...word];
  const size = 300;
  const step = size * 1.08;
  const span = step * (chars.length - 1);
  const cy = 470;
  const font = `${family === BRUSH ? 400 : 700} ${size}px "${family}", "Shippori Mincho B1", serif`;
  const drawWord = (ctx, dx = 0) => {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    chars.forEach((ch, i) => ctx.fillText(ch, LW / 2 + dx, cy - span / 2 + i * step));
  };

  // Masks: crisp glyphs (gold leaf) and a blurred copy (the V-cut's slope).
  const tmp = makeCanvas(W, H);
  const t = tmp.getContext('2d', { willReadFrequently: true });
  t.fillStyle = '#000';
  t.fillRect(0, 0, W, H);
  t.setTransform(kx, 0, 0, 1, 0, 0);
  t.fillStyle = '#fff';
  drawWord(t);
  const crisp = t.getImageData(0, 0, W, H).data;
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.fillStyle = '#000';
  t.fillRect(0, 0, W, H);
  t.setTransform(kx, 0, 0, 1, 0, 0);
  blurredShape(t, 7, '#fff', kx, (dx) => drawWord(t, dx));
  const soft = t.getImageData(0, 0, W, H).data;

  const noise = stoneNoise();
  const dctx = dataCanvas.getContext('2d');
  const img = dctx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const m = crisp[i] / 255;
      const s = Math.min(1, (soft[i] / 255) * 1.3);
      const n = noise[(y & 255) * 256 + (x & 255)];
      const stoneR = 0.1 + 0.09 * n;
      d[i] = 255 - 175 * Math.max(s, m * 0.95);
      d[i + 1] = 255 * (stoneR + (0.36 - stoneR) * m);
      d[i + 2] = 255 * m;
      d[i + 3] = 255;
    }
  }
  dctx.putImageData(img, 0, 0);

  const c = colorCanvas.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  const rand = mulberry32(seed);
  const bg = c.createLinearGradient(0, 0, W * 0.3, H);
  bg.addColorStop(0, '#19191c');
  bg.addColorStop(1, '#0f0f11');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 30; i++) {
    const x = rand() * W, y = rand() * H, r = 30 + rand() * 120;
    const rg = c.createRadialGradient(x, y, 0, x, y, r);
    const l = rand() < 0.5 ? '255,255,255' : '0,0,0';
    rg.addColorStop(0, `rgba(${l},${0.02 + rand() * 0.025})`);
    rg.addColorStop(1, `rgba(${l},0)`);
    c.fillStyle = rg;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 9000; i++) {
    const v = 55 + rand() * 90;
    c.fillStyle = `rgba(${v | 0},${v | 0},${(v + 6) | 0},${0.16 + rand() * 0.45})`;
    const s = 0.8 + rand() * 1.5;
    c.fillRect(rand() * W, rand() * H, s, s * (0.7 + rand() * 0.6));
  }
  c.setTransform(kx, 0, 0, 1, 0, 0);
  blurredShape(c, 6, 'rgba(0,0,0,0.9)', kx, (dx) => drawWord(c, dx));
  c.fillStyle = goldPattern(c, seed);
  drawWord(c);
  c.setTransform(1, 0, 0, 1, 0, 0);
}

function speckleTexture() {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      const rand = mulberry32(77);
      ctx.fillStyle = '#161618';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2400; i++) {
        const v = 55 + rand() * 90;
        ctx.fillStyle = `rgba(${v | 0},${v | 0},${(v + 6) | 0},${0.18 + rand() * 0.42})`;
        const s = 0.6 + rand() * 1.1;
        ctx.fillRect(rand() * w, rand() * h, s, s);
      }
    },
    { key: 'cultureSpeckle' }
  );
}

/* ------------------------------------------------------------------ round table */

/** Chair facing -Z (the table side), split into walnut and upholstery parts. */
function chairGeometries() {
  const wood = [], fabric = [];
  const seat = roundedBox(0.46, 0.07, 0.44, 0.03, 3);
  seat.translate(0, 0.462, -0.01);
  fabric.push(seat);
  const frame = roundedBox(0.48, 0.035, 0.46, 0.012, 2);
  frame.translate(0, 0.41, 0);
  wood.push(frame);
  for (const [x, z] of [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]]) {
    const leg = new THREE.CylinderGeometry(0.017, 0.012, 0.42, 12);
    leg.rotateX(z > 0 ? 0.06 : -0.06);
    leg.rotateZ(x > 0 ? -0.05 : 0.05);
    leg.translate(x * 1.03, 0.2, z * 1.03);
    wood.push(leg);
  }
  for (const x of [-0.19, 0.19]) {
    const post = new THREE.CylinderGeometry(0.014, 0.015, 0.44, 10);
    post.rotateX(0.09);
    post.translate(x, 0.63, 0.205);
    wood.push(post);
  }
  // Curved back rest: an extruded arc band wrapping around the sitter.
  const R = 0.62, a = 0.72;
  const sh = new THREE.Shape();
  sh.absarc(0, 0, R, Math.PI / 2 - a / 2, Math.PI / 2 + a / 2, false);
  sh.absarc(0, 0, R - 0.024, Math.PI / 2 + a / 2, Math.PI / 2 - a / 2, true);
  const back = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 24 });
  back.rotateX(Math.PI / 2);
  back.translate(0, 0.87, 0.235 - R);
  wood.push(back);
  return { wood: merge(wood), fabric: merge(fabric) };
}

/** Spur gear lying flat (axis +Y). Tooth centres at angle i·2π/N (from +X toward −Z). */
function gearGeometry({ teeth = 14, rp = 0.12, thickness = 0.028 } = {}) {
  const m = (2 * rp) / teeth, ra = rp + m, rd = rp - 1.25 * m, p = TAU / teeth;
  const s = new THREE.Shape();
  const P = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
  for (let i = 0; i < teeth; i++) {
    const c = i * p;
    const pts = [P(rd, c - 0.3 * p), P(rp, c - 0.21 * p), P(ra, c - 0.12 * p), P(ra, c + 0.12 * p), P(rp, c + 0.21 * p), P(rd, c + 0.3 * p), P(rd, c + 0.5 * p)];
    pts.forEach(([x, y], k) => (i === 0 && k === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  }
  s.closePath();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + 0.3;
    const h = new THREE.Path();
    h.absarc(Math.cos(a) * rp * 0.52, Math.sin(a) * rp * 0.52, rp * 0.2, 0, TAU, true);
    s.holes.push(h);
  }
  const hub = new THREE.Path();
  hub.absarc(0, 0, rp * 0.1, 0, TAU, true);
  s.holes.push(hub);
  const geo = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 20 });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------------ athletics track */

// Metres. Home straight runs toward −Z and ends at the finish line (u = 0);
// bend 1 turns left around (−R0, 0, 0). u = arc length along the kerb, v = metres outward.
const TRK = { R0: 36.5, lane: 1.22, n: 8, u0: -28, u1: 84, apron: 11.0, board: 11.4, scale: 0.25 };
const runR = (k) => TRK.R0 + (k === 1 ? 0.3 : (k - 1) * TRK.lane + 0.2);
// 400 m staggered start lines on the bend (inner-edge arc length).
const STARTS = Array.from({ length: 8 }, (_, i) => ((TAU * (runR(i + 1) - runR(1))) / runR(i + 1)) * TRK.R0);

function trackPos(u, v, y = 0, out = new THREE.Vector3()) {
  if (u <= 0) return out.set(v, y, -u);
  const th = u / TRK.R0, r = TRK.R0 + v;
  return out.set(-TRK.R0 + r * Math.cos(th), y, -r * Math.sin(th));
}
function trackDir(u, out = new THREE.Vector3()) {
  if (u <= 0) return out.set(0, 0, -1);
  const th = u / TRK.R0;
  return out.set(-Math.sin(th), 0, -Math.cos(th));
}
function trackSamples(u0, u1, step) {
  const us = [];
  for (let u = u0; u < 0; u += 4) us.push(u);
  for (let u = 0; u <= u1 + 1e-6; u += step) us.push(u);
  return us;
}
/** Horizontal (up-facing) or vertical (inward-facing) strip following the track. */
function trackStrip(us, a, b, { vertical = false, arcLen = false } = {}) {
  const pos = [], uv = [], idx = [];
  const p = new THREE.Vector3();
  us.forEach((u) => {
    const s = arcLen && u > 0 ? (u / TRK.R0) * (TRK.R0 + a) : u;
    if (vertical) {
      trackPos(u, TRK.board, a, p);
      pos.push(p.x, p.y, p.z);
      trackPos(u, TRK.board, b, p);
      pos.push(p.x, p.y, p.z);
      uv.push(s, 0, s, 1);
    } else {
      trackPos(u, a, 0, p);
      pos.push(p.x, p.y, p.z);
      trackPos(u, b, 0, p);
      pos.push(p.x, p.y, p.z);
      uv.push(u, a, u, b);
    }
  });
  for (let i = 0; i < us.length - 1; i++) {
    const k = i * 2;
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function startingBlockGeometries() {
  const metal = [], rubber = [];
  const rail = roundedBox(0.11, 0.045, 0.78, 0.015, 2);
  rail.translate(0, 0.03, 0);
  metal.push(rail);
  for (const [z, x, h] of [[-0.12, -0.075, 0.2], [0.2, 0.075, 0.24]]) {
    const plate = roundedBox(0.14, h, 0.03, 0.01, 2);
    plate.rotateX(-0.75);
    plate.translate(x, 0.1, z);
    rubber.push(plate);
    const bracket = roundedBox(0.03, 0.12, 0.12, 0.008, 1);
    bracket.translate(x * 0.4, 0.07, z + 0.05);
    metal.push(bracket);
  }
  const spikeBar = roundedBox(0.16, 0.02, 0.04, 0.006, 1);
  spikeBar.translate(0, 0.012, -0.37);
  metal.push(spikeBar);
  return { metal: merge(metal), rubber: merge(rubber) };
}

/* ------------------------------------------------------------------ football */

/** Face normals and plane distances of a truncated icosahedron (12 pentagons, 20 hexagons). */
function footballFaces() {
  const phi = (1 + Math.sqrt(5)) / 2;
  const faces = [];
  const add = (x, y, z, h) => faces.push({ n: new THREE.Vector3(x, y, z).normalize(), h });
  // Pentagons sit on the icosahedron vertices, hexagons on its face centres.
  for (const s1 of [-1, 1])
    for (const s2 of [-1, 1]) {
      add(0, s1, s2 * phi, 2.3274);
      add(s1, s2 * phi, 0, 2.3274);
      add(s2 * phi, 0, s1, 2.3274);
    }
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) add(a, b, c, 2.2673);
  for (const s1 of [-1, 1])
    for (const s2 of [-1, 1]) {
      add(0, s1 / phi, s2 * phi, 2.2673);
      add(s1 / phi, s2 * phi, 0, 2.2673);
      add(s2 * phi, 0, s1 / phi, 2.2673);
    }
  return faces;
}

/** Classic 32-panel ball: puffy panels with stitched seams (geometry) + panel colours (shader). */
function footballMesh() {
  const faces = footballFaces();
  const geo = mergeVertices(new THREE.SphereGeometry(1, 128, 96).deleteAttribute('uv').deleteAttribute('normal'));
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let a = -1e9, b = -1e9;
    for (const f of faces) {
      const s = v.dot(f.n) / f.h;
      if (s > a) {
        b = a;
        a = s;
      } else if (s > b) b = s;
    }
    const seam = Math.min(1, (a - b) / 0.035);
    const puff = 1 - 0.012 * Math.pow(1 - seam, 2) - 0.004 * (1 - Math.min(1, (a - b) / 0.12));
    v.multiplyScalar(puff);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.35, sheen: 0.2, sheenColor: new THREE.Color(0xffffff) });
  const nArr = faces.map((f) => f.n);
  const hArr = faces.map((f) => f.h);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFaceN = { value: nArr };
    sh.uniforms.uFaceH = { value: hArr };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBallDir;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBallDir = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBallDir;\nuniform vec3 uFaceN[32];\nuniform float uFaceH[32];')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 bd = normalize(vBallDir);
          float a = -1e9, b = -1e9; int ia = 0;
          for (int i = 0; i < 32; i++) {
            float s = dot(bd, uFaceN[i]) / uFaceH[i];
            if (s > a) { b = a; a = s; ia = i; } else if (s > b) { b = s; }
          }
          float w = fwidth(a - b) + 1e-4;
          float seam = smoothstep(0.004, 0.004 + w * 1.5, a - b);
          vec3 panel = ia < 12 ? vec3(0.018, 0.018, 0.02) : vec3(0.86, 0.85, 0.82);
          diffuseColor.rgb = mix(vec3(0.05, 0.05, 0.05), panel, seam);
        }`
      );
  };
  mat.customProgramCacheKey = () => 'football-v1';
  return new THREE.Mesh(geo, mat);
}

/* ------------------------------------------------------------------ wind turbine */

function turbineGeometries() {
  const tower = new THREE.CylinderGeometry(0.11, 0.22, 7, 24, 1);
  tower.translate(0, 3.5, 0);
  const nacelle = merge([
    (() => {
      const g = roundedBox(0.34, 0.34, 1.0, 0.13, 3);
      g.translate(0, 7.12, -0.12);
      return g;
    })(),
  ]);
  const blades = [];
  const bs = new THREE.Shape();
  bs.moveTo(0.05, 0.15);
  bs.splineThru([new THREE.Vector2(0.12, 0.55), new THREE.Vector2(0.1, 1.4), new THREE.Vector2(0.05, 2.6), new THREE.Vector2(0.015, 3.05)]);
  bs.lineTo(-0.02, 3.05);
  bs.splineThru([new THREE.Vector2(-0.07, 2.4), new THREE.Vector2(-0.16, 1.1), new THREE.Vector2(-0.14, 0.45), new THREE.Vector2(-0.05, 0.15)]);
  bs.closePath();
  for (let i = 0; i < 3; i++) {
    const b = new THREE.ExtrudeGeometry(bs, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2, curveSegments: 10 });
    b.translate(0, 0, -0.0175);
    b.rotateY(0.18);
    b.rotateZ((i / 3) * TAU);
    blades.push(b);
  }
  const hub = new THREE.SphereGeometry(0.16, 20, 14);
  hub.scale(1, 1, 1.5);
  blades.push(hub);
  const rotor = merge(blades);
  return { tower, nacelle, rotor };
}

function solarTexture() {
  return canvasTexture(
    388,
    644,
    (ctx, w, h) => {
      const rand = mulberry32(5);
      ctx.fillStyle = '#d9dde2';
      ctx.fillRect(0, 0, w, h);
      const cs = 60, gap = 4, ch = 8;
      for (let r = 0; r < 10; r++)
        for (let c = 0; c < 6; c++) {
          const x = gap + c * (cs + gap), y = gap + r * (cs + gap);
          const g = ctx.createLinearGradient(x, y, x + cs, y + cs);
          g.addColorStop(0, '#111b2d');
          g.addColorStop(1, '#1b2942');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(x + ch, y);
          ctx.lineTo(x + cs - ch, y);
          ctx.lineTo(x + cs, y + ch);
          ctx.lineTo(x + cs, y + cs - ch);
          ctx.lineTo(x + cs - ch, y + cs);
          ctx.lineTo(x + ch, y + cs);
          ctx.lineTo(x, y + cs - ch);
          ctx.lineTo(x, y + ch);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(40,60,90,0.35)';
          for (let f = y + 3; f < y + cs; f += 3) ctx.fillRect(x + 1, f, cs - 2, 0.6);
          ctx.fillStyle = `rgba(185,192,200,${0.75 + rand() * 0.1})`;
          for (let b = 1; b <= 4; b++) ctx.fillRect(x + (b * cs) / 5 - 0.8, y, 1.6, cs);
        }
      ctx.strokeStyle = '#c4c9cf';
      ctx.lineWidth = 6;
      ctx.strokeRect(1, 1, w - 2, h - 2);
    },
    { key: 'cultureSolar' }
  );
}

/* ------------------------------------------------------------------ chapter */

// Per-step lighting / sky presets (colours are sRGB hex).
const LOOKS = [
  { sky: 0, keyI: 95, sunI: 0, hemiI: 0.08, hemiSky: 0xffeedd, hemiGround: 0x0b0a09, rimI: 1.1, rimC: 0xcfdcff, envI: 0.9, fog: 0, fogC: 0x000000, exp: 1.0 },
  { sky: 0, keyI: 120, sunI: 0, hemiI: 0.12, hemiSky: 0xffeedd, hemiGround: 0x0e0b09, rimI: 0.9, rimC: 0xd6e0ff, envI: 0.85, fog: 0, fogC: 0x000000, exp: 1.0 },
  {
    sky: 1, keyI: 140, sunI: 0, hemiI: 0.22, hemiSky: 0x5a6a90, hemiGround: 0x0c0d10, rimI: 0.5, rimC: 0xbfd0ff, envI: 0.45, fog: 0.012, fogC: 0x0b0e15, exp: 1.0,
    zenith: 0x030409, mid: 0x0a0d16, horizon: 0x1c2232, glow: 0x5a3a20, cloudLit: 0x2a2a34, sun: [0.2, 0.02, -1], glowPow: 3, disk: 0, cloud: 0.0,
  },
  {
    sky: 1, keyI: 0, sunI: 2.4, sunC: 0xffb070, hemiI: 0.55, hemiSky: 0x8a90c0, hemiGround: 0x2a2a1c, rimI: 0.0, rimC: 0xffffff, envI: 0.5, fog: 0.006, fogC: 0x9a8090, exp: 1.0,
    zenith: 0x141a3a, mid: 0x4a4a78, horizon: 0xf0a878, glow: 0xffa060, cloudLit: 0xffb48a, sun: [0.33, 0.012, -1], glowPow: 7, disk: 1, cloud: 1,
  },
  {
    sky: 1, keyI: 0, sunI: 2.6, sunC: 0xffd2a8, hemiI: 0.85, hemiSky: 0xb4c8ec, hemiGround: 0x3e4a2c, rimI: 0.0, rimC: 0xffffff, envI: 0.75, fog: 0.012, fogC: 0xc8b8b0, exp: 0.95,
    zenith: 0x22365e, mid: 0x6a84ae, horizon: 0xf2cfae, glow: 0xffc890, cloudLit: 0xffd8b8, sun: [0.75, 0.14, -0.55], glowPow: 6, disk: 0, cloud: 0.7,
  },
];

export class Culture extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.env = 'studio';
    this.exposure = 1.0;
    this.shift = 0.2;
    this.look = { bloom: 0.12, threshold: 1.0, vignette: 0.4, saturation: 1.02, lift: new THREE.Vector3(0.003, 0.002, 0) };
  }

  build() {
    const M = materials();
    const q = this.app.quality.tier;
    const keep = (x) => this.tracker.track(x);
    this.envMaps = { studio: this.app.envs.get('studio'), dawn: this.app.envs.get('dawn') };
    this.addBackdrop({ top: '#141210', bottom: '#060505', glow: '#2b2117', glowPos: [0.7, 0.6], glowSize: 0.55, glowStrength: 0.8 });
    this.addDust({ count: 340, radius: 4.5, height: 3.4, size: 0.04, opacity: 0.5, seed: 15, center: [0.3, 1.7, 0.8] });
    this.scene.fog = new THREE.FogExp2(0x000000, 0);
    this.sky = buildSky();
    this.add(this.sky);
    keep(this.sky.material);

    /* --- lights shared by every station ------------------------------------ */
    this.key = spot(this.scene, { intensity: 0, pos: [-2.4, 5.4, 3.8], target: [0, 1.2, 0], angle: 0.34, penumbra: 0.6, decay: 1.3, shadow: q.shadows, shadowSize: q.shadowSize, far: 40 });
    this.sun = new THREE.DirectionalLight(0xffc890, 0);
    if (q.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.03;
      this.sun.shadow.radius = 4;
    }
    this.scene.add(this.sun, this.sun.target);
    this.rim = new THREE.DirectionalLight(0xcfdcff, 1);
    this.scene.add(this.rim, this.rim.target);
    this.hemi = new THREE.HemisphereLight(0xffeedd, 0x0b0a09, 0.1);
    this.scene.add(this.hemi);
    this.lit = {
      keyI: 0, sunI: 0, hemiI: 0.1, rimI: 1, envI: 0.9, fog: 0, exp: 1,
      hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), rimC: new THREE.Color(), fogC: new THREE.Color(), sunC: new THREE.Color(0xffc890),
      zenith: new THREE.Color(), mid: new THREE.Color(), horizon: new THREE.Color(), glow: new THREE.Color(), cloudLit: new THREE.Color(),
      skyO: 0, glowPow: 6, disk: 0, cloud: 0, sun: new THREE.Vector3(1, 0, 0),
    };
    this.keyPos = new THREE.Vector3(-2.4, 5.4, 3.8);
    this.keyAim = new THREE.Vector3(0, 1.2, 0);

    /* --- indoor floor (stations 0 and 1) ----------------------------------- */
    const floorMat = keep(new THREE.MeshPhysicalMaterial({ color: 0x0f0f11, roughness: 0.36, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.4 }));
    this.indoor = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 40), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(6, 0, -6);
    floor.receiveShadow = true;
    this.indoor.add(floor);
    this.add(this.indoor);

    this.groups = [this.buildSteles(M, keep), this.buildTable(M, keep), this.buildTrack(M, keep), this.buildPitch(M, keep), this.buildEco(M, keep)];
    this.groups.forEach((g) => this.add(g));

    /* --- glyphs: brush lettering for the steles, Mincho for the plate ------ */
    const token = (this.buildToken = (this.buildToken || 0) + 1);
    const alive = () => this.buildToken === token && this.built;
    fontSubset(BRUSH, WORDS.join(''))
      .then(() => loadGlyphs(`400 100px "${BRUSH}"`, WORDS.join('')))
      .then((ok) => {
        if (!ok) return loadGlyphs('700 100px "Shippori Mincho B1"', WORDS.join('')).then(() => 'Shippori Mincho B1');
        return BRUSH;
      })
      .then((family) => {
        if (alive()) this.steles.forEach((s) => s.paint(family));
      });
    loadGlyphs('600 40px "Shippori Mincho B1"', '社是創造によって文化、産業に貢献する').then(() => {
      if (alive()) this.plateTex.userData.repaint();
    });
  }

  /* ======================================================================= 0 */
  buildSteles(M, keep) {
    const g = new THREE.Group();
    g.position.set(ST.stele, 0, 0);
    const speck = speckleTexture();
    const granite = keep(new THREE.MeshStandardMaterial({ map: speck, color: 0xd8d8dc, roughness: 0.34, metalness: 0 }));
    const baseMat = keep(new THREE.MeshStandardMaterial({ map: speck, color: 0x9a9aa0, roughness: 0.62 }));
    const lacquer = keep(new THREE.MeshPhysicalMaterial({ color: 0x0a0a0b, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 }));
    const plinth = new THREE.Mesh(roundedBox(3.9, 0.34, 1.3, 0.03, 3), lacquer);
    plinth.position.y = 0.17;
    plinth.castShadow = plinth.receiveShadow = true;
    g.add(plinth);

    // Brass plate with the corporate creed (社是, 1967).
    this.plateTex = keep(
      paintedTexture(1024, 128, (ctx, w, h) => {
        const rand = mulberry32(8);
        const gr = ctx.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, '#a88553');
        gr.addColorStop(0.5, '#caa56b');
        gr.addColorStop(1, '#9b794a');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 180; i++) {
          ctx.fillStyle = `rgba(255,240,210,${rand() * 0.07})`;
          ctx.fillRect(0, rand() * h, w, 1);
        }
        ctx.strokeStyle = 'rgba(58,38,18,0.75)';
        ctx.lineWidth = 3;
        ctx.strokeRect(10, 10, w - 20, h - 20);
        ctx.fillStyle = 'rgba(46,30,14,0.92)';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.font = '600 36px "Shippori Mincho B1", serif';
        ctx.fillText('社是', 92, h / 2 + 2);
        ctx.font = '600 46px "Shippori Mincho B1", serif';
        ctx.fillText('創造によって文化、産業に貢献する', w / 2 + 8, h / 2 + 2);
        ctx.font = '500 34px "IBM Plex Mono", monospace';
        ctx.fillText('1967', w - 96, h / 2 + 2);
        ctx.fillRect(150, 30, 2, h - 60);
        ctx.fillRect(w - 156, 30, 2, h - 60);
      })
    );
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.2125), keep(new THREE.MeshStandardMaterial({ map: this.plateTex, metalness: 0.9, roughness: 0.36 })));
    plate.position.set(0, 0.17, 0.652);
    g.add(plate);
    this.plate = plate;

    this.steles = [];
    WORDS.forEach((word, i) => {
      const s = new THREE.Group();
      s.position.set((i - 1) * 1.14, 0.34, i === 1 ? -0.1 : 0.04);
      s.rotation.y = (1 - i) * 0.17;
      const base = new THREE.Mesh(boxUV(roundedBox(1.0, 0.12, 0.42, 0.015, 2), 1.6), baseMat);
      base.position.y = 0.06;
      const body = new THREE.Mesh(boxUV(roundedBox(STELE.w, STELE.h, STELE.d, 0.02, 3), 1.6), granite);
      body.position.y = 0.12 + STELE.h / 2;
      base.castShadow = base.receiveShadow = body.castShadow = body.receiveShadow = true;
      const color = makeCanvas(512, 1024), data = makeCanvas(512, 1024);
      const ctex = keep(canvasTex(color, { aniso: 8 })), dtex = keep(canvasTex(data, { srgb: false, aniso: 8 }));
      const faceMat = keep(new THREE.MeshStandardMaterial({ map: ctex, roughnessMap: dtex, metalnessMap: dtex, bumpMap: dtex, bumpScale: 1.2, roughness: 1, metalness: 1 }));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(FACE.w, FACE.h), faceMat);
      face.position.set(0, 0.12 + STELE.h / 2, STELE.d / 2 + 0.0015);
      face.receiveShadow = true;
      s.add(base, body, face);
      g.add(s);
      const paint = (family) => {
        paintStele(color, data, word, family, 11 + i * 7);
        ctex.needsUpdate = true;
        dtex.needsUpdate = true;
      };
      paint('Shippori Mincho B1');
      this.steles.push({ s, paint });
    });

    // A visible beam from the key light, with dust drifting through it.
    this.shaft = lightShaft({ length: 7.4, radiusTop: 0.1, radiusBottom: 1.25, color: '#ffe3bf', opacity: 0.0 });
    this.shaft.renderOrder = 3;
    g.add(this.shaft);

    this.label({ text: '社訓', sub: '夢・勇気・信頼', anchor: [ST.stele + 0.55, 2.62, -0.05], offset: [46, -26], when: () => this.step === 0 && this.stepTime > 1.8 });
    this.label({ text: '社是（1967年）', sub: '創造によって文化、産業に貢献する', anchor: () => plate.localToWorld(new THREE.Vector3(0.5, 0.02, 0)), offset: [40, 44], when: () => this.step === 0 && this.stepTime > 2.4 });
    return g;
  }

  /* ======================================================================= 1 */
  buildTable(M, keep) {
    const g = new THREE.Group();
    g.position.set(ST.table, 0, 0);
    const rig = new THREE.Group();
    g.add(rig);
    this.tableRig = rig;

    const rugTex = canvasTexture(
      1024,
      1024,
      (ctx, w, h) => {
        const rand = mulberry32(31);
        ctx.fillStyle = '#2b2622';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 26000; i++) {
          const v = rand();
          ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${rand() * 0.18})` : `rgba(140,120,96,${rand() * 0.12})`;
          ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
        }
        const cx = w / 2, cy = h / 2;
        ctx.lineWidth = 10;
        ctx.strokeStyle = 'rgba(150,120,82,0.32)';
        ctx.beginPath();
        ctx.arc(cx, cy, w * 0.455, 0, TAU);
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(150,120,82,0.25)';
        ctx.beginPath();
        ctx.arc(cx, cy, w * 0.425, 0, TAU);
        ctx.stroke();
      },
      { key: 'cultureRug' }
    );
    const rug = new THREE.Mesh(new THREE.CircleGeometry(2.3, 96), keep(new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 })));
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.004;
    rug.receiveShadow = true;
    g.add(rug);

    const prof = [[0.0001, 0.69], [1.11, 0.69], [1.145, 0.696], [1.162, 0.713], [1.157, 0.731], [1.13, 0.744], [0.0001, 0.744]];
    const topGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 128);
    {
      const p = topGeo.attributes.position, uv = topGeo.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.42 + 0.5, p.getZ(i) * 0.42 + 0.5);
    }
    const walnutTop = keep(new THREE.MeshPhysicalMaterial({ map: M.walnut.map, color: 0x9a6a48, roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.28 }));
    const top = new THREE.Mesh(topGeo, walnutTop);
    top.castShadow = top.receiveShadow = true;
    rig.add(top);
    const bronzeDark = keep(new THREE.MeshStandardMaterial({ color: 0x2c2520, metalness: 0.85, roughness: 0.38 }));
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.66, 32), bronzeDark);
    col.position.y = 0.36;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.48, 0.035, 64), bronzeDark);
    foot.position.y = 0.022;
    col.castShadow = foot.castShadow = true;
    foot.receiveShadow = true;
    rig.add(col, foot);

    // Eight identical chairs, evenly spaced: no head of the table.
    const { wood, fabric } = chairGeometries();
    const chairWood = keep(new THREE.MeshPhysicalMaterial({ color: 0x4a2f1e, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 }));
    const chairFab = keep(new THREE.MeshStandardMaterial({ map: M.fabric.map, color: 0xa69a8c, roughness: 0.95 }));
    this.nChairs = 8;
    this.chairW = new THREE.InstancedMesh(wood, chairWood, this.nChairs);
    this.chairF = new THREE.InstancedMesh(fabric, chairFab, this.nChairs);
    [this.chairW, this.chairF].forEach((m) => {
      m.castShadow = m.receiveShadow = true;
      rig.add(m);
    });
    // Identical place settings: leather pad, paper, pen.
    const pad = roundedBox(0.25, 0.012, 0.33, 0.006, 2);
    const paper = new THREE.BoxGeometry(0.2, 0.004, 0.27);
    const pen = new THREE.CylinderGeometry(0.0075, 0.0075, 0.16, 10);
    pen.rotateX(Math.PI / 2);
    const padMat = keep(new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.6 }));
    const paperMat = keep(new THREE.MeshStandardMaterial({ color: 0xece5d6, roughness: 0.9 }));
    const set = [new THREE.InstancedMesh(pad, padMat, 8), new THREE.InstancedMesh(paper, paperMat, 8), new THREE.InstancedMesh(pen, M.epoxyGloss, 8)];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 8; i++) {
      const phi = (i / 8) * TAU + TAU / 16;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 - phi);
      const at = (r, y, side = 0) => new THREE.Vector3(Math.cos(phi) * r - Math.sin(phi) * side, y, Math.sin(phi) * r + Math.cos(phi) * side);
      set[0].setMatrixAt(i, m4.compose(at(0.86, 0.751), q, s1));
      set[1].setMatrixAt(i, m4.compose(at(0.86, 0.759), q, s1));
      set[2].setMatrixAt(i, m4.compose(at(0.86, 0.752, 0.17), q, s1));
    }
    set.forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
      rig.add(m);
    });

    // Six equal gears in a closed ring: every gear turns because every gear meshes.
    const rp = 0.12, teeth = 14, pitch = TAU / teeth;
    const gearGeo = gearGeometry({ teeth, rp, thickness: 0.026 });
    const brass = keep(new THREE.MeshPhysicalMaterial({ color: 0xc9a46a, metalness: 1, roughness: 0.26, clearcoat: 0.4, clearcoatRoughness: 0.2 }));
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.014, 72), keep(new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.7, metalness: 0.1 })));
    tray.position.y = 0.751;
    tray.receiveShadow = true;
    rig.add(tray);
    const pinGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.07, 12);
    this.gears = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const mesh = new THREE.Mesh(gearGeo, brass);
      mesh.position.set(Math.cos(a) * 2 * rp, 0.762, -Math.sin(a) * 2 * rp);
      mesh.castShadow = mesh.receiveShadow = true;
      rig.add(mesh);
      const pin = new THREE.Mesh(pinGeo, M.steel);
      pin.position.set(mesh.position.x, 0.775, mesh.position.z);
      rig.add(pin);
      const base = i % 2 === 0 ? (i / 6) * TAU * 1 : pitch / 2 + (i / 6) * TAU;
      this.gears.push({ mesh, base, dir: i % 2 === 0 ? 1 : -1 });
    }

    this.label({ text: '機能対等', sub: '上座のない円卓（イメージ）', anchor: () => this.tableRig.localToWorld(new THREE.Vector3(0, 0.78, 0)).setX(ST.table + 1.05).setZ(-0.55), offset: [44, -38], when: () => this.step === 1 && this.stepTime > 1.8 });
    this.label({ text: '同じ大きさの6つの歯車', sub: 'すべてがかみ合って回る', anchor: () => this.tableRig.localToWorld(new THREE.Vector3(0, 0.8, 0)), offset: [70, 46], when: () => this.step === 1 && this.stepTime > 2.6 });
    return g;
  }

  /* ======================================================================= 2 */
  buildTrack(M, keep) {
    const g = new THREE.Group();
    g.position.set(ST.track, 0, 0);
    const T = new THREE.Group();
    T.scale.setScalar(TRK.scale);
    g.add(T);
    this.trackG = T;
    const us = trackSamples(TRK.u0, TRK.u1, 0.75);

    // Tartan surface: rubber granules + analytically anti-aliased paint lines.
    const tartan = canvasTexture(
      256,
      256,
      (ctx, w, h) => {
        const rand = mulberry32(17);
        ctx.fillStyle = '#9a4532';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 9000; i++) {
          const k = rand();
          ctx.fillStyle = k < 0.5 ? `rgba(60,18,10,${0.15 + rand() * 0.3})` : `rgba(210,120,90,${0.08 + rand() * 0.16})`;
          ctx.fillRect(rand() * w, rand() * h, 1 + rand(), 1 + rand());
        }
      },
      { key: 'cultureTartan', repeat: [0.7, 0.7] }
    );
    const trackMat = keep(new THREE.MeshStandardMaterial({ map: tartan, roughness: 0.86, normalMap: grainNormal(256, 2.2, 61), normalScale: new THREE.Vector2(0.5, 0.5) }));
    const tu = { uStart: { value: STARTS }, uTime: { value: 0 }, uSpill: { value: 0 } };
    this.trackU = tu;
    trackMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, tu);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vTrk;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvTrk = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vTrk;\nuniform float uStart[8];\nuniform float uTime, uSpill;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            float fwv = fwidth(vTrk.y) * 0.8 + 1e-4;
            float fwu = fwidth(vTrk.x) * 0.8 + 1e-4;
            float lw = 0.025;
            float kk = floor(vTrk.y / ${TRK.lane.toFixed(2)} + 0.5);
            float dl = abs(vTrk.y - kk * ${TRK.lane.toFixed(2)});
            float lane = (kk >= 0.0 && kk <= 8.0) ? 1.0 - smoothstep(lw - fwv, lw + fwv, dl) : 0.0;
            float inT = step(0.0, vTrk.y) * step(vTrk.y, ${(TRK.lane * 8).toFixed(2)});
            float fin = inT * (1.0 - smoothstep(lw - fwu, lw + fwu, abs(vTrk.x)));
            int li = int(clamp(floor(vTrk.y / ${TRK.lane.toFixed(2)}), 0.0, 7.0));
            float stl = inT * (1.0 - smoothstep(lw - fwu, lw + fwu, abs(vTrk.x - uStart[li])));
            float paint = max(lane, max(fin, stl));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.83, 0.83, 0.81), paint);
          }`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            // Warm spill from the LED board onto the outer lanes.
            float sp = exp(-(${TRK.board.toFixed(2)} - vTrk.y) * 0.55);
            float band = 0.55 + 0.45 * sin(vTrk.x * 0.32 - uTime * 1.1);
            totalEmissiveRadiance += vec3(1.0, 0.5, 0.22) * sp * band * uSpill * diffuseColor.rgb;
          }`
        );
    };
    trackMat.customProgramCacheKey = () => 'culture-track-v1';
    const surf = new THREE.Mesh(trackStrip(us, -0.02, TRK.apron), trackMat);
    surf.receiveShadow = true;
    T.add(surf);

    // Infield and surroundings.
    const infield = new THREE.Mesh(
      new THREE.CircleGeometry(TRK.R0 - 0.05, 96, 0, Math.PI),
      keep(new THREE.MeshStandardMaterial({ color: 0x1f3322, roughness: 0.95, normalMap: grainNormal(256, 1.4, 63), normalScale: new THREE.Vector2(0.6, 0.6) }))
    );
    infield.rotation.x = -Math.PI / 2;
    infield.position.set(-TRK.R0, -0.004, 0);
    infield.receiveShadow = true;
    T.add(infield);
    const infieldStraight = new THREE.Mesh(new THREE.PlaneGeometry(2 * TRK.R0 - 0.1, 40), infield.material);
    infieldStraight.rotation.x = -Math.PI / 2;
    infieldStraight.position.set(-TRK.R0, -0.004, 20);
    T.add(infieldStraight);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 200), keep(new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.9 })));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(-20, -0.02, -40);
    T.add(ground);

    // White kerb along the inside edge.
    const kerbPts = trackSamples(TRK.u0, TRK.u1, 2).map((u) => trackPos(u, -0.06, 0.03));
    const kerb = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(kerbPts), 160, 0.045, 8, false), keep(new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.45, metalness: 0.2 })));
    kerb.castShadow = true;
    T.add(kerb);

    // Lane numbers painted before the finish line.
    const numTex = canvasTexture(
      1024,
      128,
      (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '600 112px "IBM Plex Sans JP", sans-serif';
        for (let i = 0; i < 8; i++) ctx.fillText(String(i + 1), i * 128 + 64, 68);
      },
      { key: 'cultureLaneNums' }
    );
    numTex.wrapS = numTex.wrapT = THREE.ClampToEdgeWrapping;
    const quads = [];
    for (let i = 0; i < 8; i++) {
      const qg = new THREE.PlaneGeometry(0.62, 0.62);
      const uv = qg.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 8);
      qg.rotateX(-Math.PI / 2);
      qg.translate((i + 0.5) * TRK.lane, 0.004, 2.2);
      quads.push(qg);
    }
    const nums = new THREE.Mesh(merge(quads), keep(new THREE.MeshStandardMaterial({ map: numTex, transparent: true, roughness: 0.7, depthWrite: false, color: 0xd8d8d4 })));
    nums.receiveShadow = true;
    nums.renderOrder = 1;
    T.add(nums);

    // Starting blocks behind every staggered 400 m start line.
    const sb = startingBlockGeometries();
    const blockMetal = new THREE.InstancedMesh(sb.metal, M.aluminum, 8);
    const blockRubber = new THREE.InstancedMesh(sb.rubber, keep(new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.8 })), 8);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), d = new THREE.Vector3();
    this.blockPos = [];
    for (let i = 0; i < 8; i++) {
      const u = STARTS[i] - 0.72;
      trackPos(u, (i + 0.5) * TRK.lane, 0, p);
      trackDir(u, d);
      q.setFromUnitVectors(new THREE.Vector3(0, 0, -1), d);
      m4.compose(p, q, s1);
      blockMetal.setMatrixAt(i, m4);
      blockRubber.setMatrixAt(i, m4);
      this.blockPos.push(p.clone());
    }
    [blockMetal, blockRubber].forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
      T.add(m);
    });

    // Low LED perimeter board: abstract warm light bands, no lettering.
    const boardU = trackSamples(TRK.u0, TRK.u1, 1.0);
    this.boardMat = keep(
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uI: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          uniform float uTime, uI;
          void main() {
            float x = vUv.x;
            float b1 = 0.5 + 0.5 * sin(x * 0.32 - uTime * 1.1);
            float b2 = 0.5 + 0.5 * sin(x * 0.09 + uTime * 0.37 + 1.3);
            vec3 deep = vec3(0.16, 0.06, 0.025), amber = vec3(1.0, 0.5, 0.2), warm = vec3(1.0, 0.8, 0.6);
            vec3 c = mix(deep, amber, smoothstep(0.25, 0.95, b1));
            c = mix(c, warm, smoothstep(0.62, 1.0, b1 * b2) * 0.8);
            float row = smoothstep(0.08, 0.2, vUv.y) * smoothstep(0.92, 0.8, vUv.y);
            float seam = smoothstep(0.0, 0.02, abs(fract(x / 6.0) - 0.5) - 0.48);
            float pix = 0.82 + 0.18 * step(0.35, fract(vUv.y * 22.0)) * step(0.35, fract(x * 22.0));
            gl_FragColor = vec4(c * row * (1.0 - seam * 0.85) * pix * uI, 1.0);
          }`,
      })
    );
    const board = new THREE.Mesh(trackStrip(boardU, 0.08, 0.92, { vertical: true, arcLen: true }), this.boardMat);
    T.add(board);
    const casingMat = keep(new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.5, metalness: 0.6 }));
    const casing = new THREE.Mesh(trackStrip(boardU, 0, 1.0, { vertical: true }), casingMat);
    casing.position.set(0, 0, 0);
    casing.scale.set(1.0, 1.0, 1.0);
    {
      // Offset the casing slightly behind the light face.
      const pa = casing.geometry.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i);
        const nx = v.x + TRK.R0, nz = v.z;
        if (v.z <= 0 && nx > 0) {
          const r = Math.hypot(nx, nz);
          const k = (r + 0.06) / r;
          v.set(nx * k - TRK.R0, v.y, nz * k);
        } else v.x += 0.06;
        pa.setXYZ(i, v.x, v.y, v.z);
      }
    }
    casing.geometry.computeVertexNormals();
    T.add(casing);

    // Stands rising beyond the board, dark against the night sky, with a few flash points.
    const prof = [[12.2, 0], [13.2, 0], [13.2, 1.3]];
    for (let k = 0; k < 16; k++) {
      const v0 = 13.2 + k * 0.85;
      prof.push([v0 + 0.85, 1.3 + k * 0.48], [v0 + 0.85, 1.3 + (k + 1) * 0.48]);
    }
    const standU = trackSamples(TRK.u0, TRK.u1 + 10, 1.5);
    const spos = [], sidx = [];
    standU.forEach((u) => prof.forEach(([v, y]) => spos.push(...trackPos(u, v, y).toArray())));
    const P = prof.length;
    for (let i = 0; i < standU.length - 1; i++)
      for (let j = 0; j < P - 1; j++) {
        const a = i * P + j, b = a + P;
        sidx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const standGeo = new THREE.BufferGeometry();
    standGeo.setAttribute('position', new THREE.Float32BufferAttribute(spos, 3));
    standGeo.setIndex(sidx);
    standGeo.computeVertexNormals();
    const stands = new THREE.Mesh(standGeo, keep(new THREE.MeshStandardMaterial({ color: 0x1a1b20, roughness: 0.9, side: THREE.DoubleSide })));
    T.add(stands);
    const rand = mulberry32(23);
    const NF = Math.round(260 * this.app.quality.tier.particles) + 40;
    const fpos = new Float32Array(NF * 3), frnd = new Float32Array(NF);
    for (let i = 0; i < NF; i++) {
      const k = Math.floor(rand() * 15);
      const u = TRK.u0 + rand() * (TRK.u1 + 10 - TRK.u0);
      trackPos(u, 13.6 + k * 0.85 + rand() * 0.5, 1.6 + k * 0.48 + 0.4, p);
      fpos.set([p.x, p.y, p.z], i * 3);
      frnd[i] = rand();
    }
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    fgeo.setAttribute('aR', new THREE.BufferAttribute(frnd, 1));
    this.flashMat = keep(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uO: { value: 0 }, uScale: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float aR; uniform float uTime, uScale; varying float vA;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uScale * (0.6 + aR) * 18.0 / max(-mv.z, 0.5);
            vA = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.6 + aR * 2.0) + aR * 40.0), 6.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uO; varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * a * a * vA * uO, 1.0);
          }`,
      })
    );
    const flashes = new THREE.Points(fgeo, this.flashMat);
    flashes.frustumCulled = false;
    T.add(flashes);

    this.label({
      text: '1983年 第1回ヘルシンキ大会から協賛',
      sub: '世界陸上 オフィシャルパートナー',
      anchor: () => T.localToWorld(trackPos(STARTS[5] - 0.6, 5.5 * TRK.lane, 0.35)),
      offset: [36, -52],
      when: () => this.step === 2 && this.stepTime > 1.8,
    });
    return g;
  }

  /* ======================================================================= 3 */
  buildPitch(M, keep) {
    const g = new THREE.Group();
    g.position.set(ST.pitch, 0, 0);
    this.pitchG = g;
    this.decor = []; // far-scenery materials that fade with the station

    // Grass with mowing stripes and pitch markings (metres; corner at the origin,
    // goal line along −Z, touchline along +X, field in x > 0, z < 0).
    const grassTex = canvasTexture(
      256,
      256,
      (ctx, w, h) => {
        const rand = mulberry32(41);
        ctx.fillStyle = '#4b6a33';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 14000; i++) {
          const k = rand();
          ctx.fillStyle = k < 0.5 ? `rgba(20,40,12,${0.1 + rand() * 0.25})` : `rgba(140,170,90,${0.05 + rand() * 0.12})`;
          ctx.fillRect(rand() * w, rand() * h, 1, 1 + rand() * 3);
        }
      },
      { key: 'cultureGrass', repeat: [1.6, 1.6] }
    );
    const grass = keep(new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.92, normalMap: grainNormal(256, 2.0, 71), normalScale: new THREE.Vector2(0.45, 0.45) }));
    grass.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPitch;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvPitch = position.xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec2 vPitch;
          float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            vec2 P = vPitch;
            float fw = (fwidth(P.x) + fwidth(P.y)) * 0.6 + 1e-4;
            float inP = step(0.0, P.x) * step(P.y, 0.0) * step(P.x, 105.0) * step(-68.0, P.y);
            float band = mod(floor(P.x / 5.25), 2.0);
            diffuseColor.rgb *= mix(0.86, mix(0.9, 1.08, band), inP);
            float d = 1e3;
            d = min(d, segD(P, vec2(0.06, 0.0), vec2(0.06, -68.0)));
            d = min(d, segD(P, vec2(0.0, -0.06), vec2(105.0, -0.06)));
            if (P.x > 0.0 && P.y < 0.0) d = min(d, abs(length(P) - 1.0));
            d = min(d, segD(P, vec2(0.0, -24.84), vec2(5.5, -24.84)));
            d = min(d, segD(P, vec2(0.0, -43.16), vec2(5.5, -43.16)));
            d = min(d, segD(P, vec2(5.5, -24.84), vec2(5.5, -43.16)));
            d = min(d, segD(P, vec2(0.0, -13.84), vec2(16.5, -13.84)));
            d = min(d, segD(P, vec2(0.0, -54.16), vec2(16.5, -54.16)));
            d = min(d, segD(P, vec2(16.5, -13.84), vec2(16.5, -54.16)));
            if (P.x > 16.5) d = min(d, abs(length(P - vec2(11.0, -34.0)) - 9.15));
            d = min(d, max(length(P - vec2(11.0, -34.0)) - 0.05, 0.0));
            float line = 1.0 - smoothstep(0.06 - fw, 0.06 + fw, d);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.8, 0.78), line);
          }`
        );
    };
    grass.customProgramCacheKey = () => 'culture-pitch-v1';
    const groundGeo = new THREE.PlaneGeometry(150, 110, 1, 1);
    groundGeo.rotateX(-Math.PI / 2);
    groundGeo.translate(30, 0, -42);
    const ground = new THREE.Mesh(groundGeo, grass);
    ground.receiveShadow = true;
    g.add(ground);

    // The ball, resting in the corner arc ready for a corner kick.
    this.ball = footballMesh();
    keep(this.ball.material);
    this.ball.scale.setScalar(0.11);
    this.ball.position.set(0.6, 0.11, -0.62);
    this.ball.rotation.set(0.4, 0.7, 0.1);
    this.ball.castShadow = this.ball.receiveShadow = true;
    g.add(this.ball);
    const blob = softShadow({ radius: 0.2, opacity: 0.45, y: 0.003 });
    keep(blob.material);
    keep(blob.material.map);
    this.ballShadow = blob;
    g.add(blob);

    // Corner flag.
    const white = keep(new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.4 }));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 1.5, 12), white);
    pole.position.set(0, 0.75, 0);
    pole.castShadow = true;
    g.add(pole);
    const flagGeo = new THREE.PlaneGeometry(0.42, 0.3, 10, 4);
    flagGeo.translate(0.21, -0.15, 0);
    this.flagGeo = flagGeo;
    this.flagBase = Float32Array.from(flagGeo.attributes.position.array);
    const flag = new THREE.Mesh(flagGeo, keep(new THREE.MeshStandardMaterial({ color: 0x24508c, roughness: 0.8, side: THREE.DoubleSide })));
    flag.position.set(0.016, 1.5, 0);
    flag.rotation.y = 0.6;
    flag.castShadow = true;
    g.add(flag);

    // Goal: white frame and a soft net (seen side-on along the goal line).
    const netTex = canvasTexture(
      64,
      64,
      (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, w, h);
      },
      { key: 'cultureNet' }
    );
    const netMat = keep(new THREE.MeshStandardMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9, opacity: 0.8 }));
    const gz0 = -30.34, gz1 = -37.66, H = 2.44;
    const frame = [];
    for (const z of [gz0, gz1]) {
      const post = new THREE.CylinderGeometry(0.06, 0.06, H, 16);
      post.translate(0.06, H / 2, z);
      frame.push(post);
    }
    const bar = new THREE.CylinderGeometry(0.06, 0.06, gz0 - gz1 + 0.12, 16);
    bar.rotateX(Math.PI / 2);
    bar.translate(0.06, H, (gz0 + gz1) / 2);
    frame.push(bar);
    for (const z of [gz0, gz1]) {
      const top = new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8);
      top.rotateZ(Math.PI / 2);
      top.translate(-0.44, H - 0.02, z);
      const diag = new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(1.0, H), 8);
      diag.rotateZ(-Math.atan2(1.0, H));
      diag.translate(-1.44, H / 2, z);
      frame.push(top, diag);
    }
    const back = new THREE.CylinderGeometry(0.025, 0.025, gz0 - gz1, 8);
    back.rotateX(Math.PI / 2);
    back.translate(-1.94, 0.03, (gz0 + gz1) / 2);
    frame.push(back);
    const goalFrame = new THREE.Mesh(merge(frame), white);
    goalFrame.castShadow = true;
    g.add(goalFrame);
    const netQuad = (a, b, c, dd, uScale, vScale) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...dd], 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, uScale, 0, uScale, vScale, 0, vScale], 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      geo.computeVertexNormals();
      return geo;
    };
    const mesh = 0.12;
    const nets = [
      netQuad([0, H, gz0], [-1, H, gz0], [-1, H, gz1], [0, H, gz1], 1 / mesh, (gz0 - gz1) / mesh),
      netQuad([-1, H, gz0], [-2, 0, gz0], [-2, 0, gz1], [-1, H, gz1], Math.hypot(1, H) / mesh, (gz0 - gz1) / mesh),
      ...[gz0, gz1].map((z) => netQuad([0, 0, z], [-2, 0, z], [-1, H, z], [0, H, z], 2 / mesh, H / mesh)),
    ];
    const net = new THREE.Mesh(merge(nets), netMat);
    net.renderOrder = 2;
    g.add(net);

    /* --- far scenery: coast, sea, hills, Mt. Chōkai, town lights, museum ----- */
    const fade = (mat) => {
      mat.transparent = true;
      this.decor.push(mat);
      return keep(mat);
    };
    const atmos = (color, haze) =>
      new THREE.ShaderMaterial({
        transparent: true,
        uniforms: { uColor: { value: new THREE.Color(color) }, uTop: { value: new THREE.Color(color) }, uHaze: { value: new THREE.Color(0xd0a090) }, uHazeK: { value: haze }, uOpacity: { value: 1 }, uY0: { value: 0 }, uY1: { value: 40 } },
        vertexShader: /* glsl */ `
          varying vec3 vW;
          void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `
          varying vec3 vW;
          uniform vec3 uColor, uTop, uHaze; uniform float uHazeK, uOpacity, uY0, uY1;
          void main() {
            float h = clamp((vW.y - uY0) / (uY1 - uY0), 0.0, 1.0);
            vec3 c = mix(uColor, uTop, h);
            c = mix(c, uHaze, uHazeK * (1.0 - h * 0.6));
            gl_FragColor = vec4(c, uOpacity);
          }`,
      });

    // Sea of Japan to the west (right of frame), lower than the land.
    this.seaMat = fade(
      new THREE.ShaderMaterial({
        transparent: true,
        uniforms: { uDeep: { value: new THREE.Color(0x1a2034) }, uHorizon: { value: new THREE.Color(0xd09a84) }, uGlow: { value: new THREE.Color(0xffa060) }, uSunDir: { value: new THREE.Vector3(0.33, 0.012, -1).normalize() }, uTime: { value: 0 }, uOpacity: { value: 1 } },
        vertexShader: /* glsl */ `
          varying vec3 vW;
          void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `
          varying vec3 vW;
          uniform vec3 uDeep, uHorizon, uGlow, uSunDir; uniform float uTime, uOpacity;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
          float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
          void main() {
            vec3 V = normalize(vW - cameraPosition);
            float dist = length(vW.xz - cameraPosition.xz);
            vec2 q = vW.xz * vec2(0.05, 0.16);
            float w1 = noise(q + vec2(uTime * 0.05, uTime * 0.11));
            float w2 = noise(q * 2.7 - vec2(uTime * 0.08, 0.0));
            vec3 N = normalize(vec3((w1 - 0.5) * 0.35 + (w2 - 0.5) * 0.2, 1.0, (w2 - 0.5) * 0.25));
            vec3 R = reflect(V, N);
            float fres = pow(1.0 - max(-V.y, 0.0), 4.0);
            vec3 c = mix(uDeep, uHorizon, clamp(fres + dist / 260.0, 0.0, 1.0));
            float g = pow(max(dot(R, normalize(uSunDir)), 0.0), 90.0);
            c += uGlow * g * 2.2;
            c += uGlow * pow(max(dot(normalize(vec3(V.x, 0.0, V.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 40.0) * 0.12;
            gl_FragColor = vec4(c, uOpacity);
          }`,
      })
    );
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 420), this.seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(200, -1.0, -150);
    sea.renderOrder = -2;
    g.add(sea);

    // Land beyond the pitch: a dark coastal plain whose coastline curves away to the south-west.
    const land = new THREE.Shape();
    land.moveTo(-200, 40);
    land.lineTo(150, 40);
    land.bezierCurveTo(150, -60, 110, -120, 72, -170);
    land.bezierCurveTo(40, -215, 10, -250, -10, -300);
    land.lineTo(-200, -300);
    land.closePath();
    const landGeo = new THREE.ShapeGeometry(land, 40);
    landGeo.rotateX(Math.PI / 2);
    landGeo.scale(1, 1, -1);
    const landMat = fade(atmos(0x1c2416, 0.25));
    landMat.uniforms.uTop.value.set(0x1c2416);
    const landMesh = new THREE.Mesh(landGeo, landMat);
    landMesh.position.y = -0.03;
    landMesh.renderOrder = -1;
    g.add(landMesh);

    // Tree line behind the pitch (silhouette band with bumpy crowns).
    const treeShape = (x0, x1, z, hMin, hMax, seed) => {
      const rnd = mulberry32(seed);
      const s = new THREE.Shape();
      s.moveTo(x0, -1);
      for (let x = x0; x <= x1; x += 1.6) s.lineTo(x, hMin + (hMax - hMin) * (0.5 + 0.5 * Math.sin(x * 0.21 + seed)) * (0.6 + 0.4 * rnd()));
      s.lineTo(x1, -1);
      s.closePath();
      const geo = new THREE.ShapeGeometry(s, 4);
      geo.translate(0, 0, z);
      return geo;
    };
    const treeMat = fade(atmos(0x0f140f, 0.22));
    treeMat.uniforms.uTop.value.set(0x182016);
    treeMat.uniforms.uY1.value = 10;
    const trees = new THREE.Mesh(merge([treeShape(-160, 60, -88, 3, 9, 3), treeShape(-60, 34, -96, 5, 11, 7)]), treeMat);
    trees.renderOrder = 1;
    g.add(trees);

    // Coastal hills and Mt. Chōkai ("Dewa Fuji") rising from the coast.
    const ridge = (pts, z) => {
      const s = new THREE.Shape();
      s.moveTo(pts[0][0], -2);
      pts.forEach(([x, y]) => s.lineTo(x, y));
      s.lineTo(pts[pts.length - 1][0], -2);
      s.closePath();
      const geo = new THREE.ShapeGeometry(s, 4);
      geo.translate(0, 0, z);
      return geo;
    };
    const chokai = [];
    const rnd = mulberry32(19);
    for (let x = -200; x <= 120; x += 2) {
      const xs = x - -38;
      let y = xs < 0 ? 44 * (1 - Math.pow(-xs / 175, 1.5)) : 44 * (1 - Math.pow(xs / 135, 1.25));
      y = Math.max(y, 0);
      y += Math.sin(x * 0.09) * 0.8 + (rnd() - 0.5) * 0.9 * Math.min(1, y / 10);
      if (Math.abs(xs - 6) < 6) y -= 2.2 * (1 - Math.abs(xs - 6) / 6); // saddle between the twin summits
      chokai.push([x, y]);
    }
    this.mountainMat = fade(atmos(0x2c3352, 0.36));
    this.mountainMat.uniforms.uTop.value.set(0x3b3c60);
    this.mountainMat.uniforms.uY1.value = 44;
    const mountain = new THREE.Mesh(ridge(chokai, -262), this.mountainMat);
    mountain.renderOrder = -1;
    g.add(mountain);
    const hillsPts = [];
    for (let x = -220; x <= 40; x += 3) hillsPts.push([x, Math.max(0, 9 + 4 * Math.sin(x * 0.04 + 1) + 2.5 * Math.sin(x * 0.13) - Math.max(0, x + 10) * 0.3)]);
    this.hillsMat = fade(atmos(0x1c2234, 0.3));
    this.hillsMat.uniforms.uTop.value.set(0x252a40);
    this.hillsMat.uniforms.uY1.value = 14;
    const hills = new THREE.Mesh(ridge(hillsPts, -175), this.hillsMat);
    hills.renderOrder = 0;
    g.add(hills);
    this.ridgeMats = [landMat, treeMat, this.mountainMat, this.hillsMat];

    // Evening lights of the town along the coast.
    const NL = 90;
    const lpos = new Float32Array(NL * 3), lr = new Float32Array(NL);
    for (let i = 0; i < NL; i++) {
      const t = rnd();
      const z = -120 - t * 120;
      const xCoast = z > -170 ? 150 - ((-120 - z) / 50) * 78 : 72 - ((-170 - z) / 130) * 82;
      lpos.set([xCoast - 6 - rnd() * 70, 0.4 + rnd() * 1.2, z], i * 3);
      lr[i] = rnd();
    }
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
    lgeo.setAttribute('aR', new THREE.BufferAttribute(lr, 1));
    this.townMat = keep(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uO: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float aR; uniform float uTime; varying float vA;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = (2.0 + aR * 2.5);
            vA = 0.7 + 0.3 * sin(uTime * (0.8 + aR) + aR * 30.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uO; varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.05, d);
            gl_FragColor = vec4(vec3(1.0, 0.72, 0.42) * a * vA * uO * 1.4, 1.0);
          }`,
      })
    );
    const town = new THREE.Points(lgeo, this.townMat);
    town.frustumCulled = false;
    town.renderOrder = 2;
    g.add(town);

    // TDK History Museum: a long, low pavilion with warm glazing (simplified).
    const museum = new THREE.Group();
    museum.position.set(30, 0, -112);
    museum.rotation.y = -0.25;
    const concrete = fade(new THREE.MeshStandardMaterial({ color: 0xbab3aa, roughness: 0.8 }));
    const glassWarm = fade(new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.2, emissive: 0xffb070, emissiveIntensity: 0.55 }));
    const roofMat = fade(new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.6, metalness: 0.3 }));
    const body = new THREE.Mesh(roundedBox(30, 5.2, 12, 0.2, 2), concrete);
    body.position.y = 2.6;
    const glazing = new THREE.Mesh(new THREE.PlaneGeometry(26, 3.6), glassWarm);
    glazing.position.set(0, 2.4, 6.02);
    const roof = new THREE.Mesh(roundedBox(34, 0.5, 15, 0.1, 1), roofMat);
    roof.position.y = 5.45;
    museum.add(body, glazing, roof);
    const mullionGeo = new THREE.BoxGeometry(0.18, 3.6, 0.2);
    const mullions = new THREE.InstancedMesh(mullionGeo, roofMat, 14);
    for (let i = 0; i < 14; i++) mullions.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-13 + i * 2, 2.4, 6.08));
    museum.add(mullions);
    g.add(museum);
    this.museum = museum;

    this.label({ text: 'ブラウブリッツ秋田', sub: '1965年 TDKサッカー部として発足', anchor: () => this.ball.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0)), offset: [34, -46], when: () => this.step === 3 && this.stepTime > 2.2 });
    this.label({ text: 'TDK歴史みらい館', sub: '秋田県にかほ市', anchor: () => museum.localToWorld(new THREE.Vector3(6, 5.8, 0)), offset: [30, -36], when: () => this.step === 3 && this.stepTime > 2.8 });
    return g;
  }

  /* ======================================================================= 4 */
  buildEco(M, keep) {
    const g = new THREE.Group();
    g.position.set(ST.eco, 0, 0);
    const rand = mulberry32(53);

    // Rolling hills (vertex-coloured), flattened where the solar field stands.
    const hgt = (x, z) => {
      let y = 2.4 * Math.sin(x * 0.085 + 1.3) * Math.cos(z * 0.06 + 0.4) + 1.6 * Math.sin(x * 0.17 + z * 0.11) + 0.9 * Math.cos(x * 0.31 - z * 0.23);
      y += Math.max(0, -z - 18) * 0.12;
      const flat = smoothstep(-16, -6, z);
      return lerp(y + 2.2, 0.15 * Math.sin(x * 0.2), flat);
    };
    this.ecoH = hgt;
    const hg = new THREE.PlaneGeometry(110, 80, 160, 120);
    hg.rotateX(-Math.PI / 2);
    hg.translate(0, 0, -28);
    const hp = hg.attributes.position;
    const cols = new Float32Array(hp.count * 3);
    const cA = new THREE.Color(0x4f6e35), cB = new THREE.Color(0x6e8a45), cC = new THREE.Color(0x2f4a26), tmpC = new THREE.Color();
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i), z = hp.getZ(i);
      const y = hgt(x, z);
      hp.setY(i, y);
      const n = 0.5 + 0.5 * Math.sin(x * 0.7 + Math.sin(z * 0.5) * 2.0) * Math.cos(z * 0.43);
      tmpC.copy(cA).lerp(cB, n * 0.6).lerp(cC, clamp01(0.35 - y * 0.08) + (rand() < 0.02 ? 0.3 : 0));
      cols.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
    }
    hg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    hg.computeVertexNormals();
    const hills = new THREE.Mesh(hg, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, normalMap: grainNormal(256, 1.5, 73), normalScale: new THREE.Vector2(0.5, 0.5) })));
    hills.receiveShadow = true;
    g.add(hills);

    // Porcelain-white wind turbines on the ridges.
    const tg = turbineGeometries();
    const spots = [[-15, -30], [-5, -40], [7, -27], [17, -44], [27, -31], [-27, -46], [38, -48]];
    this.turbines = spots.map(([x, z], i) => ({ x, z, y: hgt(x, z), phase: rand() * TAU, speed: 0.75 + rand() * 0.3, s: 0.95 + rand() * 0.15 }));
    const n = this.turbines.length;
    this.towerIM = new THREE.InstancedMesh(tg.tower, M.porcelain, n);
    this.nacIM = new THREE.InstancedMesh(tg.nacelle, M.porcelain, n);
    this.rotorIM = new THREE.InstancedMesh(tg.rotor, M.porcelain, n);
    this.yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.35);
    this.turbines.forEach((t, i) => {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.y - 0.05, t.z), this.yaw, new THREE.Vector3(t.s, t.s, t.s));
      this.towerIM.setMatrixAt(i, m);
      this.nacIM.setMatrixAt(i, m);
    });
    [this.towerIM, this.nacIM, this.rotorIM].forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    });

    // Solar field: three tables of glass-faced panels on low racks.
    const solarTex = solarTexture();
    const glassMat = keep(new THREE.MeshPhysicalMaterial({ map: solarTex, roughness: 0.16, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.3 }));
    const PW = 1.0, PL = 1.66;
    const panelGeo = new THREE.PlaneGeometry(PW, PL);
    panelGeo.rotateX(-Math.PI / 2);
    panelGeo.translate(0, 0.026, 0);
    const frameGeo = roundedBox(PW + 0.04, 0.045, PL + 0.04, 0.01, 1);
    this.panels = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) this.panels.push({ x: 1.2 + c * 1.12, z: -2.4 - r * 3.1, i: this.panels.length, r, c });
    this.panelIM = new THREE.InstancedMesh(panelGeo, glassMat, this.panels.length);
    this.frameIM = new THREE.InstancedMesh(frameGeo, M.aluminum, this.panels.length);
    const legGeo = new THREE.BoxGeometry(0.06, 1, 0.06);
    legGeo.translate(0, 0.5, 0);
    this.legIM = new THREE.InstancedMesh(legGeo, M.steel, this.panels.length * 2);
    [this.panelIM, this.frameIM, this.legIM].forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    });

    // A clean, sawtooth-roofed factory between the panels and the turbines.
    const fac = new THREE.Group();
    fac.position.set(-1.5, 0, -15);
    const wall = keep(new THREE.MeshStandardMaterial({ color: 0xe9e6e0, roughness: 0.7 }));
    const glass = keep(new THREE.MeshStandardMaterial({ color: 0x1d2530, roughness: 0.15, metalness: 0.3, emissive: 0xffc890, emissiveIntensity: 0.16 }));
    const hall = new THREE.Mesh(roundedBox(11, 3.0, 6.4, 0.06, 2), wall);
    hall.position.y = 1.5;
    fac.add(hall);
    const band = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 0.7), glass);
    band.position.set(0, 1.7, 3.21);
    fac.add(band);
    const tooth = new THREE.Shape();
    tooth.moveTo(0, 0);
    tooth.lineTo(1.6, 0);
    tooth.lineTo(0, 1.05);
    tooth.closePath();
    const toothGeo = new THREE.ExtrudeGeometry(tooth, { depth: 10.8, bevelEnabled: false });
    toothGeo.rotateY(-Math.PI / 2);
    toothGeo.translate(5.4, 0, 0);
    for (let k = 0; k < 4; k++) {
      const t = new THREE.Mesh(toothGeo, wall);
      t.position.set(0, 3.0, -3.2 + k * 1.6);
      t.castShadow = t.receiveShadow = true;
      fac.add(t);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 0.95), glass);
      gl.position.set(0, 3.0 + 0.5, -3.2 + k * 1.6 - 0.01);
      gl.rotation.y = Math.PI;
      fac.add(gl);
    }
    hall.castShadow = hall.receiveShadow = true;
    g.add(fac);
    this.factory = fac;

    // Rounded trees for scale.
    const treeGeo = new THREE.IcosahedronGeometry(1, 1);
    const treeIM = new THREE.InstancedMesh(treeGeo, keep(new THREE.MeshStandardMaterial({ color: 0x2d4a24, roughness: 0.9, flatShading: true })), 34);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < 34; i++) {
      const x = -24 + rand() * 30, z = -9 - rand() * 18;
      if (Math.abs(x + 1.5) < 7 && Math.abs(z + 15) < 4.5) {
        i--;
        continue;
      }
      const s = 0.7 + rand() * 0.8;
      sc.set(s, s * (1.1 + rand() * 0.5), s);
      p.set(x, hgt(x, z) + sc.y * 0.8, z);
      q.setFromEuler(new THREE.Euler(0, rand() * TAU, 0));
      treeIM.setMatrixAt(i, m4.compose(p, q, sc));
    }
    treeIM.castShadow = treeIM.receiveShadow = true;
    g.add(treeIM);

    this.label({ text: '国内製造拠点 再エネ100%', sub: '2023年から', anchor: () => fac.localToWorld(new THREE.Vector3(2.5, 4.2, 0)), offset: [40, -44], when: () => this.step === 4 && this.stepTime > 2.0 });
    return g;
  }

  /* ======================================================================= camera */
  poses() {
    const T = (x, y, z) => trackPos(0, 0, 0, new THREE.Vector3(x, y, z)).multiplyScalar(1); // eslint-friendly no-op
    void T;
    const tk = (x, y, z) => [ST.track + x * TRK.scale, y * TRK.scale, z * TRK.scale];
    return [
      { pos: [ST.stele + 1.1, 1.85, 7.6], target: [ST.stele + 0.2, 1.22, 0], fov: 30, dur: 2.2 },
      { pos: [ST.table + 2.5, 4.5, 4.7], target: [ST.table + 0.15, 0.5, 0.05], fov: 32, dur: 2.6 },
      { pos: tk(6.1, 0.62, 9.5), target: tk(1.5, 0.2, -14), fov: 38, dur: 3.0 },
      { pos: [ST.pitch + 0.12, 0.42, 1.55], target: [ST.pitch + 1.6, 1.0, -20], fov: 30, dur: 3.0 },
      { pos: [ST.eco + 9.5, 7.0, 15.5], target: [ST.eco + 4.5, 1.6, -9], fov: 32, dur: 3.0 },
    ];
  }

  onStep(step, instant) {
    if (instant) {
      // Snap lighting/sky to the step so a direct jump starts settled.
      this.applyLook(LOOKS[step], 1);
      this.keyPos.copy(this.keyGoal(step).pos);
      this.keyAim.copy(this.keyGoal(step).aim);
    }
    this.glide = false;
    if (this.sun.shadow) {
      const s = step === 4 ? 26 : 7;
      const c = this.sun.shadow.camera;
      c.left = -s;
      c.right = s;
      c.top = s;
      c.bottom = -s;
      c.near = 1;
      c.far = 160;
      c.updateProjectionMatrix();
    }
    this.scene.environment = step >= 3 ? this.envMaps.dawn : this.envMaps.studio;
  }

  keyGoal(step) {
    const t = this.time;
    if (step === 0) {
      const sx = Math.sin(t * 0.42) * 1.15;
      return { pos: new THREE.Vector3(ST.stele + sx - 2.2, 5.6, 3.6), aim: new THREE.Vector3(ST.stele + sx * 1.05, 1.3, 0) };
    }
    if (step === 1) return { pos: new THREE.Vector3(ST.table + 0.4, 6.4, 0.8), aim: new THREE.Vector3(ST.table, 0.3, 0) };
    // Track floodlight from the far side of the bend.
    return { pos: new THREE.Vector3(ST.track + 6, 9, 4), aim: new THREE.Vector3(ST.track - 0.5, 0, -4) };
  }

  applyLook(L, k) {
    const s = this.lit;
    const mixN = (key, v) => (s[key] = lerp(s[key], v, k));
    const mixC = (key, hex) => s[key].lerp(new THREE.Color(hex), k);
    mixN('keyI', L.keyI);
    mixN('sunI', L.sunI);
    mixN('hemiI', L.hemiI);
    mixN('rimI', L.rimI);
    mixN('envI', L.envI);
    mixN('fog', L.fog);
    mixN('exp', L.exp);
    mixC('hemiSky', L.hemiSky);
    mixC('hemiGround', L.hemiGround);
    mixC('rimC', L.rimC);
    mixC('fogC', L.fogC);
    if (L.sunC) mixC('sunC', L.sunC);
    mixN('skyO', L.sky);
    if (L.sky) {
      mixC('zenith', L.zenith);
      mixC('mid', L.mid);
      mixC('horizon', L.horizon);
      mixC('glow', L.glow);
      mixC('cloudLit', L.cloudLit);
      mixN('glowPow', L.glowPow);
      mixN('disk', L.disk);
      mixN('cloud', L.cloud);
      s.sun.lerp(new THREE.Vector3(...L.sun).normalize(), k).normalize();
    }
  }

  tick(dt, t) {
    const st = this.stepTime;
    const step = this.step;

    /* --- station presence and visibility ----------------------------------- */
    for (let i = 0; i < 5; i++) this.to(`p${i}`, step === i ? 1 : 0);
    const pres = [0, 1, 2, 3, 4].map((i) => this.param(`p${i}`));
    this.groups.forEach((g, i) => (g.visible = pres[i] > 0.003 || step === i));
    this.indoor.visible = pres[0] + pres[1] > 0.003 || step < 2;

    /* --- light, sky and atmosphere blend toward the step's look ------------- */
    this.applyLook(LOOKS[step], 1 - Math.exp(-2.4 * dt));
    const s = this.lit;
    this.key.intensity = s.keyI;
    this.sun.intensity = s.sunI;
    this.sun.color.copy(s.sunC);
    this.hemi.intensity = s.hemiI;
    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    this.rim.intensity = s.rimI;
    this.rim.color.copy(s.rimC);
    this.scene.environmentIntensity = s.envI;
    this.scene.fog.density = s.fog;
    this.scene.fog.color.copy(s.fogC);
    this.exposure = s.exp;
    const su = this.sky.material.uniforms;
    su.uOpacity.value = clamp01(s.skyO);
    su.uZenith.value.copy(s.zenith);
    su.uMid.value.copy(s.mid);
    su.uHorizon.value.copy(s.horizon);
    su.uGlow.value.copy(s.glow);
    su.uCloudLit.value.copy(s.cloudLit);
    su.uGlowPow.value = s.glowPow;
    su.uDisk.value = s.disk;
    su.uCloud.value = s.cloud;
    su.uSunDir.value.copy(s.sun);
    this.sky.visible = s.skyO > 0.002;
    this.sky.position.copy(this.camera.position);

    // Key spot glides between stations; only the active shadow map updates.
    const kg = this.keyGoal(Math.min(step, 2));
    const kk = 1 - Math.exp(-(step === 0 ? 6 : 2.2) * dt);
    this.keyPos.lerp(kg.pos, kk);
    this.keyAim.lerp(kg.aim, kk);
    this.key.position.copy(this.keyPos);
    this.key.target.position.copy(this.keyAim);
    this.key.angle = step === 0 ? 0.34 : step === 1 ? 0.42 : 0.5;
    // A shadow map that was never rendered leaves its sampler2DShadow bound to a
    // plain colour texture and WebGL rejects every shadow-receiving draw, so
    // render each map once before letting it freeze.
    for (const [light, on] of [[this.key, s.keyI > 0.5], [this.sun, s.sunI > 0.02]]) {
      if (!light.castShadow) continue;
      light.shadow.autoUpdate = on;
      if (!on && !light.shadow.map) light.shadow.needsUpdate = true;
    }
    const rimBase = [ST.stele, ST.table, ST.track][Math.min(step, 2)];
    this.rim.position.set(rimBase + 3, 3.5, -6);
    this.rim.target.position.set(rimBase, 0.8, 0);
    const sunBase = step >= 4 ? new THREE.Vector3(ST.eco + 6, 0, -12) : new THREE.Vector3(ST.pitch + 0.5, 0, -0.8);
    this.sun.target.position.copy(sunBase);
    this.sun.position.copy(sunBase).addScaledVector(s.sun, 80);

    /* --- 0: steles — the beam sweeps across the engravings ------------------ */
    if (this.groups[0].visible) {
      const on = step === 0 ? smoothstep(0.2, 1.4, st) : 0;
      this.to('beam', on);
      const beam = this.param('beam');
      this.key.intensity = s.keyI * (step === 0 ? 0.25 + 0.75 * beam : 1);
      const dir = this.keyAim.clone().sub(this.keyPos);
      const len = dir.length();
      this.shaft.position.copy(this.keyPos).sub(this.groups[0].position);
      this.shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
      this.shaft.scale.set(1, len / 7.4, 1);
      this.shaft.material.uniforms.uOpacity.value = 0.055 * beam * pres[0];
    }

    /* --- 1: round table — chairs settle in, gears turn --------------------- */
    if (this.groups[1].visible) {
      this.tableRig.rotation.y = t * 0.045;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < this.nChairs; i++) {
        const phi = (i / this.nChairs) * TAU + TAU / 16;
        const k = step === 1 ? easeOutCubic(clamp01((st - 0.5 - i * 0.12) / 0.9)) : step > 1 ? 1 : 0;
        const r = 1.36 + 0.42 * (1 - k);
        p.set(Math.cos(phi) * r, 0, Math.sin(phi) * r);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 - phi);
        m4.compose(p, q, one);
        this.chairW.setMatrixAt(i, m4);
        this.chairF.setMatrixAt(i, m4);
      }
      this.chairW.instanceMatrix.needsUpdate = true;
      this.chairF.instanceMatrix.needsUpdate = true;
      this.to('gears', step === 1 ? smoothstep(1.4, 2.4, st) : 0);
      this.gearAngle = (this.gearAngle || 0) + dt * 0.45 * this.param('gears');
      for (const gr of this.gears) gr.mesh.rotation.y = gr.base + gr.dir * this.gearAngle;
    }

    /* --- 2: athletics track — LED board and a low glide along lane 5 -------- */
    if (this.groups[2].visible) {
      this.to('board', step === 2 ? smoothstep(0.4, 1.6, st) : 0);
      const b = this.param('board');
      this.boardMat.uniforms.uTime.value = t;
      this.boardMat.uniforms.uI.value = 1.5 * b;
      this.trackU.uTime.value = t;
      this.trackU.uSpill.value = 0.6 * b;
      this.flashMat.uniforms.uTime.value = t;
      this.flashMat.uniforms.uO.value = 0.9 * b;
      this.flashMat.uniforms.uScale.value = this.app.height / 390;
      if (step === 2 && st > 3.0 && !this.glide) {
        this.glide = true;
        const tk = (x, y, z) => [ST.track + x * TRK.scale, y * TRK.scale, z * TRK.scale];
        this.rig.go({ pos: tk(6.0, 0.6, 3.5), target: tk(1.2, 0.2, -18), fov: 38 }, 9, easeInOutCubic);
      }
    }

    /* --- 3: pitch at sunset ------------------------------------------------- */
    if (this.groups[3].visible) {
      const p3 = pres[3];
      for (const m of this.decor) {
        if (m.uniforms) m.uniforms.uOpacity.value = p3;
        else m.opacity = p3;
        m.depthWrite = p3 > 0.98;
      }
      this.seaMat.uniforms.uTime.value = t;
      this.seaMat.uniforms.uSunDir.value.copy(s.sun);
      this.seaMat.uniforms.uHorizon.value.copy(s.horizon);
      for (const m of this.ridgeMats) m.uniforms.uHaze.value.copy(s.horizon);
      this.to('town', step === 3 ? smoothstep(1.5, 4.0, st) : 0);
      this.townMat.uniforms.uTime.value = t;
      this.townMat.uniforms.uO.value = this.param('town') * p3;
      // Flag ripples in the sea breeze.
      const pa = this.flagGeo.attributes.position, base = this.flagBase;
      for (let i = 0; i < pa.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        const w = x / 0.42;
        pa.setZ(i, Math.sin(x * 9 - t * 4.2 + y * 2) * 0.035 * w + Math.sin(x * 5 - t * 2.3) * 0.02 * w);
      }
      pa.needsUpdate = true;
      this.flagGeo.computeVertexNormals();
      // The ball rolls into the corner arc and settles.
      const roll = step === 3 ? easeOutCubic(clamp01((st - 0.3) / 2.2)) : step > 3 ? 1 : 0;
      const from = new THREE.Vector3(2.6, 0.11, -2.2), to = new THREE.Vector3(0.6, 0.11, -0.62);
      const pos = from.clone().lerp(to, roll);
      const travelled = from.distanceTo(to) * roll;
      this.ball.position.copy(pos);
      const axis = new THREE.Vector3(-(to.z - from.z), 0, to.x - from.x).normalize();
      this.ball.quaternion.setFromAxisAngle(axis, -travelled / 0.11).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.7, 0.1)));
      this.ballShadow.position.set(pos.x + 0.06, 0.003, pos.z + 0.08);
    }

    /* --- 4: clean-energy landscape ----------------------------------------- */
    if (this.groups[4].visible) {
      this.to('spin', step === 4 ? smoothstep(0.6, 2.6, st) : 0);
      this.to('tilt', step === 4 ? smoothstep(0.8, 3.0, st) : 0);
      const spin = this.param('spin');
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), roll = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
      this.turbines.forEach((tb, i) => {
        tb.phase += dt * tb.speed * (0.15 + 0.85 * spin);
        roll.setFromAxisAngle(new THREE.Vector3(0, 0, 1), tb.phase);
        q.copy(this.yaw).multiply(roll);
        p.set(0, 7.12 * tb.s, 0.42 * tb.s).applyQuaternion(this.yaw).add(new THREE.Vector3(tb.x, tb.y - 0.05, tb.z));
        sc.setScalar(tb.s);
        this.rotorIM.setMatrixAt(i, m4.compose(p, q, sc));
      });
      this.rotorIM.instanceMatrix.needsUpdate = true;
      const tilt = this.param('tilt');
      const one = new THREE.Vector3(1, 1, 1);
      const e = new THREE.Euler();
      this.panels.forEach((pn) => {
        const k = clamp01(tilt * 1.4 - pn.c * 0.04 - pn.r * 0.06);
        const ang = 0.08 + easeInOutCubic(k) * 0.42;
        const h = 0.55 + Math.sin(ang) * 0.83;
        e.set(ang, 0, 0);
        q.setFromEuler(e);
        p.set(pn.x, h, pn.z);
        m4.compose(p, q, one);
        this.panelIM.setMatrixAt(pn.i, m4);
        this.frameIM.setMatrixAt(pn.i, m4);
        // Front and back legs.
        const yF = h - Math.sin(ang) * 0.7, yB = h + Math.sin(ang) * 0.7;
        this.legIM.setMatrixAt(pn.i * 2, m4.compose(p.set(pn.x, 0, pn.z + Math.cos(ang) * 0.7), q.identity(), sc.set(1, yF, 1)));
        this.legIM.setMatrixAt(pn.i * 2 + 1, m4.compose(p.set(pn.x, 0, pn.z - Math.cos(ang) * 0.7), q.identity(), sc.set(1, yB, 1)));
      });
      this.panelIM.instanceMatrix.needsUpdate = true;
      this.frameIM.instanceMatrix.needsUpdate = true;
      this.legIM.instanceMatrix.needsUpdate = true;
    }
  }
}
