// CH.08 Hard disk drives — an open 3.5" drive with spinning platters and a
// seeking actuator; then a microscopic world where the slider flies nanometres
// above the disc, tracks resolve into magnetic grains, and a HAMR laser heats
// a 20 nm spot to write.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials, roundedBox, roundedRectShape, extrude } from '../core/kit.js';
import { buildSlider } from './History.js';
import { suspension } from './Share.js';
import { clamp01, easeInOutCubic, smoothstep, mulberry32, damp } from '../core/math.js';
import { spot } from './common.js';

const MICRO = new THREE.Vector3(60, 0, 0);
const PLATTER_C = new THREE.Vector3(-0.9, 0, 0);
const PIVOT = new THREE.Vector3(2.55, 0, 1.55);

/** Recording-surface shader: tracks, bits, grains and the HAMR hot spot. */
function mediaMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uHead: { value: new THREE.Vector2(0, 0) },
      uScroll: { value: 0 },
      uTracks: { value: 0 },
      uGrains: { value: 0 },
      uHeat: { value: 0 },
      uFade: { value: 6 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uScroll, uTracks, uGrains, uHeat, uFade;
      uniform vec2 uHead;
      varying vec3 vW;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      vec2 h22(vec2 p) { float n = h21(p); return vec2(n, h21(p + n + 17.0)); }
      void main() {
        vec2 p = vW.xz - uHead;            // head-relative
        float dist = length(p * vec2(0.6, 1.0));
        float vis = 1.0 - smoothstep(uFade * 0.4, uFade, dist);
        // media moves toward -x under the head
        vec2 q = vec2(p.x + uScroll, p.y);
        float trackW = 0.16;
        float ti = floor(q.y / trackW);
        float tf = fract(q.y / trackW);
        float guard = smoothstep(0.0, 0.12, tf) * smoothstep(1.0, 0.88, tf);
        float bitLen = 0.11;
        float bi = floor(q.x / bitLen);
        // bits already passed under the head (p.x < 0) were rewritten
        float written = step(p.x, 0.0) * step(abs(p.y), trackW * 1.5);
        float bit = step(0.5, h21(vec2(ti, bi) + written * 31.7));
        // grains: jittered Voronoi
        vec2 g = q * 46.0;
        vec2 gi = floor(g), gf = fract(g);
        float d1 = 8.0, d2 = 8.0; vec2 cid = vec2(0.0);
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 o = vec2(float(x), float(y));
          vec2 r = o + h22(gi + o) * 0.85 - gf;
          float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; cid = gi + o; } else if (d < d2) { d2 = d; }
        }
        float edge = smoothstep(0.0, 0.08, sqrt(d2) - sqrt(d1));
        vec2 cq = cid / 46.0;
        float gbit = step(0.5, h21(vec2(floor(cq.y / trackW), floor(cq.x / bitLen)) + step(cq.x - uScroll, 0.0) * step(abs(cq.y), trackW * 1.5) * 31.7));
        gbit = mix(gbit, 1.0 - gbit, step(0.93, h21(cid + 3.1)));
        vec3 up = vec3(0.78, 0.48, 0.3), dn = vec3(0.32, 0.4, 0.52);
        vec3 trackCol = mix(dn, up, bit) * (0.55 + 0.45 * guard);
        vec3 grainCol = mix(dn, up, gbit) * (0.35 + 0.65 * edge);
        vec3 col = mix(trackCol, grainCol, uGrains);
        float a = vis * uTracks * (0.42 + 0.3 * uGrains) * mix(guard, 1.0, uGrains * 0.7);
        // HAMR hot spot just behind the head
        vec2 hp = p - vec2(-0.05, 0.0);
        float spotG = exp(-dot(hp, hp) / 0.0018);
        float halo = exp(-dot(hp, hp) / 0.03);
        vec3 heat = vec3(1.0, 0.45, 0.12) * (spotG * 3.5 + halo * 0.35 * (0.8 + 0.2 * sin(uTime * 20.0)));
        col += heat * uHeat;
        a = max(a, (spotG + halo * 0.5) * uHeat);
        gl_FragColor = vec4(col, a);
      }`,
  });
}

function flowLines() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOn: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime, uOn; varying vec2 vUv;
      void main(){ float f = fract(vUv.x * 5.0 - uTime * 1.6); float d = smoothstep(0.0, 0.2, f) * (1.0 - smoothstep(0.3, 0.9, f));
        float edge = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
        gl_FragColor = vec4(vec3(0.75, 0.82, 0.92) * d * edge * 0.6 * uOn, 1.0); }`,
  });
}

