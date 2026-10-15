// CH.05 World share — a bright gallery. Products stand on plinths around an arc,
// each with a vertical ring gauge showing TDK's estimated global share band.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials, roundedBox, textPlane, extrude } from '../core/kit.js';
import { arcSegmentGeometry, arcMaterial } from '../core/charts.js';
import { mlcc, commonModeFilter, ntcBead, discComponent, pouchCell, powerSupply } from '../core/parts.js';
import { clamp01, easeOutCubic, easeOutBack, damp, smoothstep } from '../core/math.js';

/** HDD suspension: stainless load beam with rails, flexure and slider. Length ~1.1 along -Z. */
export function suspension(M) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-0.24, 0);
  s.lineTo(0.24, 0);
  s.lineTo(0.07, -1.0);
  s.quadraticCurveTo(0, -1.06, -0.07, -1.0);
  s.lineTo(-0.24, 0);
  const hole = new THREE.Path();
  hole.absellipse(0, -0.42, 0.05, 0.12, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const beam = new THREE.Mesh(extrude(s, 0.012, 0.002, 1), M.steel);
  beam.rotation.x = -Math.PI / 2;
  beam.castShadow = beam.receiveShadow = true;
  g.add(beam);
  // Side rails (bent flanges).
  for (const sx of [-1, 1]) {
    const pts = [new THREE.Vector3(sx * 0.235, 0.02, -0.05), new THREE.Vector3(sx * 0.068, 0.02, -0.95)];
    const len = pts[0].distanceTo(pts[1]);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.04, len), M.steel);
    rail.position.copy(pts[0]).lerp(pts[1], 0.5);
    rail.lookAt(pts[1]);
    rail.castShadow = true;
    g.add(rail);
  }
  // Base plate with swage boss.
  const base = new THREE.Mesh(roundedBox(0.62, 0.03, 0.4, 0.02, 2), M.steel);
  base.position.set(0, 0.0, 0.18);
  base.castShadow = true;
  g.add(base);
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 40), M.steel);
  boss.position.set(0, 0.02, 0.18);
  g.add(boss);
  // Flexure with copper traces on amber polyimide.
  const flex = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 1.05), M.kapton);
  flex.position.set(0.12, 0.012, -0.42);
  flex.rotation.y = -0.17;
  g.add(flex);
  // Gimbal tongue and slider at the tip.
  const slider = new THREE.Mesh(roundedBox(0.09, 0.03, 0.11, 0.006, 1), new THREE.MeshPhysicalMaterial({ color: 0x3a3c41, metalness: 0.4, roughness: 0.3, clearcoat: 0.6 }));
  slider.position.set(0, -0.02, -0.97);
  g.add(slider);
  return g;
}

const PLINTHS = [
  { key: 'battery', name: '小型二次電池', rank: 'No.1', lo: 50, hi: 60 },
  { key: 'emc', name: '信号系EMCフィルタ', rank: 'No.1', lo: 45, hi: 50 },
  { key: 'temp', name: '温度センサ', rank: 'No.1', lo: 35, hi: 40 },
  { key: 'susp', name: 'HDD用サスペンション', rank: 'No.2', lo: 40, hi: 45 },
  { key: 'mlcc', name: '車載用セラミックコンデンサ', rank: 'No.2', lo: 35, hi: 40 },
  { key: 'varistor', name: 'バリスタ', rank: 'No.1', lo: 55, hi: 60 },
  { key: 'ptc', name: 'PTCサーミスタ', rank: 'No.1', lo: 50, hi: 55 },
  { key: 'psu', name: '産業機器向け電源', rank: 'No.1', lo: 15, hi: 20 },
];
const R = 6.2;
const angleOf = (i) => ((-62 + i * (124 / (PLINTHS.length - 1))) * Math.PI) / 180;

