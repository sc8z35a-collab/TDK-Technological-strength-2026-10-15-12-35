// Procedural textures (no image assets): ceramic grain, brushed metal,
// pouch-film wrinkles, radial anisotropy for HDD platters, and canvas helpers.
import * as THREE from 'three';
import { mulberry32 } from './math.js';

const cache = new Map();
let maxAniso = 4;
export function setMaxAnisotropy(v) {
  maxAniso = v;
}

function memo(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Tileable fBm value-noise field in [0,1]. */
export function fbmField(size, { octaves = 5, base = 8, seed = 1, gain = 0.5, stretchX = 1, ridged = false } = {}) {
  const rand = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const nx = Math.max(1, Math.round((base << o) / stretchX));
    const ny = base << o;
    const lat = new Float32Array(nx * ny);
    for (let i = 0; i < lat.length; i++) lat[i] = rand();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * ny;
      const y0 = Math.floor(fy);
      const ty = fade(fy - y0);
      const r0 = (y0 % ny) * nx;
      const r1 = ((y0 + 1) % ny) * nx;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * nx;
        const x0 = Math.floor(fx);
        const tx = fade(fx - x0);
        const c0 = x0 % nx;
        const c1 = (x0 + 1) % nx;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * tx;
        const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * tx;
        let v = a + (b - a) * ty;
        if (ridged) v = 1 - Math.abs(v * 2 - 1);
        out[y * size + x] += v * amp;
      }
    }
    norm += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function toDataTexture(data, size, { srgb = false, repeat = 1 } = {}) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = maxAniso;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Height field -> tangent-space normal map. */
export function normalFromHeight(h, size, strength = 2) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x];
      const d = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength;
      let ny = (d - u) * strength;
      let nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  return data;
}

function grayData(field, size, lo = 0, hi = 1) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round((lo + (hi - lo) * field[i]) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Sintered ceramic / ferrite grain: fine noise plus sparse pores. */
export function grainNormal(size = 512, strength = 3.2, seed = 7) {
  return memo(`grainN${size}${strength}${seed}`, () => {
    const f = fbmField(size, { octaves: 4, base: 64, seed, gain: 0.55 });
    const rand = mulberry32(seed + 11);
    const pores = Math.floor(size * size * 0.0025);
    for (let p = 0; p < pores; p++) {
      const cx = Math.floor(rand() * size), cy = Math.floor(rand() * size);
      const rad = 1 + rand() * 1.6;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const d = Math.hypot(dx, dy);
          if (d > rad) continue;
          const i = ((cy + dy + size) % size) * size + ((cx + dx + size) % size);
          f[i] -= 0.35 * (1 - d / rad);
        }
    }
    return toDataTexture(normalFromHeight(f, size, strength), size);
  });
}

export function grainRoughness(size = 512, lo = 0.45, hi = 0.75, seed = 3) {
  return memo(`grainR${size}${lo}${hi}${seed}`, () => {
    const f = fbmField(size, { octaves: 5, base: 16, seed, gain: 0.6 });
    return toDataTexture(grayData(f, size, lo, hi), size);
  });
}

/** Brushed metal: streaks along U. */
export function brushedNormal(size = 512, strength = 1.6, seed = 5) {
  return memo(`brushN${size}${strength}${seed}`, () => {
    const f = fbmField(size, { octaves: 5, base: 32, seed, gain: 0.6, stretchX: 24 });
    return toDataTexture(normalFromHeight(f, size, strength), size);
  });
}

export function brushedRoughness(size = 512, lo = 0.2, hi = 0.42, seed = 9) {
  return memo(`brushR${size}${lo}${hi}${seed}`, () => {
    const f = fbmField(size, { octaves: 5, base: 32, seed, gain: 0.55, stretchX: 24 });
    return toDataTexture(grayData(f, size, lo, hi), size);
  });
}

