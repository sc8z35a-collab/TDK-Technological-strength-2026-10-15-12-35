// CH.11 Magnets & power — an EV traction motor with a quarter cut away
// (laminated stator, hairpin windings, V-shaped neodymium magnets in a
// spinning rotor), DIN-rail power supplies with one opened up, and an RF
// generator feeding a semiconductor plasma chamber.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Chapter } from '../core/Chapter.js';
import { materials, roundedBox, extrude } from '../core/kit.js';
import { powerSupply, electrolytic, filmCapacitor, arcMagnet, pcbTexture } from '../core/parts.js';
import { canvasTexture } from '../core/textures.js';
import { clamp01, easeOutCubic, easeInOutCubic, smoothstep, damp } from '../core/math.js';
import { spot } from './common.js';

const PSU = new THREE.Vector3(15, 0, 0);
const FAB = new THREE.Vector3(30, 0, 0);

/* ------------------------------------------------------------------ motor */

function statorShape(N = 48, R = 2.0, r = 1.28, depth = 0.34, slotW = 0.085) {
  const s = new THREE.Shape();
  s.absarc(0, 0, R, 0, Math.PI * 2, false);
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const a1 = ((i + 1) / N) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const h = slotW / 2 / r;
    // inner arc up to the slot, then the rectangular notch outward
    for (let k = 0; k <= 2; k++) {
      const a = a0 + h + ((am - h - (a0 + h)) * k) / 2;
      pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
    }
    const hb = slotW / 2 / (r + depth);
    pts.push(new THREE.Vector2(Math.cos(am - h) * r, Math.sin(am - h) * r));
    pts.push(new THREE.Vector2(Math.cos(am - hb) * (r + depth), Math.sin(am - hb) * (r + depth)));
    pts.push(new THREE.Vector2(Math.cos(am + hb) * (r + depth), Math.sin(am + hb) * (r + depth)));
    pts.push(new THREE.Vector2(Math.cos(am + h) * r, Math.sin(am + h) * r));
  }
  s.holes.push(new THREE.Path(pts.reverse()));
  return s;
}

function rectPath(cx, cy, w, h, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const corners = [[-w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2]]; // clockwise
  return new THREE.Path(corners.map(([x, y]) => new THREE.Vector2(cx + x * c - y * s, cy + x * s + y * c)));
}

/** Rotor lamination with eight V-shaped magnet pockets; returns shape + pocket poses. */
function rotorShape(Rr = 1.2, poles = 8) {
  const s = new THREE.Shape();
  s.absarc(0, 0, Rr, 0, Math.PI * 2, false);
  const shaft = new THREE.Path();
  shaft.absarc(0, 0, 0.36, 0, Math.PI * 2, true);
  s.holes.push(shaft);
  const pockets = [];
  for (let p = 0; p < poles; p++) {
    const a = (p / poles) * Math.PI * 2;
    for (const side of [-1, 1]) {
      const rr = 0.86;
      const da = side * 0.15;
      const cx = Math.cos(a + da) * rr, cy = Math.sin(a + da) * rr;
      const ang = a + side * 0.62 + Math.PI / 2;
      s.holes.push(rectPath(cx, cy, 0.36, 0.085, ang));
      pockets.push({ cx, cy, ang });
    }
  }
  return { shape: s, pockets };
}

