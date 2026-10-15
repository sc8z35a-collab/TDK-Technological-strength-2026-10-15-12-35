// CH.01 Origin — a museum desk: a ball-and-stick spinel model of ferrite,
// the patent that founded the company, a 1930s radio with oxide cores, and
// the IEEE Milestone plaque.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials, roundedBox, extrude, toroidCore } from '../core/kit.js';
import { canvasTexture } from '../core/textures.js';
import { clamp01, easeOutBack, easeOutCubic, smoothstep, mulberry32, damp } from '../core/math.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { spot, paperTexture, verticalText, tableTop } from './common.js';

/** Ideal spinel unit cell (origin choice 1, u = 3/8), with boundary images. */
export function spinelCell() {
  const fr = (v) => ((v % 1) + 1) % 1;
  const F = [[0, 0, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0]];
  const P = [[0, 0, 0], [0, 0.25, 0.25], [0.25, 0, 0.25], [0.25, 0.25, 0]];
  const O = [], A = [], B = [];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++)
      for (let k = 0; k < 2; k++)
        for (const p of P) O.push([fr(3 / 8 + i / 2 + p[0]), fr(3 / 8 + j / 2 + p[1]), fr(3 / 8 + k / 2 + p[2])]);
  for (const b of [[0, 0, 0], [0.75, 0.25, 0.75]]) for (const f of F) A.push(b.map((v, i) => fr(v + f[i])));
  for (const b of [[5 / 8, 5 / 8, 5 / 8], [3 / 8, 7 / 8, 1 / 8], [7 / 8, 1 / 8, 3 / 8], [1 / 8, 3 / 8, 7 / 8]])
    for (const f of F) B.push(b.map((v, i) => fr(v + f[i])));
  // Add periodic images on the cell faces so the cube looks complete.
  const withImages = (list) => {
    const out = [];
    for (const p of list) {
      const opts = p.map((v) => (Math.abs(v) < 1e-6 ? [0, 1] : [v]));
      for (const x of opts[0]) for (const y of opts[1]) for (const z of opts[2]) out.push([x, y, z]);
    }
    return out;
  };
  return { O: withImages(O), A: withImages(A), B: withImages(B) };
}