function buildDrive(M) {
  const g = new THREE.Group();
  const cast = new THREE.MeshPhysicalMaterial({ color: 0xa9adb3, metalness: 0.85, roughness: 0.46, roughnessMap: M.aluminum.roughnessMap, normalMap: M.ferrite.normalMap, normalScale: new THREE.Vector2(0.08, 0.08) });
  const W = 7.3, D = 5.1;
  const base = new THREE.Mesh(roundedBox(W, 0.22, D, 0.06, 3), cast);
  base.position.y = 0.11;
  base.receiveShadow = base.castShadow = true;
  g.add(base);
  const ring = roundedRectShape(W, D, 0.25);
  ring.holes.push(new THREE.Path(roundedRectShape(W - 0.36, D - 0.36, 0.18).getPoints(32)));
  const wallGeo = extrude(ring, 1.05, 0.02, 2);
  wallGeo.rotateX(-Math.PI / 2);
  const walls = new THREE.Mesh(wallGeo, cast);
  walls.position.y = 0.22 + 0.52;
  walls.castShadow = walls.receiveShadow = true;
  g.add(walls);
  // Platter stack.
  const platGeo = new THREE.CylinderGeometry(2.38, 2.38, 0.04, 128, 1);
  // planar UVs for the anisotropy map on the caps
  const uv = platGeo.attributes.uv, pos = platGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 4.76 + 0.5, pos.getZ(i) / 4.76 + 0.5);
  const platters = new THREE.Group();
  platters.position.copy(PLATTER_C);
  g.add(platters);
  const ys = [0.42, 0.66, 0.9];
  ys.forEach((y) => {
    const pl = new THREE.Mesh(platGeo, M.platter);
    pl.position.y = y;
    pl.castShadow = pl.receiveShadow = true;
    platters.add(pl);
  });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.72, 64), M.chrome);
  hub.position.y = 0.62;
  platters.add(hub);
  const clamp = new THREE.Group();
  const clampDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.74, 0.06, 64), M.steel);
  clampDisc.position.y = 1.0;
  clamp.add(clampDisc);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const scr = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 24), M.nickel);
    scr.position.set(Math.cos(a) * 0.45, 1.05, Math.sin(a) * 0.45);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.022), M.ink);
    slot.position.set(scr.position.x, 1.08, scr.position.z);
    slot.rotation.y = a;
    clamp.add(scr, slot);
  }
  platters.add(clamp);
  g.userData.platters = platters;
  // Actuator: E-block arms, suspensions, VCM coil and magnets.
  const act = new THREE.Group();
  act.position.copy(PIVOT);
  g.add(act);
  const armShape = new THREE.Shape();
  armShape.moveTo(-0.32, 0.25);
  armShape.lineTo(2.5, 0.12);
  armShape.quadraticCurveTo(2.62, 0, 2.5, -0.12);
  armShape.lineTo(-0.32, -0.25);
  armShape.lineTo(-0.32, 0.25);
  const lh = new THREE.Path();
  lh.absellipse(1.1, 0, 0.42, 0.09, 0, Math.PI * 2, true);
  armShape.holes.push(lh);
  const armGeo = extrude(armShape, 0.05, 0.008, 1);
  armGeo.rotateX(Math.PI / 2);
  const armAxis = new THREE.Vector3(-1, 0, -0.38).normalize();
  const armRot = Math.atan2(-armAxis.z, armAxis.x);
  const arms = new THREE.Group();
  arms.rotation.y = armRot;
  act.add(arms);
  const susp = suspension(M);
  [0.31, 0.54, 0.78, 1.01].forEach((y, i) => {
    const arm = new THREE.Mesh(armGeo, M.aluminum);
    arm.position.y = y;
    arm.castShadow = true;
    arms.add(arm);
    const s = susp.clone();
    s.scale.setScalar(0.85);
    s.rotation.y = -Math.PI / 2;
    s.rotation.z = i % 2 ? Math.PI : 0;
    s.position.set(2.45, y + (i % 2 ? -0.03 : 0.03), 0);
    arms.add(s);
  });
  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.0, 48), M.anodizedDark);
  pivot.position.y = 0.62;
  act.add(pivot);
  const coilShape = new THREE.Shape();
  coilShape.moveTo(-0.4, -0.55);
  coilShape.lineTo(-1.25, -0.85);
  coilShape.quadraticCurveTo(-1.45, 0, -1.25, 0.85);
  coilShape.lineTo(-0.4, 0.55);
  coilShape.lineTo(-0.4, -0.55);
  coilShape.holes.push(new THREE.Path(new THREE.Shape([new THREE.Vector2(-0.6, -0.35), new THREE.Vector2(-1.05, -0.52), new THREE.Vector2(-1.12, 0), new THREE.Vector2(-1.05, 0.52), new THREE.Vector2(-0.6, 0.35)]).getPoints(16)));
  const coilGeo = extrude(coilShape, 0.14, 0.02, 2);
  coilGeo.rotateX(Math.PI / 2);
  const coil = new THREE.Mesh(coilGeo, M.copperWire);
  coil.position.y = 0.66;
  coil.castShadow = true;
  arms.add(coil);
  g.userData.arms = arms;
  g.userData.armRot = armRot;
  const magnet = new THREE.Mesh(roundedBox(1.7, 0.12, 2.0, 0.05, 2), M.nickel);
  magnet.position.set(PIVOT.x + 1.25, 0.95, PIVOT.z - 0.2);
  magnet.castShadow = true;
  g.add(magnet);
  // Flex cable and connector.
  const flex = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.02), M.kapton);
  flex.position.set(PIVOT.x + 0.2, 0.6, PIVOT.z + 0.7);
  flex.rotation.y = 0.4;
  g.add(flex);
  const ramp = new THREE.Mesh(roundedBox(0.4, 0.75, 0.3, 0.04, 2), M.epoxy);
  ramp.position.set(PLATTER_C.x + 2.55, 0.62, 1.45);
  g.add(ramp);
  // Screws around the rim.
  for (const [x, z] of [[-3.45, -2.35], [3.45, -2.35], [-3.45, 2.35], [3.45, 2.35], [0, -2.37], [0, 2.37]]) {
    const scr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 24), M.nickel);
    scr.position.set(x, 1.27, z);
    g.add(scr);
  }
  return g;
}