function buildMotor(M, planes) {
  const g = new THREE.Group();
  const lamMat = new THREE.MeshPhysicalMaterial({ color: 0x80868f, metalness: 0.85, roughness: 0.38, clearcoat: 0.25, clippingPlanes: planes, clipIntersection: true, side: THREE.DoubleSide });
  const rotorMat = new THREE.MeshPhysicalMaterial({ color: 0x9aa1aa, metalness: 0.8, roughness: 0.3, clearcoat: 0.3, clippingPlanes: planes, clipIntersection: true, side: THREE.DoubleSide });
  const copper = new THREE.MeshPhysicalMaterial({ color: 0xc17b4f, metalness: 1, roughness: 0.27, clearcoat: 0.8, clearcoatRoughness: 0.12, clippingPlanes: planes, clipIntersection: true, side: THREE.DoubleSide });
  const magnetMat = new THREE.MeshPhysicalMaterial({ color: 0xcfd3d8, metalness: 1, roughness: 0.16, clearcoat: 0.4, clippingPlanes: planes, clipIntersection: true });
  const N = 34, pitch = 0.06, L = N * pitch;
  // Laminated stator (instanced thin sheets).
  const sGeo = new THREE.ExtrudeGeometry(statorShape(), { depth: pitch * 0.86, bevelEnabled: false, curveSegments: 72 });
  sGeo.rotateX(-Math.PI / 2);
  const stator = new THREE.InstancedMesh(sGeo, lamMat, N);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    m4.makeTranslation(0, i * pitch, 0);
    stator.setMatrixAt(i, m4);
  }
  stator.castShadow = stator.receiveShadow = true;
  g.add(stator);
  // Hairpin conductors in the slots (two layers) and end-turn loops.
  const Ns = 48, r = 1.28, depth = 0.34;
  const barGeo = new THREE.BoxGeometry(0.06, L + 0.24, 0.13);
  const bars = new THREE.InstancedMesh(barGeo, copper, Ns * 2);
  const q = new THREE.Quaternion();
  let k = 0;
  for (let i = 0; i < Ns; i++) {
    const am = ((i + 0.5) / Ns) * Math.PI * 2;
    for (const layer of [0, 1]) {
      const rr = r + 0.09 + layer * 0.15;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), am + Math.PI / 2);
      m4.compose(new THREE.Vector3(Math.cos(am) * rr, L / 2, -Math.sin(am) * rr), q, new THREE.Vector3(1, 1, 1));
      bars.setMatrixAt(k++, m4);
    }
  }
  bars.castShadow = true;
  g.add(bars);
  const loops = [];
  for (const end of [0, 1]) {
    for (let i = 0; i < Ns; i++) {
      const a0 = ((i + 0.5) / Ns) * Math.PI * 2;
      const a1 = ((i + 6.5) / Ns) * Math.PI * 2;
      const y0 = end ? L + 0.12 : -0.12;
      const dir = end ? 1 : -1;
      const r0 = r + 0.09 + (end ? 0.15 : 0), r1 = r + 0.09 + (end ? 0 : 0.15);
      const am = (a0 + a1) / 2;
      const P = (a, rr, y) => new THREE.Vector3(Math.cos(a) * rr, y, -Math.sin(a) * rr);
      const pts = [P(a0, r0, y0), P(a0 + 0.06, r0 + 0.02, y0 + dir * 0.16), P(am, r + 0.17, y0 + dir * 0.3), P(a1 - 0.06, r1 + 0.02, y0 + dir * 0.16), P(a1, r1, y0)];
      loops.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.032, 6, false));
    }
  }
  const loopsMesh = new THREE.Mesh(mergeGeometries(loops), copper);
  loops.forEach((l) => l.dispose());
  loopsMesh.castShadow = true;
  g.add(loopsMesh);
  // Rotor: laminations + magnets + shaft, spins as a group.
  const rotor = new THREE.Group();
  g.add(rotor);
  const { shape, pockets } = rotorShape();
  const rGeo = new THREE.ExtrudeGeometry(shape, { depth: pitch * 0.86, bevelEnabled: false, curveSegments: 64 });
  rGeo.rotateX(-Math.PI / 2);
  const rot = new THREE.InstancedMesh(rGeo, rotorMat, N);
  for (let i = 0; i < N; i++) {
    m4.makeTranslation(0, i * pitch, 0);
    rot.setMatrixAt(i, m4);
  }
  rot.castShadow = rot.receiveShadow = true;
  rotor.add(rot);
  const magGeo = new THREE.BoxGeometry(0.34, L - 0.02, 0.075);
  const mags = new THREE.InstancedMesh(magGeo, magnetMat, pockets.length);
  pockets.forEach((p, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.ang);
    // shape (x, y) -> world (x, -z) after rotateX(-90deg)
    m4.compose(new THREE.Vector3(p.cx, L / 2, -p.cy), q, new THREE.Vector3(1, 1, 1));
    mags.setMatrixAt(i, m4);
  });
  rotor.add(mags);
  const shaftMat = M.steel.clone();
  shaftMat.clippingPlanes = planes;
  shaftMat.clipIntersection = true;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, L + 1.6, 48), shaftMat);
  shaft.position.y = L / 2;
  shaft.castShadow = true;
  rotor.add(shaft);
  g.userData = { rotor, L, magnetMat };
  return g;
}

