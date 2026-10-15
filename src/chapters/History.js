// CH.02 History — a long steel ruler engraved with the years 1930–2030. The
// company's turning points sit on it: ferrite core, cassette tape, multilayer
// chip inductor, thin-film head, lithium polymer cell, plus M&A flag pins.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials, roundedBox, extrude, roundedRectShape, toroidCore, toroidWinding, withDissolve } from '../core/kit.js';
import { canvasTexture } from '../core/textures.js';
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, smoothstep, mulberry32, damp } from '../core/math.js';
import { pouchCell } from '../core/parts.js';
import { spot } from './common.js';

const YEAR0 = 1930, YEAR1 = 2030, LEN = 16;
export const yearX = (y) => ((y - YEAR0) / (YEAR1 - YEAR0)) * LEN - LEN / 2;

function rulerTexture() {
  return canvasTexture(4096, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2b2e33');
    g.addColorStop(1, '#25272b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d9d4c8';
    for (let y = YEAR0; y <= YEAR1; y++) {
      const x = ((y - YEAR0) / (YEAR1 - YEAR0)) * (w - 80) + 40;
      const major = y % 10 === 0, mid = y % 5 === 0;
      const len = major ? 0.42 : mid ? 0.28 : 0.17;
      ctx.fillRect(x - (major ? 2.5 : 1.5), 0, major ? 5 : 3, h * len);
      if (major) {
        ctx.font = '600 44px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(y), x, h * 0.66);
      }
    }
    ctx.font = '500 26px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('TDK TECHNOLOGY ATLAS — 1930…2030 — 1 DIV = 1 YEAR', 44, h * 0.92);
  }, { srgb: true, key: 'historyRuler' });
}

/* ------------------------------------------------------------------ cassette */
function buildCassette(M) {
  const g = new THREE.Group();
  const W = 1.0, D = 0.63, T = 0.12, r = 0.035;
  const black = new THREE.MeshPhysicalMaterial({ color: 0x151618, roughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  const plate = (withWindow) => {
    const s = roundedRectShape(W, D, r);
    if (withWindow) {
      const win = roundedRectShape(0.62, 0.17, 0.05);
      const pts = win.getPoints(24).map((p) => new THREE.Vector2(p.x, p.y + 0.02));
      s.holes.push(new THREE.Path(pts));
    }
    const geo = extrude(s, 0.016, 0.004, 2);
    geo.rotateX(-Math.PI / 2);
    return geo;
  };
  const bottom = new THREE.Mesh(plate(false), black);
  bottom.position.y = 0.012;
  const top = new THREE.Mesh(plate(true), black);
  top.position.y = T - 0.012;
  // Walls as a rounded-rect ring.
  const ring = roundedRectShape(W, D, r);
  ring.holes.push(new THREE.Path(roundedRectShape(W - 0.04, D - 0.04, r * 0.6).getPoints(24)));
  const wallGeo = extrude(ring, T - 0.03, 0, 1);
  wallGeo.rotateX(-Math.PI / 2);
  const walls = new THREE.Mesh(wallGeo, black);
  walls.position.y = T / 2;
  for (const m of [bottom, top, walls]) {
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  // Clear window.
  const win = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(0.62, 0.17, 0.05), 8), M.glass);
  win.rotation.x = -Math.PI / 2;
  win.position.set(0, T - 0.006, -0.02);
  win.renderOrder = 3;
  g.add(win);
  // Label with a cut-out for the window.
  const labelTex = canvasTexture(1024, 640, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#e8dfcc';
    ctx.beginPath();
    ctx.roundRect(16, 16, w - 32, h - 32, 26);
    ctx.fill();
    ['#b5562b', '#c98a3c', '#2e3b4e'].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(16, 46 + i * 24, w - 32, 13);
    });
    ctx.fillStyle = '#2a2622';
    ctx.font = '500 30px "IBM Plex Mono", monospace';
    ctx.fillText('HIGH POSITION · TYPE II · 70µs EQ', 60, 172);
    ctx.font = '700 110px "IBM Plex Sans JP", sans-serif';
    ctx.fillText('A', 60, 540);
    ctx.font = '600 52px "IBM Plex Mono", monospace';
    ctx.fillText('C60', w - 200, 520);
    ctx.strokeStyle = 'rgba(40,36,30,0.4)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(170, 470 + i * 44);
      ctx.lineTo(w - 230, 470 + i * 44);
      ctx.stroke();
    }
    // Window opening (0.62 x 0.17 world units, centred 0.02 behind the middle).
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.roundRect(167, 200, 690, 194, 56);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }, { srgb: true, key: 'cassetteLabel' });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.56), new THREE.MeshPhysicalMaterial({ map: labelTex, alphaTest: 0.5, roughness: 0.7, sheen: 0.3, sheenColor: new THREE.Color(0xffffff) }));
  label.rotation.x = -Math.PI / 2;
  label.position.set(0, T + 0.0045, 0);
  g.add(label);
  // Tape packs and hubs.
  const packMat = new THREE.MeshPhysicalMaterial({ color: 0x3b2618, roughness: 0.36, clearcoat: 0.3, sheen: 0.4, sheenColor: new THREE.Color(0x8a5a3a) });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.4 });
  const packs = [];
  for (const x of [-0.2125, 0.2125]) {
    const pack = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.038, 64), packMat);
    pack.position.set(x, T / 2, -0.02);
    g.add(pack);
    packs.push(pack);
    const hubPts = [[0.022, -0.03], [0.06, -0.03], [0.06, 0.03], [0.022, 0.03]].map(([a, b]) => new THREE.Vector2(a, b));
    hubPts.push(hubPts[0].clone());
    const hub = new THREE.Mesh(new THREE.LatheGeometry(hubPts, 32), hubMat);
    hub.position.set(x, T / 2, -0.02);
    g.add(hub);
    const teeth = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.012), hubMat);
      const a = (k / 6) * Math.PI * 2;
      tooth.position.set(Math.cos(a) * 0.026, 0, Math.sin(a) * 0.026);
      teeth.add(tooth);
    }
    teeth.position.copy(hub.position);
    g.add(teeth);
    pack.userData.hub = hub;
    pack.userData.teeth = teeth;
  }
  g.userData.packs = packs;
  // Tape running along the front edge.
  const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.038), new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.4, side: THREE.DoubleSide }));
  tape.position.set(0, T / 2, D / 2 - 0.012);
  g.add(tape);
  return g;
}

