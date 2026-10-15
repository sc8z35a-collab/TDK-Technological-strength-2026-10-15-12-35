// CH.06 MLCC — sizes next to a grain of rice, a chip cut open to show its
// hundreds of interleaved electrodes, thousands of chips swarming into the
// shape of a car, and the 2x-capacitance 100 V chip for AI servers.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials, roundedBox, withDissolve } from '../core/kit.js';
import { mlcc } from '../core/parts.js';
import { clamp01, easeInOutCubic, easeOutCubic, easeOutBack, smoothstep, mulberry32, damp, lerp } from '../core/math.js';
import { spot } from './common.js';

const SIZES = [
  ['0402', 0.4, 0.2, 0.2],
  ['0603', 0.6, 0.3, 0.3],
  ['1005', 1.0, 0.5, 0.5],
  ['1608', 1.6, 0.8, 0.8],
  ['2012', 2.0, 1.25, 1.25],
  ['3225', 3.2, 2.5, 2.5],
];
const HERO = new THREE.Vector3(24, 0, 0);
const CMP = new THREE.Vector3(48, 0, 0);

/** Signed distance to a rounded box. */
function sdBox(p, c, b, r) {
  const qx = Math.abs(p.x - c[0]) - b[0] + r, qy = Math.abs(p.y - c[1]) - b[1] + r, qz = Math.abs(p.z - c[2]) - b[2] + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
}
function sdCylZ(p, c, r, h) {
  const d = Math.hypot(p.x - c[0], p.y - c[1]) - r;
  const dz = Math.abs(p.z - c[2]) - h;
  return Math.min(Math.max(d, dz), 0) + Math.hypot(Math.max(d, 0), Math.max(dz, 0));
}
/** Simple car silhouette as an SDF (length along X, ~9 units). */
function carSDF(p) {
  const body = sdBox(p, [0, 0.95, 0], [4.4, 0.45, 1.75], 0.4);
  const cabin = sdBox(p, [-0.4, 1.75, 0], [2.3, 0.5, 1.5], 0.55);
  const nose = sdBox(p, [3.6, 0.8, 0], [1.0, 0.32, 1.65], 0.3);
  let d = Math.min(body, cabin, nose);
  for (const [x, z] of [[2.8, 1.6], [-2.8, 1.6], [2.8, -1.6], [-2.8, -1.6]]) {
    // carve wheel arches, then add tyres
    d = Math.max(d, -sdCylZ(p, [x, 0.55, z], 0.95, 0.5));
    d = Math.min(d, sdCylZ(p, [x, 0.55, z], 0.78, 0.32));
  }
  return d;
}

function sampleSurface(sdf, count, bounds, rand) {
  const pts = [];
  const p = new THREE.Vector3();
  const e = 0.01;
  let tries = 0;
  while (pts.length < count && tries < count * 400) {
    tries++;
    p.set(lerp(bounds[0], bounds[3], rand()), lerp(bounds[1], bounds[4], rand()), lerp(bounds[2], bounds[5], rand()));
    const d = sdf(p);
    if (Math.abs(d) > 0.06) continue;
    // project onto the surface along the gradient
    const nx = sdf(new THREE.Vector3(p.x + e, p.y, p.z)) - sdf(new THREE.Vector3(p.x - e, p.y, p.z));
    const ny = sdf(new THREE.Vector3(p.x, p.y + e, p.z)) - sdf(new THREE.Vector3(p.x, p.y - e, p.z));
    const nz = sdf(new THREE.Vector3(p.x, p.y, p.z + e)) - sdf(new THREE.Vector3(p.x, p.y, p.z - e));
    const n = new THREE.Vector3(nx, ny, nz).normalize();
    pts.push({ p: p.clone().addScaledVector(n, -d), n });
  }
  return pts;
}