export class Share extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.env = 'gallery';
    this.exposure = 0.9;
    this.shift = 0.2;
    this.look = { bloom: 0.06, threshold: 1.3, vignette: 0.2, grain: 0.02, saturation: 1.02 };
  }

  build() {
    const M = materials();
    const q = this.app.quality.tier;
    const bg = 0xe9e5de;
    this.addBackdrop({ top: '#f5f3ef', bottom: '#e6e1d9', glow: '#ffffff', glowPos: [0.6, 0.75], glowSize: 0.7, glowStrength: 0.3, noise: 0.006 });
    this.scene.fog = new THREE.Fog(bg, 12, 30);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 96), new THREE.MeshStandardMaterial({ color: 0xece8e1, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.add(floor);
    // Curved gallery wall behind the plinths.
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R + 2.4, R + 2.4, 6, 96, 1, true, Math.PI * 0.5 + 0.0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xf1eee8, roughness: 0.95, side: THREE.BackSide }));
    wall.position.y = 3;
    wall.rotation.y = Math.PI;
    wall.receiveShadow = true;
    this.add(wall);

    this.sun = new THREE.DirectionalLight(0xfffaf3, 2.5);
    this.sun.position.set(-3, 10, 5);
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    Object.assign(this.sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 5;
    this.scene.add(this.sun, this.sun.target);
    this.sun.target.position.set(0, 0, -R);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd6cec2, 0.38));

    const plinthMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f1ec, roughness: 0.6, clearcoat: 0.2 });
    this.tracker.track(plinthMat);
    const trackMat = new THREE.MeshPhysicalMaterial({ color: 0xdcd6cc, roughness: 0.6 });
    const fillMat = new THREE.MeshPhysicalMaterial({ color: 0xc8845a, metalness: 1, roughness: 0.25, clearcoat: 0.5 });
    const bandMat = new THREE.MeshPhysicalMaterial({ color: 0xe7c49b, metalness: 0.6, roughness: 0.35, transparent: true, opacity: 0.75 });
    [trackMat, fillMat, bandMat].forEach((m) => this.tracker.track(m));
    const segGeo = arcSegmentGeometry({ segments: 128, bevel: 0.12 });
    this.tracker.track(segGeo);
    const ink = '#2c2f34';

    this.stands = PLINTHS.map((p, i) => {
      const a = angleOf(i);
      const root = new THREE.Group();
      root.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
      root.rotation.y = -a;
      this.add(root);
      const plinth = new THREE.Mesh(roundedBox(1.25, 1.0, 1.25, 0.03, 3), plinthMat);
      plinth.position.y = 0.5;
      plinth.castShadow = plinth.receiveShadow = true;
      root.add(plinth);
      const name = textPlane([p.name, `世界${p.rank}　${p.lo}〜${p.hi}%`], {
        width: 1.15,
        height: 0.32,
        px: 640,
        color: ink,
        font: ['600 64px "IBM Plex Sans JP", sans-serif', '500 50px "IBM Plex Mono", monospace'],
        key: `plq${p.key}`,
      });
      name.position.set(0, 0.68, 0.628);
      root.add(name);
      // Product.
      const prod = this.product(p.key, M);
      prod.position.y = 1.0;
      root.add(prod);
      // Ring gauge behind the product.
      const gauge = new THREE.Group();
      gauge.position.set(0, 1.85, -0.35);
      gauge.rotation.x = Math.PI / 2;
      root.add(gauge);
      const mk = (mat, r0, r1, h) => {
        const am = arcMaterial(mat);
        const m = new THREE.Mesh(segGeo, am);
        m.customDepthMaterial = am.arcDepth;
        m.castShadow = true;
        m.frustumCulled = false;
        am.arc.uR0.value = r0;
        am.arc.uR1.value = r1;
        am.arc.uH.value = h;
        am.arc.uY.value = -h / 2;
        gauge.add(m);
        this.tracker.track(am);
        return am;
      };
      const track = mk(trackMat, 0.62, 0.7, 0.05);
      track.arc.uA0.value = -Math.PI / 2;
      track.arc.uA1.value = Math.PI * 1.5;
      const fill = mk(fillMat, 0.6, 0.72, 0.08);
      const band = mk(bandMat, 0.6, 0.72, 0.07);
      const st = { root, prod, fill, band, k: 0, p, i, a };
      this.label({
        text: `${p.name}`,
        sub: `世界${p.rank}　${p.lo}〜${p.hi}%（TDK推定）`,
        anchor: (out) => root.localToWorld(out.set(0.55, 2.5, -0.35)),
        offset: [36, -30],
        when: () => this.labelFocus().includes(i) && this.stepTime > 1.4,
      });
      return st;
    });
  }

  product(key, M) {
    const g = new THREE.Group();
    let item;
    switch (key) {
      case 'battery':
        item = pouchCell({ w: 0.56, l: 0.8, t: 0.05, label: true });
        item.rotation.set(-0.95, 0.35, 0);
        item.position.set(0, 0.42, 0);
        break;
      case 'emc':
        item = commonModeFilter();
        item.scale.setScalar(0.3);
        item.rotation.set(0.25, 0.6, 0);
        item.position.set(0, 0.22, 0);
        break;
      case 'temp':
        item = ntcBead({ color: 0x1b2433 });
        item.scale.setScalar(0.9);
        item.rotation.set(0, 0.4, 0.15);
        item.position.set(0, 0.62, 0);
        break;
      case 'susp':
        item = suspension(M);
        item.scale.setScalar(0.85);
        item.rotation.set(0.5, 2.4, 0.15);
        item.position.set(0.0, 0.42, -0.2);
        break;
      case 'mlcc':
        item = mlcc({ l: 0.64, w: 0.5, h: 0.5, band: 0.2 });
        item.rotation.set(0.2, 0.55, 0);
        item.position.set(0, 0.3, 0);
        break;
      case 'varistor':
        item = discComponent({ color: 0x2c5b8a });
        item.scale.setScalar(0.6);
        item.rotation.set(0, 0.5, 0);
        item.position.set(0, 0.6, 0);
        break;
      case 'ptc':
        item = discComponent({ color: 0xb7ae9c });
        item.scale.setScalar(0.6);
        item.rotation.set(0, -0.4, 0);
        item.position.set(0, 0.6, 0);
        break;
      case 'psu':
        item = powerSupply();
        item.scale.setScalar(0.48);
        item.rotation.set(0, 0.5, 0);
        item.position.set(0, 0.0, 0);
        break;
    }
    g.add(item);
    g.userData.item = item;
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    return g;
  }

  focusIndex() {
    return [[0, 1, 2, 3, 4], [0], [1], [2], [3, 4], [5, 6, 7]][this.step] || [];
  }

  labelFocus() {
    return this.step === 0 ? [] : this.focusIndex();
  }

  /** Camera pose looking at the plinth(s) i (array). */
  poseFor(list, dist = 4.7, h = 2.35) {
    const a = list.reduce((s, i) => s + angleOf(i), 0) / list.length;
    const spread = list.length > 1 ? (angleOf(list[list.length - 1]) - angleOf(list[0])) * 0.5 : 0;
    const d = dist + spread * 6.5;
    const tx = Math.sin(a) * (R - 0.2), tz = -Math.cos(a) * (R - 0.2);
    return { pos: [tx - Math.sin(a) * d, h + spread * 1.6, tz + Math.cos(a) * d], target: [tx, 1.62, tz], fov: 32 };
  }

  poses() {
    return [
      { pos: [-1.6, 3.7, 5.2], target: [1.7, 1.0, -5.6], fov: 44, dur: 2.2 },
      { ...this.poseFor([0]), dur: 2.6 },
      { ...this.poseFor([1]), dur: 2.4 },
      { ...this.poseFor([2]), dur: 2.4 },
      { ...this.poseFor([3, 4], 4.4), dur: 2.6 },
      { ...this.poseFor([5, 6, 7], 4.0), dur: 2.8 },
    ];
  }

  tick(dt, t) {
    const focus = this.focusIndex();
    for (const s of this.stands) {
      const on = focus.includes(s.i);
      const target = on ? 1 : this.step === 0 ? 0.0 : s.k > 0.99 ? 1 : 0;
      if (on && this.stepTime > 0.6) s.k = Math.min(1, s.k + dt * 0.7);
      else if (!on && this.step === 0) s.k = Math.max(0, s.k - dt * 1.5);
      const k = easeOutCubic(s.k);
      const start = -Math.PI / 2;
      const lo = (s.p.lo / 100) * Math.PI * 2 * k;
      const hi = (s.p.hi / 100) * Math.PI * 2 * k;
      s.fill.arc.uA0.value = start;
      s.fill.arc.uA1.value = start + Math.max(0.0001, lo);
      s.band.arc.uA0.value = start + lo;
      s.band.arc.uA1.value = start + Math.max(lo + 0.0001, hi);
      // Gentle turntable for the product in focus.
      const item = s.prod.userData.item;
      s.prod.rotation.y = damp(s.prod.rotation.y, on ? Math.sin(t * 0.4 + s.i) * 0.5 : 0, 2, dt);
      s.prod.position.y = 1.0 + (on ? Math.sin(t * 0.9 + s.i) * 0.02 : 0);
    }
    const f = focus.length ? focus : [0];
    const a = f.reduce((sum, i) => sum + angleOf(i), 0) / f.length;
    this.sun.position.set(Math.sin(a) * R - 3, 10, -Math.cos(a) * R + 6);
    this.sun.target.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
  }
}