/* ------------------------------------------------------------------ multilayer chip */
export function buildLayeredChip(M, { layers = 12, w = 0.9, d = 0.5, lh = 0.028 } = {}) {
  const g = new THREE.Group();
  const sheetGeo = roundedBox(w, lh, d, 0.006, 2);
  const sheetMat = new THREE.MeshPhysicalMaterial({ color: 0xe6e0d4, roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color(0xffffff), normalMap: M.ceramicIvory.normalMap, normalScale: new THREE.Vector2(0.2, 0.2) });
  const traceMat = new THREE.MeshStandardMaterial({ color: 0xd9dbde, metalness: 1, roughness: 0.25 });
  const sheets = [];
  const cw = w * 0.56, cd = d * 0.56, tw = 0.035;
  const seg = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(len + tw, 0.006, tw), traceMat);
    b.position.set((x0 + x1) / 2, lh / 2 + 0.003, (z0 + z1) / 2);
    b.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    return b;
  };
  const corners = [[-cw / 2, -cd / 2], [cw / 2, -cd / 2], [cw / 2, cd / 2], [-cw / 2, cd / 2]];
  for (let i = 0; i < layers; i++) {
    const sheet = new THREE.Group();
    const s = new THREE.Mesh(sheetGeo, sheetMat);
    s.castShadow = s.receiveShadow = true;
    sheet.add(s);
    if (i > 0 && i < layers - 1) {
      // Three quarters of a turn per layer, rotating so the stack forms a coil.
      const k = i % 4;
      for (let e = 0; e < 3; e++) {
        const a = corners[(k + e) % 4], b = corners[(k + e + 1) % 4];
        sheet.add(seg(a[0], a[1], b[0], b[1]));
      }
      const via = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, lh + 0.004, 12), traceMat);
      const vc = corners[(k + 3) % 4];
      via.position.set(vc[0], 0, vc[1]);
      sheet.add(via);
    }
    g.add(sheet);
    sheets.push(sheet);
  }
  const termGeo = roundedBox(0.16, layers * lh + 0.02, d + 0.02, 0.02, 2);
  const terms = [-1, 1].map((sx) => {
    const t = new THREE.Mesh(termGeo, M.tin);
    t.position.set(sx * (w / 2 - 0.07), (layers * lh) / 2, 0);
    t.castShadow = true;
    g.add(t);
    return t;
  });
  g.userData = { sheets, terms, lh, layers };
  return g;
}

