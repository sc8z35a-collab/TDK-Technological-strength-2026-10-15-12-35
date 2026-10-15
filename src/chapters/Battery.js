// CH.09 Batteries — ten phones, more than half of them opened to reveal a
// TDK-group (ATL) pouch cell; inside a cell: electrode layers and lithium
// ions shuttling through the separator; silicon in the anode; the ATL→CATL
// family tree; and a 100x leap in solid-state energy density.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials, roundedBox, roundedRectShape, extrude } from '../core/kit.js';
import { pouchCell, pcbTexture, mlcc } from '../core/parts.js';
import { clamp01, easeInOutCubic, easeOutCubic, easeOutBack, smoothstep, mulberry32, damp } from '../core/math.js';
import { spot } from './common.js';

const STACK = new THREE.Vector3(26, 0, 0);
const FAMILY = new THREE.Vector3(46, 0, 0);
const SOLID = new THREE.Vector3(64, 0, 0);

function buildPhone(M, { open = false } = {}) {
  const g = new THREE.Group();
  const W = 0.76, L = 1.6, T = 0.085;
  // Screen side down, a hollow aluminium frame, internals inside, glass back on top.
  const front = new THREE.Mesh(roundedBox(W, 0.014, L, 0.007, 2), M.screen);
  front.position.y = 0.007;
  front.castShadow = front.receiveShadow = true;
  g.add(front);
  const ring = roundedRectShape(W, L, 0.1);
  ring.holes.push(new THREE.Path(roundedRectShape(W - 0.04, L - 0.04, 0.08).getPoints(24)));
  const wallGeo = extrude(ring, T - 0.014, 0.004, 2);
  wallGeo.rotateX(-Math.PI / 2);
  const walls = new THREE.Mesh(wallGeo, M.aluminum);
  walls.position.y = 0.014 + (T - 0.014) / 2;
  walls.castShadow = walls.receiveShadow = true;
  g.add(walls);
  const cavity = new THREE.Mesh(roundedBox(W - 0.05, 0.004, L - 0.05, 0.02, 2), new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.8 }));
  cavity.position.y = 0.016;
  g.add(cavity);
  const cell = pouchCell({ w: 0.6, l: 0.92, t: 0.034, label: true, labelColor: 0x9a5f38 });
  cell.position.set(0, 0.04, 0.22);
  cell.rotation.y = Math.PI;
  g.add(cell);
  const board = new THREE.Mesh(roundedBox(0.62, 0.02, 0.42, 0.02, 2), new THREE.MeshPhysicalMaterial({ map: pcbTexture({ size: 512, seed: 21, mask: '#101a16', key: 'phonePcb', traces: 50 }), roughness: 0.4, clearcoat: 0.6 }));
  board.position.set(0, 0.03, -0.5);
  g.add(board);
  const cam = new THREE.Mesh(roundedBox(0.2, 0.05, 0.2, 0.03, 3), M.anodizedDark);
  cam.position.set(-0.17, 0.045, -0.58);
  g.add(cam);
  // Back glass on a hinge at the bottom edge so it can swing open.
  const back = new THREE.Group();
  back.position.set(0, T + 0.004, -L / 2 + 0.02);
  g.add(back);
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x1b1d22, roughness: 0.28, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 });
  const panel = new THREE.Mesh(roundedBox(W - 0.01, 0.008, L - 0.01, 0.04, 3), glassMat);
  panel.position.set(0, 0.004, L / 2 - 0.025);
  panel.castShadow = true;
  back.add(panel);
  const bump = new THREE.Mesh(roundedBox(0.3, 0.03, 0.3, 0.06, 4), glassMat);
  bump.position.set(-0.17, 0.02, 0.25);
  back.add(bump);
  for (const [x, z] of [[-0.24, 0.18], [-0.1, 0.18], [-0.24, 0.32]]) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 32), M.chrome);
    lens.position.set(x, 0.035, z);
    const glassL = new THREE.Mesh(new THREE.CircleGeometry(0.035, 32), M.screen);
    glassL.rotation.x = -Math.PI / 2;
    glassL.position.set(x, 0.051, z);
    back.add(lens, glassL);
  }
  g.userData = { back, cell, open };
  return g;
}

