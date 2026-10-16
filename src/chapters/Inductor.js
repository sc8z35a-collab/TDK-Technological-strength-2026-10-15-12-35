// CH.07 Inductors & EMC — a drum-core coil with flowing field lines that smooths
// a rippled current; the three ways TDK makes inductors; a common-mode filter
// stopping noise on a differential pair; thin-film inductors around an AI GPU.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials, roundedBox } from '../core/kit.js';
import { commonModeFilter, powerInductor, pcbTexture } from '../core/parts.js';
import { buildLayeredChip } from './History.js';
import { buildAIBoard } from './board.js';
import { clamp01, easeOutCubic, smoothstep, mulberry32, damp } from '../core/math.js';
import { spot } from './common.js';

const S1 = new THREE.Vector3(14, 0, 0);
const S2 = new THREE.Vector3(28, 0, 0);
const S3 = new THREE.Vector3(42, 0, 0);

/** Animated dashed flow along a tube (uv.x runs along the curve). */
function flowMaterial(color = [1.0, 0.86, 0.66], { opacity = 0.5, dashes = 6, speed = 0.35 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(...color) }, uOpacity: { value: opacity }, uDash: { value: dashes }, uSpeed: { value: speed } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vFres;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vFres = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity, uDash, uSpeed; uniform vec3 uColor;
      varying vec2 vUv; varying float vFres;
      void main() {
        float f = fract(vUv.x * uDash - uTime * uSpeed);
        float dash = smoothstep(0.0, 0.25, f) * (1.0 - smoothstep(0.35, 1.0, f));
        float a = (0.25 + 0.75 * dash) * uOpacity * pow(vFres, 0.6);
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
  });
}