/* ------------------------------------------------------------------ thin-film head */
export function buildSlider(M) {
  const g = new THREE.Group();
  const altic = new THREE.MeshPhysicalMaterial({ color: 0x3a3c41, metalness: 0.35, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const body = new THREE.Mesh(roundedBox(0.62, 0.15, 0.5, 0.012, 2), altic);
  body.position.y = 0.075;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  // Trailing-edge face with the deposited thin-film element: layered films and a planar spiral coil.
  const face = new THREE.Group();
  face.position.set(0, 0.075, 0.251);
  const films = [0xb08d57, 0x6d7279, 0x9c6a3c, 0x7c8087, 0xc2a067];
  films.forEach((c, i) => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.22 - i * 0.02, 0.012, 0.004), new THREE.MeshStandardMaterial({ color: c, metalness: 0.8, roughness: 0.3 }));
    f.position.set(0, -0.045 + i * 0.016, 0.002);
    face.add(f);
  });
  const coilPts = [];
  for (let i = 0; i <= 260; i++) {
    const t = i / 260, a = t * Math.PI * 2 * 4.5, rr = 0.012 + t * 0.045;
    coilPts.push(new THREE.Vector3(Math.cos(a) * rr * 1.3, Math.sin(a) * rr * 0.75 + 0.02, 0.004));
  }
  const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 260, 0.0035, 5, false), M.copper);
  face.add(coil);
  g.add(face);
  // Air-bearing rails on the underside (visible when the slider tilts).
  for (const x of [-0.2, 0.2]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.008, 0.44), M.chrome);
    rail.position.set(x, -0.003, 0);
    g.add(rail);
  }
  return g;
}

/* ------------------------------------------------------------------ flag pins */
function flagPin(M, text, sub, height = 0.75) {
  const g = new THREE.Group();
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, height, 8), M.brass);
  pin.position.y = height / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 10), M.brass);
  head.position.y = height;
  const tex = canvasTexture(512, 192, (ctx, w, h) => {
    ctx.fillStyle = '#ece6da';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c58a5c';
    ctx.fillRect(0, 0, 10, h);
    ctx.fillStyle = '#17191d';
    ctx.font = '600 56px "IBM Plex Sans JP", sans-serif';
    ctx.fillText(text, 34, 84);
    ctx.font = '500 34px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#5d636c';
    ctx.fillText(sub, 34, 150);
  }, { srgb: true, key: `flag${text}${sub}` });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }));
  flag.position.set(0.215, height - 0.1, 0);
  g.add(pin, head, flag);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

