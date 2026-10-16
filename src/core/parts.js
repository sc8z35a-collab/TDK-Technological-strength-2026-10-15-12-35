// Product-scale 3D models of electronic components, built procedurally.
// Units are arbitrary; each builder documents its nominal size. Geometries are
// cached by key so repeated parts share GPU buffers.
import * as THREE from 'three';
import { materials, roundedBox, extrude, roundedRectShape, tubeFromPoints } from './kit.js';
import { canvasTexture } from './textures.js';
import { mulberry32 } from './math.js';

const geoCache = new Map();
export function cachedGeo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

/* ------------------------------------------------------------ passive chips */

/** Multilayer ceramic chip capacitor. Length along X. Default ~1005 proportions. */
export function mlcc({ l = 1.0, w = 0.5, h = 0.5, band = 0.21, body = 'ceramicTan', term = 'tin', seg = 3 } = {}) {
  const M = materials();
  const g = new THREE.Group();
  const r = Math.min(w, h) * 0.09;
  const t = Math.min(w, h) * 0.035;
  g.add(mesh(cachedGeo(`mlccB${l}${w}${h}`, () => roundedBox(l - 0.01, h, w, r, seg)), M[body]));
  const tg = cachedGeo(`mlccT${l}${w}${h}${band}`, () => roundedBox(band * l, h + 2 * t, w + 2 * t, r * 1.6, seg));
  for (const s of [-1, 1]) g.add(mesh(tg, M[term], s * (l / 2 - (band * l) / 2 + t * 0.4), 0, 0));
  g.userData.size = [l, h + 2 * t, w + 2 * t];
  return g;
}

/** Multilayer chip inductor / ferrite bead: same form factor, darker body. */
export function chipInductor(opts = {}) {
  return mlcc({ body: 'ferrite', ...opts });
}

/** Wire-wound common-mode filter on a ferrite drum core (about 2.0 x 1.25 x 1.1). */
export function commonModeFilter({ turns = 9, topPlate = false } = {}) {
  const M = materials();
  const g = new THREE.Group();
  const L = 2.0, W = 1.25, H = 1.0;
  const fl = 0.36;
  const flange = cachedGeo('cmfFl', () => roundedBox(fl, H, W, 0.06, 3));
  g.add(mesh(flange, M.ferrite, -L / 2 + fl / 2, 0, 0));
  g.add(mesh(flange, M.ferrite, L / 2 - fl / 2, 0, 0));
  const coreLen = L - 2 * fl;
  const core = cachedGeo('cmfCore', () => roundedBox(coreLen + 0.02, 0.46, 0.62, 0.08, 3));
  g.add(mesh(core, M.ferrite, 0, 0.12, 0));
  // Bifilar winding: two interleaved helices around the rectangular core.
  const wind = (phase, key) =>
    cachedGeo(key, () => {
      const pts = [];
      const n = turns * 28;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = t * turns * Math.PI * 2 + phase;
        const x = -coreLen / 2 + 0.06 + t * (coreLen - 0.12);
        const cy = Math.cos(a), sz = Math.sin(a);
        const se = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
        pts.push(new THREE.Vector3(x, 0.12 + se(cy, 0.45) * 0.3, se(sz, 0.45) * 0.38));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, 0.035, 8, false);
    });
  g.add(mesh(wind(0, 'cmfW0'), M.copperWire));
  g.add(mesh(wind(Math.PI / turns, 'cmfW1'), M.copperWire));
  // Four terminals wrapped around the flange bottoms.
  const termG = cachedGeo('cmfTerm', () => roundedBox(fl + 0.04, 0.12, 0.36, 0.03, 2));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(mesh(termG, M.tin, sx * (L / 2 - fl / 2), -H / 2 + 0.04, sz * 0.36));
  if (topPlate) g.add(mesh(cachedGeo('cmfTop', () => roundedBox(L, 0.2, W, 0.05, 3)), M.ferrite, 0, H / 2 + 0.1, 0));
  g.userData.size = [L, H, W];
  return g;
}