function buildRadio(M, clip) {
  const g = new THREE.Group();
  const w = 1.5, h = 1.9, d = 0.8;
  const planes = [clip];
  const outline = (sw, sh, y0 = 0) => {
    const s = new THREE.Shape();
    s.moveTo(-sw / 2, y0);
    s.lineTo(sw / 2, y0);
    s.lineTo(sw / 2, y0 + sh * 0.62);
    s.bezierCurveTo(sw / 2, y0 + sh * 0.92, sw * 0.24, y0 + sh, 0, y0 + sh);
    s.bezierCurveTo(-sw * 0.24, y0 + sh, -sw / 2, y0 + sh * 0.92, -sw / 2, y0 + sh * 0.62);
    s.lineTo(-sw / 2, y0);
    return s;
  };
  const lacquer = new THREE.MeshPhysicalMaterial({ map: M.walnut.map, color: 0x6a4428, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.22, clippingPlanes: planes, clipShadows: true, side: THREE.DoubleSide });
  const inner = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.9, clippingPlanes: planes, side: THREE.BackSide });
  const body = new THREE.Mesh(extrude(outline(w, h, 0), d, 0.035, 4), lacquer);
  body.position.y = 0.1;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  // Inner lining: a slightly smaller shell so the cut shows a hollow cabinet.
  const lining = new THREE.Mesh(extrude(outline(w - 0.1, h - 0.1, 0), d - 0.1, 0, 1), inner);
  lining.position.y = 0.15;
  g.add(lining);
  // Grille frame (outline with an arched opening) + fabric behind it.
  const frameShape = outline(w * 0.84, h * 0.66, 0);
  const hole = outline(w * 0.62, h * 0.5, h * 0.06);
  frameShape.holes.push(new THREE.Path(hole.getPoints(48)));
  const frame = new THREE.Mesh(extrude(frameShape, 0.06, 0.012, 2), lacquer);
  frame.position.set(0, 0.1 + h * 0.28, d / 2 + 0.05);
  frame.castShadow = true;
  g.add(frame);
  const fabric = M.fabric.clone();
  fabric.clippingPlanes = planes;
  fabric.side = THREE.DoubleSide;
  const cloth = new THREE.Mesh(new THREE.ShapeGeometry(outline(w * 0.64, h * 0.52, h * 0.05), 24), fabric);
  cloth.position.set(0, 0.1 + h * 0.28, d / 2 + 0.04);
  g.add(cloth);
  for (let i = -2; i <= 2; i++) {
    const bar = new THREE.Mesh(roundedBox(0.035, h * 0.46, 0.035, 0.01, 2), lacquer);
    bar.position.set(i * 0.17, 0.1 + h * 0.28 + h * 0.06 + h * 0.23, d / 2 + 0.07);
    bar.castShadow = true;
    g.add(bar);
  }
  // Dial with backlight.
  const dialTex = canvasTexture(512, 512, (ctx, cw, ch) => {
    const cx = cw / 2, cy = ch / 2;
    const rg = ctx.createRadialGradient(cx, cy, 10, cx, cy, cw / 2);
    rg.addColorStop(0, '#f3e6c4');
    rg.addColorStop(1, '#d8c08e');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#3a2a1a';
    ctx.fillStyle = '#3a2a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, cw * 0.44, 0, Math.PI * 2);
    ctx.stroke();
    const nums = [55, 60, 70, 80, 100, 120, 140, 160];
    ctx.font = '600 34px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI * (0.85 + (i / 40) * 1.3);
      const r0 = cw * 0.4, r1 = cw * (i % 5 === 0 ? 0.33 : 0.36);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    nums.forEach((n, i) => {
      const a = Math.PI * (0.85 + (i / (nums.length - 1)) * 1.3);
      ctx.fillText(String(n), cx + Math.cos(a) * cw * 0.25, cy + Math.sin(a) * cw * 0.25);
    });
    ctx.font = '500 26px "IBM Plex Mono", monospace';
    ctx.fillText('KC', cx, cy + cw * 0.17);
  }, { srgb: true, key: 'radioDial' });
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.2, 48), new THREE.MeshStandardMaterial({ map: dialTex, emissiveMap: dialTex, emissive: new THREE.Color(1.0, 0.62, 0.3), emissiveIntensity: 0.0, roughness: 0.6, clippingPlanes: planes }));
  dial.position.set(0, 0.1 + h * 0.15, d / 2 + 0.04);
  g.add(dial);
  g.userData.dial = dial;
  const brass = M.brass.clone();
  brass.clippingPlanes = planes;
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.022, 12, 48), brass);
  bezel.position.copy(dial.position);
  g.add(bezel);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.17, 0.004), M.ink);
  needle.geometry.translate(0, 0.07, 0);
  needle.position.set(0, dial.position.y, dial.position.z + 0.01);
  g.add(needle);
  g.userData.needle = needle;
  const knobGeo = (() => {
    const pts = [[0.0001, 0], [0.085, 0], [0.09, 0.02], [0.085, 0.07], [0.06, 0.1], [0.0001, 0.105]].map(([x, y]) => new THREE.Vector2(x, y));
    const lg = new THREE.LatheGeometry(pts, 32);
    lg.rotateX(Math.PI / 2);
    return lg;
  })();
  const bakelite = new THREE.MeshPhysicalMaterial({ color: 0x2b1a12, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12, clippingPlanes: planes });
  for (const x of [-0.5, 0.5]) {
    const k = new THREE.Mesh(knobGeo, bakelite);
    k.position.set(x, 0.1 + h * 0.15, d / 2 + 0.035);
    k.castShadow = true;
    g.add(k);
  }
  const base = new THREE.Mesh(roundedBox(w + 0.14, 0.1, d + 0.14, 0.03, 3), lacquer);
  base.position.y = 0.05;
  base.castShadow = base.receiveShadow = true;
  g.add(base);

  /* interior: chassis, valves, IF transformers with ferrite cores, speaker */
  const inside = new THREE.Group();
  const chassis = new THREE.Mesh(roundedBox(1.32, 0.035, 0.6, 0.01, 2), M.steel);
  chassis.position.set(0, 0.62, -0.03);
  chassis.castShadow = chassis.receiveShadow = true;
  inside.add(chassis);
  const envelope = (() => {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const r = t < 0.8 ? 0.062 + Math.sin(t * Math.PI * 0.6) * 0.012 : 0.07 * Math.cos(((t - 0.8) / 0.2) * Math.PI * 0.5) + 0.0001;
      pts.push(new THREE.Vector2(r, t * 0.36));
    }
    return new THREE.LatheGeometry(pts, 32);
  })();
  const glass = M.glass.clone();
  glass.opacity = 0.3;
  const valveBase = new THREE.CylinderGeometry(0.07, 0.07, 0.06, 32);
  const plateGeo = roundedBox(0.075, 0.16, 0.04, 0.005, 1);
  const heaterGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.12, 8);
  g.userData.heaters = [];
  for (const [x, z, sc] of [[0.12, -0.16, 1.05], [0.32, -0.16, 1.15], [0.52, 0.0, 0.9], [0.24, 0.1, 0.85]]) {
    const v = new THREE.Group();
    const b = new THREE.Mesh(valveBase, M.epoxy);
    b.position.y = 0.03;
    const e = new THREE.Mesh(envelope, glass);
    e.position.y = 0.06;
    e.renderOrder = 2;
    const pl = new THREE.Mesh(plateGeo, M.anodizedDark);
    pl.position.y = 0.06 + 0.15;
    const ht = new THREE.Mesh(heaterGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) }));
    ht.position.set(0, 0.06 + 0.15, 0.03);
    g.userData.heaters.push(ht.material);
    const getter = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.004, 20), M.chrome);
    getter.position.y = 0.06 + 0.33;
    v.add(b, pl, ht, getter, e);
    v.scale.setScalar(sc);
    v.position.set(x, 0.64, z);
    v.traverse((o) => (o.castShadow = o !== e));
    inside.add(v);
  }
  // IF transformer cans; the front one is cut open to show its ferrite core.
  const canGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.24, 40, 1, false);
  for (const [x, z] of [[0.48, -0.2]]) {
    const c = new THREE.Mesh(canGeo, M.aluminum);
    c.position.set(x, 0.64 + 0.12, z);
    c.castShadow = true;
    inside.add(c);
  }
  const openCan = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.24, 40, 1, true, Math.PI * 0.15, Math.PI * 1.25), M.aluminum.clone());
  openCan.material.side = THREE.DoubleSide;
  openCan.position.set(0.62, 0.64 + 0.12, 0.17);
  openCan.rotation.y = -0.4;
  inside.add(openCan);
  const coreRod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 24), M.ferrite);
  coreRod.position.copy(openCan.position);
  inside.add(coreRod);
  const coil = (() => {
    const pts = [];
    const n = 14 * 24;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = t * 14 * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.034, -0.05 + t * 0.1, Math.sin(a) * 0.034));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, 0.006, 6, false);
  })();
  const coilM = new THREE.Mesh(coil, M.copperWire);
  coilM.position.copy(openCan.position);
  inside.add(coilM);
  g.userData.ifCore = coreRod;
  // Speaker behind the grille.
  const cone = (() => {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(new THREE.Vector2(0.06 + t * 0.32, -0.14 + Math.pow(t, 1.4) * 0.14));
    }
    return new THREE.LatheGeometry(pts, 48);
  })();
  const paperMat = new THREE.MeshStandardMaterial({ color: 0x5a4a38, roughness: 0.95, side: THREE.DoubleSide });
  const spk = new THREE.Mesh(cone, paperMat);
  spk.rotation.x = Math.PI / 2;
  spk.position.set(0, 1.25, 0.24);
  inside.add(spk);
  const magnet = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 32), M.ferrite);
  magnet.rotation.x = Math.PI / 2;
  magnet.position.set(0, 1.25, 0.03);
  inside.add(magnet);
  // Cloth-covered wiring.
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x5a1f18, roughness: 0.8 });
  for (const pts of [
    [[0.12, 0.66, -0.1], [0.25, 0.8, 0.05], [0.4, 0.95, 0.2], [0.5, 1.15, 0.22]],
    [[0.32, 0.66, -0.1], [0.45, 0.75, 0.1], [0.62, 0.7, 0.17]],
  ]) {
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, 0.008, 6, false);
    inside.add(new THREE.Mesh(tg, wireMat));
  }
  g.add(inside);
  g.userData.top = new THREE.Vector3(0, 0.1 + h, 0);
  return g;
}

