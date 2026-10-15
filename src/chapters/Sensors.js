// CH.10 Sensors — six "senses" on pedestals; an NTC thermistor riding its
// resistance–temperature curve; a TMR stack whose free layer follows a
// rotating magnet; a MEMS accelerometer's proof mass, springs and comb fingers;
// and an edge-AI node listening to a motor's vibration.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials, roundedBox } from '../core/kit.js';
import { ntcBead, lgaPackage, pcbTexture } from '../core/parts.js';
import { canvasTexture } from '../core/textures.js';
import { clamp01, easeOutCubic, smoothstep, mulberry32, damp, lerp } from '../core/math.js';
import { spot } from './common.js';

const NTC = new THREE.Vector3(16, 0, 0);
const TMR = new THREE.Vector3(30, 0, 0);
const MEMS = new THREE.Vector3(44, 0, 0);
const EDGE = new THREE.Vector3(58, 0, 0);

function arrow(mat, len = 0.8, r = 0.035) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len * 0.72, 12), mat);
  shaft.rotation.z = -Math.PI / 2;
  shaft.position.x = len * 0.36 - len / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(r * 2.6, len * 0.28, 16), mat);
  head.rotation.z = -Math.PI / 2;
  head.position.x = len / 2 - len * 0.14;
  g.add(shaft, head);
  return g;
}

function micPackage(M) {
  const g = new THREE.Group();
  const sub = new THREE.Mesh(roundedBox(0.7, 0.06, 0.5, 0.01, 1), new THREE.MeshPhysicalMaterial({ color: 0x2c3a2a, roughness: 0.5, clearcoat: 0.5 }));
  sub.position.y = 0.03;
  const can = new THREE.Mesh(roundedBox(0.66, 0.28, 0.46, 0.05, 3), M.nickel);
  can.position.y = 0.2;
  const port = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 24), M.ink);
  port.position.set(0.15, 0.345, 0.05);
  g.add(sub, can, port);
  return g;
}
function pressurePackage(M) {
  const g = lgaPackage({ w: 0.6, d: 0.6, h: 0.16 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.22, 32), M.steel);
  tube.position.y = 0.27;
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 24), M.ink);
  hole.position.y = 0.385;
  g.add(tube, hole);
  return g;
}
function tofPackage(M) {
  const g = lgaPackage({ w: 0.7, d: 0.7, h: 0.2, color: 0x24262a });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 12, 40), M.nickel);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.205;
  const mem = new THREE.Mesh(new THREE.CircleGeometry(0.18, 40), new THREE.MeshPhysicalMaterial({ color: 0x8a8f96, metalness: 0.6, roughness: 0.3, iridescence: 0.4 }));
  mem.rotation.x = -Math.PI / 2;
  mem.position.y = 0.203;
  g.add(ring, mem);
  return g;
}

/** Chart panel with an exponential NTC curve (resistance vs temperature). */
function ntcChart(M) {
  const g = new THREE.Group();
  const W = 3.2, H = 2.2;
  const tex = canvasTexture(1024, 704, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(20,22,26,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(236,230,218,0.12)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const x = 90 + (i * (w - 130)) / 10;
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.lineTo(x, h - 80);
      ctx.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      const y = 40 + (i * (h - 120)) / 6;
      ctx.beginPath();
      ctx.moveTo(90, y);
      ctx.lineTo(w - 40, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(236,230,218,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(90, 40);
    ctx.lineTo(90, h - 80);
    ctx.lineTo(w - 40, h - 80);
    ctx.stroke();
    ctx.fillStyle = 'rgba(236,230,218,0.75)';
    ctx.font = '500 30px "IBM Plex Mono", monospace';
    ctx.fillText('温度 →', w - 190, h - 30);
    ctx.save();
    ctx.translate(46, 260);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('抵抗 →', -60, 0);
    ctx.restore();
    ['-40', '0', '40', '80', '120', '160℃'].forEach((t, i) => ctx.fillText(t, 76 + (i * (w - 160)) / 5, h - 46));
  }, { srgb: true, key: 'ntcChart' });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  g.add(panel);
  // Curve: R = exp(B (1/T - 1/T0)), normalised into the plot box.
  const pts = [];
  const x0 = -W / 2 + (90 / 1024) * W, x1 = W / 2 - (40 / 1024) * W;
  const y0 = -H / 2 + (80 / 704) * H, y1 = H / 2 - (40 / 704) * H;
  const f = (u) => {
    const T = 233 + u * 200;
    const r = Math.exp(3950 * (1 / T - 1 / 298));
    return Math.log(r) / 6; // log scale -> 0..~1.8
  };
  const fmin = f(1), fmax = f(0);
  for (let i = 0; i <= 80; i++) {
    const u = i / 80;
    const v = (f(u) - fmin) / (fmax - fmin);
    pts.push(new THREE.Vector3(lerp(x0, x1, u), lerp(y0 + 0.05, y1 - 0.05, Math.pow(v, 1.0)), 0.02));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.018, 8, false), M.copper);
  g.add(tube);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf2dcc2, emissive: 0xff9a50, emissiveIntensity: 1.2 }));
  g.add(marker);
  g.userData = { curve, marker };
  return g;
}