/** SMD power inductor: drum core with visible winding and a square shield ring. */
export function powerInductor({ size = 1.2, shield = true } = {}) {
  const M = materials();
  const g = new THREE.Group();
  const s = size;
  const base = cachedGeo(`piB${s}`, () => roundedBox(s, s * 0.16, s, s * 0.05, 3));
  g.add(mesh(base, M.ferrite, 0, s * 0.08, 0));
  const drumG = cachedGeo(`piD${s}`, () => new THREE.CylinderGeometry(s * 0.24, s * 0.24, s * 0.5, 40));
  g.add(mesh(drumG, M.ferrite, 0, s * 0.4, 0));
  const top = cachedGeo(`piT${s}`, () => new THREE.CylinderGeometry(s * 0.42, s * 0.42, s * 0.1, 48));
  g.add(mesh(top, M.ferrite, 0, s * 0.68, 0));
  const coil = cachedGeo(`piC${s}`, () => {
    const pts = [];
    const turns = 7, n = turns * 32;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * s * 0.3, s * 0.2 + t * s * 0.4, Math.sin(a) * s * 0.3));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, s * 0.045, 8, false);
  });
  g.add(mesh(coil, M.copperWire));
  if (shield) {
    const ring = cachedGeo(`piS${s}`, () => {
      const shape = roundedRectShape(s, s, s * 0.08);
      const hole = new THREE.Path();
      hole.absarc(0, 0, s * 0.45, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const geo = extrude(shape, s * 0.5, s * 0.01, 2);
      geo.rotateX(Math.PI / 2);
      return geo;
    });
    g.add(mesh(ring, M.ferrite, 0, s * 0.42, 0));
  }
  const pad = cachedGeo(`piP${s}`, () => roundedBox(s * 0.28, s * 0.05, s * 0.6, s * 0.02, 2));
  for (const sx of [-1, 1]) g.add(mesh(pad, M.tin, sx * s * 0.36, s * 0.0, 0));
  g.userData.size = [s, s * 0.73, s];
  return g;
}

/* ------------------------------------------------------------ leaded parts */

function leads(spread = 0.25, length = 1.6, radius = 0.018, kink = true, key = 'lead') {
  return [-1, 1].map((s) =>
    cachedGeo(`${key}${s}${spread}${length}${radius}${kink}`, () => {
      const pts = [
        new THREE.Vector3(s * spread * 0.4, 0, 0),
        new THREE.Vector3(s * spread * 0.7, -0.12, 0),
        new THREE.Vector3(s * spread, -0.3, 0),
      ];
      if (kink) {
        pts.push(new THREE.Vector3(s * spread, -0.42, 0.04));
        pts.push(new THREE.Vector3(s * spread, -0.5, 0));
      }
      pts.push(new THREE.Vector3(s * spread, -length, 0));
      return tubeFromPoints(pts, radius, 8, false, 0.2);
    })
  );
}

/** Epoxy-dipped bead NTC thermistor with two leads. Bead ~0.36 across. */
export function ntcBead({ color = 0x1a2230 } = {}) {
  const M = materials();
  const g = new THREE.Group();
  const geo = cachedGeo('ntcBead', () => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const a = t * Math.PI;
      // Teardrop: round bottom, tapering top where the leads exit.
      const r = Math.sin(a) * 0.18 * (1 - 0.35 * Math.pow(t, 3));
      pts.push(new THREE.Vector2(Math.max(0.0001, r), -Math.cos(a) * 0.2 - t * t * 0.08));
    }
    const lg = new THREE.LatheGeometry(pts, 40);
    lg.computeVertexNormals();
    return lg;
  });
  const mat = M.epoxyGloss.clone();
  mat.color = new THREE.Color(color);
  const bead = mesh(geo, mat);
  bead.rotation.z = Math.PI;
  bead.position.y = 0.02;
  g.add(bead);
  for (const lg of leads(0.07, 1.4, 0.012, false, 'ntc')) g.add(mesh(lg, M.tin, 0, -0.14, 0));
  g.userData.material = mat;
  return g;
}