/** Soft wrinkles for aluminium-laminate battery pouches and films. */
export function wrinkleNormal(size = 512, strength = 1.2, seed = 21) {
  return memo(`wrinkle${size}${strength}${seed}`, () => {
    const f = fbmField(size, { octaves: 4, base: 4, seed, gain: 0.5, ridged: true });
    return toDataTexture(normalFromHeight(f, size, strength), size);
  });
}

/** Fine isotropic noise used as a generic roughness breakup. */
export function smudgeRoughness(size = 256, lo = 0.1, hi = 0.3, seed = 13) {
  return memo(`smudge${size}${lo}${hi}${seed}`, () => {
    const f = fbmField(size, { octaves: 4, base: 4, seed, gain: 0.6 });
    return toDataTexture(grayData(f, size, lo, hi), size);
  });
}

/**
 * Anisotropy direction map for a disc whose UVs are planar (CircleGeometry / cylinder cap):
 * the highlight stretches along concentric circles like a polished HDD platter.
 */
export function platterAnisotropy(size = 512) {
  return memo(`platter${size}`, () => {
    const data = new Uint8Array(size * size * 4);
    const rand = mulberry32(99);
    const ringNoise = new Float32Array(size);
    for (let i = 0; i < size; i++) ringNoise[i] = rand();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size - 0.5;
        const v = (y + 0.5) / size - 0.5;
        const r = Math.hypot(u, v) || 1e-6;
        // tangential direction
        const tx = -v / r;
        const ty = u / r;
        const ri = Math.min(size - 1, Math.floor(r * 2 * size));
        const strength = 0.75 + 0.25 * ringNoise[ri];
        const i = (y * size + x) * 4;
        data[i] = (tx * 0.5 + 0.5) * 255;
        data[i + 1] = (ty * 0.5 + 0.5) * 255;
        data[i + 2] = strength * 255;
        data[i + 3] = 255;
      }
    }
    const tex = toDataTexture(data, size);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}

/** Concentric micro-grooves in the roughness channel for the platter. */
export function platterRoughness(size = 512) {
  return memo(`platterR${size}`, () => {
    const data = new Uint8Array(size * size * 4);
    const rand = mulberry32(42);
    const ring = new Float32Array(size * 2);
    for (let i = 0; i < ring.length; i++) ring[i] = rand();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size - 0.5;
        const v = (y + 0.5) / size - 0.5;
        const r = Math.hypot(u, v);
        const ri = Math.min(ring.length - 1, Math.floor(r * 2 * ring.length));
        const val = 0.05 + 0.06 * ring[ri];
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = Math.round(val * 255);
        data[i + 3] = 255;
      }
    }
    const tex = toDataTexture(data, size);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}

/** Canvas-drawn texture helper. */
export function canvasTexture(w, h, draw, { srgb = true, repeat = [1, 1], key } = {}) {
  const make = () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    const tex = new THREE.CanvasTexture(c);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
    tex.anisotropy = maxAniso;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  };
  return key ? memo(key, make) : make();
}

/** Text label rendered to a texture (for engraved years, part numbers, etc.). */
export function textTexture(lines, {
  width = 512,
  height = 256,
  font = '500 64px "IBM Plex Mono", monospace',
  color = '#ece6da',
  bg = null,
  align = 'center',
  lineHeight = 1.15,
  key,
} = {}) {
  return canvasTexture(width, height, (ctx, w, h) => {
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const arr = Array.isArray(lines) ? lines : [lines];
    const fonts = Array.isArray(font) ? font : arr.map(() => font);
    const sizes = fonts.map((f) => parseFloat(f.match(/(\d+(?:\.\d+)?)px/)[1]));
    const total = sizes.reduce((a, s) => a + s * lineHeight, 0);
    let y = h / 2 - total / 2;
    arr.forEach((line, i) => {
      ctx.font = fonts[i];
      y += (sizes[i] * lineHeight) / 2;
      const x = align === 'center' ? w / 2 : align === 'left' ? w * 0.04 : w * 0.96;
      ctx.fillText(line, x, y);
      y += (sizes[i] * lineHeight) / 2;
    });
  }, { srgb: true, key });
}