/** MEMS accelerometer: proof mass on folded springs with interdigitated combs. */
function buildMems(M) {
  const g = new THREE.Group();
  const si = M.silicon;
  const siDark = new THREE.MeshPhysicalMaterial({ color: 0x23272e, metalness: 0.5, roughness: 0.35, clearcoat: 0.3 });
  const base = new THREE.Mesh(roundedBox(5.2, 0.2, 3.6, 0.03, 2), siDark);
  base.position.y = 0.1;
  base.receiveShadow = true;
  g.add(base);
  const mover = new THREE.Group();
  mover.position.y = 0.42;
  g.add(mover);
  const mass = new THREE.Mesh(roundedBox(2.2, 0.18, 1.5, 0.02, 2), si);
  mass.castShadow = true;
  mover.add(mass);
  // Etch holes on the proof mass.
  const holeGeo = new THREE.BoxGeometry(0.09, 0.012, 0.09);
  const holes = new THREE.InstancedMesh(holeGeo, M.ink, 15 * 10);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < 15; i++)
    for (let j = 0; j < 10; j++) {
      m4.makeTranslation(-0.98 + i * 0.14, 0.09, -0.63 + j * 0.14);
      holes.setMatrixAt(k++, m4);
    }
  mover.add(holes);
  // Comb fingers: moving (on mass) and fixed (on stators), along +-z edges.
  const fingerGeo = new THREE.BoxGeometry(0.05, 0.16, 0.55);
  const movingF = new THREE.InstancedMesh(fingerGeo, si, 2 * 14);
  const fixedF = new THREE.InstancedMesh(fingerGeo, siDark, 2 * 14);
  k = 0;
  for (const sz of [-1, 1])
    for (let i = 0; i < 14; i++) {
      m4.makeTranslation(-1.0 + i * 0.154, 0, sz * (0.75 + 0.27));
      movingF.setMatrixAt(k, m4);
      m4.makeTranslation(-1.0 + i * 0.154 + 0.077, 0.42, sz * (0.75 + 0.42));
      fixedF.setMatrixAt(k, m4);
      k++;
    }
  movingF.castShadow = fixedF.castShadow = true;
  mover.add(movingF);
  g.add(fixedF);
  for (const sz of [-1, 1]) {
    const stator = new THREE.Mesh(roundedBox(2.4, 0.18, 0.22, 0.02, 2), siDark);
    stator.position.set(0, 0.42, sz * 1.55);
    stator.castShadow = true;
    g.add(stator);
  }
  // Folded springs from four anchors.
  const springs = [];
  for (const sx of [-1, 1]) {
    const anchor = new THREE.Mesh(roundedBox(0.3, 0.32, 0.3, 0.02, 2), siDark);
    anchor.position.set(sx * 2.15, 0.36, 0);
    anchor.castShadow = true;
    g.add(anchor);
    const sp = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 1.0), si);
      beam.position.set(sx * (1.2 + i * 0.12), 0, 0);
      sp.add(beam);
      if (i < 5) {
        const link = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.16, 0.035), si);
        link.position.set(sx * (1.26 + i * 0.12), 0, i % 2 ? -0.5 : 0.5);
        sp.add(link);
      }
    }
    sp.position.y = 0.42;
    g.add(sp);
    springs.push({ sp, sx });
  }
  g.userData = { mover, springs };
  return g;
}

