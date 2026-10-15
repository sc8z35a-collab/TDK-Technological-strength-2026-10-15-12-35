// Material presets and geometry builders shared by all chapters.
// Materials rely on scene.environment for reflections, so a single material
// instance can be reused by several chapter scenes.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  grainNormal,
  grainRoughness,
  brushedNormal,
  brushedRoughness,
  wrinkleNormal,
  smudgeRoughness,
  platterAnisotropy,
  platterRoughness,
  canvasTexture,
} from './textures.js';

let _mats = null;

export function materials() {
  if (_mats) return _mats;
  const M = {};
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const std = (o) => new THREE.MeshStandardMaterial(o);

  M.ferrite = phys({
    color: 0x2b2c30,
    roughness: 0.62,
    metalness: 0.12,
    roughnessMap: grainRoughness(512, 0.5, 0.78, 3),
    normalMap: grainNormal(512, 3.0, 7),
    normalScale: new THREE.Vector2(0.55, 0.55),
    clearcoat: 0.18,
    clearcoatRoughness: 0.45,
    envMapIntensity: 1.0,
  });
  M.ferriteGlow = M.ferrite.clone();
  M.ferriteGlow.emissive = new THREE.Color(0xff8a3c);
  M.ferriteGlow.emissiveIntensity = 0;

  M.copperWire = phys({
    color: 0xc0784c,
    metalness: 1,
    roughness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.25,
  });
  M.copper = std({ color: 0xc8845a, metalness: 1, roughness: 0.32, envMapIntensity: 1.1 });
  M.brass = std({ color: 0xc9a46a, metalness: 1, roughness: 0.28, envMapIntensity: 1.15 });
  M.gold = std({ color: 0xe0b45e, metalness: 1, roughness: 0.22, envMapIntensity: 1.2 });
  M.bronze = std({ color: 0x8c6a46, metalness: 1, roughness: 0.42, envMapIntensity: 1.0 });
  M.nickel = std({ color: 0xc9c6bf, metalness: 1, roughness: 0.34, envMapIntensity: 1.05 });
  M.tin = std({ color: 0xd8dadc, metalness: 1, roughness: 0.42, roughnessMap: smudgeRoughness(256, 0.3, 0.55), envMapIntensity: 1.0 });
  M.chrome = std({ color: 0xe8eaec, metalness: 1, roughness: 0.06, envMapIntensity: 1.3 });
  M.steel = phys({
    color: 0xc9cdd2,
    metalness: 1,
    roughness: 0.28,
    roughnessMap: brushedRoughness(512, 0.18, 0.36),
    normalMap: brushedNormal(512, 1.2),
    normalScale: new THREE.Vector2(0.25, 0.25),
    anisotropy: 0.6,
    envMapIntensity: 1.1,
  });
  M.aluminum = phys({
    color: 0xbfc4ca,
    metalness: 1,
    roughness: 0.34,
    roughnessMap: brushedRoughness(512, 0.24, 0.44, 17),
    normalMap: brushedNormal(512, 1.0, 19),
    normalScale: new THREE.Vector2(0.2, 0.2),
    anisotropy: 0.5,
    envMapIntensity: 1.0,
  });
  M.anodizedDark = phys({ color: 0x2a2d33, metalness: 0.9, roughness: 0.38, roughnessMap: brushedRoughness(512, 0.3, 0.46, 23), anisotropy: 0.3 });
  M.platter = phys({
    color: 0xdfe2e6,
    metalness: 1,
    roughness: 0.1,
    roughnessMap: platterRoughness(512),
    anisotropy: 0.92,
    anisotropyMap: platterAnisotropy(512),
    envMapIntensity: 1.25,
  });
  M.ceramicTan = phys({
    color: 0x8f6c4a,
    roughness: 0.6,
    metalness: 0,
    normalMap: grainNormal(512, 2.0, 31),
    normalScale: new THREE.Vector2(0.35, 0.35),
    sheen: 0.4,
    sheenColor: new THREE.Color(0xd8bf9c),
    sheenRoughness: 0.6,
  });
  M.ceramicIvory = phys({
    color: 0xe7e0d2,
    roughness: 0.55,
    metalness: 0,
    normalMap: grainNormal(512, 1.2, 37),
    normalScale: new THREE.Vector2(0.25, 0.25),
    clearcoat: 0.25,
    clearcoatRoughness: 0.5,
  });
  M.porcelain = phys({ color: 0xf1ede6, roughness: 0.32, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  M.matteWhite = std({ color: 0xe9e6e1, roughness: 0.82, metalness: 0 });
  M.epoxy = phys({ color: 0x17181b, roughness: 0.48, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4, normalMap: grainNormal(256, 0.8, 41), normalScale: new THREE.Vector2(0.15, 0.15) });
  M.epoxyGloss = phys({ color: 0x1c1410, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });
  M.silicon = phys({
    color: 0x2c3340,
    metalness: 0.65,
    roughness: 0.16,
    iridescence: 0.35,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [220, 520],
    envMapIntensity: 1.2,
  });
  M.siliconMatte = std({ color: 0x3a404b, metalness: 0.5, roughness: 0.42 });
  M.pcb = phys({ color: 0x14261f, roughness: 0.42, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.22 });
  M.pcbBlack = phys({ color: 0x121315, roughness: 0.4, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  M.kapton = phys({ color: 0xb8742a, roughness: 0.32, metalness: 0, transmission: 0, clearcoat: 0.8, clearcoatRoughness: 0.15, sheen: 0.2, sheenColor: new THREE.Color(0xffc070) });
  M.glass = phys({
    color: 0xffffff,
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.4,
    depthWrite: false,
  });
  M.glassTint = M.glass.clone();
  M.glassTint.color = new THREE.Color(0xbfd2e6);
  M.glassTint.opacity = 0.28;
  M.screen = phys({ color: 0x060708, roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3 });
  M.pouch = phys({
    color: 0xc6c8cb,
    metalness: 0.92,
    roughness: 0.3,
    normalMap: wrinkleNormal(512, 1.4),
    normalScale: new THREE.Vector2(0.45, 0.45),
    envMapIntensity: 1.1,
  });
  M.graphite = std({ color: 0x1d1e21, roughness: 0.78, metalness: 0.2, normalMap: grainNormal(256, 2.2, 51), normalScale: new THREE.Vector2(0.6, 0.6) });
  M.cathode = std({ color: 0x2a2c31, roughness: 0.62, metalness: 0.35, normalMap: grainNormal(256, 1.8, 53), normalScale: new THREE.Vector2(0.5, 0.5) });
  M.separator = phys({ color: 0xf2f0ea, roughness: 0.6, metalness: 0, transparent: true, opacity: 0.72, depthWrite: false, sheen: 0.4, sheenColor: new THREE.Color(0xffffff) });
  M.rubber = std({ color: 0x1b1c1e, roughness: 0.85, metalness: 0 });
  M.walnut = std({ color: 0x5a3a24, roughness: 0.48, metalness: 0, map: woodTexture() });
  M.fabric = std({ color: 0x8b7a62, roughness: 0.95, metalness: 0, map: fabricTexture() });
  M.magnet = phys({ color: 0xd4d6d9, metalness: 1, roughness: 0.18, clearcoat: 0.3, envMapIntensity: 1.2 });
  M.steelLam = std({ color: 0x7c828b, metalness: 0.9, roughness: 0.36, envMapIntensity: 1.0 });
  M.ink = std({ color: 0x0f1012, roughness: 0.7, metalness: 0 });
  _mats = M;
  return M;
}

function woodTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      const y = Math.random() * h;
      ctx.strokeStyle = `rgba(${40 + Math.random() * 30},${24 + Math.random() * 18},${12 + Math.random() * 10},${0.15 + Math.random() * 0.25})`;
      ctx.lineWidth = 0.5 + Math.random() * 2.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 3 + Math.sin(x * 0.005 + i * 0.3) * 8);
      ctx.stroke();
    }
  }, { key: 'wood' });
}

function fabricTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#857257';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = `rgba(0,0,0,${0.08 + (y % 4 === 0 ? 0.08 : 0)})`;
      ctx.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 2) {
      ctx.fillStyle = `rgba(255,240,210,${0.05 + (x % 4 === 0 ? 0.05 : 0)})`;
      ctx.fillRect(x, 0, 1, h);
    }
  }, { key: 'fabric', repeat: [6, 6] });
}

/* ---------------------------------------------------------------- geometry */

export function roundedBox(w, h, d, r = 0.05, seg = 4) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
}

/** Toroidal core with a rounded-rectangle cross-section (like a real ferrite ring). */
export function toroidCore({ inner = 0.55, outer = 1.0, height = 0.42, bevel = 0.06, radial = 160, profileSeg = 6 } = {}) {
  const pts = [];
  const r0 = inner, r1 = outer, h = height / 2, b = bevel;
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= profileSeg; i++) {
      const a = a0 + (i / profileSeg) * (Math.PI / 2);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * b, cy + Math.sin(a) * b));
    }
  };
  // Counter-clockwise profile in (r, y).
  corner(r1 - b, -h + b, -Math.PI / 2);
  corner(r1 - b, h - b, 0);
  corner(r0 + b, h - b, Math.PI / 2);
  corner(r0 + b, -h + b, Math.PI);
  pts.push(pts[0].clone());
  const geo = new THREE.LatheGeometry(pts, radial);
  geo.computeVertexNormals();
  return geo;
}