/* ------------------------------------------------------------------ PSU */

function eCore(M, w = 0.36, h = 0.3, d = 0.18) {
  const s = new THREE.Shape();
  const t = w * 0.18;
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(w / 2 - t, h);
  s.lineTo(w / 2 - t, t);
  s.lineTo(t, t);
  s.lineTo(t, h);
  s.lineTo(-t, h);
  s.lineTo(-t, t);
  s.lineTo(-w / 2 + t, t);
  s.lineTo(-w / 2 + t, h);
  s.lineTo(-w / 2, h);
  s.lineTo(-w / 2, 0);
  return new THREE.Mesh(extrude(s, d, 0.004, 1), M.ferrite);
}

function openPsu(M) {
  const g = new THREE.Group();
  const W = 0.9, H = 1.25, D = 1.1;
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xb8bdc3, metalness: 0.75, roughness: 0.42, roughnessMap: M.aluminum.roughnessMap, clearcoat: 0.15 });
  // Fixed left wall, back, base and front panel.
  const left = new THREE.Mesh(roundedBox(0.04, H, D, 0.015, 2), shell);
  left.position.set(-W / 2 + 0.02, H / 2, 0);
  const base = new THREE.Mesh(roundedBox(W, 0.04, D, 0.015, 2), shell);
  base.position.set(0, 0.02, 0);
  const back = new THREE.Mesh(roundedBox(W, H, 0.04, 0.015, 2), shell);
  back.position.set(0, H / 2, -D / 2 + 0.02);
  const front = new THREE.Mesh(roundedBox(W, H, 0.03, 0.015, 2), new THREE.MeshPhysicalMaterial({ color: 0x2a2d31, roughness: 0.55 }));
  front.position.set(0, H / 2, D / 2 - 0.015);
  [left, base, back, front].forEach((m) => {
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  });
  // Vertical PCB with parts facing +x.
  const pcb = new THREE.Mesh(roundedBox(0.03, H - 0.12, D - 0.12, 0.01, 1), new THREE.MeshPhysicalMaterial({ map: pcbTexture({ size: 1024, seed: 44, mask: '#13241d', key: 'psuPcb', traces: 120 }), roughness: 0.4, clearcoat: 0.6 }));
  pcb.position.set(-W / 2 + 0.1, H / 2, 0);
  g.add(pcb);
  const px = -W / 2 + 0.12;
  // Transformer: two E cores + copper bobbin.
  const tr = new THREE.Group();
  const e1 = eCore(M);
  const e2 = eCore(M);
  e2.rotation.z = Math.PI;
  e2.position.y = 0.62;
  tr.add(e1, e2);
  const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 32), M.copperWire);
  bob.position.y = 0.31;
  bob.rotation.x = Math.PI / 2;
  bob.scale.set(1, 1, 1);
  tr.add(bob);
  tr.scale.setScalar(0.85);
  tr.rotation.set(0, Math.PI / 2, -Math.PI / 2);
  tr.position.set(px + 0.02, 0.55, 0.05);
  g.add(tr);
  // Bulk capacitors.
  for (const [y, z] of [[0.95, -0.2], [0.95, 0.12]]) {
    const c = electrolytic({ r: 0.11, h: 0.36 });
    c.rotation.z = -Math.PI / 2;
    c.position.set(px, y, z);
    g.add(c);
  }
  const fc = filmCapacitor({ w: 0.3, h: 0.2, d: 0.14, text: null });
  fc.rotation.z = -Math.PI / 2;
  fc.position.set(px, 0.32, -0.32);
  g.add(fc);
  // Heat sink with fins and MOSFETs.
  const hs = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.36), M.aluminum);
    fin.position.set(0.17, i * 0.05, 0);
    hs.add(fin);
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.44, 0.36), M.aluminum);
  plate.position.set(0.0, 0.2, 0);
  hs.add(plate);
  hs.position.set(px + 0.03, 0.12, 0.28);
  g.add(hs);
  for (let i = 0; i < 3; i++) {
    const fet = new THREE.Mesh(roundedBox(0.03, 0.12, 0.1, 0.006, 1), M.epoxy);
    fet.position.set(px + 0.0, 0.22 + i * 0.13, 0.48);
    g.add(fet);
  }
  // Removable side cover (+x) with vents.
  const cover = new THREE.Mesh(roundedBox(0.04, H, D, 0.015, 2), shell);
  cover.position.set(W / 2 - 0.02, H / 2, 0);
  cover.castShadow = true;
  g.add(cover);
  const top = new THREE.Mesh(roundedBox(W, 0.04, D, 0.015, 2), shell);
  top.position.set(0, H - 0.02, 0);
  g.add(top);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  g.userData = { cover, top, tr };
  return g;
}