export class Mlcc extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.env = 'studio';
    this.exposure = 1.0;
    this.shift = 0.2;
    this.look = { bloom: 0.12, threshold: 1.0, vignette: 0.38, saturation: 1.03 };
  }

  build() {
    const M = materials();
    const q = this.app.quality.tier;
    this.addBackdrop({ top: '#131416', bottom: '#060607', glow: '#272019', glowPos: [0.68, 0.58], glowSize: 0.6, glowStrength: 0.75 });
    this.addDust({ count: 300, radius: 30, height: 6, size: 0.05, opacity: 0.35, seed: 31, center: [24, 2, 0] });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), new THREE.MeshPhysicalMaterial({ color: 0x141518, roughness: 0.38, metalness: 0.0, clearcoat: 0.5, clearcoatRoughness: 0.25 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.add(floor);
    this.key = spot(this.scene, { intensity: 140, pos: [2, 9, 7], target: [4, 0, 0], angle: 0.55, penumbra: 0.8, shadow: q.shadows, shadowSize: q.shadowSize, far: 40 });
    const rim = new THREE.DirectionalLight(0xd2dcff, 1.8);
    rim.position.set(6, 5, -8);
    this.scene.add(rim, rim.target, new THREE.HemisphereLight(0xfff0e4, 0x0b0b0c, 0.15));
    this.focus = new THREE.Vector3(4, 0, 0);

    /* --- size lineup (1 unit = 1 mm) ------------------------------------------- */
    const xs = [0, 0.75, 1.75, 3.25, 5.2, 7.8];
    this.lineup = SIZES.map(([name, l, w, h], i) => {
      const x = xs[i];
      const chip = mlcc({ l, w, h, band: 0.22 });
      chip.position.set(x, h / 2 + 0.035, 0);
      chip.rotation.y = -0.15;
      chip.traverse((o) => (o.castShadow = true));
      this.add(chip);
      this.label({ text: name, sub: `${l}×${w}mm`, anchor: [x, h + 0.08, 0], offset: [i % 2 ? 22 : -22, -40 - (i % 2) * 26], steps: [0] });
      return { chip, x, h, name };
    });
    const x = 9.4;
    const riceMat = new THREE.MeshPhysicalMaterial({ color: 0xf3efe6, roughness: 0.42, sheen: 0.6, sheenColor: new THREE.Color(0xffffff), clearcoat: 0.2, clearcoatRoughness: 0.5 });
    const rice = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), riceMat);
    rice.scale.set(2.6, 0.9, 1.3);
    rice.position.set(x + 2.0, 0.9, -0.2);
    rice.rotation.y = -0.25;
    rice.castShadow = true;
    this.add(rice);
    this.tracker.track(riceMat);
    this.label({ text: '米粒', sub: '長さ約5mm', anchor: [x + 2.4, 1.85, -0.2], offset: [24, -40], steps: [0] });

    /* --- hero chip, cut open ------------------------------------------------------ */
    const L = 3.2, W = 2.5, H = 2.5;
    const hero = new THREE.Group();
    hero.position.copy(HERO);
    this.add(hero);
    this.hero = hero;
    const term = 0.42;
    const dielectric = new THREE.MeshPhysicalMaterial({ color: 0x9a7552, roughness: 0.55, normalMap: M.ceramicTan.normalMap, normalScale: new THREE.Vector2(0.25, 0.25), sheen: 0.3, sheenColor: new THREE.Color(0xd8bf9c) });
    const nickelPos = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 1, roughness: 0.3, emissive: 0xff8a3c, emissiveIntensity: 0 });
    const nickelNeg = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 1, roughness: 0.3, emissive: 0x6f9ad8, emissiveIntensity: 0 });
    this.nickelPos = nickelPos;
    this.nickelNeg = nickelNeg;
    this.tracker.track(dielectric);
    this.tracker.track(nickelPos);
    this.tracker.track(nickelNeg);
    // Back half: cover layers + interleaved electrodes, cut face at z = 0.
    const back = new THREE.Group();
    hero.add(back);
    const nLayers = 36;
    const cover = 0.22;
    const pitch = (H - 2 * cover) / nLayers;
    const eT = pitch * 0.32;
    const innerL = L - 2 * term;
    const block = new THREE.Mesh(new THREE.BoxGeometry(innerL, H, W / 2), dielectric);
    block.position.set(0, H / 2, -W / 4 - 0.0005);
    block.castShadow = block.receiveShadow = true;
    back.add(block);
    const eGeo = new THREE.BoxGeometry(innerL * 0.86, eT, W / 2 - 0.18);
    this.tracker.track(eGeo);
    this.electrodes = [];
    for (let i = 0; i < nLayers; i++) {
      const left = i % 2 === 0;
      const e = new THREE.Mesh(eGeo, left ? nickelPos : nickelNeg);
      e.position.set((left ? -1 : 1) * innerL * 0.07, cover + pitch * (i + 0.5), -W / 4 + 0.09 + 0.001);
      back.add(e);
      this.electrodes.push(e);
    }
    // Terminations (copper base + nickel + tin, shown as layered caps).
    const capMat = [M.copper, M.nickel, M.tin];
    this.terms = [];
    for (const sx of [-1, 1]) {
      capMat.forEach((m, k) => {
        const t = 0.05 + k * 0.03;
        const cap = new THREE.Mesh(roundedBox(term - k * 0.03, H + t, W + t, 0.08, 3), m);
        cap.position.set(sx * (L / 2 - (term - k * 0.03) / 2), H / 2, 0);
        cap.castShadow = true;
        if (k < 2) cap.visible = false;
        hero.add(cap);
        if (k === 2) this.terms.push(cap);
      });
    }
    // Front half: solid ceramic that slides away and dissolves.
    const frontMat = withDissolve(M.ceramicTan, { edgeColor: 0xffb070, edgeWidth: 0.08, scale: 2.2, intensity: 3 });
    frontMat.dissolve.uReveal.value = 1;
    this.tracker.track(frontMat);
    const front = new THREE.Mesh(roundedBox(innerL + 0.02, H, W / 2, 0.05, 2), frontMat);
    front.position.set(0, H / 2, W / 4);
    front.castShadow = true;
    hero.add(front);
    this.front = front;
    this.frontMat = frontMat;
    // Charge glow: + electrodes warm, - electrodes cool (subtle).
    this.label({ text: '誘電体（チタン酸バリウム）', sub: 'うすいセラミックの層', anchor: () => hero.localToWorld(new THREE.Vector3(0.6, cover + pitch * 20, 0.02)), offset: [70, -40], when: () => this.step === 1 && this.stepTime > 2.2 });
    this.label({ text: '内部電極（ニッケル）', sub: '左右の端子へ交互につながる', anchor: () => hero.localToWorld(new THREE.Vector3(-0.4, cover + pitch * 11.5, 0.02)), offset: [-60, 50], when: () => this.step === 1 && this.stepTime > 2.6 });
    this.label({ text: '外部電極', sub: '銅・ニッケル・すずめっき', anchor: () => hero.localToWorld(new THREE.Vector3(L / 2 - 0.1, H * 0.85, W / 2)), offset: [50, -40], when: () => this.step === 1 && this.stepTime > 3.0 });

    /* --- swarm into a car ---------------------------------------------------------- */
    const rand = mulberry32(77);
    const count = Math.round(5200 * Math.max(0.5, q.particles));
    const pts = sampleSurface(carSDF, count, [-5, 0.05, -2.4, 5, 3, 2.4], rand);
    const chipBody = roundedBox(0.16, 0.08, 0.08, 0.012, 1);
    const chipTerm = roundedBox(0.035, 0.088, 0.088, 0.012, 1);
    this.tracker.track(chipBody);
    this.tracker.track(chipTerm);
    this.swarm = {
      body: new THREE.InstancedMesh(chipBody, M.ceramicTan, pts.length),
      term: new THREE.InstancedMesh(chipTerm, M.tin, pts.length * 2),
      items: pts.map((s) => {
        const up = new THREE.Vector3(0, 1, 0);
        const qn = new THREE.Quaternion().setFromUnitVectors(up, s.n);
        qn.multiply(new THREE.Quaternion().setFromAxisAngle(up, rand() * Math.PI));
        const start = new THREE.Vector3((rand() - 0.5) * 1.5, H * (0.2 + rand() * 0.6), (rand() - 0.5) * 1.2);
        return { p: s.p, q: qn, start, delay: (s.p.x + 5) * 0.08 + rand() * 0.6, spin: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6, rand() * 6, rand() * 6)) };
      }),
    };
    this.swarm.body.castShadow = this.swarm.term.castShadow = true;
    this.swarm.body.position.copy(HERO);
    this.swarm.term.position.copy(HERO);
    this.swarm.body.visible = this.swarm.term.visible = false;
    this.swarm.body.frustumCulled = this.swarm.term.frustumCulled = false;
    this.add(this.swarm.body);
    this.add(this.swarm.term);
    this.swarmT = 0;
    this.label({ text: 'EV1台に', sub: '5,000〜10,000個以上のMLCC', anchor: () => new THREE.Vector3(HERO.x + 1.0, 3.1, 0), offset: [60, -40], when: () => this.step === 2 && this.swarmT > 4.2, cls: 'big' });

    /* --- 2x capacitance comparison ---------------------------------------------- */
    const cmp = new THREE.Group();
    cmp.position.copy(CMP);
    this.add(cmp);
    this.cmpBars = [];
    [['従来品', 0.5, -3.3], ['新製品', 1.0, 1.5]].forEach(([name, cap, cx], i) => {
      const chip = mlcc({ l: 3.2, w: 2.5, h: 2.5, band: 0.2 });
      chip.position.set(cx, 1.25 + 0.04, 0);
      chip.rotation.y = i ? -0.35 : 0.35;
      chip.traverse((o) => (o.castShadow = true));
      cmp.add(chip);
      // Glass tube gauge filled with "charge".
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 3.2, 40, 1, true), M.glass);
      tube.position.set(cx + 2.1, 1.6, 0.2);
      tube.renderOrder = 2;
      cmp.add(tube);
      const fillMat = new THREE.MeshPhysicalMaterial({ color: 0xc8845a, metalness: 0.9, roughness: 0.25, emissive: 0x3a1a08, emissiveIntensity: 0.5 });
      this.tracker.track(fillMat);
      const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 40), fillMat);
      fill.geometry.translate(0, 0.5, 0);
      fill.position.set(cx + 2.1, 0.02, 0.2);
      fill.scale.y = 0.0001;
      cmp.add(fill);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.08, 40), M.anodizedDark);
      base.position.set(cx + 2.1, 0.04, 0.2);
      cmp.add(base);
      this.cmpBars.push({ fill, cap });
      this.label({ text: name, sub: i ? '100V・10µF（2026年9月）' : '同サイズの従来品', anchor: () => cmp.localToWorld(new THREE.Vector3(cx, 2.7, 0)), offset: [i ? 40 : -40, -34], when: () => this.step === 3 && this.stepTime > 1.5 });
    });
    this.label({ text: '容量 2倍', sub: '同じ3.2×2.5mmで', anchor: () => cmp.localToWorld(new THREE.Vector3(3.6, 1.6, 0.4)), offset: [44, 46], when: () => this.step === 3 && this.stepTime > 2.6, cls: 'big' });
  }

  poses() {
    return [
      { pos: [9.5, 10.5, 36], target: [6.9, 0.9, 0], fov: 19, dur: 2.2 },
      { pos: [HERO.x + 5.2, 4.6, 8.2], target: [HERO.x + 0.3, 1.3, 0], fov: 30, dur: 2.8 },
      { pos: [HERO.x + 6.5, 6.5, 13.5], target: [HERO.x + 0.5, 1.4, 0], fov: 32, dur: 3.0 },
      { pos: [CMP.x + 1.2, 5.2, 15.5], target: [CMP.x + 0.2, 1.6, 0], fov: 30, dur: 3.0 },
    ];
  }

  onStep(step, instant) {
    const f = [[5, 0, 0], [HERO.x, 0, 0], [HERO.x, 0, 0], [CMP.x, 0, 0]][step];
    this.focusGoal = f;
    if (instant) this.focus.fromArray(f);
    if (step === 2) this.swarmT = 0;
  }

  tick(dt, t) {
    const st = this.stepTime;
    if (this.focusGoal) {
      this.focus.x = damp(this.focus.x, this.focusGoal[0], 1.6, dt);
    }
    this.key.position.set(this.focus.x - 2, 9, 7);
    this.key.target.position.set(this.focus.x, 0.5, 0);
    this.key.angle = this.step === 2 ? 0.75 : 0.55;

    // Hero chip: front half slides away and dissolves on step 1.
    this.to('cut', this.step === 1 ? smoothstep(0.4, 2.0, st) : this.step === 2 ? 1 : 0);
    const c = this.param('cut');
    this.front.position.z = 2.5 / 4 + c * 2.2;
    this.front.position.y = 1.25 + c * 0.6;
    this.front.rotation.x = c * 0.4;
    this.frontMat.dissolve.uReveal.value = 1 - smoothstep(0.3, 0.85, c);
    this.front.visible = c < 0.86;
    this.hero.rotation.y = -0.5 + c * 0.25 + Math.sin(t * 0.25) * 0.05;
    // Charging: + electrodes warm, - electrodes cool, breathing slowly.
    this.to('charge', this.step === 1 ? smoothstep(3.0, 4.2, st) : 0);
    const ch = this.param('charge') * (0.75 + 0.25 * Math.sin(t * 1.6));
    this.nickelPos.emissiveIntensity = 0.55 * ch;
    this.nickelNeg.emissiveIntensity = 0.45 * ch;

    // Swarm into a car.
    const sw = this.swarm;
    const on = this.step === 2;
    if (on) this.swarmT += dt;
    sw.body.visible = sw.term.visible = on;
    this.hero.visible = !on || this.swarmT < 1.2;
    this.hero.scale.setScalar(on ? Math.max(0.0001, 1 - smoothstep(0.2, 1.2, this.swarmT)) : 1);
    if (on) {
      const m4 = new THREE.Matrix4(), s3 = new THREE.Vector3(1, 1, 1), off = new THREE.Vector3(), p = new THREE.Vector3(), qq = new THREE.Quaternion();
      const tt = this.swarmT;
      sw.items.forEach((it, i) => {
        const k = easeInOutCubic(clamp01((tt - 0.3 - it.delay * 0.55) / 1.6));
        p.lerpVectors(it.start, it.p, k);
        p.y += Math.sin(k * Math.PI) * 1.2;
        qq.copy(it.spin).slerp(it.q, k);
        s3.setScalar(0.35 + 0.65 * k);
        m4.compose(p, qq, s3);
        sw.body.setMatrixAt(i, m4);
        for (const sg of [-1, 1]) {
          off.set(sg * 0.08 * s3.x, 0, 0).applyQuaternion(qq).add(p);
          m4.compose(off, qq, s3);
          sw.term.setMatrixAt(i * 2 + (sg > 0 ? 1 : 0), m4);
        }
      });
      sw.body.instanceMatrix.needsUpdate = true;
      sw.term.instanceMatrix.needsUpdate = true;
      const spin = smoothstep(4.5, 9, tt) * (tt - 4.5) * 0.12;
      sw.body.rotation.y = sw.term.rotation.y = -0.35 + spin;
    }

    // Comparison gauges fill.
    this.cmpBars.forEach((b, i) => {
      const k = this.step === 3 ? easeOutCubic(clamp01((st - 0.8 - i * 0.3) / 1.6)) : 0;
      b.fill.scale.y = Math.max(0.0001, damp(b.fill.scale.y, 3.1 * b.cap * k, 5, dt));
    });
  }
}