/** Electrode stack: Al foil / cathode / separator / anode / Cu foil, repeated. */
function buildStack(M) {
  const g = new THREE.Group();
  const W = 3.2, D = 2.2;
  const mk = (h, mat) => new THREE.Mesh(roundedBox(W, h, D, Math.min(0.02, h / 2.1), 2), mat);
  const cathodeMat = new THREE.MeshPhysicalMaterial({ color: 0x3a3d44, roughness: 0.6, metalness: 0.3, normalMap: M.cathode.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), sheen: 0.3, sheenColor: new THREE.Color(0x8899aa) });
  const anodeMat = new THREE.MeshPhysicalMaterial({ color: 0x18191b, roughness: 0.75, metalness: 0.1, normalMap: M.graphite.normalMap, normalScale: new THREE.Vector2(0.8, 0.8) });
  const sepMat = new THREE.MeshPhysicalMaterial({ color: 0xf0eee8, roughness: 0.55, transparent: true, opacity: 0.62, depthWrite: false, sheen: 0.5, sheenColor: new THREE.Color(0xffffff) });
  const layers = [
    ['al', 0.03, M.aluminum],
    ['cathode', 0.16, cathodeMat],
    ['sep', 0.05, sepMat],
    ['anode', 0.18, anodeMat],
    ['cu', 0.03, M.copper],
  ];
  const items = [];
  layers.forEach(([key, h, mat]) => {
    const m = mk(h, mat);
    m.castShadow = key !== 'sep';
    m.receiveShadow = true;
    if (key === 'sep') m.renderOrder = 2;
    g.add(m);
    items.push({ key, h, m });
  });
  g.userData = { items, cathodeMat, anodeMat, W, D };
  return g;
}

function prismaticCell(M) {
  const g = new THREE.Group();
  const can = new THREE.Mesh(roundedBox(1.9, 1.15, 0.5, 0.06, 3), M.aluminum);
  can.position.y = 0.575;
  can.castShadow = can.receiveShadow = true;
  g.add(can);
  const lid = new THREE.Mesh(roundedBox(1.92, 0.06, 0.52, 0.03, 2), M.steel);
  lid.position.y = 1.17;
  g.add(lid);
  for (const [x, mat] of [[-0.6, M.aluminum], [0.6, M.copper]]) {
    const post = new THREE.Mesh(roundedBox(0.34, 0.12, 0.3, 0.03, 2), mat);
    post.position.set(x, 1.25, 0);
    post.castShadow = true;
    g.add(post);
  }
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 32), M.chrome);
  vent.scale.set(1.6, 1, 1);
  vent.position.set(0, 1.205, 0);
  g.add(vent);
  const wrap = new THREE.Mesh(roundedBox(1.92, 0.7, 0.52, 0.05, 3), new THREE.MeshPhysicalMaterial({ color: 0x2c4a6a, roughness: 0.35, clearcoat: 0.6 }));
  wrap.position.y = 0.5;
  g.add(wrap);
  return g;
}