/** Disc component (varistor / PTC thermistor) with leads. Disc radius ~0.45. */
export function discComponent({ color = 0x2f557e, radius = 0.45, thickness = 0.13 } = {}) {
  const M = materials();
  const g = new THREE.Group();
  const geo = cachedGeo(`disc${radius}${thickness}`, () => {
    const pts = [];
    const r = radius, t = thickness / 2, b = t * 0.9;
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * Math.PI;
      pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, Math.sin(a) * t));
    }
    pts.unshift(new THREE.Vector2(0.0001, -t));
    pts.push(new THREE.Vector2(0.0001, t));
    const lg = new THREE.LatheGeometry(pts, 56);
    lg.rotateX(Math.PI / 2);
    lg.computeVertexNormals();
    return lg;
  });
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3, normalMap: M.ceramicIvory.normalMap, normalScale: new THREE.Vector2(0.12, 0.12) });
  g.add(mesh(geo, mat, 0, radius * 0.95, 0));
  for (const lg of leads(0.2, 1.5, 0.02, true, 'disc')) g.add(mesh(lg, M.tin, 0, 0.12, 0));
  g.userData.material = mat;
  return g;
}

/** Box-type film capacitor (plastic case, two tinned leads). */
export function filmCapacitor({ w = 1.1, h = 0.8, d = 0.5, color = 0x8d949b, text = ['MKP  1µF', '450V~'] } = {}) {
  const M = materials();
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.6 });
  g.add(mesh(cachedGeo(`film${w}${h}${d}`, () => roundedBox(w, h, d, 0.05, 4)), mat, 0, h / 2, 0));
  if (text) {
    const tex = canvasTexture(512, 256, (ctx, cw, ch) => {
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = 'rgba(245,245,240,0.9)';
      ctx.font = '500 64px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(text[0], cw / 2, ch * 0.42);
      ctx.font = '500 48px "IBM Plex Mono", monospace';
      ctx.fillText(text[1] || '', cw / 2, ch * 0.75);
    }, { key: `filmtxt${text.join('|')}` });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, w * 0.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 }));
    p.position.set(0, h * 0.55, d / 2 + 0.002);
    g.add(p);
  }
  for (const s of [-1, 1]) {
    const lg = mesh(cachedGeo('filmLead', () => new THREE.CylinderGeometry(0.025, 0.025, 0.5, 10)), M.tin, s * w * 0.36, -0.25, 0);
    g.add(lg);
  }
  g.userData.material = mat;
  return g;
}

/** Snap-in aluminium electrolytic capacitor. Radius 0.35, height ~1. */
export function electrolytic({ r = 0.35, h = 1.0, sleeve = 0x2b3a4e } = {}) {
  const M = materials();
  const g = new THREE.Group();
  const sleeveMat = new THREE.MeshPhysicalMaterial({ color: sleeve, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.18 });
  const body = cachedGeo(`ecap${r}${h}`, () => {
    const pts = [];
    const b = r * 0.08;
    pts.push(new THREE.Vector2(0.0001, 0));
    pts.push(new THREE.Vector2(r - b, 0));
    pts.push(new THREE.Vector2(r, b));
    pts.push(new THREE.Vector2(r, h * 0.93));
    // rolled groove near the top
    pts.push(new THREE.Vector2(r * 0.96, h * 0.945));
    pts.push(new THREE.Vector2(r, h * 0.96));
    pts.push(new THREE.Vector2(r, h - b));
    pts.push(new THREE.Vector2(r - b, h));
    pts.push(new THREE.Vector2(0.0001, h));
    const lg = new THREE.LatheGeometry(pts, 64);
    lg.computeVertexNormals();
    return lg;
  });
  g.add(mesh(body, sleeveMat));
  // Aluminium top disc with a pressure-relief vent.
  const top = mesh(cachedGeo(`ecapTop${r}`, () => new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.01, 64)), M.aluminum, 0, h + 0.002, 0);
  g.add(top);
  const vent = cachedGeo(`ecapVent${r}`, () => new THREE.BoxGeometry(r * 1.2, 0.012, 0.018));
  const v1 = mesh(vent, M.ink, 0, h + 0.006, 0);
  const v2 = mesh(vent, M.ink, 0, h + 0.006, 0);
  v2.rotation.y = Math.PI / 2;
  g.add(v1, v2);
  // Band marking (minus stripe).
  const stripe = mesh(cachedGeo(`ecapStripe${r}${h}`, () => new THREE.CylinderGeometry(r * 1.002, r * 1.002, h * 0.84, 24, 1, true, -0.35, 0.7)), new THREE.MeshPhysicalMaterial({ color: 0xc9ced6, roughness: 0.35, clearcoat: 0.8 }), 0, h * 0.5, 0);
  g.add(stripe);
  for (const s of [-1, 1]) g.add(mesh(cachedGeo('ecapPin', () => roundedBox(0.06, 0.32, 0.02, 0.008, 2)), M.tin, s * r * 0.45, -0.16, 0));
  g.userData.material = sleeveMat;
  return g;
}

