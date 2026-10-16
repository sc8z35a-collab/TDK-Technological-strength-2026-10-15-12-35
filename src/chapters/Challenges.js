// CH.16 Challenges — a calm analyst's desk. Two precision balances tip toward
// China (55% of sales, about 62% of production); a porcelain ring gives up its
// 19% copper wedge (one customer group, mainly batteries); three ribbons ride
// the market waves beside a tray of 29 business tiles, 9 of which dissolve
// away; and mineral specimens sit next to a case file and a gavel.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Chapter } from '../core/Chapter.js';
import { materials, roundedBox, withDissolve } from '../core/kit.js';
import { arcSegmentGeometry, arcMaterial } from '../core/charts.js';
import { pouchCell } from '../core/parts.js';
import { canvasTexture, grainNormal } from '../core/textures.js';
import { softShadow } from '../core/fx.js';
import { clamp01, easeOutCubic, easeInOutCubic, easeOutBack, smoothstep, mulberry32, damp } from '../core/math.js';
import { spot } from './common.js';

const S0 = new THREE.Vector3(0, 0, 0); // balances
const S1 = new THREE.Vector3(16, 0, 0); // customer ring
const S2 = new THREE.Vector3(32, 0, 0); // market ribbons + portfolio tray
const S3 = new THREE.Vector3(48, 0, 0); // specimens + legal file
const STATIONS = [S0, S1, S2, S3];
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

/** Resolves once a web-font face covering `text` is loaded (canvas can use it). */
function loadGlyphs(font, text, timeout = 5000) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve(false);
  return Promise.race([
    document.fonts.load(font, text).then((f) => f.length > 0, () => false),
    new Promise((r) => setTimeout(() => r(false), timeout)),
  ]);
}

/** Canvas texture that can be repainted (e.g. when a web font arrives). */
function paintedTexture(w, h, paint, { srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
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

/** Planar UVs (top view) in world units, so tiling textures keep their scale. */
function planarUV(geo, scale = 1) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * scale, p.getZ(i) * scale);
  uv.needsUpdate = true;
  return geo;
}

/** Thin cylinder spanning two points. */
function rodBetween(a, b, r, mat, seg = 8) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}

/** Same as rodBetween but baked into a geometry (for merging). */
function rodGeo(a, b, r, seg = 8) {
  const d = new THREE.Vector3().subVectors(b, a);
  const geo = new THREE.CylinderGeometry(r, r, d.length(), seg);
  const m4 = new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()), new THREE.Vector3(1, 1, 1));
  return geo.applyMatrix4(m4);
}

/** Geometry translated (and optionally rotated) in place, for merging. */
function placed(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  if (rx || ry || rz) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  return geo.translate(x, y, z);
}

/** Merge geometries (all indexed, or all converted to non-indexed). */
function mergeAll(list) {
  const mixed = list.some((g) => !g.index);
  return mergeGeometries(mixed ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list);
}

const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/* ------------------------------------------------------------------ balance */

// Calibration weight (unit radius): body, shoulder, neck and knob.
const weightGeometry = () =>
  lathe([[0.0001, 0], [0.94, 0], [1, 0.05], [1, 1.22], [0.95, 1.29], [0.64, 1.34], [0.47, 1.4], [0.44, 1.48], [0.55, 1.54], [0.6, 1.64], [0.55, 1.74], [0.36, 1.8], [0.0001, 1.81]], 48);
// Shallow pan with a rolled lip.
const panGeometry = () => lathe([[0.0001, 0], [0.22, 0], [0.285, 0.026], [0.31, 0.058], [0.302, 0.064], [0.278, 0.034], [0.214, 0.009], [0.0001, 0.009]], 64);

function beamGeometry(L) {
  const s = new THREE.Shape();
  s.moveTo(-L, -0.013);
  s.lineTo(-0.1, -0.028);
  s.quadraticCurveTo(0, -0.05, 0.1, -0.028);
  s.lineTo(L, -0.013);
  s.lineTo(L, 0.013);
  s.lineTo(0.1, 0.028);
  s.quadraticCurveTo(0, 0.056, -0.1, 0.028);
  s.lineTo(-L, 0.013);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.028, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2, curveSegments: 12 });
  geo.translate(0, 0, -0.014);
  geo.computeVertexNormals();
  return geo;
}

/** Engraved brass dial behind the pointer: ring sector centred on the pivot. */
function dialTexture() {
  return canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#b38f58');
      g.addColorStop(1, '#d6b47a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = w / 2; // canvas spans [-0.47, 0.47]
      ctx.strokeStyle = 'rgba(52,34,16,0.9)';
      for (let k = -6; k <= 6; k++) {
        const a = Math.PI / 2 + (k * 4 * Math.PI) / 180;
        const r0 = R * (0.885), r1 = R * (k % 3 === 0 ? 0.975 : 0.94);
        ctx.lineWidth = k === 0 ? 5 : 3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
    },
    { key: 'chDial' }
  );
}

/* ------------------------------------------------------------------ ribbons */