function buildCores(M) {
  const g = new THREE.Group();
  const add = (geo, x, z, ry = 0, rx = 0) => {
    const m = new THREE.Mesh(geo, M.ferrite);
    m.position.set(x, 0, z);
    m.rotation.set(rx, ry, 0);
    m.castShadow = m.receiveShadow = true;
    const holder = new THREE.Group();
    holder.add(m);
    g.add(holder);
    return holder;
  };
  const ring = toroidCore({ inner: 0.07, outer: 0.13, height: 0.06, bevel: 0.012, radial: 64 });
  ring.translate(0, 0.03, 0);
  const rod = new THREE.CylinderGeometry(0.035, 0.035, 0.34, 32);
  rod.rotateZ(Math.PI / 2);
  rod.translate(0, 0.035, 0);
  const cup = (() => {
    const pts = [[0.0001, 0], [0.11, 0], [0.12, 0.01], [0.12, 0.1], [0.095, 0.1], [0.095, 0.03], [0.045, 0.03], [0.045, 0.1], [0.02, 0.1], [0.02, 0.03], [0.0001, 0.03]].map(([x, y]) => new THREE.Vector2(x, y));
    const lg = new THREE.LatheGeometry(pts, 48);
    lg.computeVertexNormals();
    return lg;
  })();
  const bead = (() => {
    const pts = [[0.02, 0], [0.05, 0], [0.055, 0.008], [0.055, 0.1], [0.05, 0.108], [0.02, 0.108]].map(([x, y]) => new THREE.Vector2(x, y));
    pts.push(pts[0].clone());
    const lg = new THREE.LatheGeometry(pts, 40);
    lg.computeVertexNormals();
    return lg;
  })();
  const items = [add(ring, -0.42, 0.05), add(rod, -0.1, 0.12, 0.4), add(cup, 0.22, -0.02), add(bead, 0.45, 0.14), add(ring, 0.05, -0.18, 0, 0)];
  g.userData.items = items;
  return g;
}