/* ------------------------------------------------------------ magnets */

/** Arc segment magnet (motor magnet). */
export function arcMagnet({ inner = 0.8, outer = 1.0, angle = 0.8, length = 1.2, mat = 'ferrite' } = {}) {
  const M = materials();
  const geo = cachedGeo(`arc${inner}${outer}${angle}${length}`, () => {
    const s = new THREE.Shape();
    s.absarc(0, 0, outer, -angle / 2, angle / 2, false);
    s.absarc(0, 0, inner, angle / 2, -angle / 2, true);
    const geo = extrude(s, length, 0.015, 2);
    return geo;
  });
  return mesh(geo, M[mat]);
}

/* ------------------------------------------------------------ batteries */

/** Pouch lithium-ion cell. Footprint w x l (X x Z), thickness t. Tabs at +Z. */
export function pouchCell({ w = 0.62, l = 0.95, t = 0.05, label = false, labelColor = 0x15171b } = {}) {
  const M = materials();
  const g = new THREE.Group();
  const body = mesh(cachedGeo(`pouch${w}${l}${t}`, () => roundedBox(w, t, l, t * 0.48, 6)), M.pouch);
  g.add(body);
  // Heat-sealed edge along the tab side.
  const seal = mesh(cachedGeo(`pseal${w}${l}${t}`, () => roundedBox(w * 0.995, t * 0.12, 0.07, t * 0.05, 2)), M.pouch, 0, 0, l / 2 + 0.03);
  g.add(seal);
  // Tabs (aluminium +, nickel -) with sealant film.
  const tabG = cachedGeo('ptab', () => roundedBox(0.075, 0.004, 0.16, 0.0019, 2));
  const filmG = cachedGeo('pfilm', () => roundedBox(0.1, 0.012, 0.035, 0.005, 2));
  for (const [x, m] of [[-0.15, M.aluminum], [0.15, M.nickel]]) {
    g.add(mesh(tabG, m, x * (w / 0.62), 0, l / 2 + 0.11));
    g.add(mesh(filmG, M.ink, x * (w / 0.62), 0, l / 2 + 0.055));
  }
  const tape = mesh(cachedGeo(`ptape${w}`, () => roundedBox(w * 0.7, 0.006, 0.05, 0.002, 2)), M.kapton, 0, t * 0.5, l / 2 - 0.05);
  g.add(tape);
  if (label) {
    const lbl = mesh(cachedGeo(`plabel${w}${l}`, () => roundedBox(w * 0.96, 0.002, l * 0.82, 0.001, 1)), new THREE.MeshPhysicalMaterial({ color: labelColor, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35 }), 0, t / 2 + 0.001, -0.02);
    g.add(lbl);
  }
  return g;
}

/* ------------------------------------------------------------ packages */

/** LGA/QFN sensor package (e.g., MEMS IMU) with pin-1 dot. */
export function lgaPackage({ w = 0.6, d = 0.6, h = 0.18, color = 0x1d1f23, dot = true } = {}) {
  const M = materials();
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.62, clearcoat: 0.1, normalMap: M.epoxy.normalMap, normalScale: new THREE.Vector2(0.2, 0.2) });
  g.add(mesh(cachedGeo(`lga${w}${d}${h}`, () => roundedBox(w, h, d, 0.015, 2)), mat, 0, h / 2, 0));
  if (dot) {
    const dm = mesh(cachedGeo('lgaDot', () => new THREE.CylinderGeometry(0.03, 0.03, 0.002, 16)), new THREE.MeshStandardMaterial({ color: 0x9a9da3, roughness: 0.5 }), -w / 2 + 0.08, h + 0.001, -d / 2 + 0.08);
    g.add(dm);
  }
  // Pads peeking from the underside.
  const padG = cachedGeo(`lgaPad`, () => roundedBox(0.06, 0.012, 0.1, 0.004, 1));
  for (let i = 0; i < 4; i++)
    for (const s of [-1, 1]) {
      g.add(mesh(padG, M.gold, -w / 2 + 0.1 + (i * (w - 0.2)) / 3, 0.002, s * (d / 2 - 0.06)));
    }
  return g;
}