export class Sensors extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.dofSteps = [0.004, 0.006, 0.006, 0.01, 0.004];
    this.env = 'studio';
    this.exposure = 1.0;
    this.shift = 0.2;
    this.look = { bloom: 0.13, threshold: 1.0, vignette: 0.38, saturation: 1.03 };
  }

  build() {
    const M = materials();
    const q = this.app.quality.tier;
    this.addBackdrop({ top: '#111316', bottom: '#050506', glow: '#1d2229', glowPos: [0.66, 0.56], glowSize: 0.6, glowStrength: 0.8 });
    this.addDust({ count: 300, radius: 40, height: 6, size: 0.05, opacity: 0.3, seed: 71, center: [30, 2, 0] });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 80), new THREE.MeshPhysicalMaterial({ color: 0x121316, roughness: 0.4, clearcoat: 0.4 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.add(floor);
    this.key = spot(this.scene, { intensity: 130, pos: [-2, 10, 7], target: [0, 0, 0], angle: 0.55, penumbra: 0.8, shadow: q.shadows, shadowSize: q.shadowSize, far: 40 });
    const rim = new THREE.DirectionalLight(0xd2dcff, 1.8);
    rim.position.set(6, 5, -8);
    this.scene.add(rim, new THREE.HemisphereLight(0xfff0e4, 0x0b0b0c, 0.16));
    this.focus = new THREE.Vector3();

    /* --- six senses ---------------------------------------------------------------- */
    const senses = [
      ['温度', 'NTCサーミスタ', () => { const n = ntcBead(); n.scale.setScalar(1.6); n.position.y = 1.0; return n; }],
      ['磁気', 'TMR・ホールセンサ', () => { const p = lgaPackage({ w: 0.6, d: 0.6, h: 0.14 }); p.scale.setScalar(1.4); return p; }],
      ['動き', 'MEMS 6軸IMU', () => { const p = lgaPackage({ w: 0.5, d: 0.5, h: 0.16, color: 0x2a2b2f }); p.scale.setScalar(1.6); return p; }],
      ['音', 'MEMSマイク', () => { const p = micPackage(M); p.scale.setScalar(1.3); return p; }],
      ['圧力', '気圧センサ', () => { const p = pressurePackage(M); p.scale.setScalar(1.4); return p; }],
      ['距離', '超音波ToF', () => { const p = tofPackage(M); p.scale.setScalar(1.3); return p; }],
    ];
    this.ring = new THREE.Group();
    this.add(this.ring);
    senses.forEach(([name, sub, make], i) => {
      const a = (i / senses.length) * Math.PI * 2;
      const r = 2.6;
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.36, 6), M.anodizedDark);
      ped.position.set(Math.cos(a) * r, 0.18, Math.sin(a) * r);
      ped.castShadow = ped.receiveShadow = true;
      this.ring.add(ped);
      const item = make();
      item.position.add(new THREE.Vector3(Math.cos(a) * r, 0.36, Math.sin(a) * r));
      item.rotation.y = -a;
      item.traverse((o) => (o.castShadow = true));
      this.ring.add(item);
      this.label({ text: name, sub, anchor: (out) => this.ring.localToWorld(out.set(Math.cos(a) * r, 0.95, Math.sin(a) * r)), offset: [0, -48], when: () => this.step === 0 && this.stepTime > 1.2 + i * 0.12 });
    });

    /* --- NTC on its curve --------------------------------------------------------- */
    const ntcG = new THREE.Group();
    ntcG.position.copy(NTC);
    this.add(ntcG);
    const chart = ntcChart(M);
    chart.position.set(1.7, 1.9, -0.6);
    ntcG.add(chart);
    this.chart = chart;
    const bead = ntcBead({ color: 0x1b2433 });
    bead.scale.setScalar(2.2);
    bead.position.set(-1.1, 2.2, 0.4);
    ntcG.add(bead);
    this.bead = bead;
    this.heatLight = new THREE.PointLight(0xff8a40, 0, 3, 2);
    this.heatLight.position.set(-1.1, 2.0, 0.9);
    ntcG.add(this.heatLight);
    this.label({ text: '温度が上がると', sub: '抵抗がぐっと下がる', anchor: () => chart.localToWorld(chart.userData.marker.position.clone()), offset: [40, -40], when: () => this.step === 1 && this.stepTime > 1.8 });

    /* --- TMR ------------------------------------------------------------------------- */
    const tmr = new THREE.Group();
    tmr.position.copy(TMR);
    this.add(tmr);
    const pcb = new THREE.Mesh(roundedBox(3.2, 0.08, 2.2, 0.02, 2), new THREE.MeshPhysicalMaterial({ map: pcbTexture({ size: 512, seed: 31, mask: '#12221c', key: 'tmrPcb', traces: 40 }), roughness: 0.4, clearcoat: 0.6 }));
    pcb.position.y = 0.04;
    tmr.add(pcb);
    const chipT = lgaPackage({ w: 0.7, d: 0.7, h: 0.16 });
    chipT.position.y = 0.08;
    tmr.add(chipT);
    const magnet = new THREE.Group();
    const nMat = new THREE.MeshPhysicalMaterial({ color: 0x7a3328, roughness: 0.35, clearcoat: 0.6, metalness: 0.2 });
    const sMat = new THREE.MeshPhysicalMaterial({ color: 0x34445c, roughness: 0.35, clearcoat: 0.6, metalness: 0.2 });
    this.tracker.track(nMat);
    this.tracker.track(sMat);
    const halfA = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 48, 1, false, 0, Math.PI), nMat);
    const halfB = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 48, 1, false, Math.PI, Math.PI), sMat);
    magnet.add(halfA, halfB);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 32), M.steel);
    shaft.position.y = 1.0;
    magnet.add(shaft);
    magnet.position.set(0, 2.25, 0);
    magnet.traverse((o) => (o.castShadow = true));
    tmr.add(magnet);
    this.magnet = magnet;
    // Exploded MTJ stack floating between the chip and the magnet.
    const stack = new THREE.Group();
    stack.position.set(1.9, 1.1, 0.2);
    tmr.add(stack);
    const layerMats = [
      ['ピン層', new THREE.MeshPhysicalMaterial({ color: 0xb07a52, metalness: 0.8, roughness: 0.3 }), 0],
      ['トンネル障壁（MgO）', new THREE.MeshPhysicalMaterial({ color: 0xe8e4dc, roughness: 0.2, transparent: true, opacity: 0.55, depthWrite: false }), 0.5],
      ['フリー層', new THREE.MeshPhysicalMaterial({ color: 0x9aa4b2, metalness: 0.8, roughness: 0.3 }), 1.0],
    ];
    layerMats.forEach(([name, mat, y], i) => {
      this.tracker.track(mat);
      const l = new THREE.Mesh(roundedBox(1.4, i === 1 ? 0.04 : 0.12, 1.0, 0.02, 2), mat);
      l.position.y = y;
      l.castShadow = i !== 1;
      stack.add(l);
      this.label({ text: name, anchor: (out) => stack.localToWorld(out.set(0.72, y, 0.5)), offset: [46, i === 1 ? 0 : i === 0 ? 24 : -24], when: () => this.step === 2 && this.stepTime > 1.6 + i * 0.2 });
    });
    const pinArrow = arrow(new THREE.MeshStandardMaterial({ color: 0xe0a070, metalness: 0.5, roughness: 0.3 }), 0.9);
    pinArrow.position.y = 0.2;
    stack.add(pinArrow);
    const freeArrow = arrow(new THREE.MeshStandardMaterial({ color: 0xc8d4e4, metalness: 0.5, roughness: 0.3 }), 0.9);
    freeArrow.position.y = 1.2;
    stack.add(freeArrow);
    this.freeArrow = freeArrow;
    this.tmrStack = stack;
    // Tunnel current particles through the barrier (denser when parallel).
    const tg = new THREE.SphereGeometry(0.025, 8, 6);
    this.tracker.track(tg);
    this.tunnel = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: 0xf6e3c6, emissive: 0xffb36b, emissiveIntensity: 1.0 }), 60);
    this.tunnelData = Array.from({ length: 60 }, (_, i) => ({ x: (Math.random() - 0.5) * 1.1, z: (Math.random() - 0.5) * 0.8, ph: Math.random() }));
    stack.add(this.tunnel);

    /* --- MEMS ----------------------------------------------------------------------- */
    const mems = buildMems(M);
    mems.position.copy(MEMS);
    this.add(mems);
    this.mems = mems;
    this.label({ text: 'おもり（プルーフマス）', sub: '傾けると慣性でずれる', anchor: () => mems.userData.mover.localToWorld(new THREE.Vector3(0, 0.12, 0)), offset: [40, -56], when: () => this.step === 3 && this.stepTime > 1.6 });
    this.label({ text: 'くし歯電極', sub: 'すき間の変化を電気で読む', anchor: () => mems.localToWorld(new THREE.Vector3(0.6, 0.5, 1.1)), offset: [50, 40], when: () => this.step === 3 && this.stepTime > 2.0 });
    this.label({ text: 'ばね', sub: 'シリコンを細く削って作る', anchor: () => mems.localToWorld(new THREE.Vector3(-1.6, 0.52, 0.5)), offset: [-40, -50], when: () => this.step === 3 && this.stepTime > 2.4 });

    /* --- edge AI -------------------------------------------------------------------- */
    const edge = new THREE.Group();
    edge.position.copy(EDGE);
    this.add(edge);
    const motor = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.4, 48), new THREE.MeshPhysicalMaterial({ color: 0x3b4a5e, metalness: 0.6, roughness: 0.4, clearcoat: 0.3 }));
    body.rotation.z = Math.PI / 2;
    motor.add(body);
    for (let i = 0; i < 14; i++) {
      const fin = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.035, 8, 48), M.anodizedDark);
      fin.rotation.y = Math.PI / 2;
      fin.position.x = -1.0 + i * 0.155;
      motor.add(fin);
    }
    const shaftM = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.8, 24), M.anodizedDark);
    shaftM.rotation.z = Math.PI / 2;
    shaftM.position.x = 1.6;
    motor.add(shaftM);
    const foot = new THREE.Mesh(roundedBox(2.2, 0.25, 1.4, 0.04, 2), M.anodizedDark);
    foot.position.y = -0.9;
    motor.add(foot);
    motor.position.set(-1.6, 1.05, 0);
    motor.traverse((o) => (o.castShadow = true));
    edge.add(motor);
    this.motor = motor;
    const node = lgaPackage({ w: 0.5, d: 0.5, h: 0.12 });
    node.position.set(-1.6, 1.97, 0.0);
    edge.add(node);
    // Vibration ribbon (animated) rising from the sensor.
    this.vibMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAnom: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uTime, uAnom; varying float vX;
        void main() {
          vec3 p = position; float x = p.x;
          float v = 0.18 * sin(x * 9.0 - uTime * 6.0) + 0.06 * sin(x * 23.0 - uTime * 11.0);
          v += uAnom * 0.25 * sin(x * 3.0 - uTime * 2.0) * step(0.8, fract(x * 0.5 - uTime * 0.2));
          p.y += v; vX = x;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `varying float vX; void main(){ gl_FragColor = vec4(mix(vec3(0.85,0.62,0.45), vec3(0.9,0.88,0.82), smoothstep(-1.0, 1.0, vX)) * 1.3, 1.0); }`,
    });
    this.tracker.track(this.vibMat);
    const vib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(-1.3, 0, 0), new THREE.Vector3(1.3, 0, 0)), 300, 0.018, 6, false), this.vibMat);
    vib.position.set(-0.4, 3.0, 0.2);
    edge.add(vib);
    // A small neural network lattice that lights up layer by layer.
    const nodeGeo = new THREE.SphereGeometry(0.07, 16, 12);
    this.tracker.track(nodeGeo);
    this.nn = [];
    const layersN = [4, 6, 6, 2];
    const nodeMatOff = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.7, roughness: 0.3 });
    this.tracker.track(nodeMatOff);
    const positions = [];
    layersN.forEach((n, li) => {
      for (let i = 0; i < n; i++) {
        const mat = nodeMatOff.clone();
        mat.emissive = new THREE.Color(0xffa860);
        mat.emissiveIntensity = 0;
        this.tracker.track(mat);
        const m = new THREE.Mesh(nodeGeo, mat);
        const p = new THREE.Vector3(1.3 + li * 0.7, 2.4 + (i - (n - 1) / 2) * 0.4, 0.2);
        m.position.copy(p);
        edge.add(m);
        this.nn.push({ m, li });
        positions.push({ p, li });
      }
    });
    const linkMat = new THREE.LineBasicMaterial({ color: 0xc8a888, transparent: true, opacity: 0.25 });
    this.tracker.track(linkMat);
    const segs = [];
    positions.forEach((a) => positions.forEach((b) => {
      if (b.li === a.li + 1) segs.push(a.p.x, a.p.y, a.p.z, b.p.x, b.p.y, b.p.z);
    }));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    edge.add(new THREE.LineSegments(lg, linkMat));
    this.label({ text: '振動データ', sub: 'センサが24時間聞き続ける', anchor: () => edge.localToWorld(new THREE.Vector3(-1.0, 3.3, 0.2)), offset: [-30, -46], when: () => this.step === 4 && this.stepTime > 1.6 });
    this.label({ text: 'エッジAI', sub: 'その場で異常の兆しを判断', anchor: () => edge.localToWorld(new THREE.Vector3(2.7, 3.4, 0.2)), offset: [40, -40], when: () => this.step === 4 && this.stepTime > 2.2 });
  }

  poses() {
    return [
      { pos: [0.6, 6.2, 8.4], target: [0.2, 0.6, 0.2], fov: 32, dur: 2.2 },
      { pos: [NTC.x + 0.9, 2.6, 7.6], target: [NTC.x + 0.7, 1.9, 0], fov: 32, dur: 3.0 },
      { pos: [TMR.x + 3.5, 4.0, 7.6], target: [TMR.x + 0.9, 1.35, 0], fov: 32, dur: 3.0 },
      { pos: [MEMS.x + 3.6, 5.4, 6.2], target: [MEMS.x + 0.2, 0.4, 0], fov: 32, dur: 3.0 },
      { pos: [EDGE.x + 1.3, 3.6, 10.4], target: [EDGE.x + 1.0, 2.0, 0], fov: 32, dur: 3.0 },
    ];
  }

  onStep(step, instant) {
    const f = [0, NTC.x, TMR.x, MEMS.x, EDGE.x][step];
    this.focusGoal = f;
    if (instant) this.focus.x = f;
  }

  tick(dt, t) {
    const st = this.stepTime;
    this.focus.x = damp(this.focus.x, this.focusGoal ?? 0, 1.5, dt);
    this.key.position.set(this.focus.x - 2, 10, 7);
    this.key.target.position.set(this.focus.x, 0.8, 0);

    this.ring.rotation.y = t * 0.08;

    // NTC: temperature sweeps, marker slides along the curve, bead warms.
    const temp = 0.5 + 0.5 * Math.sin(t * 0.5);
    const cu = this.chart.userData;
    cu.curve.getPointAt(clamp01(temp), cu.marker.position);
    const beadMat = this.bead.userData.material;
    beadMat.emissive = beadMat.emissive || new THREE.Color();
    beadMat.emissive.setRGB(1.0, 0.42, 0.12);
    const on = this.step === 1 ? 1 : 0;
    this.to('ntc', on);
    beadMat.emissiveIntensity = this.param('ntc') * temp * 1.4;
    this.heatLight.intensity = this.param('ntc') * temp * 2.2;

    // TMR: magnet rotates, the free layer follows, tunnelling rate follows cos(angle).
    const ang = t * 0.7;
    this.magnet.rotation.y = ang;
    this.freeArrow.rotation.y = ang;
    const par = 0.5 + 0.5 * Math.cos(ang);
    const m4 = new THREE.Matrix4();
    this.tunnelData.forEach((d, i) => {
      const u = (t * (0.4 + par * 0.9) + d.ph) % 1;
      const visible = (i / this.tunnelData.length) < 0.15 + 0.85 * par;
      const s = visible && this.step === 2 ? 1 : 0.0001;
      m4.makeScale(s, s, s);
      m4.setPosition(d.x, 1.0 - u, d.z);
      this.tunnel.setMatrixAt(i, m4);
    });
    this.tunnel.instanceMatrix.needsUpdate = true;

    // MEMS: the die tilts back and forth; the proof mass lags on its springs.
    const tilt = Math.sin(t * 0.8) * 0.18;
    this.mems.rotation.z = tilt * 0.6;
    const u = this.mems.userData;
    const disp = Math.sin(t * 0.8 - 0.4) * 0.07;
    u.mover.position.x = disp;
    u.springs.forEach(({ sp, sx }) => {
      sp.scale.x = 1 - sx * disp * 0.8;
    });

    // Edge AI: vibration ribbon, an occasional anomaly lights the network.
    this.vibMat.uniforms.uTime.value = t;
    const anomaly = this.step === 4 ? smoothstep(2.5, 3.5, st) * (0.5 + 0.5 * Math.sin(t * 0.9)) : 0;
    this.vibMat.uniforms.uAnom.value = anomaly;
    this.motor.position.y = 1.05 + Math.sin(t * 40) * 0.004 * (1 + anomaly * 3);
    this.nn.forEach((n) => {
      const wave = Math.max(0, Math.sin(t * 2.2 - n.li * 0.9));
      n.m.material.emissiveIntensity = this.step === 4 ? wave * 0.9 * (0.4 + anomaly * 0.6) : 0;
    });
  }
}