export class History extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.env = 'studio';
    this.exposure = 1.0;
    this.shift = 0.18;
    this.look = { bloom: 0.12, threshold: 1.0, vignette: 0.42, saturation: 1.03 };
    this.seen = new Set();
  }

  build() {
    const M = materials();
    const shadows = this.app.quality.tier.shadows;
    this.addBackdrop({ top: '#121315', bottom: '#050506', glow: '#24201b', glowPos: [0.66, 0.6], glowSize: 0.6, glowStrength: 0.7 });
    this.addDust({ count: 300, radius: 10, height: 3, size: 0.035, opacity: 0.35, seed: 8, center: [0, 1.2, 0] });

    // Floor and ruler.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.62, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.add(floor);
    const rulerMat = new THREE.MeshPhysicalMaterial({
      map: rulerTexture(),
      metalness: 0.7,
      roughness: 0.42,
      roughnessMap: M.steel.roughnessMap,
      normalMap: M.steel.normalMap,
      normalScale: new THREE.Vector2(0.15, 0.15),
      envMapIntensity: 1.1,
    });
    const ruler = new THREE.Mesh(roundedBox(LEN + 0.6, 0.06, 1.1, 0.01, 2), rulerMat);
    // Map texture only on top face: rely on box UVs (top face gets full 0..1).
    ruler.position.y = 0.03;
    ruler.receiveShadow = true;
    this.add(ruler);

    this.key = spot(this.scene, { intensity: 55, pos: [-6, 6, 4], target: [-6.9, 0.2, 0], angle: 0.36, penumbra: 0.8, shadow: shadows, shadowSize: this.app.quality.tier.shadowSize });
    this.scene.add(new THREE.HemisphereLight(0xffeedd, 0x0b0b0c, 0.18));
    const rim = new THREE.DirectionalLight(0xd2dcff, 1.3);
    rim.position.set(4, 4, -6);
    this.scene.add(rim);
    this.keyTarget = new THREE.Vector3(-6.9, 0.2, 0);

    const Y = 0.06;
    this.items = {};
    // 1937 ferrite core with winding.
    const core = new THREE.Group();
    const cg = toroidCore({ inner: 0.17, outer: 0.3, height: 0.13, bevel: 0.02, radial: 96 });
    const coreMesh = new THREE.Mesh(cg, M.ferrite);
    const wind = new THREE.Mesh(toroidWinding({ inner: 0.17, outer: 0.3, height: 0.13, turns: 16, wire: 0.01, clearance: 0.004, samplesPerTurn: 32 }), M.copperWire);
    core.add(coreMesh, wind);
    core.rotation.x = 0.0;
    core.position.set(yearX(1937), Y + 0.075, 0.05);
    core.traverse((o) => (o.castShadow = true));
    this.add(core);
    this.items.core = core;

    // 1966 cassette, tilted on a small stand.
    const cas = buildCassette(M);
    cas.scale.setScalar(1.0);
    cas.rotation.set(0.0, -0.25, 0);
    cas.position.set(yearX(1966), Y, 0.05);
    this.add(cas);
    this.items.cassette = cas;

    // Magnifier showing needle-shaped magnetic particles.
    const mag = new THREE.Group();
    const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.022, 16, 72), M.brass);
    const lensBack = new THREE.Mesh(new THREE.CircleGeometry(0.335, 64), new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.5, metalness: 0.2 }));
    lensBack.position.z = -0.01;
    mag.add(lensRing, lensBack);
    const needleGeo = new THREE.CapsuleGeometry(0.006, 0.07, 3, 6);
    needleGeo.rotateZ(Math.PI / 2);
    const needleMat = new THREE.MeshStandardMaterial({ color: 0x6b4128, metalness: 0.7, roughness: 0.35 });
    const N = 260;
    const needles = new THREE.InstancedMesh(needleGeo, needleMat, N);
    const rand = mulberry32(17);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      const rr = Math.sqrt(rand()) * 0.3, a = rand() * Math.PI * 2;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.35));
      m4.compose(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, rand() * 0.02), q, new THREE.Vector3(0.7 + rand() * 0.6, 1, 1));
      needles.setMatrixAt(i, m4);
    }
    mag.add(needles);
    mag.position.set(yearX(1966) + 0.78, 0.6, 0.3);
    mag.rotation.y = -0.35;
    mag.scale.setScalar(0.001);
    this.add(mag);
    this.items.mag = mag;

    // 1980 multilayer chip inductor (explodes to show the printed coil).
    const chip = buildLayeredChip(M);
    chip.position.set(yearX(1980), Y, 0.05);
    chip.rotation.y = -0.4;
    this.add(chip);
    this.items.chip = chip;

    // 1987 thin-film head slider.
    const slider = buildSlider(M);
    slider.position.set(yearX(1987) + 0.15, Y + 0.02, 0.0);
    slider.rotation.y = 0.5;
    this.add(slider);
    this.items.slider = slider;

    // 2005 lithium polymer cell (ATL).
    const cellMat = withDissolve(M.pouch, { edgeColor: 0xffb070, edgeWidth: 0.08, scale: 7, intensity: 4 });
    const cell = pouchCell({ w: 0.62, l: 0.9, t: 0.05 });
    cell.traverse((o) => {
      if (o.material === M.pouch) o.material = cellMat;
    });
    this.tracker.track(cellMat);
    cell.position.set(yearX(2005), Y + 0.025, 0.05);
    cell.rotation.y = -0.2;
    this.add(cell);
    this.items.cell = cell;
    this.cellMat = cellMat;

    // Holders let the four innovations gather into a showcase row on step 0.
    this.lineup = ['core', 'cassette', 'chip', 'slider'].map((k, i) => {
      const item = this.items[k];
      const holder = new THREE.Group();
      this.scene.remove(item);
      holder.add(item);
      this.scene.add(holder);
      const home = item.position.clone();
      const dir = new THREE.Vector3(0.89, 0, 0.45).normalize();
      const show = new THREE.Vector3(-3.05, 0.62, 0.75).addScaledVector(dir, [-1.62, -0.52, 0.56, 1.5][i]);
      return { key: k, item, holder, offset: show.sub(home), baseScale: item.scale.x };
    });

    // M&A flag pins.
    const pins = [
      [1986, 'SAE', 'HDDヘッド・香港'],
      [2000, 'Headway', 'HDDヘッド・米国'],
      [2005, 'ATL', '電池・香港'],
      [2008, 'EPCOS', '受動部品・ドイツ'],
      [2016, 'Micronas', '磁気センサ'],
      [2017, 'InvenSense', 'MEMS・米国'],
      [2026, 'Linergy', '電池・マレーシア'],
    ];
    this.pins = pins.map(([y, t, s], i) => {
      const p = flagPin(M, t, `${y} ${s}`, 0.72 + (i % 2) * 0.22);
      p.position.set(yearX(y), Y, -0.38);
      p.rotation.y = -0.15;
      p.scale.setScalar(0.0001);
      this.add(p);
      return p;
    });

    // Labels.
    const lineupLabel = (i, text, sub, dy, off) =>
      this.label({ text, sub, anchor: (out) => this.lineup[i].item.getWorldPosition(out).add(new THREE.Vector3(0, dy, 0)), offset: off, when: () => this.step === 0 && this.param('lineup') > 0.9 });
    lineupLabel(0, '1937', 'フェライトコア', -0.28, [0, 58]);
    lineupLabel(1, '1966', 'カセットテープ', -0.22, [0, 58]);
    lineupLabel(2, '1980', '積層チップインダクタ', -0.12, [0, 58]);
    lineupLabel(3, '1987', '薄膜磁気ヘッド', -0.12, [0, 58]);
    this.label({ text: '針状の磁性粉', sub: '拡大イメージ', anchor: () => mag.localToWorld(new THREE.Vector3(0.24, 0.24, 0)), offset: [40, -40], when: () => this.step === 1 && this.stepTime > 2 });
    this.label({ text: 'テープ幅 3.81mm', anchor: () => cas.localToWorld(new THREE.Vector3(0.25, 0.06, 0.31)), offset: [50, 40], when: () => this.step === 1 && this.stepTime > 2.4 });
    this.label({ text: 'コイルの導体', sub: '各層に印刷し、穴でつなぐ', anchor: () => chip.userData.sheets[6].localToWorld(new THREE.Vector3(0.25, 0.02, 0.14)), offset: [50, -40], when: () => this.step === 2 && this.stepTime > 2.2 });
    this.label({ text: '薄膜コイル', sub: '半導体のような工程で形成', anchor: () => slider.localToWorld(new THREE.Vector3(0, 0.1, 0.26)), offset: [40, 50], when: () => this.step === 2 && this.stepTime > 2.8 });
    this.label({ text: '2008年3月期', sub: '記録デバイスが売上の38.6%', anchor: [yearX(1987) + 0.15, 0.3, 0], offset: [-40, -70], steps: [3] });
    this.label({ text: '2026年3月期', sub: 'エナジー応用製品が54.7%', anchor: [yearX(2005), 0.2, 0.05], offset: [40, 60], steps: [3] });
  }

  poses() {
    return [
      { pos: [-6.3, 2.0, 7.0], target: [-3.45, 0.62, 0.72], fov: 29, dur: 2.2 },
      { pos: [yearX(1966) + 1.45, 1.35, 2.8], target: [yearX(1966) + 0.35, 0.32, 0.05], fov: 32, dur: 2.6 },
      { pos: [yearX(1983) + 1.0, 1.85, 4.3], target: [yearX(1983) + 0.25, 0.42, 0], fov: 32, dur: 2.6 },
      { pos: [yearX(2012) + 1.5, 1.9, 4.6], target: [yearX(1999), 0.25, 0], fov: 34, dur: 2.8 },
    ];
  }

  onStep(step, instant) {
    const t = [[-5.5, 0.2, 0], [yearX(1966) + 0.3, 0.2, 0], [yearX(1983), 0.2, 0], [yearX(1996), 0.2, 0]][step];
    this.keyGoal = t;
    if (instant) this.keyTarget.fromArray(t);
  }

  tick(dt, t) {
    const st = this.stepTime;
    if (this.keyGoal) {
      this.keyTarget.x = damp(this.keyTarget.x, this.keyGoal[0], 1.8, dt);
      this.keyTarget.y = damp(this.keyTarget.y, this.keyGoal[1], 1.8, dt);
      this.keyTarget.z = damp(this.keyTarget.z, this.keyGoal[2], 1.8, dt);
    }
    this.key.target.position.copy(this.keyTarget);
    this.key.position.set(this.keyTarget.x - 1.5, 6, 4);
    this.key.angle = this.step === 0 || this.step === 3 ? 0.62 : 0.36;

    const I = this.items;
    // Ferrite core turns slowly.
    I.core.rotation.y = t * 0.3;
    I.core.rotation.x = 0.35 + Math.sin(t * 0.4) * 0.06;
    I.core.position.y = 0.06 + 0.17 + Math.sin(t * 0.8) * 0.01;

    // Cassette: lid tilts toward camera, reels play.
    this.to('cas', this.step === 1 ? 1 : 0);
    const cOn = this.param('cas');
    I.cassette.rotation.x = 0.0 + cOn * 0.5;
    I.cassette.rotation.y = -0.25;
    I.cassette.position.y = 0.06 + cOn * 0.3;
    const play = (t * 0.05) % 1;
    I.cassette.userData.packs.forEach((p, i) => {
      const r = i === 0 ? 0.08 + 0.1 * play : 0.18 - 0.1 * play;
      p.scale.set(r, 1, r);
      const spin = -t * (i === 0 ? 2.2 : 1.3) * cOn;
      p.rotation.y = spin;
      p.userData.teeth.rotation.y = spin;
    });
    const magK = this.step === 1 ? easeOutBack(clamp01((st - 1.0) / 0.9)) : 0;
    this.to('mag', magK, true);
    const ms = Math.max(0.0001, this.step === 1 ? magK : damp(I.mag.scale.x, 0.0001, 6, dt));
    I.mag.scale.setScalar(ms);
    I.mag.rotation.z = Math.sin(t * 0.5) * 0.04;

    // Multilayer chip explodes.
    this.to('explode', this.step === 2 ? smoothstep(0.6, 2.2, st) : 0);
    const e = this.param('explode');
    const ch = I.chip.userData;
    ch.sheets.forEach((s, i) => {
      s.position.y = ch.lh / 2 + i * (ch.lh + e * 0.05);
      s.rotation.y = e * Math.sin(i * 0.7) * 0.05;
    });
    ch.terms.forEach((tm, i) => {
      const k = 1 - smoothstep(0.0, 0.35, e);
      tm.position.x = (i === 0 ? -1 : 1) * (0.9 / 2 - 0.07 + e * 0.25);
      tm.scale.set(Math.max(0.0001, k), Math.max(0.0001, k), Math.max(0.0001, k));
      tm.visible = k > 0.002;
    });
    I.chip.rotation.y = -0.4 + e * 0.25 + Math.sin(t * 0.3) * 0.05 * e;
    I.chip.rotation.x = 0;

    // Thin-film slider rotates to show its trailing edge.
    this.to('slider', this.step === 2 ? 1 : 0);
    const sOn = this.param('slider');
    I.slider.rotation.y = 0.5 - sOn * 0.9 + Math.sin(t * 0.4) * 0.08 * sOn;
    I.slider.position.y = 0.08 + sOn * 0.25;
    I.slider.rotation.x = sOn * 0.25;

    // Battery cell appears; M&A pins pop up along the ruler.
    const showCell = this.step === 3 ? smoothstep(0.4, 2.2, st) : this.seen.has(3) ? 1 : 0;
    this.to('cell', showCell);
    this.cellMat.dissolve.uReveal.value = this.param('cell');
    I.cell.rotation.y = -0.2 + Math.sin(t * 0.35) * 0.08;
    this.pins.forEach((p, i) => {
      const k = this.step === 3 ? easeOutBack(clamp01((st - 0.8 - i * 0.18) / 0.6)) : this.step < 3 ? 0 : 1;
      p.scale.setScalar(Math.max(0.0001, damp(p.scale.x, k, 8, dt)));
      p.rotation.y = -0.15 + Math.sin(t * 0.6 + i) * 0.05;
    });
    if (this.step === 3 && st > 2.5) this.seen.add(3);

    // Showcase row for step 0.
    this.to('lineup', this.step === 0 ? 1 : 0);
    const L = easeInOutCubic(clamp01(this.param('lineup')));
    const face = [0.0, -0.35, -0.55, 0.2];
    this.lineup.forEach((l, i) => {
      l.holder.position.copy(l.offset).multiplyScalar(L);
      l.holder.position.y += Math.sin(L * Math.PI) * 0.25 + L * Math.sin(t * 0.9 + i * 1.3) * 0.03;
      l.item.scale.setScalar(l.baseScale * (1 + 0.05 * L));
      l.item.rotation.y += face[i] * L;
      if (l.key === 'cassette') l.item.rotation.x += 1.0 * L;
      if (l.key === 'chip' || l.key === 'slider') l.item.rotation.x += 0.35 * L;
    });
  }
}