/* ------------------------------------------------------------ power */

/** DIN-rail industrial power supply (front face +Z). About 1 x 1.25 x 1.1. */
export function powerSupply({ w = 0.9, h = 1.25, d = 1.1 } = {}) {
  const M = materials();
  const g = new THREE.Group();
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xb8bdc3, metalness: 0.75, roughness: 0.42, roughnessMap: M.aluminum.roughnessMap, clearcoat: 0.15 });
  g.add(mesh(cachedGeo(`psu${w}${h}${d}`, () => roundedBox(w, h, d, 0.04, 4)), shell, 0, h / 2, 0));
  // Front panel with vents, terminal block and LED.
  const front = canvasTexture(512, 712, (ctx, cw, ch) => {
    ctx.fillStyle = '#2a2d31';
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#16181b';
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const px = 70 + x * 54, py = 180 + y * 42;
        ctx.beginPath();
        ctx.roundRect(px, py, 34, 14, 7);
        ctx.fill();
      }
    ctx.fillStyle = 'rgba(236,230,218,0.75)';
    ctx.font = '500 26px "IBM Plex Mono", monospace';
    ctx.fillText('DC OK', 330, 90);
    ctx.fillText('V.ADJ', 70, 90);
    ctx.font = '500 22px "IBM Plex Mono", monospace';
    ctx.fillText('+V  +V  -V  -V', 70, 560);
    ctx.fillText('L    N    ⏚', 70, 690);
  }, { key: 'psuFront', srgb: true });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, h * 0.92), new THREE.MeshPhysicalMaterial({ map: front, roughness: 0.55, metalness: 0.1, clearcoat: 0.2 }));
  panel.position.set(0, h / 2, d / 2 + 0.002);
  g.add(panel);
  const screwG = cachedGeo('psuScrew', () => new THREE.CylinderGeometry(0.035, 0.035, 0.03, 20));
  const blockG = cachedGeo('psuBlock', () => roundedBox(0.13, 0.12, 0.08, 0.02, 2));
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const x = -w * 0.3 + i * w * 0.2;
    g.add(mesh(blockG, blockMat, x, h * 0.16, d / 2 + 0.04));
    const s = mesh(screwG, M.nickel, x, h * 0.16, d / 2 + 0.085);
    s.rotation.x = Math.PI / 2;
    g.add(s);
  }
  const led = new THREE.Mesh(cachedGeo('psuLed', () => new THREE.SphereGeometry(0.022, 16, 10)), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.4, 0.55) }));
  led.position.set(w * 0.16, h * 0.86, d / 2 + 0.01);
  g.add(led);
  const pot = mesh(cachedGeo('psuPot', () => new THREE.CylinderGeometry(0.04, 0.04, 0.03, 20)), M.nickel, -w * 0.32, h * 0.86, d / 2 + 0.015);
  pot.rotation.x = Math.PI / 2;
  g.add(pot);
  return g;
}

/* ------------------------------------------------------------ boards */