/** Helical winding around a toroid with a superelliptic cross-section path. */
export function toroidWinding({ inner = 0.55, outer = 1.0, height = 0.42, turns = 22, wire = 0.035, clearance = 0.02, samplesPerTurn = 40, n = 5 } = {}) {
  const R = (inner + outer) / 2;
  const a = (outer - inner) / 2 + clearance + wire;
  const b = height / 2 + clearance + wire;
  const pts = [];
  const total = turns * samplesPerTurn;
  for (let i = 0; i <= total; i++) {
    const t = i / total;
    const u = t * Math.PI * 2;
    const v = t * Math.PI * 2 * turns;
    const cv = Math.cos(v), sv = Math.sin(v);
    const x = a * Math.sign(cv) * Math.pow(Math.abs(cv), 2 / n);
    const y = b * Math.sign(sv) * Math.pow(Math.abs(sv), 2 / n);
    const rr = R + x;
    pts.push(new THREE.Vector3(Math.cos(u) * rr, y, Math.sin(u) * rr));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return new THREE.TubeGeometry(curve, total, wire, 10, false);
}

/** Extruded 2D shape helper (shape in XY, extruded along Z, centered). */
export function extrude(shape, depth, bevel = 0, bevelSeg = 2) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: bevelSeg,
    curveSegments: 24,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Flat text on a transparent plane, for in-scene engraving and labels. */
export function textPlane(lines, { width = 1, height = 0.25, px = 512, color = '#ece6da', font, align = 'center', opacity = 1, key } = {}) {
  const ratio = width / height;
  const cw = px, ch = Math.max(16, Math.round(px / ratio));
  const tex = canvasTexture(cw, ch, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const arr = Array.isArray(lines) ? lines : [lines];
    const fonts = Array.isArray(font) ? font : arr.map(() => font || `500 ${Math.round(h * 0.55)}px "IBM Plex Mono", monospace`);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const sizes = fonts.map((f) => parseFloat((f.match(/(\d+(?:\.\d+)?)px/) || [0, 24])[1]));
    const total = sizes.reduce((a, s) => a + s * 1.2, 0);
    let y = h / 2 - total / 2;
    arr.forEach((line, i) => {
      ctx.font = fonts[i];
      y += (sizes[i] * 1.2) / 2;
      const x = align === 'center' ? w / 2 : align === 'left' ? 4 : w - 4;
      ctx.fillText(line, x, y);
      y += (sizes[i] * 1.2) / 2;
    });
  }, { key });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  return mesh;
}