/** Current waveform ribbon: ripple on the input side, smooth after the coil. */
function waveMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMix: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime, uMix;
      varying float vX; varying vec3 vN;
      void main() {
        vec3 p = position;
        float x = p.x;
        float smoothW = 0.35 * sin(0.9 * x - 1.6 * uTime);
        float ripple = 0.13 * sin(19.0 * x - 16.0 * uTime) + 0.07 * sin(37.0 * x - 23.0 * uTime + 1.3);
        float keep = 1.0 - smoothstep(-0.9, 1.1, x) * uMix;
        p.y += smoothW + ripple * keep;
        vX = x;
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vX; varying vec3 vN;
      void main() {
        float lit = 0.55 + 0.45 * max(dot(vN, normalize(vec3(-0.3, 0.8, 0.5))), 0.0);
        vec3 a = vec3(0.86, 0.6, 0.42);
        vec3 b = vec3(0.92, 0.9, 0.84);
        vec3 c = mix(a, b, smoothstep(-0.5, 1.0, vX)) * lit * 1.4;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/** Thin-film inductor: dark substrate, planar copper spiral, glassy coat. */
function thinFilmInductor(M) {
  const g = new THREE.Group();
  const sub = new THREE.Mesh(roundedBox(1.0, 0.16, 0.6, 0.02, 2), new THREE.MeshPhysicalMaterial({ color: 0x2a2b2f, roughness: 0.45, metalness: 0.2 }));
  sub.position.y = 0.08;
  g.add(sub);
  const pts = [];
  let w = 0.62, h = 0.36;
  const turns = 5;
  for (let i = 0; i < turns; i++) {
    const d = i * 0.05;
    pts.push(new THREE.Vector3(-w / 2 + d, 0, -h / 2 + d), new THREE.Vector3(w / 2 - d, 0, -h / 2 + d), new THREE.Vector3(w / 2 - d, 0, h / 2 - d - 0.05), new THREE.Vector3(-w / 2 + d + 0.05, 0, h / 2 - d - 0.05));
  }
  const path = new THREE.CurvePath();
  for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
  const coil = new THREE.Mesh(new THREE.TubeGeometry(path, 400, 0.012, 4, false), M.copper);
  coil.scale.y = 0.4;
  coil.position.y = 0.165;
  g.add(coil);
  const coat = new THREE.Mesh(roundedBox(0.84, 0.05, 0.5, 0.015, 2), M.glassTint);
  coat.position.y = 0.19;
  coat.renderOrder = 2;
  g.add(coat);
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(roundedBox(0.09, 0.2, 0.62, 0.02, 2), M.tin);
    t.position.set(sx * 0.46, 0.1, 0);
    g.add(t);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

export class Inductor extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.dofSteps = [0.006, 0.008, 0.008, 0.01];
    this.env = 'studio';
    this.exposure = 1.0;
    this.shift = 0.2;
    this.look = { bloom: 0.16, threshold: 0.95, vignette: 0.4, saturation: 1.03 };
  }

  build() {
    const M = materials();
    const q = this.app.quality.tier;
    this.addBackdrop({ top: '#121315', bottom: '#050506', glow: '#1f232a', glowPos: [0.68, 0.55], glowSize: 0.6, glowStrength: 0.8 });
    this.addDust({ count: 300, radius: 30, height: 6, size: 0.05, opacity: 0.32, seed: 41, center: [20, 2, 0] });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), new THREE.MeshPhysicalMaterial({ color: 0x121316, roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.add(floor);
    this.key = spot(this.scene, { intensity: 120, pos: [-2, 9, 7], target: [0, 0, 0], angle: 0.55, penumbra: 0.8, shadow: q.shadows, shadowSize: q.shadowSize, far: 40 });
    const rim = new THREE.DirectionalLight(0xcfdbff, 1.8);
    rim.position.set(6, 5, -8);
    this.scene.add(rim, new THREE.HemisphereLight(0xfff0e4, 0x0b0b0c, 0.15));
    this.focus = new THREE.Vector3();

    /* --- step 0: drum-core coil, field lines, smoothed current --------------------- */
    const coil = new THREE.Group();
    coil.position.set(0, 1.45, 0);
    this.add(coil);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 3.0, 64), M.ferrite);
    drum.rotation.z = Math.PI / 2;
    drum.castShadow = true;
    coil.add(drum);
    for (const sx of [-1, 1]) {
      const fl = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.22, 72), M.ferrite);
      fl.rotation.z = Math.PI / 2;
      fl.position.x = sx * 1.5;
      fl.castShadow = true;
      coil.add(fl);
    }
    const wpts = [];
    const turns = 15, n = turns * 40;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = t * turns * Math.PI * 2;
      wpts.push(new THREE.Vector3(-1.3 + t * 2.6, Math.cos(a) * 0.52, Math.sin(a) * 0.52));
    }
    const winding = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wpts), n, 0.07, 10, false), M.copperWire);
    winding.castShadow = true;
    coil.add(winding);
    // Field lines: nested loops through the core, rotated around the axis.
    this.flowMats = [];
    const fieldMat = flowMaterial([0.95, 0.82, 0.62], { opacity: 0.55, dashes: 5, speed: 0.4 });
    this.flowMats.push(fieldMat);
    this.tracker.track(fieldMat);
    for (let k = 0; k < 6; k++) {
      const phi = (k / 6) * Math.PI * 2;
      for (const [A, Rout] of [[1.95, 1.35], [2.65, 1.95], [3.45, 2.55]]) {
        const pts = [];
        for (let i = 0; i < 96; i++) {
          const t = (i / 96) * Math.PI * 2;
          const x = A * Math.cos(t);
          // Return path outside (t in 0..pi), straight back through the core.
          const rho = t <= Math.PI ? 0.22 + (Rout - 0.22) * Math.pow(Math.sin(t), 0.8) : 0.22;
          pts.push(new THREE.Vector3(x, Math.cos(phi) * rho, Math.sin(phi) * rho));
        }
        const curve = new THREE.CatmullRomCurve3(pts, true);
        const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.012, 5, true), fieldMat);
        coil.add(line);
      }
    }
    this.coil = coil;
    // Current ribbon running through the core.
    const waveGeo = new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(-6.5, 0, 0), new THREE.Vector3(6.5, 0, 0)), 600, 0.03, 6, false);
    this.waveMat = waveMaterial();
    this.tracker.track(this.waveMat);
    const wave = new THREE.Mesh(waveGeo, this.waveMat);
    wave.position.set(0, 1.45, 1.6);
    this.add(wave);
    this.label({ text: '入力：ギザギザの電流', sub: 'リプル（ゆらぎ）を含む', anchor: [-4.6, 2.0, 1.6], offset: [-30, -50], when: () => this.step === 0 && this.stepTime > 1.6 });
    this.label({ text: '出力：なめらかな電流', anchor: [4.8, 1.9, 1.6], offset: [20, -50], when: () => this.step === 0 && this.stepTime > 2.4 });
    this.label({ text: '磁界', sub: 'コアの中を通って一周する', anchor: [0.4, 3.2, 0.2], offset: [40, -30], when: () => this.step === 0 && this.stepTime > 2.0 });

    /* --- step 1: three construction methods -------------------------------------- */
    const trio = new THREE.Group();
    trio.position.copy(S1);
    this.add(trio);
    const ped = (x) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.3, 64), M.anodizedDark);
      p.position.set(x, 0.15, 0);
      p.castShadow = p.receiveShadow = true;
      trio.add(p);
    };
    [-3.1, 0, 3.1].forEach(ped);
    const ww = powerInductor({ size: 1.2 });
    ww.position.set(-3.1, 0.3, 0);
    ww.rotation.y = 0.5;
    trio.add(ww);
    // Show its winding by lifting the shield ring off.
    this.wwShield = ww.children.find((o) => o.geometry && o.geometry.type === 'ExtrudeGeometry');
    const ml = buildLayeredChip(M, { layers: 14, w: 1.2, d: 0.66, lh: 0.034 });
    ml.position.set(0, 0.3, 0);
    ml.rotation.y = -0.5;
    trio.add(ml);
    this.ml = ml;
    const tf = thinFilmInductor(M);
    tf.scale.setScalar(1.6);
    tf.position.set(3.1, 0.3, 0);
    tf.rotation.y = -0.4;
    trio.add(tf);
    this.tf = tf;
    this.trio = trio;
    this.label({ text: '巻線', sub: '芯に銅線を巻く', anchor: () => trio.localToWorld(new THREE.Vector3(-3.1, 1.3, 0)), offset: [-30, -50], when: () => this.step === 1 && this.stepTime > 1.6 });
    this.label({ text: '積層', sub: 'シートに印刷して重ねる（1980年〜）', anchor: () => trio.localToWorld(new THREE.Vector3(0, 1.1, 0)), offset: [30, -60], when: () => this.step === 1 && this.stepTime > 1.9 });
    this.label({ text: '薄膜', sub: 'HDDヘッドの技術を応用', anchor: () => trio.localToWorld(new THREE.Vector3(3.1, 0.75, 0)), offset: [40, -50], when: () => this.step === 1 && this.stepTime > 2.2 });

    /* --- step 2: common-mode filter on a differential pair ------------------------ */
    const emc = new THREE.Group();
    emc.position.copy(S2);
    this.add(emc);
    const strip = new THREE.Mesh(roundedBox(12, 0.12, 2.4, 0.03, 2), new THREE.MeshPhysicalMaterial({ map: pcbTexture({ size: 1024, seed: 12, mask: '#13241d', key: 'emcPcb', traces: 60 }), roughness: 0.4, clearcoat: 0.7 }));
    strip.position.y = 0.06;
    strip.receiveShadow = true;
    emc.add(strip);
    for (const z of [-0.36, 0.36]) {
      const tr = new THREE.Mesh(new THREE.BoxGeometry(12, 0.02, 0.14), M.copper);
      tr.position.set(0, 0.13, z);
      emc.add(tr);
    }
    const cmf = commonModeFilter({ turns: 8 });
    cmf.scale.setScalar(0.9);
    cmf.rotation.y = Math.PI / 2;
    cmf.position.set(0, 0.12 + 0.5 * 0.9, 0);
    cmf.traverse((o) => (o.castShadow = true));
    emc.add(cmf);
    // Signal packets (differential: opposite polarity on the two lines).
    const pktGeo = new THREE.CapsuleGeometry(0.07, 0.4, 4, 10);
    pktGeo.rotateZ(Math.PI / 2);
    this.tracker.track(pktGeo);
    const pktMat = new THREE.MeshStandardMaterial({ color: 0xe8d6c0, emissive: 0xffa060, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.3 });
    const pktMatB = new THREE.MeshStandardMaterial({ color: 0xc8d4e4, emissive: 0x7aa4ff, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.3 });
    this.tracker.track(pktMat);
    this.tracker.track(pktMatB);
    this.packets = [];
    for (let i = 0; i < 6; i++) {
      for (const [z, mat] of [[-0.36, pktMat], [0.36, pktMatB]]) {
        const m = new THREE.Mesh(pktGeo, mat);
        m.position.set(0, 0.25, z);
        emc.add(m);
        this.packets.push({ m, phase: i / 6, z });
      }
    }
    // Common-mode noise: specks that hug both lines and die at the filter.
    const rand = mulberry32(8);
    const N = 700;
    const np = new Float32Array(N * 3);
    const nr = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      np[i * 3] = -6 + rand() * 6;
      np[i * 3 + 1] = 0.2 + rand() * 0.5;
      np[i * 3 + 2] = (rand() < 0.5 ? -0.36 : 0.36) + (rand() - 0.5) * 0.4;
      nr[i * 4] = rand();
      nr[i * 4 + 1] = rand();
      nr[i * 4 + 2] = rand();
      nr[i * 4 + 3] = rand();
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(np, 3));
    ng.setAttribute('aRnd', new THREE.BufferAttribute(nr, 4));
    this.noiseMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 300 }, uOn: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec4 aRnd; uniform float uTime, uScale, uOn; varying float vA;
        void main() {
          vec3 p = position;
          float x = mod(p.x + uTime * (0.8 + aRnd.x * 0.6) + 6.0, 7.0) - 6.0;
          p.x = x;
          p.y += sin(uTime * 9.0 + aRnd.y * 40.0) * 0.08;
          p.z += sin(uTime * 7.0 + aRnd.z * 40.0) * 0.06;
          vA = (1.0 - smoothstep(-0.9, 0.2, x)) * uOn;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.025 + aRnd.w * 0.03) * uScale / -mv.z;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.1, length(c)) * vA;
          gl_FragColor = vec4(vec3(0.8, 0.84, 0.9) * a * 0.9, 1.0);
        }`,
    });
    this.tracker.track(this.noiseMat);
    const noise = new THREE.Points(ng, this.noiseMat);
    noise.frustumCulled = false;
    emc.add(noise);
    this.label({ text: 'コモンモードノイズ', sub: '2本の線に同じ向きで乗る雑音', anchor: () => emc.localToWorld(new THREE.Vector3(-3.6, 0.7, -0.4)), offset: [-20, -60], when: () => this.step === 2 && this.stepTime > 1.8 });
    this.label({ text: '信号はそのまま通過', sub: '逆向きの信号（差動）は止めない', anchor: () => emc.localToWorld(new THREE.Vector3(3.6, 0.45, 0.4)), offset: [10, 56], when: () => this.step === 2 && this.stepTime > 2.4 });
    this.label({ text: 'コモンモードフィルタ', sub: '信号系EMCフィルタ 世界No.1', anchor: () => emc.localToWorld(new THREE.Vector3(0, 1.15, 0)), offset: [40, -50], when: () => this.step === 2 && this.stepTime > 1.2 });

    /* --- step 3: thin-film inductors around an AI accelerator ---------------------- */
    const board = buildAIBoard({ quality: q.particles });
    board.position.copy(S3);
    this.add(board);
    this.board = board;
    this.label({ text: '薄膜インダクタ', sub: 'GPUに電力を届ける電源回路の部品', anchor: () => board.localToWorld(board.userData.inductors[5].clone()), offset: [-40, -60], when: () => this.step === 3 && this.stepTime > 1.6 });
    this.label({ text: 'GPU', sub: 'AIの計算をする半導体', anchor: () => board.localToWorld(new THREE.Vector3(0.3, 0.25, 0)), offset: [40, -50], when: () => this.step === 3 && this.stepTime > 2.0 });
  }

  poses() {
    return [
      { pos: [2.6, 3.3, 10.5], target: [0.4, 1.5, 0.4], fov: 32, dur: 2.2 },
      { pos: [S1.x + 1.5, 3.7, 9.6], target: [S1.x + 0.7, 0.8, 0], fov: 32, dur: 2.8 },
      { pos: [S2.x + 3.2, 4.2, 6.6], target: [S2.x + 0.3, 0.4, 0], fov: 32, dur: 2.8 },
      { pos: [S3.x + 3.6, 5.6, 6.2], target: [S3.x + 0.6, 0.1, 0.1], fov: 32, dur: 2.8 },
    ];
  }

  onStep(step, instant) {
    const f = [0, S1.x, S2.x, S3.x][step];
    this.focusGoal = f;
    if (instant) this.focus.x = f;
  }

  tick(dt, t) {
    const st = this.stepTime;
    this.focus.x = damp(this.focus.x, this.focusGoal ?? 0, 1.6, dt);
    this.key.position.set(this.focus.x - 2, 9, 7);
    this.key.target.position.set(this.focus.x, 0.5, 0);

    // Step 0: field lines flow, the coil smooths the current.
    for (const m of this.flowMats) m.uniforms.uTime.value = t;
    this.to('smooth', this.step === 0 ? smoothstep(1.2, 3.2, st) : 0);
    this.waveMat.uniforms.uTime.value = t;
    this.waveMat.uniforms.uMix.value = this.param('smooth');
    this.coil.rotation.x = Math.sin(t * 0.3) * 0.05;

    // Step 1: shield lifts, multilayer chip opens, thin film tilts.
    this.to('open', this.step === 1 ? smoothstep(0.8, 2.2, st) : 0);
    const o = this.param('open');
    if (this.wwShield) this.wwShield.position.y = 0.42 * 1.2 + o * 0.9;
    const ch = this.ml.userData;
    ch.sheets.forEach((s, i) => (s.position.y = ch.lh / 2 + i * (ch.lh + o * 0.06)));
    ch.terms.forEach((tm, i) => {
      const k = Math.max(0.0001, 1 - smoothstep(0, 0.4, o));
      tm.scale.setScalar(k);
      tm.visible = k > 0.002;
    });
    this.tf.rotation.x = o * 0.5;
    this.tf.position.y = 0.3 + o * 0.35;
    this.trio.children.forEach((c) => {
      if (c === this.ml || c === this.tf) c.rotation.y += Math.sin(t * 0.4) * 0.0008;
    });

    // Step 2: packets travel; noise specks stop at the filter.
    this.noiseMat.uniforms.uTime.value = t;
    this.noiseMat.uniforms.uScale.value = this.app.pixelRatio * this.app.height * 0.9;
    this.to('noise', this.step === 2 ? 1 : 0);
    this.noiseMat.uniforms.uOn.value = this.param('noise');
    for (const p of this.packets) {
      const u = (t * 0.16 + p.phase) % 1;
      p.m.position.x = -5.8 + u * 11.6;
      p.m.visible = this.step === 2;
      const s = 0.8 + 0.2 * Math.sin(u * Math.PI);
      p.m.scale.setScalar(s);
    }

    // Step 3: inductors breathe with load (subtle warm glow).
    this.board.rotation.y = -0.25 + Math.sin(t * 0.2) * 0.05;
  }
}
