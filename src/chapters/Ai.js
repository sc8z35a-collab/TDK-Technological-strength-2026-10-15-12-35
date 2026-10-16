// CH.12 AI ecosystem — a data-centre aisle of GPU racks; the power path from an
// 800 V DC bus down to a GPU core at under 1 V, with TDK parts at every stage;
// a microchannel copper cold plate cooling the die; and the AI-ecosystem
// growth target as columns surrounded by the markets it spans.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials, roundedBox, extrude } from '../core/kit.js';
import { filmCapacitor, electrolytic, powerSupply, mlcc, lgaPackage } from '../core/parts.js';
import { canvasTexture } from '../core/textures.js';
import { buildAIBoard } from './board.js';
import { clamp01, easeOutCubic, easeOutBack, smoothstep, mulberry32, damp } from '../core/math.js';
import { spot } from './common.js';

const CHAIN = new THREE.Vector3(20, 0, 0);
const COOL = new THREE.Vector3(40, 0, 0);
const GROW = new THREE.Vector3(58, 0, 0);

/** Warm pulses travelling along a tube (uv.x along the curve). */
function pulseMaterial({ speed = 0.35, count = 7, color = [1.0, 0.78, 0.55], base = 0.08 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOn: { value: 0 }, uColor: { value: new THREE.Color(...color) } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying float vF;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0);
        vF = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uTime, uOn; uniform vec3 uColor; varying vec2 vUv; varying float vF;
      void main(){
        float f = fract(vUv.x * ${count.toFixed(1)} - uTime * ${speed.toFixed(2)});
        float p = smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.1, 0.45, f));
        float a = (${base.toFixed(2)} + p) * pow(vF, 0.7) * uOn;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
  });
}

function rackFrontTexture() {
  return canvasTexture(512, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#16181b';
    ctx.fillRect(0, 0, w, h);
    // perforated door
    ctx.fillStyle = '#07080a';
    for (let y = 30; y < h - 30; y += 14)
      for (let x = 24 + ((y / 14) % 2) * 7; x < w - 24; x += 14) {
        ctx.beginPath();
        ctx.arc(x, y, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.strokeStyle = 'rgba(160,166,174,0.35)';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = 'rgba(200,206,214,0.55)';
    ctx.fillRect(w - 40, h / 2 - 60, 12, 120);
  }, { key: 'rackFront' });
}

/** A miniature data-centre aisle: two rows of racks, raised floor, cable trays. */
function buildAisle(M, quality) {
  const g = new THREE.Group();
  const rack = new THREE.MeshPhysicalMaterial({ color: 0x1b1d21, metalness: 0.6, roughness: 0.45, clearcoat: 0.2 });
  const front = new THREE.MeshStandardMaterial({ map: rackFrontTexture(), metalness: 0.6, roughness: 0.5 });
  const W = 0.62, H = 2.1, D = 1.15;
  const per = 9;
  const geo = roundedBox(W, H, D, 0.02, 2);
  const racks = new THREE.InstancedMesh(geo, rack, per * 2);
  const fronts = new THREE.InstancedMesh(new THREE.PlaneGeometry(W - 0.04, H - 0.06), front, per * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const ledPos = [];
  let k = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < per; i++) {
      const x = -4 + i * (W + 0.03);
      const z = side * 1.25;
      m4.makeTranslation(x, H / 2, z);
      racks.setMatrixAt(k, m4);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), side > 0 ? Math.PI : 0);
      m4.compose(new THREE.Vector3(x, H / 2, z - side * (D / 2 + 0.002)), q, new THREE.Vector3(1, 1, 1));
      fronts.setMatrixAt(k, m4);
      for (let l = 0; l < 6; l++) ledPos.push(new THREE.Vector3(x - W / 2 + 0.1, 0.4 + l * 0.28, z - side * (D / 2 + 0.006)));
      k++;
    }
  }
  racks.castShadow = racks.receiveShadow = true;
  g.add(racks, fronts);
  // Status LEDs (tiny, dim, amber/white).
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.1, 0.6) });
  const leds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 8, 6), ledMat, ledPos.length);
  ledPos.forEach((p, i) => {
    m4.makeTranslation(p.x, p.y, p.z);
    leds.setMatrixAt(i, m4);
  });
  g.add(leds);
  g.userData.leds = leds;
  g.userData.ledPos = ledPos;
  // Raised floor tiles.
  const tileTex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#9ea3a9';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#5b6066';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = '#6d7278';
    for (let y = 24; y < h - 20; y += 16) for (let x = 24; x < w - 20; x += 16) ctx.fillRect(x, y, 6, 6);
  }, { key: 'dcTile', repeat: [14, 6] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 5.2), new THREE.MeshStandardMaterial({ map: tileTex, metalness: 0.5, roughness: 0.42 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(-1.2, 0.002, 0);
  floor.receiveShadow = true;
  g.add(floor);
  // Overhead cable trays with cable bundles.
  for (const z of [-1.25, 1.25]) {
    const tray = new THREE.Mesh(roundedBox(9.5, 0.06, 0.5, 0.01, 1), M.steel);
    tray.position.set(-1.2, 2.55, z);
    g.add(tray);
    for (let c = 0; c < 5; c++) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 9.4, 10), c % 2 ? M.rubber : new THREE.MeshStandardMaterial({ color: 0x2f4a6a, roughness: 0.6 }));
      cable.rotation.z = Math.PI / 2;
      cable.position.set(-1.2, 2.62, z - 0.18 + c * 0.09);
      g.add(cable);
    }
  }
  // Ceiling light bars (soft, practical fixtures).
  const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.45, 1.35) });
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 0.12), lightMat);
    bar.position.set(-3.6 + i * 2.4, 3.1, 0);
    g.add(bar);
  }
  return g;
}