/** Standard studio light rig in addition to the environment map. */
export function studioLights(scene, { key = 2.2, rim = 1.6, fill = 0.25, keyColor = 0xfff2e2, rimColor = 0xdde7ff, shadows = false, shadowSize = 1024, target = [0, 0, 0] } = {}) {
  const group = new THREE.Group();
  const k = new THREE.DirectionalLight(keyColor, key);
  k.position.set(-4, 6, 5);
  k.target.position.set(...target);
  if (shadows) {
    k.castShadow = true;
    k.shadow.mapSize.set(shadowSize, shadowSize);
    k.shadow.camera.near = 0.5;
    k.shadow.camera.far = 30;
    const s = 5;
    k.shadow.camera.left = -s;
    k.shadow.camera.right = s;
    k.shadow.camera.top = s;
    k.shadow.camera.bottom = -s;
    k.shadow.bias = -0.0004;
    k.shadow.normalBias = 0.02;
    k.shadow.radius = 4;
  }
  const r = new THREE.DirectionalLight(rimColor, rim);
  r.position.set(5, 3, -6);
  r.target.position.set(...target);
  const f = new THREE.HemisphereLight(0xfaf2e8, 0x1a1c20, fill);
  group.add(k, k.target, r, r.target, f);
  scene.add(group);
  return { key: k, rim: r, fill: f, group };
}

/** Thin tube polyline (for traces, arcs, field lines). */
export function tubeFromPoints(points, radius = 0.01, radial = 6, closed = false, tension = 0.5) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', tension);
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 4), radius, radial, closed);
}

/** Collects disposable GPU resources for a chapter. */
export class Tracker {
  constructor() {
    this.items = new Set();
  }
  track(obj) {
    if (!obj) return obj;
    if (obj.isObject3D) {
      obj.traverse((o) => {
        if (o.geometry) this.items.add(o.geometry);
      });
    } else this.items.add(obj);
    return obj;
  }
  dispose() {
    this.items.forEach((i) => i.dispose?.());
    this.items.clear();
  }
}

/* ---------------------------------------------------------------- dissolve */

const DS_NOISE = /* glsl */ `
float dsHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dsNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dsHash(i), dsHash(i + vec3(1, 0, 0)), f.x), mix(dsHash(i + vec3(0, 1, 0)), dsHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(dsHash(i + vec3(0, 0, 1)), dsHash(i + vec3(1, 0, 1)), f.x), mix(dsHash(i + vec3(0, 1, 1)), dsHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float dsFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * dsNoise(p); p *= 2.03; a *= 0.5; } return s / 0.9375; }
`;

/**
 * Clone a standard/physical material and give it a noise-dissolve reveal with a
 * hot glowing edge. Drive `material.dissolve.uReveal.value` from 0 (hidden) to 1.
 * `dir` (vec3, local space) blends in a directional sweep (`sweep` 0..1).
 */
export function withDissolve(base, { edgeColor = 0xff9a50, edgeWidth = 0.07, scale = 3.0, intensity = 5, dir = [0, 1, 0], sweep = 0, span = 1 } = {}) {
  const m = base.clone();
  const u = {
    uReveal: { value: 0 },
    uEdgeColor: { value: new THREE.Color(edgeColor) },
    uEdgeWidth: { value: edgeWidth },
    uDsScale: { value: scale },
    uEdgeIntensity: { value: intensity },
    uDsDir: { value: new THREE.Vector4(dir[0], dir[1], dir[2], sweep) },
    uDsSpan: { value: span },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDsPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDsPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vDsPos;
uniform float uReveal, uEdgeWidth, uDsScale, uEdgeIntensity, uDsSpan;
uniform vec3 uEdgeColor;
uniform vec4 uDsDir;
${DS_NOISE}`
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
  float dsN = smoothstep(0.18, 0.82, dsFbm(vDsPos * uDsScale));
  float dsLin = clamp(dot(vDsPos, uDsDir.xyz) / uDsSpan * 0.5 + 0.5, 0.0, 1.0);
  dsN = mix(dsN, dsLin * 0.8 + dsN * 0.2, uDsDir.w);
  float dsT = uReveal * (1.0 + uEdgeWidth);
  if (dsN > dsT) discard;
  float dsEdge = 1.0 - smoothstep(0.0, uEdgeWidth, dsT - dsN);`
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uEdgeColor * dsEdge * uEdgeIntensity;');
  };
  m.customProgramCacheKey = () => 'dissolve-v1';
  m.dissolve = u;
  return m;
}