/* ------------------------------------------------------------------ fab */

function plasmaMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOn: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOn; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 c = vUv - 0.5;
        float r = length(c * vec2(1.0, 2.2));
        float body = smoothstep(0.5, 0.0, r);
        float fl = 0.75 + 0.25 * n(c * 6.0 + vec2(uTime * 1.3, -uTime * 0.7));
        vec3 col = mix(vec3(0.62, 0.48, 0.86), vec3(0.95, 0.78, 0.92), body);
        gl_FragColor = vec4(col * body * fl * 0.9 * uOn, 1.0);
      }`,
  });
}

export class Power extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.env = 'studio';
    this.exposure = 1.0;
    this.shift = 0.2;
    this.look = { bloom: 0.14, threshold: 1.0, vignette: 0.38, saturation: 1.03 };
  }

  build() {
    const M = materials();
    const q = this.app.quality.tier;
    this.addBackdrop({ top: '#121315', bottom: '#050506', glow: '#272019', glowPos: [0.66, 0.56], glowSize: 0.6, glowStrength: 0.75 });
    this.addDust({ count: 300, radius: 30, height: 6, size: 0.05, opacity: 0.3, seed: 81, center: [15, 2, 0] });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 70), new THREE.MeshPhysicalMaterial({ color: 0x131417, roughness: 0.42, clearcoat: 0.35 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.add(floor);
    this.key = spot(this.scene, { intensity: 140, pos: [-2, 10, 7], target: [0, 0, 0], angle: 0.55, penumbra: 0.8, shadow: q.shadows, shadowSize: q.shadowSize, far: 40 });
    const rim = new THREE.DirectionalLight(0xd2dcff, 2.0);
    rim.position.set(6, 5, -8);
    this.scene.add(rim, new THREE.HemisphereLight(0xfff0e4, 0x0b0b0c, 0.16));
    this.focus = new THREE.Vector3();

    /* --- motor ------------------------------------------------------------------- */
    this.cut = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)];
    const motor = buildMotor(M, this.cut);
    motor.position.set(0, 0.35, 0);
    this.add(motor);
    this.motor = motor;
    const inLight = new THREE.PointLight(0xffe2c4, 14, 4.5, 1.5);
    inLight.position.set(0.9, 2.9, 0.9);
    this.scene.add(inLight);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.4, 0.3, 96), M.anodizedDark);
    stand.position.y = 0.15;
    stand.receiveShadow = stand.castShadow = true;
    this.add(stand);
    // Small-motor ferrite arc magnets on the side.
    const arcs = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const a = arcMagnet({ inner: 0.42, outer: 0.56, angle: 1.2, length: 0.7 });
      a.rotation.y = 0;
      a.rotation.z = (i / 4) * Math.PI * 2;
      arcs.add(a);
    }
    arcs.rotation.x = Math.PI / 2;
    arcs.position.set(-3.6, 0.38, 1.4);
    arcs.traverse((o) => (o.castShadow = true));
    this.add(arcs);
    this.arcs = arcs;
    this.label({ text: 'ネオジム磁石', sub: 'ローターの中にV字に配置', anchor: () => motor.userData.rotor.localToWorld(new THREE.Vector3(0.62, motor.userData.L + 0.02, 0.6)), offset: [50, -50], when: () => this.step === 0 && this.stepTime > 1.6 });
    this.label({ text: 'ステーター', sub: '薄い電磁鋼板を重ね、銅線を通す', anchor: [1.5, 1.6, 0.9], offset: [60, 40], when: () => this.step === 0 && this.stepTime > 2.0 });
    this.label({ text: 'フェライト磁石', sub: 'エアコンや家電の小型モーター用', anchor: [-3.6, 0.95, 1.4], offset: [-40, -46], when: () => this.step === 0 && this.stepTime > 2.4 });

    /* --- power supplies on a DIN rail -------------------------------------------- */
    const cab = new THREE.Group();
    cab.position.copy(PSU);
    this.add(cab);
    const panel = new THREE.Mesh(roundedBox(6.4, 3.6, 0.1, 0.02, 2), new THREE.MeshPhysicalMaterial({ color: 0x9aa0a6, metalness: 0.3, roughness: 0.55 }));
    panel.position.set(0, 1.8, -0.62);
    panel.receiveShadow = true;
    cab.add(panel);
    const hat = new THREE.Shape();
    hat.moveTo(-0.35, 0);
    hat.lineTo(-0.35, 0.02);
    hat.lineTo(-0.25, 0.02);
    hat.lineTo(-0.25, 0.15);
    hat.lineTo(0.25, 0.15);
    hat.lineTo(0.25, 0.02);
    hat.lineTo(0.35, 0.02);
    hat.lineTo(0.35, 0);
    hat.lineTo(0.22, 0);
    hat.lineTo(0.22, 0.13);
    hat.lineTo(-0.22, 0.13);
    hat.lineTo(-0.22, 0);
    hat.lineTo(-0.35, 0);
    const rail = new THREE.Mesh(extrude(hat, 6.0, 0, 1), M.steel);
    rail.rotation.set(0, Math.PI / 2, Math.PI / 2);
    rail.position.set(0, 1.3, -0.57);
    cab.add(rail);
    this.units = [];
    for (let i = 0; i < 4; i++) {
      const x = -2.1 + i * 1.12;
      const u = i === 3 ? openPsu(M) : powerSupply();
      u.position.set(x, 0.62, 0);
      u.traverse((o) => (o.castShadow = true));
      cab.add(u);
      this.units.push(u);
    }
    this.openUnit = this.units[3];
    const shelf = new THREE.Mesh(roundedBox(6.0, 0.1, 1.6, 0.02, 2), M.anodizedDark);
    shelf.position.set(0, 0.57, 0);
    shelf.receiveShadow = true;
    cab.add(shelf);
    this.label({ text: '産業機器向け電源', sub: '世界No.1（15〜20%）', anchor: () => cab.localToWorld(new THREE.Vector3(-2.1, 2.0, 0.55)), offset: [-40, -46], when: () => this.step === 1 && this.stepTime > 1.6 });
    this.label({ text: 'フェライトのトランス', sub: '交流を必要な電圧に変える', anchor: () => this.openUnit.userData.tr.getWorldPosition(new THREE.Vector3()), offset: [60, -40], when: () => this.step === 1 && this.stepTime > 2.4 });

    /* --- plasma chamber + RF generator ------------------------------------------ */
    const fab = new THREE.Group();
    fab.position.copy(FAB);
    this.add(fab);
    const wallMat = M.steel.clone();
    wallMat.side = THREE.DoubleSide;
    this.tracker.track(wallMat);
    const gap = 0.3;
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.6, 96, 1, true, gap, Math.PI * 2 - gap * 2), wallMat);
    ch.position.set(0, 1.4, 0);
    ch.castShadow = true;
    fab.add(ch);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.62, 0.18, 96), M.aluminum);
    lid.position.set(0, 2.29, 0);
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.7, 0.3, 96), M.aluminum);
    bottom.position.set(0, 0.45, 0);
    [lid, bottom].forEach((m) => {
      m.castShadow = m.receiveShadow = true;
      fab.add(m);
    });
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.6, 48), M.anodizedDark);
    pump.position.set(0, 0.3, 0);
    fab.add(pump);
    // Front window plate filling the gap in the wall, with a round viewport.
    const chord = 1.5 * Math.sin(gap) * 2 + 0.06;
    const plateShape = new THREE.Shape();
    plateShape.moveTo(-chord / 2, -0.8);
    plateShape.lineTo(chord / 2, -0.8);
    plateShape.lineTo(chord / 2, 0.8);
    plateShape.lineTo(-chord / 2, 0.8);
    plateShape.lineTo(-chord / 2, -0.8);
    const hole = new THREE.Path();
    hole.absarc(0, 0.05, 0.36, 0, Math.PI * 2, true);
    plateShape.holes.push(hole);
    const plate = new THREE.Mesh(extrude(plateShape, 0.06, 0.01, 2), M.steel);
    plate.position.set(0, 1.4, 1.5 * Math.cos(gap));
    plate.castShadow = true;
    fab.add(plate);
    const vp = new THREE.Group();
    vp.position.set(0, 1.45, 1.5 * Math.cos(gap) + 0.05);
    fab.add(vp);
    const flange = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 16, 64), M.brass);
    vp.add(flange);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.37, 48), M.glassTint);
    glass.renderOrder = 3;
    vp.add(glass);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.46, 1.46, 1.55, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.5, metalness: 0.5, side: THREE.BackSide }));
    inner.position.set(0, 1.4, 0);
    fab.add(inner);
    const chuck = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.2, 64), M.anodizedDark);
    chuck.position.set(0, 0.95, 0.1);
    fab.add(chuck);
    const wafer = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.02, 96), M.silicon);
    wafer.position.set(0, 1.06, 0.1);
    fab.add(wafer);
    this.plasmaMat = plasmaMaterial();
    this.tracker.track(this.plasmaMat);
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4 - i * 0.25, 0.6 - i * 0.1), this.plasmaMat);
      p.position.set(0, 1.35 + i * 0.02, 0.2 + i * 0.15);
      fab.add(p);
    }
    this.plasmaLight = new THREE.PointLight(0xb08ae0, 0, 3, 2);
    this.plasmaLight.position.set(0, 1.4, 0.6);
    fab.add(this.plasmaLight);
    // RF generator (rack unit) and coax cable.
    const gen = new THREE.Group();
    gen.position.set(2.8, 0, 0.4);
    fab.add(gen);
    const box = new THREE.Mesh(roundedBox(1.5, 0.8, 1.2, 0.04, 3), new THREE.MeshPhysicalMaterial({ color: 0x2c2f34, metalness: 0.6, roughness: 0.4, clearcoat: 0.3 }));
    box.position.y = 0.4;
    box.castShadow = true;
    gen.add(box);
    const face = canvasTexture(1024, 512, (ctx, w, h) => {
      ctx.fillStyle = '#1d2024';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#0b0d0f';
      ctx.fillRect(60, 120, 420, 200);
      ctx.fillStyle = 'rgba(255,190,120,0.9)';
      ctx.font = '500 64px "IBM Plex Mono", monospace';
      ctx.fillText('13.56MHz', 90, 210);
      ctx.fillText('3.00 kW', 90, 290);
      ctx.fillStyle = 'rgba(236,230,218,0.75)';
      ctx.font = '500 36px "IBM Plex Mono", monospace';
      ctx.fillText('RF GENERATOR', 560, 160);
      ctx.fillText('FWD  REF  ON', 560, 300);
    }, { key: 'rfFace' });
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshStandardMaterial({ map: face, roughness: 0.5, emissiveMap: face, emissive: 0xffffff, emissiveIntensity: 0.25 }));
    fp.position.set(0, 0.4, 0.605);
    gen.add(fp);
    const coax = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(2.8, 0.75, -0.1), new THREE.Vector3(2.4, 2.4, -0.4), new THREE.Vector3(1.0, 2.9, -0.2), new THREE.Vector3(0.0, 2.38, 0)]), 64, 0.07, 12, false), M.rubber);
    coax.castShadow = true;
    fab.add(coax);
    this.label({ text: 'プラズマ', sub: 'ガスに高周波をかけて作る', anchor: () => fab.localToWorld(new THREE.Vector3(0, 1.45, 1.5)), offset: [-50, -50], when: () => this.step === 2 && this.stepTime > 1.8 });
    this.label({ text: 'RF電源（高周波）', sub: '2025年に米QEIの事業を取得', anchor: () => gen.localToWorld(new THREE.Vector3(0, 0.85, 0.3)), offset: [40, -50], when: () => this.step === 2 && this.stepTime > 2.2 });
    this.label({ text: 'ウェハー', sub: 'AI半導体のもと', anchor: () => fab.localToWorld(new THREE.Vector3(0.2, 1.3, 1.45)), offset: [40, 50], when: () => this.step === 2 && this.stepTime > 2.6 });
  }

  poses() {
    return [
      { pos: [4.4, 6.0, 6.0], target: [-0.1, 0.9, 0.1], fov: 32, dur: 2.2 },
      { pos: [PSU.x + 4.6, 2.5, 4.6], target: [PSU.x + 0.9, 1.25, 0], fov: 32, dur: 2.8 },
      { pos: [FAB.x + 3.6, 2.9, 7.4], target: [FAB.x + 1.0, 1.3, 0.3], fov: 32, dur: 2.8 },
    ];
  }

  onStep(step, instant) {
    const f = [0, PSU.x, FAB.x][step];
    this.focusGoal = f;
    if (instant) this.focus.x = f;
  }

  tick(dt, t) {
    const st = this.stepTime;
    this.focus.x = damp(this.focus.x, this.focusGoal ?? 0, 1.6, dt);
    this.key.position.set(this.focus.x - 2, 10, 7);
    this.key.target.position.set(this.focus.x, 0.8, 0);

    // Motor: rotor spins up; the quarter cut opens.
    this.to('spin', this.step === 0 ? 1 : 0.15);
    this.rotorAngle = (this.rotorAngle || 0) + dt * 2.2 * this.param('spin');
    this.motor.userData.rotor.rotation.y = this.rotorAngle;
    this.to('cut', this.step === 0 ? smoothstep(0.3, 1.6, st) : 1);
    const c = easeOutCubic(this.param('cut'));
    // Planes pass through the axis when fully open; start pushed out (nothing cut).
    this.cut[0].constant = 3 * (1 - c);
    this.cut[1].constant = 3 * (1 - c);
    this.arcs.rotation.z = t * 0.6;

    // PSU: the side cover slides off and fades.
    this.to('open', this.step === 1 ? smoothstep(0.6, 1.8, st) : 0);
    const o = this.param('open');
    const u = this.openUnit.userData;
    u.cover.position.x = 0.9 / 2 - 0.02 + o * 1.4;
    u.cover.rotation.y = o * 0.5;
    u.cover.visible = o < 0.98;
    u.top.position.y = 1.25 - 0.02 + o * 0.5;
    u.top.visible = o < 0.98;

    // Plasma flickers on.
    this.plasmaMat.uniforms.uTime.value = t;
    this.to('plasma', this.step === 2 ? smoothstep(0.8, 1.8, st) : 0);
    const p = this.param('plasma');
    this.plasmaMat.uniforms.uOn.value = p;
    this.plasmaLight.intensity = p * (2.2 + Math.sin(t * 9) * 0.2);
  }
}