export class Hdd extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.env = 'studio';
    this.exposure = 1.0;
    this.shift = 0.2;
    this.look = { bloom: 0.14, threshold: 1.0, vignette: 0.4, saturation: 1.02 };
    this.seek = { from: 0.0, to: 0.3, t: 1, dur: 0.6 };
  }

  build() {
    const M = materials();
    const q = this.app.quality.tier;
    this.addBackdrop({ top: '#111215', bottom: '#050506', glow: '#20252c', glowPos: [0.66, 0.55], glowSize: 0.6, glowStrength: 0.85 });
    this.addDust({ count: 260, radius: 12, height: 5, size: 0.04, opacity: 0.3, seed: 51, center: [0, 2, 0] });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(220, 80), new THREE.MeshPhysicalMaterial({ color: 0x111215, roughness: 0.42, clearcoat: 0.4 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.add(floor);
    this.key = spot(this.scene, { intensity: 130, pos: [-3, 10, 7], target: [0, 0, 0], angle: 0.5, penumbra: 0.8, shadow: q.shadows, shadowSize: q.shadowSize, far: 40 });
    const rim = new THREE.DirectionalLight(0xd2dcff, 2.0);
    rim.position.set(6, 6, -8);
    this.scene.add(rim, new THREE.HemisphereLight(0xfff0e4, 0x0b0b0c, 0.18));
    this.focus = new THREE.Vector3();

    this.drive = buildDrive(M);
    this.add(this.drive);

    /* --- micro world -------------------------------------------------------------- */
    const micro = new THREE.Group();
    micro.position.copy(MICRO);
    this.add(micro);
    this.micro = micro;
    const surfGeo = new THREE.CircleGeometry(60, 128);
    const uv = surfGeo.attributes.uv, pos = surfGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 120 + 0.5, pos.getY(i) / 120 + 0.5);
    const mirror = new THREE.MeshPhysicalMaterial({ color: 0x8d939b, metalness: 1, roughness: 0.24, clearcoat: 0.15, clearcoatRoughness: 0.2, envMapIntensity: 0.8 });
    this.tracker.track(mirror);
    const surface = new THREE.Mesh(surfGeo, mirror);
    surface.rotation.x = -Math.PI / 2;
    surface.position.set(0, 0, 50);
    surface.receiveShadow = true;
    micro.add(surface);
    this.media = mediaMaterial();
    this.tracker.track(this.media);
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), this.media);
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.y = 0.004;
    micro.add(overlay);
    const slider = buildSlider(M);
    slider.scale.setScalar(2.4);
    slider.rotation.y = -Math.PI / 2; // trailing edge (thin-film element) faces -x
    this.slider = slider;
    const sliderHolder = new THREE.Group();
    sliderHolder.add(slider);
    micro.add(sliderHolder);
    this.sliderHolder = sliderHolder;
    const tongue = new THREE.Mesh(roundedBox(1.3, 0.035, 0.9, 0.02, 2), M.steel);
    tongue.position.set(0.15, 0.44, 0);
    sliderHolder.add(tongue);
    const beamArm = new THREE.Mesh(roundedBox(3.2, 0.04, 0.5, 0.02, 2), M.steel);
    beamArm.position.set(1.9, 0.62, 0);
    beamArm.rotation.z = 0.07;
    sliderHolder.add(beamArm);
    const dimple = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 10), M.steel);
    dimple.position.set(0.15, 0.5, 0);
    sliderHolder.add(dimple);
    for (const z of [-0.12, 0.12]) {
      const lead = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.62, 0.22, z), new THREE.Vector3(-0.7, 0.4, z * 1.4), new THREE.Vector3(-0.2, 0.52, z * 1.8), new THREE.Vector3(1.5, 0.6, z * 2.2)]), 40, 0.012, 6, false), M.copper);
      sliderHolder.add(lead);
    }
    // Air flow streaming under the slider (leading edge +x -> trailing edge -x).
    const airMat = flowLines();
    this.airMat = airMat;
    this.tracker.track(airMat);
    for (let i = 0; i < 7; i++) {
      const z = -0.5 + i * (1.0 / 6);
      const y = 0.02 + (i % 2) * 0.012;
      const pts = [new THREE.Vector3(2.2, 0.06 + i * 0.01, z), new THREE.Vector3(0.7, y + 0.01, z), new THREE.Vector3(-0.6, y, z), new THREE.Vector3(-2.0, 0.07 + i * 0.008, z * 1.1)];
      const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.004, 4, false), airMat);
      micro.add(line);
    }
    // Laser glow at the trailing edge for HAMR.
    this.laser = new THREE.PointLight(0xff7a30, 0, 3, 2);
    this.laser.position.set(-0.66, 0.1, 0);
    sliderHolder.add(this.laser);
    const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.7, 0.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracker.track(beamMat);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.02, 0.36, 12), beamMat);
    beam.position.set(-0.64, 0.2, 0);
    sliderHolder.add(beam);
    this.beamMat = beamMat;
    // Gap indicator (two hairlines).
    const hair = new THREE.MeshBasicMaterial({ color: 0xe2b48a, transparent: true, opacity: 0 });
    this.hair = hair;
    this.tracker.track(hair);
    for (const y of [0.006, 0.045]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.003, 0.003), hair);
      l.position.set(-1.15, y, 0.58);
      micro.add(l);
    }

    /* labels */
    this.label({ text: 'プラッタ（磁気ディスク）', sub: '1分間に7,200回転', anchor: () => this.drive.localToWorld(new THREE.Vector3(PLATTER_C.x - 1.2, 0.95, -0.8)), offset: [-40, -50], when: () => this.step === 0 && this.stepTime > 1.6 });
    this.label({ text: '磁気ヘッド', sub: 'アームの先端で読み書き', anchor: () => this.headWorld(new THREE.Vector3()), offset: [40, -56], when: () => this.step === 0 && this.stepTime > 2.0 });
    this.label({ text: 'ヘッドとディスクのすき間', sub: 'わずか1〜2nm', anchor: () => micro.localToWorld(new THREE.Vector3(-1.5, 0.03, 0.58)), offset: [-50, 46], when: () => this.step === 1 && this.stepTime > 2.2 });
    this.label({ text: 'スライダー', sub: '空気の流れで浮上する', anchor: () => sliderHolder.localToWorld(new THREE.Vector3(-0.2, 0.36, 0.3)), offset: [50, -50], when: () => this.step === 1 && this.stepTime > 1.6 });
    this.label({ text: 'トラック', sub: '磁石の向きで0と1を記録', anchor: () => micro.localToWorld(new THREE.Vector3(-1.6, 0.01, 0.7)), offset: [40, 40], when: () => this.step === 2 && this.stepTime > 1.8 });
    this.label({ text: '磁性グレイン', sub: '数nmの磁石の粒', anchor: () => micro.localToWorld(new THREE.Vector3(-1.1, 0.01, -0.35)), offset: [50, -40], when: () => this.step === 2 && this.stepTime > 2.6 });
    this.label({ text: '約450℃に加熱', sub: '光スポット 約20nm', anchor: () => micro.localToWorld(new THREE.Vector3(-0.65, 0.02, 0)), offset: [-50, 50], when: () => this.step === 3 && this.stepTime > 1.8, cls: 'big' });
    this.label({ text: 'サスペンション', sub: '世界No.2（40〜45%）', anchor: () => this.drive.localToWorld(new THREE.Vector3(0.3, 1.1, 0.55)), offset: [40, -60], when: () => this.step === 4 && this.stepTime > 1.6 });
    this.label({ text: 'アクチュエータ', sub: 'ボイスコイルモーターで動く', anchor: () => this.drive.localToWorld(new THREE.Vector3(PIVOT.x + 0.9, 1.2, PIVOT.z + 0.3)), offset: [40, 40], when: () => this.step === 4 && this.stepTime > 2.0 });
  }

  headWorld(out) {
    const arms = this.drive.userData.arms;
    return arms.localToWorld(out.set(2.45 + 0.85 * 1.0, 1.05, 0));
  }

  poses() {
    return [
      { pos: [2.6, 7.8, 9.2], target: [0.2, 0.6, 0.2], fov: 32, dur: 2.2 },
      { pos: [MICRO.x - 3.2, 0.75, 3.4], target: [MICRO.x - 0.2, 0.2, 0], fov: 30, dur: 3.2 },
      { pos: [MICRO.x - 3.0, 2.3, 1.9], target: [MICRO.x - 1.35, 0.0, 0.05], fov: 32, dur: 2.6 },
      { pos: [MICRO.x - 2.3, 0.9, 1.9], target: [MICRO.x - 0.7, 0.08, 0.0], fov: 30, dur: 2.6 },
      { pos: [PIVOT.x + 3.8, 4.6, PIVOT.z + 5.4], target: [PIVOT.x - 1.2, 0.7, 0.0], fov: 32, dur: 3.0 },
    ];
  }

  onStep(step, instant) {
    const f = step >= 1 && step <= 3 ? MICRO.x : 0;
    this.focusGoal = f;
    if (instant) this.focus.x = f;
  }

  tick(dt, t) {
    const st = this.stepTime;
    this.focus.x = damp(this.focus.x, this.focusGoal ?? 0, 1.4, dt);
    this.key.position.set(this.focus.x - 3, 10, 7);
    this.key.target.position.set(this.focus.x, 0.3, 0);

    // Platters spin; actuator seeks between tracks.
    const d = this.drive.userData;
    d.platters.rotation.y = -t * 2.2;
    const sk = this.seek;
    sk.t += dt / sk.dur;
    if (sk.t >= 1) {
      sk.from = sk.to;
      sk.to = -0.05 + Math.random() * 0.42;
      sk.t = 0;
      sk.dur = 0.35 + Math.random() * 0.5;
      sk.hold = 0.6 + Math.random() * 1.2;
    }
    const k = easeInOutCubic(clamp01(sk.t));
    d.arms.rotation.y = d.armRot + sk.from + (sk.to - sk.from) * k;

    // Micro world.
    const m = this.media.uniforms;
    m.uTime.value = t;
    m.uScroll.value = t * 1.6;
    this.to('tracks', this.step >= 1 && this.step <= 3 ? (this.step === 1 ? 0.55 : 1) : 0);
    this.to('grains', this.step >= 2 && this.step <= 3 ? 1 : 0);
    this.to('heat', this.step === 3 ? smoothstep(0.8, 1.8, st) : 0);
    m.uTracks.value = this.param('tracks');
    m.uGrains.value = this.param('grains');
    const heat = this.param('heat');
    m.uHeat.value = heat;
    m.uHead.value.set(MICRO.x - 0.6, 0);
    m.uFade.value = damp(m.uFade.value, this.step === 2 ? 2.2 : this.step === 3 ? 2.6 : 4.5, 2, dt);
    this.laser.intensity = 3.5 * heat;
    this.beamMat.opacity = 0.8 * heat;
    const fly = 0.045 + Math.sin(t * 7.3) * 0.004 + Math.sin(t * 13.1) * 0.002;
    this.sliderHolder.position.set(0, fly, 0);
    this.slider.rotation.z = 0.02 + Math.sin(t * 5.1) * 0.004;
    this.to('hair', this.step === 1 ? 1 : 0);
    this.hair.opacity = this.param('hair') * 0.9;
    this.airMat.uniforms.uTime.value = t;
    this.airMat.uniforms.uOn.value = this.param('hair');
  }
}