/** Copper cold plate cut open: pin-fin array, inlet/outlet, coolant particles. */
/** Point on the tilted elliptical path the AI markets orbit (orbit-group space). */
function orbitPoint(a, out) {
  const r = 3.3;
  return out.set(Math.cos(a) * r, Math.sin(a * 2) * 0.25 + 0.4, Math.sin(a) * r * 0.55);
}

function buildColdPlate(M, quality) {
  const g = new THREE.Group();
  const cu = new THREE.MeshPhysicalMaterial({ color: 0xc98a5e, metalness: 1, roughness: 0.22, clearcoat: 0.4, clearcoatRoughness: 0.15 });
  const base = new THREE.Mesh(roundedBox(3.2, 0.18, 2.4, 0.04, 2), cu);
  base.position.y = 0.09;
  base.castShadow = base.receiveShadow = true;
  g.add(base);
  // Pin fins (the kind of fine structure additive copper manufacturing enables).
  const pin = new THREE.CylinderGeometry(0.035, 0.045, 0.42, 10);
  const nx = Math.round(26 * Math.max(0.6, quality)), nz = Math.round(18 * Math.max(0.6, quality));
  const pins = new THREE.InstancedMesh(pin, cu, nx * nz);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const x = -1.45 + (i / (nx - 1)) * 2.9 + (j % 2) * 0.05;
      const z = -1.0 + (j / (nz - 1)) * 2.0;
      const h = 0.75 + 0.25 * Math.cos(Math.hypot(x, z) * 1.6);
      m4.compose(new THREE.Vector3(x, 0.18 + 0.21 * h, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1));
      pins.setMatrixAt(k++, m4);
    }
  pins.castShadow = true;
  g.add(pins);
  // Half lid (glass) and the walls.
  const lid = new THREE.Mesh(roundedBox(3.2, 0.06, 1.2, 0.02, 2), M.glassTint);
  lid.position.set(0, 0.66, -0.6);
  lid.renderOrder = 2;
  g.add(lid);
  for (const [x, z, w, d] of [[0, -1.17, 3.2, 0.06], [-1.57, 0, 0.06, 2.4], [1.57, 0, 0.06, 2.4]]) {
    const wall = new THREE.Mesh(roundedBox(w, 0.5, d, 0.01, 1), cu);
    wall.position.set(x, 0.43, z);
    wall.castShadow = true;
    g.add(wall);
  }
  for (const x of [-1.8, 1.8]) {
    const port = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.6, 32), M.brass);
    port.rotation.z = Math.PI / 2;
    port.position.set(x, 0.42, 0.2);
    g.add(port);
  }
  // Coolant particles drifting between the fins (cool, subtle).
  const N = 420;
  const pos = new Float32Array(N * 3);
  const rnd = new Float32Array(N);
  const rand = mulberry32(5);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = -1.5 + rand() * 3;
    pos[i * 3 + 1] = 0.22 + rand() * 0.38;
    pos[i * 3 + 2] = -1.0 + rand() * 2.0;
    rnd[i] = rand();
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('aR', new THREE.BufferAttribute(rnd, 1));
  const pm = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 300 }, uOn: { value: 0 } },
    vertexShader: /* glsl */ `attribute float aR; uniform float uTime, uScale; varying float vA;
      void main(){ vec3 p = position; p.x = mod(p.x + 1.5 + uTime * (0.25 + aR * 0.25), 3.0) - 1.5;
        p.z += sin(uTime * 2.0 + aR * 30.0 + p.x * 4.0) * 0.04;
        vA = smoothstep(-1.5, -1.2, p.x) * (1.0 - smoothstep(1.2, 1.5, p.x));
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.03 + aR * 0.02) * uScale / -mv.z; }`,
    fragmentShader: /* glsl */ `uniform float uOn; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA * uOn;
        gl_FragColor = vec4(vec3(0.68, 0.8, 0.95) * a * 0.7, 1.0); }`,
  });
  const pts = new THREE.Points(pg, pm);
  pts.frustumCulled = false;
  g.add(pts);
  g.userData = { coolant: pm };
  return g;
}