function buildPlaque(M) {
  const g = new THREE.Group();
  const stone = new THREE.MeshPhysicalMaterial({ color: 0x232426, roughness: 0.42, metalness: 0, normalMap: M.ceramicIvory.normalMap, normalScale: new THREE.Vector2(0.18, 0.18), clearcoat: 0.3, clearcoatRoughness: 0.4 });
  const block = new THREE.Mesh(roundedBox(2.5, 1.75, 0.28, 0.04, 3), stone);
  block.position.y = 0.875;
  block.castShadow = block.receiveShadow = true;
  g.add(block);
  const W = 1536, H = 990;
  const lettering = (ctx, cw, ch, fg) => {
    ctx.strokeStyle = fg;
    ctx.fillStyle = fg;
    ctx.lineWidth = 14;
    ctx.strokeRect(40, 40, cw - 80, ch - 80);
    ctx.lineWidth = 4;
    ctx.strokeRect(72, 72, cw - 144, ch - 144);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 64px "IBM Plex Sans JP", sans-serif';
    ctx.fillText('I E E E    M I L E S T O N E', cw / 2, 205);
    ctx.fillRect(cw / 2 - 180, 280, 360, 4);
    ctx.font = '700 76px "Shippori Mincho B1", serif';
    ctx.fillText('DEVELOPMENT OF FERRITE', cw / 2, 420);
    ctx.fillText('MATERIALS AND THEIR', cw / 2, 520);
    ctx.fillText('APPLICATIONS, 1930–1945', cw / 2, 620);
    ctx.fillRect(cw / 2 - 180, 715, 360, 4);
    ctx.font = '600 60px "IBM Plex Mono", monospace';
    ctx.fillText('2009', cw / 2, 805);
  };
  const colorTex = canvasTexture(W, H, (ctx, cw, ch) => {
    const g = ctx.createLinearGradient(0, 0, cw, ch);
    g.addColorStop(0, '#3e3022');
    g.addColorStop(1, '#2c2219');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
    lettering(ctx, cw, ch, '#e2b57a');
  }, { srgb: true, key: 'plaqueColor' });
  const roughTex = canvasTexture(W / 2, H / 2, (ctx, cw, ch) => {
    ctx.fillStyle = '#b4b4b4';
    ctx.fillRect(0, 0, cw, ch);
    ctx.scale(0.5, 0.5);
    lettering(ctx, cw * 2, ch * 2, '#3a3a3a');
  }, { key: 'plaqueRough' });
  const bronze = new THREE.MeshPhysicalMaterial({ map: colorTex, metalness: 0.85, roughness: 1, roughnessMap: roughTex, envMapIntensity: 1.8 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.29), bronze);
  face.position.set(0, 0.9, 0.163);
  g.add(face);
  const rim = new THREE.Mesh(roundedBox(2.06, 1.35, 0.03, 0.012, 2), M.bronze);
  rim.position.set(0, 0.9, 0.14);
  rim.castShadow = true;
  g.add(rim);
  return g;
}