/** Procedural PCB texture: solder mask, copper traces, pads, vias and silkscreen. */
export function pcbTexture({ size = 1024, seed = 1, mask = '#123026', copper = '#b98a4e', silk = 'rgba(236,232,220,0.75)', traces = 140, key } = {}) {
  return canvasTexture(size, size, (ctx, w, h) => {
    const rand = mulberry32(seed);
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, w, h);
    // Copper pour texture under the mask.
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(rand() * w, rand() * h, rand() * w * 0.4, rand() * h * 0.3);
    }
    ctx.globalAlpha = 1;
    // 45-degree routed traces.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < traces; i++) {
      let x = rand() * w, y = rand() * h;
      ctx.strokeStyle = `rgba(185,138,78,${0.22 + rand() * 0.18})`;
      ctx.lineWidth = 1.2 + rand() * 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const segs = 2 + Math.floor(rand() * 4);
      for (let s = 0; s < segs; s++) {
        const dir = Math.floor(rand() * 8);
        const len = 20 + rand() * 160;
        const dx = [1, 1, 0, -1, -1, -1, 0, 1][dir], dy = [0, 1, 1, 1, 0, -1, -1, -1][dir];
        x += dx * len;
        y += dy * len;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = copper;
      ctx.beginPath();
      ctx.arc(x, y, 3 + rand() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Pads (exposed copper with gold finish).
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = rand() < 0.7 ? '#c9a15f' : '#a8acb0';
      const pw = 6 + rand() * 14, ph = 6 + rand() * 10;
      ctx.fillRect(rand() * w, rand() * h, pw, ph);
    }
    // Silkscreen marks.
    ctx.strokeStyle = silk;
    ctx.fillStyle = silk;
    ctx.lineWidth = 1.5;
    ctx.font = '500 13px "IBM Plex Mono", monospace';
    for (let i = 0; i < 40; i++) {
      const x = rand() * w, y = rand() * h;
      ctx.strokeRect(x, y, 14 + rand() * 30, 10 + rand() * 20);
      ctx.fillText(`${['C', 'L', 'R', 'U', 'Q'][Math.floor(rand() * 5)]}${Math.floor(rand() * 900 + 10)}`, x, y - 4);
    }
  }, { key: key || `pcb${seed}${mask}`, srgb: true });
}

/** Utility: random-scatter instanced chips on a rectangle (for busy boards). */
export function scatterChips(count, { area = [4, 3], y = 0, seed = 7, sizes = [[0.2, 0.1, 0.1]], avoid = [], body = 'ceramicTan' } = {}) {
  const M = materials();
  const rand = mulberry32(seed);
  const group = new THREE.Group();
  for (const [l, w, h] of sizes) {
    const n = Math.round(count / sizes.length);
    // One chamfer segment: these parts are a few pixels wide, and hundreds of
    // them share the board, so 108 instead of 300 triangles per box.
    const bodyGeo = roundedBox(l * 0.62, h, w, Math.min(w, h) * 0.1, 1);
    const termGeo = roundedBox(l * 0.2, h * 1.06, w * 1.06, Math.min(w, h) * 0.12, 1);
    const bodies = new THREE.InstancedMesh(bodyGeo, M[body], n);
    const terms = new THREE.InstancedMesh(termGeo, M.tin, n * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    const off = new THREE.Vector3();
    let placed = 0, tries = 0;
    while (placed < n && tries < n * 20) {
      tries++;
      const x = (rand() - 0.5) * area[0], z = (rand() - 0.5) * area[1];
      if (avoid.some(([ax, az, aw, ad]) => Math.abs(x - ax) < aw / 2 && Math.abs(z - az) < ad / 2)) continue;
      const rot = rand() < 0.5 ? 0 : Math.PI / 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      p.set(x, y + h / 2, z);
      m4.compose(p, q, s);
      bodies.setMatrixAt(placed, m4);
      for (const sgn of [-1, 1]) {
        off.set(sgn * (l / 2 - l * 0.1), 0, 0).applyQuaternion(q);
        m4.compose(p.clone().add(off), q, s);
        terms.setMatrixAt(placed * 2 + (sgn > 0 ? 1 : 0), m4);
      }
      placed++;
    }
    bodies.count = placed;
    terms.count = placed * 2;
    bodies.castShadow = terms.castShadow = true;
    bodies.receiveShadow = terms.receiveShadow = true;
    group.add(bodies, terms);
  }
  return group;
}

/* ------------------------------------------------------------ display */

/** Museum plinth with a softly bevelled top. */
export function plinth({ w = 1.2, h = 1.1, d = 1.2, material = 'matteWhite' } = {}) {
  const M = materials();
  const g = new THREE.Group();
  g.add(mesh(cachedGeo(`plinth${w}${h}${d}`, () => roundedBox(w, h, d, 0.02, 3)), M[material], 0, h / 2, 0));
  return g;
}