export class Ai extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.env = 'studio';
    this.exposure = 1.0;
    this.shift = 0.2;
    this.look = { bloom: 0.14, threshold: 1.0, vignette: 0.38, saturation: 1.02 };
  }

  build() {
    const M = materials();
    const q = this.app.quality.tier;
    this.addBackdrop({ top: '#101215', bottom: '#040506', glow: '#1c2128', glowPos: [0.66, 0.56], glowSize: 0.6, glowStrength: 0.8 });
    this.addDust({ count: 280, radius: 40, height: 6, size: 0.05, opacity: 0.28, seed: 91, center: [28, 2, 0] });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 70), new THREE.MeshPhysicalMaterial({ color: 0x121316, roughness: 0.42, clearcoat: 0.35 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.001;
    floor.receiveShadow = true;
    this.add(floor);
    this.key = spot(this.scene, { intensity: 130, pos: [-2, 10, 7], target: [0, 0, 0], angle: 0.6, penumbra: 0.8, shadow: q.shadows, shadowSize: q.shadowSize, far: 40 });
    const rim = new THREE.DirectionalLight(0xd2dcff, 1.8);
    rim.position.set(6, 5, -8);
    this.scene.add(rim, new THREE.HemisphereLight(0xfff0e4, 0x0b0b0c, 0.18));
    this.focus = new THREE.Vector3();

    /* --- data-centre aisle ------------------------------------------------------- */
    this.aisle = buildAisle(M, q.particles);
    this.add(this.aisle);
    this.label({ text: 'GPUサーバーのラック', sub: '1台で一般家庭の数十軒分の電力も', anchor: [-0.6, 2.2, -1.25], offset: [40, -40], when: () => this.step === 0 && this.stepTime > 1.8 });

    /* --- power chain: 800 V -> 48 V -> 12 V -> < 1 V ------------------------------ */
    const chain = new THREE.Group();
    chain.position.copy(CHAIN);
    chain.rotation.y = -0.5; // runs from far-left (800 V) to near-right (GPU)
    this.add(chain);
    const busMat = new THREE.MeshPhysicalMaterial({ color: 0xc8845a, metalness: 1, roughness: 0.28, clearcoat: 0.4 });
    this.tracker.track(busMat);
    const stages = [-6.2, -2.4, 1.6, 5.4];
    // Stage 1: HVDC bus with a DC-link film capacitor bank.
    const s1 = new THREE.Group();
    s1.position.x = stages[0];
    for (let i = 0; i < 3; i++) {
      const fc = filmCapacitor({ w: 1.1, h: 0.85, d: 0.6, color: 0x7d858d, text: ['MKP DC-LINK', '900V'] });
      fc.position.set(-0.6 + i * 0.62, 0.0, (i % 2) * 0.1);
      fc.scale.setScalar(0.55);
      fc.position.y = 0.3;
      fc.rotation.y = 0.25;
      s1.add(fc);
    }
    chain.add(s1);
    // Stage 2: power shelf (rectifier) with snap-in electrolytics.
    const s2 = new THREE.Group();
    s2.position.x = stages[1];
    const psu = powerSupply({ w: 1.6, h: 0.5, d: 1.2 });
    psu.position.y = 0.0;
    s2.add(psu);
    for (let i = 0; i < 3; i++) {
      const c = electrolytic({ r: 0.16, h: 0.5 });
      c.position.set(-0.5 + i * 0.36, 0.67, 0.25);
      s2.add(c);
    }
    chain.add(s2);
    // Stage 3 + 4: the accelerator board (µPOL, thin-film inductors, MLCC) and GPU.
    const board = buildAIBoard({ w: 5.4, d: 3.6, quality: q.particles });
    board.position.set(stages[2] + 1.9, 0, 0);
    board.rotation.y = 0;
    chain.add(board);
    this.board = board;
    chain.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    // Copper bus bars connecting the stages, with travelling energy pulses.
    const busPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(stages[0] - 1.0, 0.18, 0.9),
      new THREE.Vector3(stages[1] - 0.4, 0.18, 0.9),
      new THREE.Vector3(stages[1] + 0.9, 0.18, 0.9),
      new THREE.Vector3(stages[2] - 0.4, 0.18, 0.9),
      new THREE.Vector3(stages[2] + 0.4, 0.18, 1.2),
      new THREE.Vector3(stages[2] + 2.2, 0.2, 0.2),
    ], false, 'catmullrom', 0.2);
    const bus = new THREE.Mesh(new THREE.TubeGeometry(busPath, 220, 0.07, 12, false), busMat);
    bus.castShadow = true;
    chain.add(bus);
    this.pulse = pulseMaterial({ speed: 0.32, count: 9 });
    this.tracker.track(this.pulse);
    const glow = new THREE.Mesh(new THREE.TubeGeometry(busPath, 220, 0.085, 12, false), this.pulse);
    chain.add(glow);
    const volt = [
      ['800V', '直流給電（HVDC）・フィルムコンデンサ', stages[0], 1.0],
      ['約50V', 'サーバー電源・アルミ電解コンデンサ', stages[1], 1.15],
      ['12V→1V', 'µPOL・薄膜インダクタ・MLCC', stages[2] + 0.2, 0.55],
      ['GPU', '1V未満・大電流', stages[2] + 2.2, 0.45],
    ];
    volt.forEach(([t, s, x, y], i) => {
      this.label({ text: t, sub: s, anchor: () => chain.localToWorld(new THREE.Vector3(x, y, 0.4)), offset: [0, -56 - (i % 2) * 22], when: () => this.step === 1 && this.stepTime > 1.4 + i * 0.35, cls: 'big' });
    });

    /* --- cooling ------------------------------------------------------------------- */
    const cool = new THREE.Group();
    cool.position.copy(COOL);
    this.add(cool);
    const die = new THREE.Mesh(roundedBox(1.6, 0.12, 1.3, 0.02, 2), M.silicon);
    die.position.set(0, 0.06, 0);
    cool.add(die);
    const heatMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracker.track(heatMat);
    const heat = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2), heatMat);
    heat.rotation.x = -Math.PI / 2;
    heat.position.set(0, 0.125, 0);
    cool.add(heat);
    this.heat = heatMat;
    const plate = buildColdPlate(M, q.particles);
    plate.position.set(0, 0.13, 0);
    cool.add(plate);
    this.plate = plate;
    this.label({ text: '銅のコールドプレート', sub: '細かいピンの間を冷却液が流れる', anchor: () => cool.localToWorld(new THREE.Vector3(0.6, 0.75, 0.6)), offset: [50, -50], when: () => this.step === 2 && this.stepTime > 1.6 });
    this.label({ text: 'Fabric8Labs', sub: '電気化学で金属を積み上げる3Dプリント', anchor: () => cool.localToWorld(new THREE.Vector3(-1.2, 0.7, 0.9)), offset: [-40, 46], when: () => this.step === 2 && this.stepTime > 2.2 });

    /* --- growth ------------------------------------------------------------------- */
    const grow = new THREE.Group();
    grow.position.copy(GROW);
    this.add(grow);
    const colMat = new THREE.MeshPhysicalMaterial({ color: 0xc8845a, metalness: 1, roughness: 0.25, clearcoat: 0.5 });
    const ghostMat = new THREE.MeshPhysicalMaterial({ color: 0xe8e2d8, roughness: 0.5, transparent: true, opacity: 0.35, depthWrite: false });
    this.tracker.track(colMat);
    this.tracker.track(ghostMat);
    const colGeo = roundedBox(0.8, 1, 0.8, 0.05, 3);
    colGeo.translate(0, 0.5, 0);
    this.tracker.track(colGeo);
    this.cols = [
      ['2026年3月期', 1.0, -1.4, ghostMat],
      ['2027年3月期', 1.25, 0, ghostMat],
      ['2031年3月期', 3.0, 1.4, colMat],
    ].map(([name, v, x, mat], i) => {
      const m = new THREE.Mesh(colGeo, mat);
      m.position.set(x, 0, 0);
      m.scale.y = 0.0001;
      m.castShadow = true;
      grow.add(m);
      this.label({ text: name, sub: i === 0 ? '売上の1割強' : i === 1 ? '約15%（+25%）' : '約3倍', anchor: () => grow.localToWorld(new THREE.Vector3(x, Math.max(0.2, m.scale.y) + 0.1, 0.4)), offset: [[-50, 34], [-36, -50], [40, -40]][i], when: () => this.step === 3 && this.stepTime > 1.6 + i * 0.3 });
      return { m, v, i };
    });
    // Orbiting markets: rack, car body, glasses, chip, robot head.
    const orbit = new THREE.Group();
    orbit.position.set(0, 1.6, 0);
    grow.add(orbit);
    const items = [];
    const rackMini = new THREE.Mesh(roundedBox(0.3, 0.7, 0.4, 0.02, 2), new THREE.MeshPhysicalMaterial({ color: 0x1b1d21, metalness: 0.6, roughness: 0.4 }));
    items.push([rackMini, 'データセンター']);
    const car = new THREE.Group();
    const body = new THREE.Mesh(roundedBox(0.8, 0.18, 0.36, 0.08, 3), new THREE.MeshPhysicalMaterial({ color: 0x8a9096, metalness: 0.8, roughness: 0.25, clearcoat: 1 }));
    const cab = new THREE.Mesh(roundedBox(0.42, 0.16, 0.32, 0.08, 3), M.screen);
    cab.position.set(-0.05, 0.15, 0);
    car.add(body, cab);
    items.push([car, '自動運転']);
    const glasses = new THREE.Group();
    for (const sx of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.018, 10, 40), M.anodizedDark);
      rim.position.x = sx * 0.17;
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.13, 32), M.glassTint);
      lens.position.x = sx * 0.17;
      glasses.add(rim, lens);
    }
    items.push([glasses, 'スマートグラス']);
    const chip = lgaPackage({ w: 0.4, d: 0.4, h: 0.08 });
    items.push([chip, '半導体製造']);
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 20), M.porcelain);
    skull.scale.set(1, 1.15, 1);
    const visor = new THREE.Mesh(roundedBox(0.3, 0.09, 0.1, 0.04, 2), M.screen);
    visor.position.set(0, 0.02, 0.17);
    head.add(skull, visor);
    items.push([head, 'ヒューマノイド']);
    this.orbitItems = items.map(([o, name], i) => {
      o.traverse((c) => (c.castShadow = true));
      orbit.add(o);
      return { o, a: (i / items.length) * Math.PI * 2 };
    });
    this.orbit = orbit;
    // The path the markets travel, drawn in when the step opens: one ecosystem
    // circling the growth columns rather than loose props.
    const path = [];
    for (let i = 0; i < 180; i++) path.push(orbitPoint((i / 180) * Math.PI * 2, new THREE.Vector3()));
    const ringGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path, true), 360, 0.007, 6, true);
    this.tracker.track(ringGeo);
    this.ecoRing = new THREE.Mesh(ringGeo, M.copperWire);
    this.ecoRingTotal = ringGeo.index.count;
    ringGeo.setDrawRange(0, 0);
    orbit.add(this.ecoRing);
  }

  poses() {
    return [
      { pos: [3.4, 1.55, 0.2], target: [-2.6, 1.15, 0], fov: 40, dur: 2.2 },
      { pos: [CHAIN.x - 2.4, 6.6, 11.4], target: [CHAIN.x - 0.7, 0.3, 0.2], fov: 34, dur: 3.0 },
      { pos: [COOL.x + 2.8, 3.4, 3.8], target: [COOL.x + 0.2, 0.4, 0], fov: 32, dur: 3.0 },
      { pos: [GROW.x + 0.9, 3.4, 9.6], target: [GROW.x + 0.45, 1.65, 0], fov: 32, dur: 3.0 },
    ];
  }

  onStep(step, instant) {
    const f = [-1, CHAIN.x, COOL.x, GROW.x][step];
    this.focusGoal = f;
    if (instant) this.focus.x = f;
  }

  tick(dt, t) {
    const st = this.stepTime;
    this.focus.x = damp(this.focus.x, this.focusGoal ?? 0, 1.5, dt);
    this.key.position.set(this.focus.x - 2, 10, 7);
    this.key.target.position.set(this.focus.x, 0.5, 0);

    // Rack LEDs twinkle gently.
    const led = this.aisle.userData.leds;
    led.material.color.setRGB(1.4 + Math.sin(t * 3) * 0.2, 1.0, 0.55);

    // Power chain pulses.
    this.pulse.uniforms.uTime.value = t;
    this.to('pulse', this.step === 1 ? 1 : 0);
    this.pulse.uniforms.uOn.value = this.param('pulse');

    // Cooling: the die glows hot, then coolant takes the heat away.
    const cOn = this.step === 2 ? 1 : 0;
    this.to('cool', cOn ? smoothstep(1.0, 3.0, st) : 0);
    const coolK = this.param('cool');
    const hot = (cOn ? 1 : 0) * (1 - coolK * 0.75);
    this.heat.color.setRGB(0.9 * hot, 0.32 * hot, 0.08 * hot);
    this.plate.userData.coolant.uniforms.uTime.value = t;
    this.plate.userData.coolant.uniforms.uOn.value = coolK;
    this.plate.userData.coolant.uniforms.uScale.value = this.app.pixelRatio * this.app.height * 0.9;

    // Growth columns rise; markets orbit.
    for (const c of this.cols) {
      const k = this.step === 3 ? easeOutCubic(clamp01((st - 0.6 - c.i * 0.35) / 1.2)) : 0;
      c.m.scale.y = Math.max(0.0001, damp(c.m.scale.y, c.v * 0.9 * k, 6, dt));
    }
    const rk = this.step === 3 ? easeOutCubic(clamp01((st - 0.5) / 1.8)) : 0;
    const rn = Math.floor(this.ecoRingTotal * rk);
    this.ecoRing.geometry.setDrawRange(0, rn - (rn % 3));
    this.ecoRing.visible = rn > 0;
    this.orbitItems.forEach((it, i) => {
      const a = it.a + t * 0.25;
      orbitPoint(a, it.o.position);
      it.o.rotation.y = -a + t * 0.3;
      const s = this.step === 3 ? easeOutBack(clamp01((st - 1.0 - i * 0.15) / 0.6)) : 0;
      it.o.scale.setScalar(Math.max(0.0001, s * 1.05));
    });
  }
}