export class Origin extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.dofSteps = [0.012, 0.012, 0.008, 0.006];
    this.env = 'studio';
    this.exposure = 1.0;
    this.shift = 0.2;
    this.look = { bloom: 0.12, threshold: 1.05, vignette: 0.4, saturation: 1.02, lift: new THREE.Vector3(0.004, 0.002, 0) };
    this.popT = 0;
  }

  build() {
    const M = materials();
    const shadows = this.app.quality.tier.shadows;
    this.addBackdrop({ top: '#141210', bottom: '#060505', glow: '#2b2016', glowPos: [0.72, 0.62], glowSize: 0.55, glowStrength: 0.75 });
    this.addDust({ count: 360, radius: 9, height: 4, size: 0.04, opacity: 0.4, seed: 5, center: [2, 1.5, 0] });
    tableTop(this.scene, { w: 22, d: 6, y: 0 });

    this.key = spot(this.scene, { intensity: 70, pos: [-4, 6.5, 4.5], target: [-3, 1, 0], angle: 0.42, penumbra: 0.75, shadow: shadows, shadowSize: this.app.quality.tier.shadowSize });
    const rim = new THREE.DirectionalLight(0xcfdcff, 1.6);
    rim.position.set(3, 3, -6);
    this.scene.add(rim, new THREE.HemisphereLight(0xffeedd, 0x0c0b0a, 0.12));
    this.keyTarget = new THREE.Vector3(-3, 1, 0);

    /* --- spinel model --------------------------------------------------- */
    const S = 1.55;
    const cell = spinelCell();
    const crystal = new THREE.Group();
    crystal.position.set(-3.1, 1.45, 0);
    this.scene.add(crystal);
    this.crystal = crystal;
    const center = new THREE.Vector3(0.5, 0.5, 0.5);
    const toV = (p) => new THREE.Vector3(...p).sub(center).multiplyScalar(S);
    const lacquerRed = new THREE.MeshPhysicalMaterial({ color: 0x5c2216, roughness: 0.22, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 });
    const types = [
      { list: cell.O, r: 0.075, mat: M.porcelain, key: 'O' },
      { list: cell.B, r: 0.06, mat: lacquerRed, key: 'B' },
      { list: cell.A, r: 0.052, mat: M.brass, key: 'A' },
    ];
    const rand = mulberry32(4);
    this.atoms = [];
    for (const t of types) {
      const geo = new THREE.SphereGeometry(t.r * S, 32, 20);
      const im = new THREE.InstancedMesh(geo, t.mat, t.list.length);
      im.castShadow = true;
      im.receiveShadow = true;
      crystal.add(im);
      this.tracker.track(geo);
      t.list.forEach((p, i) => {
        const v = toV(p);
        this.atoms.push({ im, i, pos: v, delay: 0.25 + v.length() * 0.55 + rand() * 0.25, type: t.key });
      });
      t.im = im;
    }
    // Bonds: cation to oxygen neighbours.
    const bonds = [];
    for (const [list, rr] of [[cell.A, Math.sqrt(3) / 8], [cell.B, 0.25]])
      for (const c of list)
        for (const o of cell.O) {
          const d = Math.hypot(c[0] - o[0], c[1] - o[1], c[2] - o[2]);
          if (Math.abs(d - rr) < 1e-3) bonds.push([toV(c), toV(o)]);
        }
    const bondGeo = new THREE.CylinderGeometry(0.011 * S, 0.011 * S, 1, 10, 1);
    bondGeo.translate(0, 0.5, 0);
    this.tracker.track(bondGeo);
    this.bondMesh = new THREE.InstancedMesh(bondGeo, M.nickel, bonds.length);
    this.bonds = bonds.map(([a, b]) => ({ a, b, len: a.distanceTo(b), q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()), delay: 0.9 + a.length() * 0.5 }));
    crystal.add(this.bondMesh);
    // Cell edges.
    const edgeMat = M.anodizedDark;
    const edgeGeo = new THREE.CylinderGeometry(0.006 * S, 0.006 * S, S, 6);
    this.tracker.track(edgeGeo);
    const half = S / 2;
    for (const axis of ['x', 'y', 'z'])
      for (const a of [-half, half])
        for (const b of [-half, half]) {
          const e = new THREE.Mesh(edgeGeo, edgeMat);
          if (axis === 'x') {
            e.rotation.z = Math.PI / 2;
            e.position.set(0, a, b);
          } else if (axis === 'y') e.position.set(a, 0, b);
          else {
            e.rotation.x = Math.PI / 2;
            e.position.set(a, b, 0);
          }
          crystal.add(e);
        }
    // Ferrimagnetic moments: B sublattice up, A sublattice down.
    const arrowGeo = (() => {
      const shaft = new THREE.CylinderGeometry(0.007 * S, 0.007 * S, 0.11 * S, 8);
      shaft.translate(0, 0.055 * S, 0);
      const head = new THREE.ConeGeometry(0.022 * S, 0.05 * S, 12);
      head.translate(0, 0.135 * S, 0);
      const merged = mergeGeometries([shaft, head]);
      merged.translate(0, -0.08 * S, 0);
      return merged;
    })();
    this.tracker.track(arrowGeo);
    const upMat = new THREE.MeshStandardMaterial({ color: 0xd7925f, metalness: 0.6, roughness: 0.3, emissive: 0x3a1a08, emissiveIntensity: 0.4 });
    const downMat = new THREE.MeshStandardMaterial({ color: 0x8fa6c4, metalness: 0.6, roughness: 0.3, emissive: 0x0a1424, emissiveIntensity: 0.4 });
    this.arrowsUp = new THREE.InstancedMesh(arrowGeo, upMat, cell.B.length);
    this.arrowsDown = new THREE.InstancedMesh(arrowGeo, downMat, cell.A.length);
    crystal.add(this.arrowsUp, this.arrowsDown);
    this.tracker.track(upMat);
    this.tracker.track(downMat);
    this.arrowData = [
      ...cell.B.map((p, i) => ({ im: this.arrowsUp, i, pos: toV(p).add(new THREE.Vector3(0.09 * S, 0, 0)), dir: 1 })),
      ...cell.A.map((p, i) => ({ im: this.arrowsDown, i, pos: toV(p).add(new THREE.Vector3(0.09 * S, 0, 0)), dir: -1 })),
    ];
    // Stand.
    const standMat = M.anodizedDark;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 16), standMat);
    post.position.set(-3.1, 0.31 + 0.05, 0);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.06, 48), M.epoxy);
    foot.position.set(-3.1, 0.03, 0);
    post.castShadow = foot.castShadow = true;
    foot.receiveShadow = true;
    this.add(post);
    this.add(foot);

    /* --- patent document -------------------------------------------------- */
    const docTex = paperTexture({
      key: 'patentDoc',
      seed: 12,
      draw: (ctx, cw, ch) => {
        ctx.strokeStyle = 'rgba(70,40,20,0.85)';
        ctx.lineWidth = 6;
        ctx.strokeRect(40, 40, cw - 80, ch - 80);
        ctx.lineWidth = 2;
        ctx.strokeRect(56, 56, cw - 112, ch - 112);
        ctx.fillStyle = 'rgba(35,22,12,0.92)';
        ctx.textAlign = 'center';
        ctx.font = '700 104px "Shippori Mincho B1", serif';
        verticalText(ctx, '特許證', cw - 150, 120, 104, 1.25);
        ctx.font = '600 52px "Shippori Mincho B1", serif';
        verticalText(ctx, '特許第九八八四四號', cw - 290, 130, 52, 1.12);
        ctx.font = '600 48px "Shippori Mincho B1", serif';
        verticalText(ctx, '磁性セラミックス', cw - 400, 170, 48, 1.12);
        verticalText(ctx, 'フェライト', cw - 480, 170, 48, 1.12);
        ctx.font = '500 40px "Shippori Mincho B1", serif';
        verticalText(ctx, '昭和七年', 230, 520, 40, 1.15);
        ctx.fillStyle = 'rgba(160,40,30,0.75)';
        ctx.fillRect(110, 760, 120, 120);
        ctx.fillStyle = 'rgba(233,223,200,0.9)';
        ctx.font = '700 70px "Shippori Mincho B1", serif';
        ctx.fillText('印', 170, 845);
      },
    });
    const docGeo = new THREE.PlaneGeometry(1.15, 1.55, 24, 1);
    {
      const p = docGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        p.setZ(i, Math.pow(Math.abs(x) / 0.575, 3) * 0.035);
      }
      docGeo.computeVertexNormals();
    }
    this.tracker.track(docGeo);
    const paper = new THREE.MeshPhysicalMaterial({ map: docTex, roughness: 0.88, sheen: 0.5, sheenColor: new THREE.Color(0xfff4e0), sheenRoughness: 0.7, side: THREE.DoubleSide });
    this.doc = new THREE.Mesh(docGeo, paper);
    this.doc.position.set(0.15, 0.62, -0.05);
    this.doc.rotation.set(-0.55, -0.12, 0);
    this.doc.castShadow = this.doc.receiveShadow = true;
    this.scene.add(this.doc);
    const acrylic = new THREE.Mesh(roundedBox(1.3, 0.05, 1.1, 0.02, 2), M.glass);
    acrylic.position.set(0.15, 0.3, 0.05);
    acrylic.rotation.x = -0.55;
    this.add(acrylic);
    const acrylicBase = new THREE.Mesh(roundedBox(1.36, 0.06, 0.7, 0.02, 2), M.glass);
    acrylicBase.position.set(0.15, 0.03, 0.2);
    this.add(acrylicBase);
    const pen = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.9, 24), M.epoxyGloss);
    barrel.rotation.z = Math.PI / 2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.05, 24), M.gold);
    band.rotation.z = Math.PI / 2;
    band.position.x = 0.18;
    const nib = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 24), M.gold);
    nib.rotation.z = -Math.PI / 2;
    nib.position.x = 0.52;
    pen.add(barrel, band, nib);
    pen.traverse((o) => (o.castShadow = true));
    pen.position.set(1.25, 0.035, 0.55);
    pen.rotation.y = 0.5;
    this.add(pen);

    /* --- radio and oxide cores ------------------------------------------- */
    this.clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10);
    this.radio = buildRadio(M, this.clip);
    this.radio.position.set(3.45, 0, -0.35);
    this.radio.rotation.y = 0.22;
    this.add(this.radio);
    this.radio.updateMatrixWorld(true);
    this.tubeLight = new THREE.PointLight(0xff9a4a, 0, 2.2, 1.5);
    this.tubeLight.position.copy(this.radio.localToWorld(new THREE.Vector3(0.35, 0.95, 0.05)));
    this.scene.add(this.tubeLight);
    this.cores = buildCores(M);
    this.cores.position.set(4.55, 0, 0.75);
    this.add(this.cores);
    /* --- IEEE plaque -------------------------------------------------------- */
    this.plaque = buildPlaque(M);
    this.plaque.position.set(7.0, 0, -0.4);
    this.plaque.rotation.y = -0.2;
    this.add(this.plaque);
    this.sweep = spot(this.scene, { color: 0xfff3e2, intensity: 0, pos: [7, 3.5, 3], target: [7, 0.9, -0.4], angle: 0.12, penumbra: 0.9, decay: 1 });

    /* --- labels ------------------------------------------------------------ */
    const atomAnchor = (type) => {
      const pick = { O: (p) => p.pos.y * 1.2 + p.pos.x + p.pos.z, B: (p) => p.pos.x * 1.5 + p.pos.z - Math.abs(p.pos.y) * 0.8, A: (p) => -p.pos.y * 1.2 + p.pos.x + p.pos.z };
      const a = this.atoms.filter((x) => x.type === type).sort((p, q) => pick[type](q) - pick[type](p))[0];
      return (out) => out.copy(a.pos).applyMatrix4(this.crystal.matrixWorld);
    };
    this.label({ text: '酸素イオン O²⁻', sub: '骨組みをつくる', anchor: atomAnchor('O'), offset: [46, -46], when: () => this.step === 0 && this.popT > 2.2 });
    this.label({ text: '鉄イオン Fe³⁺', sub: '八面体のすき間', anchor: atomAnchor('B'), offset: [52, 18], when: () => this.step === 0 && this.popT > 2.5 });
    this.label({ text: '亜鉛・マンガン', sub: '四面体のすき間', anchor: atomAnchor('A'), offset: [46, 46], when: () => this.step === 0 && this.popT > 2.8 });
    this.label({ text: 'フェライトの特許', sub: '1932年取得（イメージ）', anchor: [0.15, 1.15, 0.2], offset: [80, -50], steps: [1] });
    this.label({ text: 'オキサイドコア', sub: '初期のフェライト製品（イメージ）', anchor: () => this.cores.localToWorld(new THREE.Vector3(0.45, 0.42, 0.14)), offset: [60, 46], when: () => this.step === 2 && this.stepTime > 1.6 });
    this.label({ text: 'IFトランス', sub: '中にフェライトコア', anchor: () => this.radio.userData.ifCore.getWorldPosition(new THREE.Vector3()), offset: [60, -30], when: () => this.step === 2 && this.stepTime > 2.6 });
    this.label({ text: 'ラジオ受信機', sub: '1930年代（イメージ）', anchor: [3.0, 1.95, 0.1], offset: [70, -30], when: () => this.step === 2 && this.stepTime > 2.2 });
    this.label({ text: 'IEEEマイルストーン', sub: '2009年認定（銘板はイメージ）', anchor: [7.6, 1.6, -0.2], offset: [60, -50], when: () => this.step === 3 && this.stepTime > 1.8 });
  }

  poses() {
    return [
      { pos: [-1.55, 2.3, 5.6], target: [-2.6, 1.38, 0], fov: 30, dur: 2.2 },
      { pos: [1.3, 1.55, 3.35], target: [0.28, 0.62, 0], fov: 32, dur: 2.4 },
      { pos: [4.55, 1.8, 4.7], target: [3.3, 1.0, -0.1], fov: 32, dur: 2.4 },
      { pos: [7.95, 1.4, 5.1], target: [7.0, 0.92, -0.3], fov: 30, dur: 2.4 },
    ];
  }

  onStep(step, instant) {
    const targets = [[-3.1, 1.3, 0], [0.15, 0.6, 0], [3.4, 0.9, 0], [7.0, 0.9, -0.3]];
    if (instant) this.keyTarget.fromArray(targets[step]);
    this.keyGoal = targets[step];
  }

  tick(dt, t) {
    // Key light follows the subject.
    if (this.keyGoal) {
      this.keyTarget.x = damp(this.keyTarget.x, this.keyGoal[0], 2.2, dt);
      this.keyTarget.y = damp(this.keyTarget.y, this.keyGoal[1], 2.2, dt);
      this.keyTarget.z = damp(this.keyTarget.z, this.keyGoal[2], 2.2, dt);
    }
    this.key.target.position.copy(this.keyTarget);
    this.key.position.set(this.keyTarget.x - 1.2, 6.5, 4.5);

    // Crystal assembly (first visit), then a slow turntable.
    if (this.step === 0 || this.popT < 4) this.popT += dt;
    const m4 = new THREE.Matrix4();
    const s3 = new THREE.Vector3();
    const q0 = new THREE.Quaternion();
    if (this.popT < 4.5 || !this._settled) {
      for (const a of this.atoms) {
        const k = easeOutBack(clamp01((this.popT - a.delay) / 0.55));
        s3.setScalar(Math.max(0.0001, k));
        m4.compose(a.pos, q0, s3);
        a.im.setMatrixAt(a.i, m4);
      }
      this.atoms.forEach((a) => (a.im.instanceMatrix.needsUpdate = true));
      this.bonds.forEach((b, i) => {
        const k = easeOutCubic(clamp01((this.popT - b.delay) / 0.6));
        s3.set(1, Math.max(0.0001, b.len * k), 1);
        m4.compose(b.a, b.q, s3);
        this.bondMesh.setMatrixAt(i, m4);
      });
      this.bondMesh.instanceMatrix.needsUpdate = true;
      this._settled = this.popT >= 4.5;
    }
    const ak = easeOutBack(clamp01((this.popT - 2.6) / 0.8));
    for (const a of this.arrowData) {
      const wob = Math.sin(t * 2 + a.i) * 0.05;
      q0.setFromEuler(new THREE.Euler(a.dir > 0 ? wob : Math.PI + wob, 0, 0));
      s3.setScalar(Math.max(0.0001, ak));
      m4.compose(a.pos, q0, s3);
      a.im.setMatrixAt(a.i, m4);
    }
    this.arrowsUp.instanceMatrix.needsUpdate = true;
    this.arrowsDown.instanceMatrix.needsUpdate = true;
    q0.identity();
    this.crystal.rotation.y = 0.55 + Math.sin(t * 0.22) * 0.32;
    this.crystal.rotation.x = 0.18 + Math.sin(t * 0.2) * 0.05;

    // Radio: warm dial, levitating cores, waves.
    const radioOn = this.step === 2 ? smoothstep(0.6, 1.6, this.stepTime) : 0;
    this.to('radio', radioOn);
    const rOn = this.param('radio');
    const dial = this.radio.userData.dial;
    dial.material.emissiveIntensity = 0.9 * rOn;
    // Cut the cabinet open from the right-hand side.
    const cut = 0.95 - 0.93 * easeOutCubic(rOn);
    const n = new THREE.Vector3(-1, 0, 0).applyQuaternion(this.radio.quaternion);
    const p0 = this.radio.localToWorld(new THREE.Vector3(cut, 0, 0));
    this.clip.setFromNormalAndCoplanarPoint(n, p0);
    const glow = rOn * (0.85 + Math.sin(t * 13) * 0.04 + Math.sin(t * 7.3) * 0.03);
    for (const hm of this.radio.userData.heaters) hm.color.setRGB(2.6 * glow, 0.9 * glow, 0.25 * glow);
    this.tubeLight.intensity = 1.6 * glow;
    this.radio.userData.needle.rotation.z = -0.9 + rOn * 1.5 + Math.sin(t * 0.7) * 0.03 * rOn;
    this.cores.userData.items.forEach((it, i) => {
      it.position.y = rOn * (0.04 + Math.sin(t * 0.9 + i * 1.7) * 0.02);
      it.rotation.y = rOn * Math.sin(t * 0.3 + i) * 0.3;
    });
    // Plaque light sweep.
    this.to('plaque', this.step === 3 ? 1 : 0);
    const pOn = this.param('plaque');
    const sx = 7.0 + Math.sin(t * 0.45) * 1.1;
    this.sweep.intensity = 80 * pOn;
    this.sweep.position.set(sx + 0.4, 3.0, 3.2);
    this.sweep.target.position.set(sx - 0.2, 0.9, -0.4);
  }
}