/** Ribbon with a thin rectangular section; positions are rewritten every frame. */
function ribbonGeometry(n) {
  const geo = new THREE.BufferGeometry();
  const verts = n * 8;
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
  const uv = new Float32Array(verts * 2);
  const idx = [];
  for (let f = 0; f < 4; f++) {
    const base = f * n * 2;
    for (let i = 0; i < n; i++) {
      uv.set([i / (n - 1), 0, i / (n - 1), 1], (base + i * 2) * 2);
      if (i < n - 1) {
        const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(1.2, 1, 0), 3.5);
  return geo;
}

function writeRibbon(geo, n, xs, ys, z, w, h, bank = 0) {
  const p = geo.attributes.position.array;
  const hw = w / 2, hh = h / 2;
  const cb = Math.cos(bank), sb = Math.sin(bank);
  // faces: top (front→back), back (top→bottom), bottom (back→front), front (bottom→top)
  const corners = [
    [[hh, hw], [hh, -hw]],
    [[hh, -hw], [-hh, -hw]],
    [[-hh, -hw], [-hh, hw]],
    [[-hh, hw], [hh, hw]],
  ];
  for (let f = 0; f < 4; f++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 2; j++) {
        const k = ((f * n + i) * 2 + j) * 3;
        const dy = corners[f][j][0], dz = corners[f][j][1];
        p[k] = xs[i];
        p[k + 1] = ys[i] + dy * cb - dz * sb;
        p[k + 2] = z + dy * sb + dz * cb;
      }
    }
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}

/* ------------------------------------------------------------------ specimens */

/** Displaced icosphere for rocks and metal lumps (flat facets optional). */
function lumpGeometry({ detail = 4, seed = 1, amp = 0.22, freq = 2.2, sx = 1, sy = 0.7, sz = 0.9 } = {}) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const p = geo.attributes.position;
  const rand = mulberry32(seed);
  const waves = Array.from({ length: 7 }, () => ({ d: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), f: freq * (0.6 + rand() * 1.6), ph: rand() * TAU, a: 0.4 + rand() * 0.6 }));
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let n = 0;
    for (const w of waves) n += Math.sin(v.dot(w.d) * w.f * 3 + w.ph) * w.a;
    const r = 1 + (n / waves.length) * amp * 2.2;
    p.setXYZ(i, v.x * r * sx, v.y * r * sy, v.z * r * sz);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Cobalt ore: dark host rock threaded with steel-blue metallic veins and a pinkish bloom. */
function cobaltOreMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x2b2c30, roughness: 0.86, metalness: 0.05, normalMap: grainNormal(256, 2.6, 93), normalScale: new THREE.Vector2(0.9, 0.9) });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOre;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOre = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vOre;
        float oh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float on(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(oh(i), oh(i + vec3(1, 0, 0)), f.x), mix(oh(i + vec3(0, 1, 0)), oh(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(oh(i + vec3(0, 0, 1)), oh(i + vec3(1, 0, 1)), f.x), mix(oh(i + vec3(0, 1, 1)), oh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }
        float oreVein() {
          vec3 q = vOre * 3.1;
          float n = on(q) * 0.6 + on(q * 2.3 + 4.1) * 0.3 + on(q * 5.1) * 0.1;
          return 1.0 - smoothstep(0.02, 0.07, abs(n - 0.5));
        }
        float oreBloom() { return smoothstep(0.66, 0.8, on(vOre * 5.3 + 9.0)); }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float vein = oreVein();
        float bloom = oreBloom() * (1.0 - vein);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.24, 0.32), bloom * 0.55);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.52, 0.6, 0.74), vein);`
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, vein);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 1.0, vein);');
  };
  m.customProgramCacheKey = () => 'ch-cobalt-v1';
  return m;
}

/* ------------------------------------------------------------------ chapter */

export class Challenges extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.env = 'studio';
    this.exposure = 1.0;
    this.shift = 0.2;
    this.look = { bloom: 0.1, threshold: 1.05, vignette: 0.4, saturation: 1.0, lift: new THREE.Vector3(0.002, 0.002, 0.003) };
    this.dofSteps = [0.006, 0.006, 0.006, 0.01];
  }

  build() {
    const M = materials();
    const q = this.app.quality.tier;
    const keep = (x) => this.tracker.track(x);
    this.addBackdrop({ top: '#131416', bottom: '#060607', glow: '#241e18', glowPos: [0.68, 0.58], glowSize: 0.58, glowStrength: 0.7 });
    this.addDust({ count: 260, radius: 30, height: 5, size: 0.04, opacity: 0.26, seed: 161, center: [24, 2, 0] });

    /* --- the desk ------------------------------------------------------------- */
    const deskMat = keep(new THREE.MeshPhysicalMaterial({ map: M.walnut.map, color: 0x6e4c35, roughness: 0.46, clearcoat: 0.32, clearcoatRoughness: 0.32 }));
    const desk = new THREE.Mesh(planarUV(roundedBox(66, 0.2, 7.4, 0.05, 3), 0.21), deskMat);
    desk.position.set(24, -0.1, 0);
    desk.receiveShadow = true;
    this.add(desk);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 80), keep(new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.9 })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.95;
    this.add(floor);

    /* --- lights ----------------------------------------------------------------- */
    this.key = spot(this.scene, { intensity: 120, pos: [-2.5, 7.5, 5.5], target: [0, 0.5, 0], angle: 0.5, penumbra: 0.85, decay: 1.3, shadow: q.shadows, shadowSize: q.shadowSize, far: 40 });
    this.fill = new THREE.DirectionalLight(0xdfe6ff, 0.35);
    this.rim = new THREE.DirectionalLight(0xcfdcff, 1.5);
    this.scene.add(this.fill, this.fill.target, this.rim, this.rim.target, new THREE.HemisphereLight(0xfff0e4, 0x0b0b0c, 0.14));
    this.focus = new THREE.Vector3();
    this.clk = [0, 0, 0, 0];

    this.copper = keep(new THREE.MeshPhysicalMaterial({ color: 0xc8845a, metalness: 1, roughness: 0.31, clearcoat: 0.5, clearcoatRoughness: 0.18, envMapIntensity: 1.3 }));
    this.graphite = keep(new THREE.MeshPhysicalMaterial({ color: 0x2b2d31, roughness: 0.42, metalness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.3 }));
    this.pale = keep(new THREE.MeshPhysicalMaterial({ color: 0xd6d2cb, roughness: 0.45, clearcoat: 0.35 }));
    this.lacquer = keep(new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.12 }));
    this.brass = keep(new THREE.MeshPhysicalMaterial({ color: 0xc9a46a, metalness: 1, roughness: 0.25, clearcoat: 0.45, clearcoatRoughness: 0.15 }));

    this.buildBalances(M, keep);
    this.buildRing(M, keep);
    this.buildWaves(M, keep);
    this.buildSpecimens(M, keep);

    // Engraved plates use Mincho glyphs that are not preloaded.
    const token = (this.buildToken = (this.buildToken || 0) + 1);
    loadGlyphs('600 40px "Shippori Mincho B1"', '売上高生産額').then(() => {
      if (this.buildToken === token && this.built) this.plates.forEach((t) => t.userData.repaint());
    });
  }

  /** Soft contact shadow (grounds objects on the low tier, adds occlusion elsewhere). */
  contact(parent, x, z, radius, { squash = 1, opacity = 0.4, ry = 0 } = {}) {
    const sh = softShadow({ radius, opacity, y: 0.002, squash });
    this.tracker.track(sh.material);
    this.tracker.track(sh.material.map);
    sh.position.x = x;
    sh.position.z = z;
    sh.rotation.z = ry;
    parent.add(sh);
    return sh;
  }

  /* ========================================================================= 0 */
  buildBalances(M, keep) {
    const g = new THREE.Group();
    g.position.copy(S0);
    this.add(g);
    this.stationGroups = [g];
    const weightGeo = weightGeometry();
    const panGeo = keep(panGeometry());
    const L = 0.82, H = 1.36, DROP = 0.62;
    const beamGeo = beamGeometry(L);
    const dial = dialTexture();
    const dialMat = keep(new THREE.MeshStandardMaterial({ map: dial, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide }));
    const mats = { copper: this.copper, brass: this.brass, porcelain: M.porcelain, steel: M.steel, graphite: this.graphite, pale: this.pale };
    this.plates = [];

    const make = ({ title, left, right, pos, ry, scale = 1 }) => {
      const b = new THREE.Group();
      b.position.copy(pos);
      b.rotation.y = ry;
      b.scale.setScalar(scale);
      g.add(b);
      // Base on four brass feet, with a brass name plate.
      const base = new THREE.Mesh(roundedBox(1.9, 0.12, 0.62, 0.03, 3), this.lacquer);
      base.position.y = 0.035 + 0.06;
      base.castShadow = base.receiveShadow = true;
      b.add(base);
      this.contact(b, 0, 0, 1.18, { squash: 0.45, opacity: 0.42 });
      const plateTex = keep(
        paintedTexture(512, 128, (ctx, w, h) => {
          const gr = ctx.createLinearGradient(0, 0, w, h);
          gr.addColorStop(0, '#a9874f');
          gr.addColorStop(1, '#d1ad72');
          ctx.fillStyle = gr;
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = 'rgba(52,34,16,0.8)';
          ctx.lineWidth = 4;
          ctx.strokeRect(8, 8, w - 16, h - 16);
          ctx.fillStyle = 'rgba(44,28,12,0.92)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '600 64px "Shippori Mincho B1", serif';
          ctx.fillText(title, w / 2, h / 2 + 3);
        })
      );
      this.plates.push(plateTex);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.09), keep(new THREE.MeshStandardMaterial({ map: plateTex, metalness: 0.9, roughness: 0.34 })));
      plate.position.set(0, 0.095, 0.3115);
      b.add(plate);
      // Feet, collar and column (brass) and the steel capital, merged per material.
      const brassParts = [
        ...[[-0.84, -0.24], [0.84, -0.24], [-0.84, 0.24], [0.84, 0.24]].map(([x, z]) => placed(new THREE.CylinderGeometry(0.045, 0.055, 0.035, 20), x, 0.0175, z)),
        placed(new THREE.CylinderGeometry(0.085, 0.11, 0.07, 32), 0, 0.19),
        placed(new THREE.CylinderGeometry(0.036, 0.046, H - 0.22, 24), 0, 0.155 + (H - 0.22) / 2),
      ];
      const stand = new THREE.Mesh(mergeAll(brassParts), this.brass);
      const cap = new THREE.Mesh(roundedBox(0.13, 0.05, 0.09, 0.012, 2), M.steel);
      cap.position.y = H - 0.045;
      [stand, cap].forEach((m) => {
        m.castShadow = m.receiveShadow = true;
        b.add(m);
      });
      // Engraved dial arc behind the pointer.
      const dialMesh = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.47, 32, 1, -Math.PI / 2 - 0.42, 0.84), dialMat);
      dialMesh.position.set(0, H, 0.052);
      b.add(dialMesh);
      // Beam with pointer.
      const beam = new THREE.Group();
      beam.position.y = H;
      b.add(beam);
      const bar = new THREE.Mesh(beamGeo, this.brass);
      bar.castShadow = true;
      beam.add(bar);
      const steelParts = new THREE.Mesh(
        mergeAll([
          placed(new THREE.SphereGeometry(0.022, 16, 12), -L),
          placed(new THREE.SphereGeometry(0.022, 16, 12), L),
          rodGeo(new THREE.Vector3(0, -0.02, 0.07), new THREE.Vector3(0, -0.455, 0.07), 0.005),
          placed(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 16), 0, 0, 0, Math.PI / 2),
        ]),
        M.steel
      );
      steelParts.castShadow = true;
      beam.add(steelParts);
      // Hanging pans (stay upright while the beam tilts).
      const hangers = [-1, 1].map((side) => {
        const hg = new THREE.Group();
        b.add(hg);
        const link = new THREE.Mesh(mergeAll([placed(new THREE.TorusGeometry(0.022, 0.006, 8, 20), 0, -0.02), rodGeo(new THREE.Vector3(0, -0.04, 0), new THREE.Vector3(0, -0.13, 0), 0.006)]), M.steel);
        hg.add(link);
        const rods = [0, 1, 2].map((k) => {
          const a = Math.PI / 2 + (k * TAU) / 3;
          return rodGeo(new THREE.Vector3(0, -0.13, 0), new THREE.Vector3(Math.cos(a) * 0.285, -DROP + 0.06, Math.sin(a) * 0.285), 0.0038, 6);
        });
        const pan = new THREE.Mesh(mergeAll([...rods, placed(panGeo.clone(), 0, -DROP)]), this.brass);
        pan.castShadow = pan.receiveShadow = true;
        hg.add(pan);
        return { g: hg, side };
      });
      // Weights: radius follows the cube root of the share (volume ∝ value).
      const weights = [];
      const R55 = 0.13;
      const place = (list, side) => {
        const layout = list.length === 1 ? [[0, 0]] : [[-0.02, -0.07], [0.13, 0.09], [-0.12, 0.1], [0.15, -0.12]];
        list.forEach(([v, mat], i) => {
          const r = R55 * Math.cbrt(v / 55);
          const m = new THREE.Mesh(weightGeo, mats[mat]);
          m.scale.setScalar(r);
          m.castShadow = m.receiveShadow = true;
          hangers[side].g.add(m);
          weights.push({ m, x: layout[i][0], z: layout[i][1], y: -DROP + 0.009, delay: 0.55 + weights.length * 0.14 });
        });
      };
      place(left, 0);
      place(right, 1);
      const sum = (a) => a.reduce((s, [v]) => s + v, 0);
      const lw = sum(left), rw = sum(right);
      return { b, beam, hangers, weights, L, H, tilt: ((lw - rw) / (lw + rw)) * 1.15, theta: 0, vel: 0 };
    };
    this.balances = [
      make({ title: '売上高', left: [[55.0, 'copper']], right: [[24.6, 'brass'], [7.3, 'porcelain'], [7.2, 'steel'], [5.8, 'graphite']], pos: new THREE.Vector3(0.35, 0, 0.75), ry: -0.2, scale: 1.08 }),
      make({ title: '生産額', left: [[62, 'copper']], right: [[38, 'pale']], pos: new THREE.Vector3(1.95, 0, -1.5), ry: -0.28 }),
    ];

    const [A, B] = this.balances;
    const panTop = (bal, side, y = 0.3) => (out) => bal.hangers[side].g.localToWorld(out.set(0, -DROP + y, 0));
    this.label({ text: '中国 55.0%', sub: '売上高に占める割合', anchor: panTop(A, 0, 0.3), offset: [8, -104], when: () => this.step === 0 && this.stepTime > 2.0 });
    this.label({ text: 'その他の地域 45.0%', sub: 'アジア・日本・欧州・米州', anchor: panTop(A, 1, 0.16), offset: [34, 56], when: () => this.step === 0 && this.stepTime > 2.3 });
    this.label({ text: '中国 約62%', sub: '生産額に占める割合', anchor: panTop(B, 0, 0.32), offset: [26, -62], when: () => this.step === 0 && this.stepTime > 2.6 });
  }

  /* ========================================================================= 1 */
  buildRing(M, keep) {
    const g = new THREE.Group();
    g.position.copy(S1);
    this.add(g);
    this.stationGroups.push(g);
    const PH = 0.26;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.12, PH, 128), this.lacquer);
    ped.position.y = PH / 2;
    this.contact(g, 0, 0, 2.7, { opacity: 0.5 });
    ped.castShadow = ped.receiveShadow = true;
    g.add(ped);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.012, 8, 160), this.brass);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = PH;
    g.add(trim);
    // Percent ticks engraved around the pedestal (every 1%, longer every 10%).
    const tickGeo = new THREE.BoxGeometry(1, 1, 1);
    const ticks = new THREE.InstancedMesh(tickGeo, this.brass, 100);
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    this.mid = 0.92; // wedge slides out toward the front-right, cut faces visible
    const a0 = this.mid - 0.19 * Math.PI;
    for (let i = 0; i < 100; i++) {
      const a = a0 + (i / 100) * TAU;
      const long = i % 10 === 0;
      const len = long ? 0.12 : 0.055;
      p.set(Math.cos(a) * (1.86 + len / 2), PH + 0.002, Math.sin(a) * (1.86 + len / 2));
      qq.setFromAxisAngle(UP, -a);
      sc.set(len, 0.004, long ? 0.012 : 0.007);
      ticks.setMatrixAt(i, m4.compose(p, qq, sc));
    }
    g.add(ticks);

    const segGeo = arcSegmentGeometry({ segments: 128, bevel: 0.07 });
    keep(segGeo);
    const ring = (base, from, to) => {
      const mat = arcMaterial(base);
      keep(mat);
      keep(mat.arcDepth);
      const mesh = new THREE.Mesh(segGeo, mat);
      mesh.customDepthMaterial = mat.arcDepth;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const u = mat.arc;
      u.uA0.value = from;
      u.uA1.value = to;
      u.uR0.value = 0.95;
      u.uR1.value = 1.68;
      u.uH.value = 0.36;
      u.uY.value = PH;
      g.add(mesh);
      return mesh;
    };
    const gap = 0.012;
    this.others = ring(M.porcelain, this.mid + 0.19 * Math.PI + gap, this.mid + 0.19 * Math.PI + 0.81 * TAU - gap);
    this.wedge = ring(this.copper, this.mid - 0.19 * Math.PI + gap, this.mid + 0.19 * Math.PI - gap);
    // Mainly batteries: a small fanned stack of pouch cells resting on the wedge.
    this.cells = [0, 1, 2].map((i) => {
      const c = pouchCell({ w: 0.34, l: 0.5, t: 0.03, label: true, labelColor: 0x17191d });
      const a = this.mid + (i - 1) * 0.05;
      const yaw = -this.mid + Math.PI / 2 + (i - 1) * 0.16;
      c.position.set(Math.cos(a) * 1.31, PH + 0.36 + 0.017 + i * 0.034, Math.sin(a) * 1.31);
      c.rotation.y = yaw;
      c.traverse((o) => (o.castShadow = true));
      c.scale.setScalar(0.0001);
      this.wedge.add(c);
      return c;
    });

    this.label({ text: '1つの顧客グループ 19%', sub: '4,664億円（主に電池）', anchor: (out) => this.wedge.localToWorld(out.set(Math.cos(this.mid) * 1.62, PH + 0.38, Math.sin(this.mid) * 1.62)), offset: [36, 44], when: () => this.step === 1 && this.stepTime > 2.0 });
    this.label({ text: 'その他の顧客 81%', anchor: (out) => g.localToWorld(out.set(Math.cos(this.mid + Math.PI * 0.8) * 1.3, PH + 0.36, Math.sin(this.mid + Math.PI * 0.8) * 1.3)), offset: [40, -42], when: () => this.step === 1 && this.stepTime > 2.5 });
  }

  /* ========================================================================= 2 */
  buildWaves(M, keep) {
    const g = new THREE.Group();
    g.position.copy(S2);
    this.add(g);
    this.stationGroups.push(g);
    // Low plinth under the ribbon sculpture.
    const plinth = new THREE.Mesh(roundedBox(2.95, 0.22, 1.3, 0.03, 3), this.lacquer);
    plinth.position.set(1.2, 0.11, -0.6);
    this.contact(g, 1.2, -0.6, 1.9, { squash: 0.52, opacity: 0.45 });
    plinth.castShadow = plinth.receiveShadow = true;
    g.add(plinth);
    this.Y0 = 0.95;
    // Faint glass datum at the FY2026 level (index 100), with a brass edge.
    const glassMat = keep(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.28, metalness: 0, envMapIntensity: 0.3, depthWrite: false }));
    const glass = new THREE.Mesh(roundedBox(2.75, 0.01, 1.18, 0.004, 1), glassMat);
    glass.position.set(1.25, this.Y0, -0.6);
    glass.renderOrder = 3;
    g.add(glass);
    const edge = rodBetween(new THREE.Vector3(-0.12, this.Y0, -0.01), new THREE.Vector3(2.62, this.Y0, -0.01), 0.006, this.brass);
    g.add(edge);
    const steelMat = keep(new THREE.MeshPhysicalMaterial({ color: 0xd2d6dc, metalness: 0.9, roughness: 0.36, roughnessMap: M.steel.roughnessMap, envMapIntensity: 1.25 }));
    const RIB = [
      { name: 'AIサーバー', pct: 21, units: '260万台', mat: this.copper, z: -1.0, ph: 0.0 },
      { name: 'ニアラインHDD', pct: 7, units: '7,600万台', mat: steelMat, z: -0.6, ph: 1.7 },
      { name: 'スマホ生産', pct: -10, units: '11億1,200万台', mat: M.porcelain, z: -0.2, ph: 3.1 },
    ];
    const N = 110, LEN = 2.4;
    this.ribbons = RIB.map((r, i) => {
      const geo = ribbonGeometry(N);
      keep(geo);
      const mesh = new THREE.Mesh(geo, r.mat);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      g.add(mesh);
      const post = rodBetween(new THREE.Vector3(0.03, 0.22, r.z), new THREE.Vector3(0.03, this.Y0 - 0.008, r.z), 0.011, M.steel);
      post.castShadow = true;
      g.add(post);
      const xs = new Float32Array(N), ys = new Float32Array(N);
      for (let k = 0; k < N; k++) xs[k] = (k / (N - 1)) * LEN;
      return { ...r, geo, mesh, xs, ys, N, LEN, end: new THREE.Vector3(), i };
    });
    RIB.forEach((r, i) => {
      const rib = this.ribbons[i];
      this.label({
        text: `${r.name} ${r.pct > 0 ? '+' : '−'}${Math.abs(r.pct)}%`,
        sub: r.units,
        anchor: (out) => g.localToWorld(out.copy(rib.end)),
        offset: [[24, -14], [24, 4], [24, 26]][i],
        when: () => this.step === 2 && this.stepTime > 2.2 + i * 0.25,
      });
    });

    // Tray of the 29 focus businesses; 9 dissolve away (divested or closed).
    const tray = new THREE.Group();
    tray.position.set(2.5, 0, 0.87);
    tray.rotation.y = -0.15;
    g.add(tray);
    this.tray = tray;
    const COLS = 6, PITCH = 0.21, TW = 0.175, SIDE = PITCH * 7;
    const slotTex = canvasTexture(
      512,
      512,
      (ctx, w, h) => {
        ctx.fillStyle = '#1b1c1f';
        ctx.fillRect(0, 0, w, h);
        const cell = w / 7;
        for (let i = 0; i < 29; i++) {
          const x = ((i % COLS) + 1) * cell, y = (Math.floor(i / COLS) + 1.5) * cell;
          const s = cell * 0.9;
          ctx.fillStyle = '#0b0b0d';
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
          ctx.strokeStyle = 'rgba(205,175,125,0.22)';
          ctx.lineWidth = 2;
          ctx.strokeRect(x - s / 2, y - s / 2, s, s);
        }
      },
      { key: 'chSlots' }
    );
    const trayBody = new THREE.Mesh(roundedBox(SIDE + 0.06, 0.05, SIDE + 0.06, 0.025, 3), keep(new THREE.MeshPhysicalMaterial({ color: 0x1c1d20, roughness: 0.42, metalness: 0.6, clearcoat: 0.3 })));
    trayBody.position.y = 0.025;
    trayBody.castShadow = trayBody.receiveShadow = true;
    tray.add(trayBody);
    this.contact(tray, 0, 0, 1.1, { opacity: 0.4 });
    const slots = new THREE.Mesh(new THREE.PlaneGeometry(SIDE, SIDE), keep(new THREE.MeshStandardMaterial({ map: slotTex, roughness: 0.7, metalness: 0.2 })));
    slots.rotation.x = -Math.PI / 2;
    slots.position.y = 0.0505;
    slots.receiveShadow = true;
    tray.add(slots);
    const tileGeo = roundedBox(TW, 0.05, TW, 0.016, 3);
    keep(tileGeo);
    const GONE = [2, 7, 9, 13, 16, 20, 23, 25, 28];
    const keepIdx = [];
    for (let i = 0; i < 29; i++) if (!GONE.includes(i)) keepIdx.push(i);
    const cell = SIDE / 7;
    const slotPos = (i, out = new THREE.Vector3()) => out.set(-SIDE / 2 + ((i % COLS) + 1) * cell, 0.05 + 0.025, -SIDE / 2 + (Math.floor(i / COLS) + 1.5) * cell);
    this.tilesKept = new THREE.InstancedMesh(tileGeo, M.porcelain, keepIdx.length);
    this.tilesKept.castShadow = this.tilesKept.receiveShadow = true;
    tray.add(this.tilesKept);
    this.keptData = keepIdx.map((i, k) => ({ k, pos: slotPos(i), delay: 0.5 + i * 0.022 }));
    this.gone = GONE.map((i, j) => {
      const mat = withDissolve(M.porcelain, { edgeColor: 0x000000, edgeWidth: 0.04, scale: 14, intensity: 0 });
      mat.dissolve.uReveal.value = 1;
      keep(mat);
      const m = new THREE.Mesh(tileGeo, mat);
      m.castShadow = m.receiveShadow = true;
      slotPos(i, m.position);
      tray.add(m);
      return { m, mat, i, y: m.position.y, delay: 0.5 + i * 0.022, out: 2.6 + j * 0.16 };
    });
    this.label({ text: '重点29事業', sub: 'うち9事業を譲渡・終息', anchor: (out) => tray.localToWorld(out.set(-SIDE / 2, 0.08, 0)), offset: [-26, 0], when: () => this.step === 2 && this.stepTime > 3.4 });
  }

  /* ========================================================================= 3 */
  buildSpecimens(M, keep) {
    const g = new THREE.Group();
    g.position.copy(S3);
    this.add(g);
    this.stationGroups.push(g);
    // Leather desk pad with a stitched border.
    const leather = canvasTexture(
      1024,
      512,
      (ctx, w, h) => {
        const rand = mulberry32(7);
        ctx.fillStyle = '#2a1d16';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 16000; i++) {
          ctx.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${rand() * 0.16})` : `rgba(120,90,66,${rand() * 0.08})`;
          ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
        }
        ctx.strokeStyle = 'rgba(190,160,120,0.45)';
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = 2.5;
        ctx.strokeRect(22, 22, w - 44, h - 44);
      },
      { key: 'chLeather' }
    );
    const pad = new THREE.Mesh(roundedBox(3.9, 0.025, 2.35, 0.012, 2), keep(new THREE.MeshStandardMaterial({ map: leather, roughness: 0.62 })));
    pad.position.set(0.35, 0.0125, 0.25);
    pad.receiveShadow = true;
    g.add(pad);

    // Glass petri dishes.
    const dishGeo = lathe([[0.0001, 0], [0.43, 0], [0.44, 0.005], [0.44, 0.075], [0.434, 0.079], [0.427, 0.075], [0.427, 0.008], [0.0001, 0.008]], 64);
    keep(dishGeo);
    const dishGlass = keep(new THREE.MeshPhysicalMaterial({ color: 0xdfe9ec, transparent: true, opacity: 0.09, roughness: 0.05, metalness: 0, envMapIntensity: 0.55, depthWrite: false }));
    const dish = (x, z) => {
      this.contact(g, x, z, 0.62, { opacity: 0.35 });
      const d = new THREE.Mesh(dishGeo, dishGlass);
      d.position.set(x, 0.025, z);
      d.renderOrder = 3;
      g.add(d);
    };
    // Dysprosium: pale oxide powder heap plus a lump of the silvery metal.
    dish(-0.75, -0.15);
    const powderGeo = lumpGeometry({ detail: 5, seed: 4, amp: 0.05, freq: 3.2, sx: 0.27, sy: 0.1, sz: 0.24 });
    keep(powderGeo);
    const powder = new THREE.Mesh(powderGeo, keep(new THREE.MeshStandardMaterial({ color: 0xe6dfcf, roughness: 1, normalMap: grainNormal(256, 3.2, 97), normalScale: new THREE.Vector2(0.8, 0.8) })));
    powder.position.set(-0.83, 0.033, -0.2);
    powder.receiveShadow = powder.castShadow = true;
    g.add(powder);
    const dyGeo = lumpGeometry({ detail: 1, seed: 11, amp: 0.18, freq: 1.6, sx: 0.15, sy: 0.1, sz: 0.125 });
    keep(dyGeo);
    const dyMat = keep(new THREE.MeshPhysicalMaterial({ color: 0xd9d6cf, metalness: 1, roughness: 0.22, flatShading: true, clearcoat: 0.2 }));
    const dyMetal = new THREE.Mesh(dyGeo, dyMat);
    dyMetal.position.set(-0.55, 0.1, -0.03);
    dyMetal.rotation.set(0.3, 0.8, 0.1);
    dyMetal.castShadow = dyMetal.receiveShadow = true;
    g.add(dyMetal);
    // Cobalt ore.
    dish(0.2, 0.75);
    const oreGeo = lumpGeometry({ detail: 5, seed: 23, amp: 0.2, freq: 2.0, sx: 0.27, sy: 0.18, sz: 0.23 });
    keep(oreGeo);
    const ore = new THREE.Mesh(oreGeo, keep(cobaltOreMaterial()));
    ore.position.set(0.2, 0.2, 0.75);
    ore.rotation.set(0.2, 0.6, -0.15);
    ore.castShadow = ore.receiveShadow = true;
    g.add(ore);
    // Museum specimen cards.
    const card = (sym, num, x, z, ry) => {
      const tex = keep(
        paintedTexture(256, 160, (ctx, w, h) => {
          ctx.fillStyle = '#ece6d8';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = 'rgba(60,45,30,0.5)';
          ctx.lineWidth = 3;
          ctx.strokeRect(8, 8, w - 16, h - 16);
          ctx.fillStyle = '#2a2018';
          ctx.textBaseline = 'middle';
          ctx.font = '600 76px "IBM Plex Sans JP", sans-serif';
          ctx.fillText(sym, 30, h / 2 + 4);
          ctx.font = '500 30px "IBM Plex Mono", monospace';
          ctx.textAlign = 'right';
          ctx.fillText(num, w - 28, 44);
        })
      );
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1875), keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })));
      c.rotation.set(-Math.PI / 2 + 0.25, 0, 0);
      const holder = new THREE.Group();
      holder.position.set(x, 0.05, z);
      holder.rotation.y = ry;
      holder.add(c);
      g.add(holder);
    };
    card('Dy', '66', -0.7, 0.42, 0.12);
    card('Co', '27', -0.45, 0.95, 0.1);

    // Legal: a closed case file on a stack of papers, a gavel on its sound block.
    const stack = new THREE.Group();
    stack.position.set(1.35, 0.025, -0.45);
    stack.rotation.y = -0.3;
    g.add(stack);
    const paperMat = keep(new THREE.MeshStandardMaterial({ color: 0xebe5d6, roughness: 0.9 }));
    const rand = mulberry32(31);
    const sheet = new THREE.BoxGeometry(0.86, 0.006, 1.18);
    keep(sheet);
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(sheet, paperMat);
      s.position.set((rand() - 0.5) * 0.04, 0.003 + i * 0.0062, (rand() - 0.5) * 0.04);
      s.rotation.y = (rand() - 0.5) * 0.05;
      s.castShadow = s.receiveShadow = true;
      stack.add(s);
    }
    const folderMat = keep(new THREE.MeshPhysicalMaterial({ color: 0x1d2a3a, roughness: 0.55, clearcoat: 0.25, sheen: 0.3, sheenColor: new THREE.Color(0x8899aa) }));
    const folder = new THREE.Mesh(roundedBox(0.92, 0.03, 1.24, 0.012, 2), folderMat);
    folder.position.y = 0.072;
    folder.rotation.y = 0.03;
    folder.castShadow = folder.receiveShadow = true;
    stack.add(folder);
    const tab = new THREE.Mesh(roundedBox(0.2, 0.004, 0.08, 0.002, 1), paperMat);
    tab.position.set(0.3, 0.06, -0.64);
    stack.add(tab);
    const band = new THREE.Mesh(roundedBox(0.94, 0.034, 0.03, 0.01, 1), keep(new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.7 })));
    band.position.set(0, 0.073, 0.32);
    band.rotation.y = 0.03;
    stack.add(band);
    this.stack = stack;
    this.contact(stack, 0, 0, 0.82, { squash: 1.35, opacity: 0.45 });

    const walnut = keep(new THREE.MeshPhysicalMaterial({ map: M.walnut.map, color: 0x7a4c30, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
    const block = new THREE.Mesh(lathe([[0.0001, 0], [0.19, 0], [0.2, 0.01], [0.2, 0.05], [0.185, 0.065], [0.0001, 0.065]], 48), walnut);
    block.position.set(1.62, 0.025, 0.5);
    block.castShadow = block.receiveShadow = true;
    g.add(block);
    const gavel = new THREE.Group();
    const head = new THREE.Mesh(lathe([[0.0001, -0.2], [0.07, -0.2], [0.078, -0.19], [0.078, -0.15], [0.072, -0.14], [0.066, -0.07], [0.064, 0], [0.066, 0.07], [0.072, 0.14], [0.078, 0.15], [0.078, 0.19], [0.07, 0.2], [0.0001, 0.2]], 40), walnut);
    head.rotation.z = Math.PI / 2;
    gavel.add(head);
    for (const x of [-0.165, 0.165]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0795, 0.0795, 0.018, 40), this.brass);
      ring.rotation.z = Math.PI / 2;
      ring.position.x = x;
      gavel.add(ring);
    }
    const handle = new THREE.Mesh(lathe([[0.0001, 0], [0.021, 0], [0.024, 0.06], [0.018, 0.3], [0.022, 0.46], [0.026, 0.52], [0.0001, 0.53]], 24), walnut);
    handle.position.y = 0.05;
    gavel.add(handle);
    gavel.traverse((o) => (o.castShadow = true));
    // Lying on the pad beside its block, handle angled toward the viewer.
    gavel.rotation.order = 'YXZ';
    gavel.rotation.set(Math.PI / 2 + 0.09, 0.62, 0);
    gavel.position.set(1.25, 0.103, 0.75);
    g.add(gavel);
    this.gavel = gavel;

    const anchorAt = (x, y, z) => (out) => g.localToWorld(out.set(x, y, z));
    this.label({ text: 'ジスプロシウム', sub: '主産地：中国', anchor: anchorAt(-0.75, 0.12, -0.6), offset: [-8, -60], when: () => this.step === 3 && this.stepTime > 1.8 });
    this.label({ text: 'コバルト', sub: '主産地：コンゴ民主共和国', anchor: anchorAt(0.2, 0.1, 1.2), offset: [40, 32], when: () => this.step === 3 && this.stepTime > 2.2 });
    this.label({ text: '独占禁止法関連の集団訴訟', sub: '米国・カナダ（HDDサスペンション）', anchor: (out) => this.stack.localToWorld(out.set(0.4, 0.09, 0)), offset: [-10, -76], when: () => this.step === 3 && this.stepTime > 2.6 });
  }

  /* ========================================================================= camera */
  /** Narrower screens (16:9 desktop, tablets) pull the camera back so the right side is not cropped. */
  aspectFactor() {
    const a = this.app.width && this.app.height ? this.app.width / this.app.height : 2.16;
    return 1 + Math.max(0, Math.min(0.6, (2.1 - a) * 0.5));
  }

  poses() {
    const f = this.aspectFactor();
    const P = (pos, target, fov, dur) => ({ pos: target.map((t, i) => t + (pos[i] - t) * f), target, fov, dur });
    return [
      P([S0.x + 2.9, 2.25, 6.6], [S0.x + 0.7, 1.0, -0.3], 30, 2.2),
      P([S1.x + 2.8, 5.6, 7.6], [S1.x - 0.1, 0.3, 0.0], 30, 2.6),
      P([S2.x + 3.5, 4.1, 8.5], [S2.x + 1.65, 0.66, 0.1], 28, 2.6),
      P([S3.x + 2.0, 3.05, 5.2], [S3.x + 0.32, 0.2, 0.12], 29, 2.6),
    ];
  }

  resize(w, h) {
    super.resize(w, h);
    const f = this.aspectFactor();
    if (this.active && this._aspectF !== undefined && Math.abs(f - this._aspectF) > 0.01) this.rig.go(this.poses()[this.step], 0.8);
    this._aspectF = f;
  }

  onStep(step, instant) {
    this.focusGoal = STATIONS[step].x;
    if (instant) this.focus.x = this.focusGoal;
  }

  tick(dt, t) {
    const step = this.step;
    this.focus.x = damp(this.focus.x, this.focusGoal ?? 0, 1.6, dt);
    const fx = this.focus.x;
    this.key.position.set(fx - 2.6, 7.6, 5.6);
    this.key.target.position.set(fx + 0.6, 0.5, 0);
    this.fill.position.set(fx + 7, 3.5, 6);
    this.fill.target.position.set(fx, 0.6, 0);
    // Rim swings behind-left at the ring so the copper wedge catches a highlight.
    this.to('rimSide', step === 1 ? -1 : 1);
    const rs = this.param('rimSide');
    this.rim.position.set(fx + 3.5 * rs, 4.5, -7);
    this.rim.target.position.set(fx, 0.8, 0);
    // Only stations near the camera are drawn (all are off-frame from other poses).
    const cx = this.camera.position.x;
    this.stationGroups.forEach((g, i) => (g.visible = Math.abs(cx - (STATIONS[i].x + 1.5)) < 14 || i === step));
    const near = (s) => Math.abs(cx - (s.x + 1.5)) < 14;

    // Station clocks run while the story is at or past a station and rewind when
    // the reader goes back before it, so every reveal is continuous both ways.
    for (let i = 0; i < 4; i++) this.clk[i] = step >= i ? Math.min(40, this.clk[i] + dt) : Math.max(0, this.clk[i] - dt * 2.5);
    const [c0, c1, c2, c3] = this.clk;

    /* --- 0: weights land, the balances tip toward China ---------------------- */
    if (near(S0)) {
      for (const bal of this.balances) {
        let landed = 0;
        for (const w of bal.weights) {
          const k = easeOutCubic(clamp01((c0 - w.delay) / 0.75));
          w.m.position.set(w.x, w.y + (1 - k) * 0.5, w.z);
          w.m.visible = k > 0.001;
          landed += k;
        }
        const frac = landed / bal.weights.length;
        // Damped pendulum toward the imbalance angle.
        const target = bal.tilt * smoothstep(0.6, 1, frac);
        const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
          bal.vel += (18 * (target - bal.theta) - 2.4 * bal.vel) * h;
          bal.theta += bal.vel * h;
        }
        bal.beam.rotation.z = bal.theta;
        const c = Math.cos(bal.theta), s = Math.sin(bal.theta);
        bal.hangers[0].g.position.set(-bal.L * c, bal.H - bal.L * s, 0);
        bal.hangers[1].g.position.set(bal.L * c, bal.H + bal.L * s, 0);
        // Pans sway very slightly.
        bal.hangers.forEach((hg, i) => (hg.g.rotation.z = -bal.vel * 0.05 + Math.sin(t * 0.9 + i) * 0.004));
      }
    }

    /* --- 1: the 19% wedge slides out toward the viewer ---------------------- */
    if (near(S1)) {
      const k = easeInOutCubic(smoothstep(0.5, 2.0, c1));
      this.wedge.position.set(Math.cos(this.mid) * 0.82 * k, 0.3 * k, Math.sin(this.mid) * 0.82 * k);
      const ck = smoothstep(1.7, 2.6, c1);
      this.cells.forEach((c, i) => c.scale.setScalar(Math.max(0.0001, easeOutBack(clamp01(ck * 1.6 - i * 0.3)))));
    }

    /* --- 2: ribbons ride the market waves; 9 tiles dissolve ------------------- */
    if (near(S2)) {
      const gk = smoothstep(0.4, 2.0, c2);
      for (const r of this.ribbons) {
        const reach = Math.max(0.02, gk);
        for (let k = 0; k < r.N; k++) {
          const u = Math.min(k / (r.N - 1), reach);
          const e = smoothstep(0.1, 0.94, u) * gk;
          const wave = (Math.sin(u * 7.2 - t * 1.5 + r.ph) * 0.05 + Math.sin(u * 15.0 - t * 2.2 + r.ph * 2.0) * 0.012) * u;
          r.xs[k] = u * r.LEN;
          r.ys[k] = this.Y0 + e * r.pct * 0.035 + wave;
        }
        writeRibbon(r.geo, r.N, r.xs, r.ys, r.z, 0.3, 0.016, 0.32);
        r.end.set(r.xs[r.N - 1], r.ys[r.N - 1] + 0.03, r.z);
      }
      const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
      for (const d of this.keptData) {
        const k = easeOutCubic(clamp01((c2 - d.delay) / 0.6));
        p.copy(d.pos);
        p.y -= (1 - k) * 0.05;
        this.tilesKept.setMatrixAt(d.k, m4.compose(p, qq, one.setScalar(Math.max(0.0001, k))));
      }
      this.tilesKept.instanceMatrix.needsUpdate = true;
      for (const gt of this.gone) {
        const inK = easeOutCubic(clamp01((c2 - gt.delay) / 0.6));
        const reveal = 1 - smoothstep(gt.out, gt.out + 1.1, c2);
        gt.mat.dissolve.uReveal.value = reveal;
        gt.m.position.y = gt.y - (1 - reveal) * 0.035 - (1 - inK) * 0.05;
        gt.m.scale.setScalar(Math.max(0.0001, inK));
        gt.m.visible = reveal > 0.01 && inK > 0.001;
      }
    }

    /* --- 3: the gavel settles beside its block ----------------------------- */
    if (near(S3)) {
      const gk = easeInOutCubic(smoothstep(0.6, 1.8, c3));
      this.gavel.position.y = 0.103 + (1 - gk) * 0.12;
    }
  }
}