export class Battery extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.dofSteps = [0.006, 0.008, 0.008, 0.004, 0.006];
    this.env = 'studio';
    this.exposure = 1.0;
    this.shift = 0.2;
    this.look = { bloom: 0.13, threshold: 1.0, vignette: 0.38, saturation: 1.03 };
  }

  build() {
    const M = materials();
    const q = this.app.quality.tier;
    this.addBackdrop({ top: '#121315', bottom: '#050506', glow: '#272019', glowPos: [0.66, 0.56], glowSize: 0.6, glowStrength: 0.75 });
    this.addDust({ count: 300, radius: 40, height: 6, size: 0.05, opacity: 0.32, seed: 61, center: [30, 2, 0] });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 80), new THREE.MeshPhysicalMaterial({ color: 0x131417, roughness: 0.4, clearcoat: 0.4 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.add(floor);
    this.key = spot(this.scene, { intensity: 130, pos: [-2, 10, 7], target: [0, 0, 0], angle: 0.55, penumbra: 0.8, shadow: q.shadows, shadowSize: q.shadowSize, far: 40 });
    const rim = new THREE.DirectionalLight(0xd2dcff, 1.8);
    rim.position.set(6, 5, -8);
    this.scene.add(rim, new THREE.HemisphereLight(0xfff0e4, 0x0b0b0c, 0.16));
    this.focus = new THREE.Vector3();

    /* --- ten phones, 5–6 opened -------------------------------------------------- */
    this.phones = [];
    const opened = [0, 2, 3, 5, 6, 8];
    for (let i = 0; i < 10; i++) {
      const p = buildPhone(M);
      const col = i % 5, row = Math.floor(i / 5);
      p.position.set(-2.0 + col * 1.0, 0, -0.9 + row * 1.85);
      p.rotation.y = (col - 2) * 0.02;
      this.add(p);
      this.phones.push({ p, open: opened.includes(i), i, partial: i === 8 });
    }
    this.label({ text: 'パウチ型リチウムイオン電池', sub: 'TDKグループ（ATL）が世界の50〜60%を生産', anchor: () => this.phones[3].p.localToWorld(new THREE.Vector3(0, 0.25, 0.2)), offset: [40, -56], when: () => this.step === 0 && this.stepTime > 2.4 });

    /* --- electrode stack with ions ------------------------------------------------ */
    const stack = buildStack(M);
    stack.position.copy(STACK);
    this.add(stack);
    this.stack = stack;
    const rand = mulberry32(13);
    const ionGeo = new THREE.SphereGeometry(0.03, 12, 8);
    const ionMat = new THREE.MeshStandardMaterial({ color: 0xf6e3c6, emissive: 0xffb36b, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.2 });
    this.tracker.track(ionGeo);
    this.tracker.track(ionMat);
    const NI = 140;
    this.ions = new THREE.InstancedMesh(ionGeo, ionMat, NI);
    this.ionData = Array.from({ length: NI }, () => ({ x: (rand() - 0.5) * 2.9, z: (rand() - 0.5) * 1.9, ph: rand(), sp: 0.5 + rand() * 0.5 }));
    this.ions.frustumCulled = false;
    stack.add(this.ions);
    // Silicon particles mixed into the anode.
    const siGeo = new THREE.IcosahedronGeometry(0.07, 2);
    this.tracker.track(siGeo);
    const NS = 90;
    this.si = new THREE.InstancedMesh(siGeo, M.silicon, NS);
    this.siData = Array.from({ length: NS }, () => ({ x: (rand() - 0.5) * 2.9, z: (rand() - 0.5) * 1.9, s: 0.7 + rand() * 0.6 }));
    stack.add(this.si);
    const layerLabel = (key, text, sub, off, steps) =>
      this.label({ text, sub, anchor: (out) => this.layerAnchor(key, out), offset: off, when: () => steps.includes(this.step) && this.stepTime > 1.6 });
    layerLabel('cathode', '正極', 'コバルト酸リチウムなど', [70, 30], [1]);
    layerLabel('sep', 'セパレータ', 'イオンだけを通す膜', [80, 4], [1]);
    layerLabel('anode', '負極', '黒鉛（グラファイト）', [60, -24], [1]);
    layerLabel('anode', 'シリコン', '黒鉛より多くのリチウムを蓄える', [60, 30], [2]);
    this.label({ text: 'リチウムイオン', sub: '充電で負極へ、放電で正極へ', anchor: () => stack.localToWorld(new THREE.Vector3(-1.0, this.layerY('sep') + 0.15, 0.9)), offset: [-50, -46], when: () => this.step === 1 && this.stepTime > 2.4 });

    /* --- ATL → CATL ----------------------------------------------------------------- */
    const fam = new THREE.Group();
    fam.position.copy(FAMILY);
    this.add(fam);
    const atl = pouchCell({ w: 0.9, l: 1.25, t: 0.06, label: true });
    atl.position.set(-1.7, 0.95, 0);
    atl.rotation.set(1.2, 0.3, 0);
    atl.traverse((o) => (o.castShadow = true));
    fam.add(atl);
    const catl = prismaticCell(M);
    catl.position.set(1.4, 0, -0.3);
    catl.rotation.y = -0.35;
    catl.traverse((o) => (o.castShadow = true));
    fam.add(catl);
    this.catl = catl;
    const branchMat = new THREE.MeshStandardMaterial({ color: 0xc8845a, metalness: 1, roughness: 0.3 });
    this.tracker.track(branchMat);
    const branch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-1.2, 0.05, 0.55), new THREE.Vector3(-0.2, 0.05, 1.0), new THREE.Vector3(0.9, 0.05, 0.6)]), 40, 0.02, 8, false), branchMat);
    fam.add(branch);
    this.label({ text: 'ATL', sub: '1999年 香港で創業／2005年 TDKが買収', anchor: () => fam.localToWorld(new THREE.Vector3(-1.7, 0.4, 0.3)), offset: [-30, 56], when: () => this.step === 3 && this.stepTime > 1.6 });
    this.label({ text: 'CATL', sub: '2011年 車載電池部門が独立', anchor: () => fam.localToWorld(new THREE.Vector3(1.4, 1.4, -0.3)), offset: [40, -50], when: () => this.step === 3 && this.stepTime > 2.2 });

    /* --- solid state: 100x ---------------------------------------------------------- */
    const ss = new THREE.Group();
    ss.position.copy(SOLID);
    this.add(ss);
    const chip = mlcc({ l: 1.5, w: 1.0, h: 0.42, band: 0.16, body: 'ceramicIvory' });
    chip.position.set(-1.6, 0.25, 0.4);
    chip.rotation.y = 0.5;
    chip.traverse((o) => (o.castShadow = true));
    ss.add(chip);
    this.ssBars = [];
    [[-0.2, 0.012, '従来品'], [1.2, 1.0, '新材料']].forEach(([x, k, name], i) => {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.6, 40, 1, true), M.glass);
      tube.position.set(x, 1.32, -0.4);
      tube.renderOrder = 2;
      ss.add(tube);
      const fillMat = new THREE.MeshPhysicalMaterial({ color: 0xc8845a, metalness: 0.9, roughness: 0.25, emissive: 0x3a1a08, emissiveIntensity: 0.5 });
      this.tracker.track(fillMat);
      const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 1, 40), fillMat);
      fill.geometry.translate(0, 0.5, 0);
      fill.position.set(x, 0.04, -0.4);
      fill.scale.y = 0.0001;
      ss.add(fill);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.08, 40), M.anodizedDark);
      base.position.set(x, 0.04, -0.4);
      ss.add(base);
      this.ssBars.push({ fill, k });
      this.label({ text: name, sub: i ? '1,000Wh/L（2024年）' : '自社の従来の全固体電池', anchor: () => ss.localToWorld(new THREE.Vector3(x, i ? 2.7 : 0.4, -0.4)), offset: [i ? 40 : -40, i ? -30 : -60], when: () => this.step === 4 && this.stepTime > 1.8 });
    });
    this.label({ text: 'CeraCharge', sub: '世界初のSMD型全固体電池（2020年）', anchor: () => ss.localToWorld(new THREE.Vector3(-1.6, 0.5, 0.4)), offset: [-40, 50], when: () => this.step === 4 && this.stepTime > 2.4 });
  }

  layerY(key) {
    const st = this.stack.userData;
    const e = this.param('explode');
    let y = 0.05;
    for (const it of st.items) {
      if (it.key === key) return y + it.h / 2;
      y += it.h + e * 0.42;
    }
    return y;
  }

  layerAnchor(key, out) {
    const st = this.stack.userData;
    return this.stack.localToWorld(out.set(st.W / 2 - 0.1, this.layerY(key), st.D / 2 - 0.1));
  }

  poses() {
    return [
      { pos: [1.8, 5.2, 6.4], target: [0.2, 0.2, 0.0], fov: 32, dur: 2.2 },
      { pos: [STACK.x + 4.4, 3.6, 6.2], target: [STACK.x + 0.4, 0.95, 0], fov: 30, dur: 3.0 },
      { pos: [STACK.x + 3.2, 2.2, 4.6], target: [STACK.x + 0.6, 0.85, 0.2], fov: 30, dur: 2.4 },
      { pos: [FAMILY.x + 1.8, 3.2, 7.0], target: [FAMILY.x, 0.85, 0], fov: 32, dur: 3.0 },
      { pos: [SOLID.x + 1.8, 2.9, 6.6], target: [SOLID.x + 0.1, 1.1, 0], fov: 32, dur: 3.0 },
    ];
  }

  onStep(step, instant) {
    const f = [0, STACK.x, STACK.x, FAMILY.x, SOLID.x][step];
    this.focusGoal = f;
    if (instant) this.focus.x = f;
  }

  tick(dt, t) {
    const st = this.stepTime;
    this.focus.x = damp(this.focus.x, this.focusGoal ?? 0, 1.5, dt);
    this.key.position.set(this.focus.x - 2, 10, 7);
    this.key.target.position.set(this.focus.x, 0.5, 0);

    // Phones: backs swing open one after another.
    for (const ph of this.phones) {
      const target = ph.open ? (this.step === 0 ? easeOutCubic(clamp01((st - 0.6 - ph.i * 0.12) / 0.9)) : 1) * (ph.partial ? 0.55 : 1) : 0;
      const b = ph.p.userData.back;
      b.rotation.x = damp(b.rotation.x, -target * 1.75, 6, dt);
      const cell = ph.p.userData.cell;
      cell.position.y = 0.04 + damp(cell.position.y - 0.04, ph.open && this.step === 0 && b.rotation.x < -1.2 ? 0.12 + 0.04 * Math.sin(t * 1.2 + ph.i) : 0, 4, dt);
    }

    // Electrode stack: explode, ions shuttle.
    this.to('explode', this.step === 1 || this.step === 2 ? smoothstep(0.5, 2.0, st) : 0);
    const sd = this.stack.userData;
    let y = 0.05;
    const e = this.param('explode');
    for (const it of sd.items) {
      it.m.position.y = y + it.h / 2;
      y += it.h + e * 0.42;
    }
    const yC = this.layerY('cathode'), yA = this.layerY('anode');
    const m4 = new THREE.Matrix4();
    const pv = new THREE.Vector3();
    const show = (this.step === 1 || this.step === 2) && st > 1.2 ? 1 : 0;
    this.to('ions', show);
    const ionK = this.param('ions');
    const charge = Math.sin(t * 0.35) > -0.2 ? 1 : -1;
    this.ionData.forEach((d, i) => {
      const u = (t * 0.25 * d.sp + d.ph) % 1;
      const yy = charge > 0 ? yC + (yA - yC) * u : yA + (yC - yA) * u;
      pv.set(d.x + Math.sin(t * 2 + i) * 0.02, yy, d.z);
      m4.makeScale(ionK, ionK, ionK);
      m4.setPosition(pv);
      this.ions.setMatrixAt(i, m4);
    });
    this.ions.instanceMatrix.needsUpdate = true;
    this.ions.visible = ionK > 0.01;
    // Silicon particles appear on step 2.
    this.to('si', this.step === 2 ? smoothstep(0.6, 1.8, st) : 0);
    const sk = this.param('si');
    this.siData.forEach((d, i) => {
      const s = Math.max(0.0001, sk * d.s * (1 + 0.15 * Math.sin(t * 1.5 + i)));
      m4.makeScale(s, s, s);
      m4.setPosition(d.x, yA + 0.02, d.z);
      this.si.setMatrixAt(i, m4);
    });
    this.si.instanceMatrix.needsUpdate = true;
    this.si.visible = sk > 0.01;
    this.stack.rotation.y = -0.35 + Math.sin(t * 0.2) * 0.06;

    // CATL cell grows out of the ATL branch.
    const ck = this.step === 3 ? easeOutBack(clamp01((st - 0.8) / 1.0)) : this.step > 3 ? 1 : 0;
    this.catl.scale.setScalar(Math.max(0.0001, damp(this.catl.scale.x, ck, 6, dt)));

    // Solid-state gauges.
    this.ssBars.forEach((b) => {
      const k = this.step === 4 ? easeOutCubic(clamp01((st - 0.9) / 1.6)) : 0;
      b.fill.scale.y = Math.max(0.0001, damp(b.fill.scale.y, 2.5 * b.k * k + 0.0001, 5, dt));
    });
  }
}
