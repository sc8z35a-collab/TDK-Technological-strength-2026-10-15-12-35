// CH.13 Future lab — TDK's spintronics research and the road to smart glasses:
// electrons whose spins line up after a ferromagnetic layer; a spin-memristor
// crossbar whose analog weights change with learning pulses; a spin
// photodetector answering a light pulse in 20 ps; an analog reservoir AI chip
// reading rock-paper-scissors ahead of time; and glasses whose meta-optics
// mirror steers a laser through the pupil to draw directly on the retina.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials, roundedBox, roundedRectShape, extrude } from '../core/kit.js';
import { canvasTexture } from '../core/textures.js';
import { clamp01, smoothstep, mulberry32, damp, lerp } from '../core/math.js';
import { spot } from './common.js';

const SPIN = new THREE.Vector3(0, 0, 0);
const CROSS = new THREE.Vector3(14, 0, 0);
const PHOTO = new THREE.Vector3(28, 0, 0);
const RES = new THREE.Vector3(42, 0, 0);
const GLASS = new THREE.Vector3(56, 0, 0);

const UP = new THREE.Vector3(0, 1, 0);
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const ID_Q = new THREE.Quaternion();

function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = shadow;
  return m;
}

/** Clone of a lit material whose emission (not its diffuse colour) is scaled per instance by instanceColor. */
function instanceGlow(base, key) {
  const m = base.clone();
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance *= vColor.rgb;\n#endif');
  };
  m.customProgramCacheKey = () => `future-glow-${key}`;
  return m;
}

/** Soft additive material for thin tubes: brightest along the axis that faces the camera. */
function beamMaterial(color, opacity = 1) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(...color) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      varying float vF;
      void main() {
        vec4 p = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
          n = mat3(instanceMatrix) * n;
        #endif
        vec4 mv = modelViewMatrix * p;
        vF = abs(dot(normalize(normalMatrix * n), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying float vF;
      void main() { gl_FragColor = vec4(uColor * pow(vF, 1.5) * uOpacity, 1.0); }`,
  });
}

function glowTex() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.16, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: false, key: 'futureGlow' });
}

function glowSprite(color, size, opacity = 1) {
  const mat = new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(...color), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

/** Flat arrow (shaft + triangular head) pointing +y, extruded thin along z. */
function flatArrow(mat, len = 0.8, w = 0.07, headW = 0.26, headL = 0.2, depth = 0.03) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(w, len - headL, depth, 0.012, 2), mat, 0, (len - headL) / 2, 0));
  const s = new THREE.Shape();
  s.moveTo(-headW / 2, 0);
  s.lineTo(headW / 2, 0);
  s.lineTo(0, headL);
  s.lineTo(-headW / 2, 0);
  g.add(mesh(extrude(s, depth, 0.006, 1), mat, 0, len - headL, 0));
  return g;
}

/* ================================================================ step 0 */

/** Electrons stream through a glass channel; a magnetised alloy block lines their spins up. */
function buildSpin(M) {
  const g = new THREE.Group();
  const rand = mulberry32(1301);
  const CY = 0.66, XS = 0.35;
  g.add(mesh(roundedBox(6.6, 0.18, 2.7, 0.05, 3), M.anodizedDark, 0, 0.09, 0));
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xe2eaf2, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.13, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6, depthWrite: false });
  const channel = mesh(roundedBox(5.3, 0.62, 0.92, 0.15, 4), glass, 0, CY, 0, false);
  channel.renderOrder = 4;
  g.add(channel);
  const postGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.17, 20);
  for (const x of [-1.7, 1.7]) g.add(mesh(postGeo, M.steel, x, 0.265, 0));
  const elecGeo = roundedBox(0.4, 0.96, 1.12, 0.06, 3);
  for (const s of [-1, 1]) g.add(mesh(elecGeo, M.copper, s * 2.86, 0.66, 0));
  // Ferromagnetic layer: a polished alloy block magnetised upward.
  const alloy = new THREE.MeshPhysicalMaterial({ color: 0x8f969f, metalness: 1, roughness: 0.15, clearcoat: 0.5, clearcoatRoughness: 0.08, envMapIntensity: 1.25 });
  g.add(mesh(roundedBox(0.44, 1.6, 1.6, 0.05, 3), alloy, XS, 0.98, 0));
  const mArrow = flatArrow(M.copper, 0.78, 0.07, 0.24, 0.2, 0.03);
  mArrow.position.set(XS, 0.62, 0.815);
  g.add(mArrow);

  // Electrons: pearl spheres, each pierced by a spin arrow.
  const N = 28;
  const pearl = new THREE.MeshPhysicalMaterial({ color: 0xe9e5de, roughness: 0.2, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, iridescence: 0.55, iridescenceIOR: 1.35, iridescenceThicknessRange: [260, 620], envMapIntensity: 1.3 });
  const electrons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.078, 20, 14), pearl, N);
  const headGeo = new THREE.ConeGeometry(0.036, 0.1, 14);
  headGeo.translate(0, 0.21, 0);
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.28 });
  const shafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.013, 0.013, 0.32, 8), arrowMat, N);
  const heads = new THREE.InstancedMesh(headGeo, arrowMat, N);
  const items = [];
  for (let i = 0; i < N; i++) {
    const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), rand() * Math.PI * 2);
    items.push({ u0: (i + rand() * 0.6) / N, y0: (rand() - 0.5) * 0.3, z0: (rand() - 0.5) * 0.5, ph: rand() * 6.28, axis, q0, w: 0.5 + rand() * 1.1 });
    shafts.setColorAt(i, _c.setRGB(1, 1, 1));
    heads.setColorAt(i, _c);
  }
  for (const im of [electrons, shafts, heads]) {
    im.castShadow = true;
    im.frustumCulled = false;
    g.add(im);
  }

  // Magnetic tunnel junction pillar: the HDD-head heritage.
  const mtj = new THREE.Group();
  mtj.position.set(2.0, 0.18, -0.92);
  g.add(mtj);
  const pinned = new THREE.MeshPhysicalMaterial({ color: 0x3a3d43, metalness: 0.9, roughness: 0.3 });
  const ref = new THREE.MeshPhysicalMaterial({ color: 0xb07a52, metalness: 0.85, roughness: 0.28 });
  const barrier = new THREE.MeshPhysicalMaterial({ color: 0xf2eee6, roughness: 0.15, transparent: true, opacity: 0.6, clearcoat: 1 });
  const free = new THREE.MeshPhysicalMaterial({ color: 0xaab3bf, metalness: 0.9, roughness: 0.2 });
  const layers = [
    [0.1, 0.38, M.anodizedDark],
    [0.16, 0.3, M.copper],
    [0.2, 0.27, pinned],
    [0.09, 0.265, ref],
    [0.035, 0.265, barrier],
    [0.11, 0.26, free],
    [0.1, 0.25, M.nickel],
    [0.14, 0.27, M.copper],
  ];
  let y = 0;
  for (const [h, r, mat] of layers) {
    mtj.add(mesh(new THREE.CylinderGeometry(r * 0.97, r, h, 40), mat, 0, y + h / 2, 0));
    y += h;
  }
  g.userData = { electrons, shafts, heads, items, N, CY, XS, speed: 0.07, mtj, mtjTop: y, mats: [glass, alloy, pearl, arrowMat, pinned, ref, barrier, free] };
  return g;
}

/* ================================================================ step 1 */

/** Spin-memristor crossbar: copper word/bit lines with an analog device at every crossing. */
function buildCrossbar(M) {
  const g = new THREE.Group();
  const rand = mulberry32(1402);
  const N = 6, P = 0.56, H = 0.3;
  const at = (i) => (i - (N - 1) / 2) * P;
  g.add(mesh(roundedBox(5.0, 0.3, 5.0, 0.08, 3), M.epoxy, 0, 0.15, 0));
  g.add(mesh(roundedBox(4.3, 0.07, 4.3, 0.02, 2), M.silicon, 0, 0.335, 0));
  const Y0 = 0.37;
  const yRow = Y0 + 0.0225, yPil = Y0 + 0.045, yCol = yPil + H + 0.0225;
  const rows = new THREE.InstancedMesh(roundedBox(4.1, 0.045, 0.11, 0.015, 2), M.copper, N);
  const cols = new THREE.InstancedMesh(roundedBox(0.11, 0.045, 4.1, 0.015, 2), M.copper, N);
  const pads = new THREE.InstancedMesh(roundedBox(0.24, 0.03, 0.22, 0.01, 2), M.gold, N * 2);
  const vias = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, yCol - Y0, 12), M.copper, N);
  for (let i = 0; i < N; i++) {
    rows.setMatrixAt(i, _m4.makeTranslation(0, yRow, at(i)));
    cols.setMatrixAt(i, _m4.makeTranslation(at(i), yCol, 0));
    pads.setMatrixAt(i, _m4.makeTranslation(-2.16, Y0 + 0.015, at(i)));
    pads.setMatrixAt(N + i, _m4.makeTranslation(at(i), Y0 + 0.015, -2.16));
    vias.setMatrixAt(i, _m4.makeTranslation(at(i), Y0 + (yCol - Y0) / 2, -2.0));
  }
  const pillarMat = new THREE.MeshPhysicalMaterial({ color: 0xeaf0f6, roughness: 0.06, transparent: true, opacity: 0.3, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide });
  const shellGeo = new THREE.CylinderGeometry(0.085, 0.085, H - 0.1, 28, 1, true);
  shellGeo.translate(0, H / 2, 0);
  const discGeo = new THREE.CylinderGeometry(0.092, 0.092, 0.05, 28);
  const coreGeo = new THREE.CylinderGeometry(0.056, 0.056, 1, 18);
  coreGeo.translate(0, 0.5, 0);
  const alloy = new THREE.MeshPhysicalMaterial({ color: 0x3b3f46, metalness: 0.9, roughness: 0.3 });
  const shells = new THREE.InstancedMesh(shellGeo, pillarMat, N * N);
  const bases = new THREE.InstancedMesh(discGeo, alloy, N * N);
  const caps = new THREE.InstancedMesh(discGeo, M.nickel, N * N);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const cores = new THREE.InstancedMesh(coreGeo, coreMat, N * N);
  const cells = [];
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const k = i * N + j;
      const x = at(j), z = at(i);
      shells.setMatrixAt(k, _m4.makeTranslation(x, yPil, z));
      bases.setMatrixAt(k, _m4.makeTranslation(x, yPil + 0.025, z));
      caps.setMatrixAt(k, _m4.makeTranslation(x, yPil + H - 0.025, z));
      const lv = 0.12 + rand() * 0.8;
      cells.push({ x, z, level: lv, target: lv, flash: 0 });
      cores.setColorAt(k, _c.setRGB(1, 1, 1));
    }
  for (const im of [rows, cols, pads, vias, bases, caps]) {
    im.castShadow = im.receiveShadow = true;
    g.add(im);
  }
  shells.renderOrder = 3;
  g.add(cores, shells);
  // Learning pulses: short capsules riding the row (x) and column (z) lines.
  const pulseMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.45, 0.92, 0.52) });
  const rowGeo = new THREE.CapsuleGeometry(0.03, 0.16, 4, 10);
  rowGeo.rotateZ(Math.PI / 2);
  const colGeo = new THREE.CapsuleGeometry(0.03, 0.16, 4, 10);
  colGeo.rotateX(Math.PI / 2);
  const rowPulse = new THREE.InstancedMesh(rowGeo, pulseMat, 4);
  const colPulse = new THREE.InstancedMesh(colGeo, pulseMat, 4);
  for (const im of [rowPulse, colPulse]) {
    for (let k = 0; k < 4; k++) im.setMatrixAt(k, _m4.makeScale(0, 0, 0));
    im.frustumCulled = false;
    g.add(im);
  }
  g.userData = { N, at, cells, cores, rowPulse, colPulse, yRow, yCol, yPil, H, events: [], timer: 0, rand: mulberry32(77), mats: [pillarMat, alloy, coreMat, pulseMat] };
  return g;
}

/* ================================================================ step 2 */

const PS_WINDOW = 300; // oscilloscope time window (ps)
const spinPulse = (t) => Math.exp(-4 * Math.LN2 * ((t - 40) / 20) ** 2); // ~20 ps wide
const slowPulse = (t) => (t <= 30 ? 0 : ((t - 30) / 75) * Math.exp(1 - (t - 30) / 75)); // ~10x wider

function scopeTexture() {
  const tex = canvasTexture(1024, 640, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(14,16,20,0.66)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 28);
    ctx.fill();
    const x0 = 70, x1 = w - 40, y0 = 40, y1 = h - 70;
    ctx.strokeStyle = 'rgba(236,230,218,0.1)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const x = x0 + (i * (x1 - x0)) / 10;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
    for (let i = 0; i <= 8; i++) {
      const y = y0 + (i * (y1 - y0)) / 8;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(236,230,218,0.28)';
    for (let i = 0; i <= 50; i++) {
      const x = x0 + (i * (x1 - x0)) / 50;
      ctx.beginPath();
      ctx.moveTo(x, (y0 + y1) / 2 - 5);
      ctx.lineTo(x, (y0 + y1) / 2 + 5);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(236,230,218,0.45)';
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = 'rgba(236,230,218,0.7)';
    ctx.font = '500 28px "IBM Plex Mono", monospace';
    ctx.fillText('CH1', x0 + 14, y0 + 40);
    ctx.fillText('CH2', x0 + 14, (y0 + y1) / 2 + 44);
    ctx.textAlign = 'right';
    ctx.font = '500 26px "IBM Plex Sans JP", sans-serif';
    ctx.fillText('時間 →', x1, h - 26);
  }, { srgb: true });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Oscilloscope trace: revealed left to right by uReveal (panel-local x). */
function traceMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(...color) }, uReveal: { value: -10 }, uFade: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vX; varying float vF;
      void main() {
        vX = position.x;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vF = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uReveal, uFade;
      varying float vX; varying float vF;
      void main() {
        if (vX > uReveal) discard;
        float head = exp(-(uReveal - vX) * 10.0);
        gl_FragColor = vec4(uColor * (0.8 + 1.4 * head) * pow(vF, 0.7) * uFade, 1.0);
      }`,
  });
}

/** Fibre-coupled spin photodetector on a bench and a two-channel scope panel. */
function buildPhoto(M) {
  const g = new THREE.Group();
  const FY = 0.62;
  g.add(mesh(roundedBox(5.2, 0.16, 2.6, 0.05, 3), M.anodizedDark, 0, 0.08, 0));
  // Fibre patch cord rising from the floor; bare glass for the last stretch.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4.6, 0.04, -2.2),
    new THREE.Vector3(-3.5, 0.1, -1.5),
    new THREE.Vector3(-2.6, 0.48, -0.6),
    new THREE.Vector3(-1.9, FY, -0.08),
    new THREE.Vector3(-1.4, FY, 0),
    new THREE.Vector3(-0.32, FY, 0),
  ], false, 'centripetal');
  const JACKET = 0.36;
  const jPts = [];
  for (let i = 0; i <= 40; i++) jPts.push(curve.getPointAt((i / 40) * JACKET));
  const jacketMat = new THREE.MeshPhysicalMaterial({ color: 0xd9c9a3, roughness: 0.55, clearcoat: 0.3 });
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(jPts), 80, 0.065, 12, false), jacketMat));
  const boot = mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.22, 20), M.rubber);
  boot.position.copy(curve.getPointAt(JACKET));
  boot.quaternion.setFromUnitVectors(UP, curve.getTangentAt(JACKET));
  g.add(boot);
  const clad = new THREE.MeshPhysicalMaterial({ color: 0xe6edf3, roughness: 0.04, transparent: true, opacity: 0.22, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.8, depthWrite: false });
  const fPts = [];
  for (let i = 0; i <= 60; i++) fPts.push(curve.getPointAt(JACKET + (i / 60) * (1 - JACKET)));
  const bareCurve = new THREE.CatmullRomCurve3(fPts);
  const fiber = mesh(new THREE.TubeGeometry(bareCurve, 160, 0.045, 14, false), clad, 0, 0, 0, false);
  fiber.renderOrder = 3;
  g.add(fiber);
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.28, 0.24), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  g.add(mesh(new THREE.TubeGeometry(bareCurve, 160, 0.012, 6, false), coreMat, 0, 0, 0, false));
  // V-groove clamp holding the bare fibre.
  g.add(mesh(roundedBox(0.7, FY - 0.16 - 0.045, 0.5, 0.03, 2), M.steel, -1.15, 0.16 + (FY - 0.16 - 0.045) / 2, 0));
  g.add(mesh(roundedBox(0.7, 0.07, 0.5, 0.02, 2), M.steel, -1.15, FY + 0.08, 0));
  for (const z of [-0.17, 0.17]) {
    const scr = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 20), M.nickel, -1.15, FY + 0.135, z);
    g.add(scr);
  }
  // Detector: ceramic carrier, die facing the fibre, gold contacts and bond wires.
  const CX = 0.15;
  g.add(mesh(roundedBox(0.34, 1.0, 1.0, 0.03, 2), M.ceramicIvory, CX, 0.66, 0));
  g.add(mesh(roundedBox(0.05, 0.42, 0.42, 0.01, 1), M.silicon, CX - 0.195, FY, 0));
  const film = new THREE.MeshPhysicalMaterial({ color: 0x9aa2ae, metalness: 0.85, roughness: 0.16, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 560], emissive: new THREE.Color(1.0, 0.72, 0.45), emissiveIntensity: 0 });
  const active = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), film);
  active.rotation.y = -Math.PI / 2;
  active.position.set(CX - 0.222, FY, 0);
  g.add(active);
  const goldBar = (w, h, x, y, z) => g.add(mesh(new THREE.BoxGeometry(0.012, h, w), M.gold, x, y, z, false));
  goldBar(0.25, 0.03, CX - 0.224, FY + 0.11, 0);
  goldBar(0.25, 0.03, CX - 0.224, FY - 0.11, 0);
  goldBar(0.03, 0.25, CX - 0.224, FY, 0.11);
  goldBar(0.03, 0.25, CX - 0.224, FY, -0.11);
  for (const z of [-0.36, 0.36]) {
    g.add(mesh(new THREE.BoxGeometry(0.012, 0.16, 0.16), M.gold, CX - 0.174, FY + 0.28, z, false));
    const wire = new THREE.CatmullRomCurve3([
      new THREE.Vector3(CX - 0.226, FY + 0.12, z * 0.3),
      new THREE.Vector3(CX - 0.3, FY + 0.27, z * 0.62),
      new THREE.Vector3(CX - 0.18, FY + 0.3, z * 0.95),
    ]);
    g.add(mesh(new THREE.TubeGeometry(wire, 24, 0.006, 6, false), M.gold, 0, 0, 0, false));
  }
  // SMA connector and coax on the back of the carrier.
  const sma = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 6), M.nickel, CX + 0.23, FY, 0);
  sma.rotation.z = Math.PI / 2;
  g.add(sma);
  const coax = new THREE.CatmullRomCurve3([
    new THREE.Vector3(CX + 0.28, FY, 0),
    new THREE.Vector3(CX + 0.75, FY, -0.05),
    new THREE.Vector3(CX + 1.1, 0.32, -0.45),
    new THREE.Vector3(CX + 1.6, 0.21, -1.0),
    new THREE.Vector3(CX + 2.6, 0.18, -1.2),
  ]);
  g.add(mesh(new THREE.TubeGeometry(coax, 80, 0.045, 10, false), M.rubber));

  // Light packet travelling inside the fibre.
  const pktMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.55), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
  const pktGeo = new THREE.CapsuleGeometry(0.02, 0.26, 4, 8);
  const packet = new THREE.Mesh(pktGeo, pktMat);
  const halo = glowSprite([1.0, 0.86, 0.68], 0.5, 0.7);
  g.add(packet, halo);
  const hitGlow = glowSprite([1.0, 0.78, 0.52], 0.7, 0);
  hitGlow.position.set(CX - 0.26, FY, 0);
  g.add(hitGlow);

  // Two-channel scope panel.
  const W = 3.0, H = 1.875;
  const panel = new THREE.Group();
  panel.position.set(2.15, 2.05, -0.75);
  panel.rotation.y = -0.38;
  g.add(panel);
  const scopeMat = new THREE.MeshBasicMaterial({ map: scopeTexture(), transparent: true, depthWrite: false });
  panel.add(new THREE.Mesh(new THREE.PlaneGeometry(W, H), scopeMat));
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.08, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6, depthWrite: false });
  const pane = new THREE.Mesh(roundedBox(W + 0.06, H + 0.06, 0.03, 0.05, 2), glassMat);
  pane.position.z = -0.03;
  panel.add(pane);
  const xL = -W / 2 + (70 / 1024) * W, xR = W / 2 - (40 / 1024) * W;
  const plotT = H / 2 - (40 / 640) * H, plotB = -H / 2 + (70 / 640) * H;
  const mid = (plotT + plotB) / 2;
  const traces = [];
  const mkTrace = (fn, base, amp, color) => {
    const pts = [];
    for (let i = 0; i <= 300; i++) {
      const tps = (i / 300) * PS_WINDOW;
      pts.push(new THREE.Vector3(lerp(xL, xR, tps / PS_WINDOW), base + fn(tps) * amp, 0.012));
    }
    const mat = traceMaterial(color);
    panel.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 600, 0.012, 6, false), mat));
    const dot = glowSprite(color, 0.16, 0);
    panel.add(dot);
    traces.push({ fn, base, amp, mat, dot });
  };
  const base1 = mid + 0.12, base2 = plotB + 0.1;
  mkTrace(spinPulse, base1, 0.58, [1.0, 0.8, 0.56]);
  mkTrace(slowPulse, base2, 0.58, [0.62, 0.7, 0.82]);
  const psX = (tps) => lerp(xL, xR, tps / PS_WINDOW);
  g.userData = {
    curve, bareCurve, packet, halo, hitGlow, film, panel, traces, xL, xR, psX,
    peak1: new THREE.Vector3(psX(40), base1 + 0.58, 0),
    peak2: new THREE.Vector3(psX(105), base2 + 0.58 * 0.98, 0),
    die: new THREE.Vector3(CX - 0.24, FY + 0.12, 0),
    mats: [jacketMat, clad, coreMat, film, pktMat, scopeMat, glassMat, ...traces.map((t) => t.mat), halo.material, hitGlow.material, ...traces.map((t) => t.dot.material)],
  };
  return g;
}

/* ================================================================ step 3 */

function dieTexture() {
  const tex = canvasTexture(512, 512, (ctx, w, h) => {
    const rand = mulberry32(31);
    ctx.fillStyle = '#20252d';
    ctx.fillRect(0, 0, w, h);
    // analog blocks
    for (let i = 0; i < 46; i++) {
      const bw = 30 + rand() * 120, bh = 24 + rand() * 90;
      const x = 46 + rand() * (w - 92 - bw), y = 46 + rand() * (h - 92 - bh);
      const l = 34 + rand() * 26;
      ctx.fillStyle = `rgb(${l},${l + 6},${l + 16})`;
      ctx.fillRect(x, y, bw, bh);
      ctx.strokeStyle = 'rgba(190,200,215,0.18)';
      ctx.lineWidth = 1;
      for (let k = 2; k < bw; k += 4) {
        ctx.beginPath();
        ctx.moveTo(x + k, y);
        ctx.lineTo(x + k, y + bh);
        ctx.stroke();
      }
    }
    // routing
    ctx.strokeStyle = 'rgba(200,170,120,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 60; i++) {
      ctx.beginPath();
      const x = 46 + rand() * (w - 92), y = 46 + rand() * (h - 92);
      ctx.moveTo(x, y);
      ctx.lineTo(rand() < 0.5 ? x : 46 + rand() * (w - 92), rand() < 0.5 ? y : 46 + rand() * (h - 92));
      ctx.stroke();
    }
    // pad ring
    ctx.fillStyle = '#c9a15f';
    for (let i = 0; i < 14; i++) {
      const p = 40 + i * ((w - 80) / 13);
      ctx.fillRect(p - 7, 12, 14, 18);
      ctx.fillRect(p - 7, h - 30, 14, 18);
      ctx.fillRect(12, p - 7, 18, 14);
      ctx.fillRect(w - 30, p - 7, 18, 14);
    }
  }, { srgb: true });
  return tex;
}

function plateTextures(text) {
  const draw = (ink, bg) => (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 92px "Shippori Mincho B1", serif';
    ctx.fillText(text, w / 2, h / 2 + 4);
  };
  return {
    map: canvasTexture(256, 160, draw('#2b2620', '#efe9df'), { srgb: true }),
    glow: canvasTexture(256, 160, draw('#ffffff', '#000000'), { srgb: false }),
  };
}

/** Analog reservoir AI chip in an opened ceramic package, its reservoir drawn above it. */
function buildReservoir(M) {
  const g = new THREE.Group();
  const rand = mulberry32(1601);
  // Package: white alumina body, gold cavity and seal ring, gull-wing leads.
  g.add(mesh(roundedBox(2.5, 0.24, 2.5, 0.05, 3), M.ceramicIvory, 0, 0.18, 0));
  g.add(mesh(roundedBox(1.62, 0.02, 1.62, 0.01, 1), M.gold, 0, 0.3, 0));
  const ring = roundedRectShape(2.08, 2.08, 0.12);
  ring.holes.push(new THREE.Path(roundedRectShape(1.76, 1.76, 0.08).getPoints(24)));
  const sealGeo = extrude(ring, 0.03, 0.006, 1);
  sealGeo.rotateX(-Math.PI / 2);
  g.add(mesh(sealGeo, M.gold, 0, 0.315, 0));
  const dieMat = new THREE.MeshPhysicalMaterial({ map: dieTexture(), metalness: 0.5, roughness: 0.24, iridescence: 0.3, iridescenceIOR: 1.6, iridescenceThicknessRange: [220, 520], envMapIntensity: 1.1 });
  g.add(mesh(roundedBox(1.0, 0.05, 1.0, 0.01, 1), dieMat, 0, 0.335, 0));
  const fingers = new THREE.InstancedMesh(roundedBox(0.05, 0.012, 0.12, 0.004, 1), M.gold, 28);
  const wireGeo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.14, 0.16, 0), new THREE.Vector3(0.3, 0, 0)), 16, 0.006, 5, false);
  const wires = new THREE.InstancedMesh(wireGeo, M.gold, 28);
  const leads = new THREE.InstancedMesh(roundedBox(0.07, 0.03, 0.26, 0.01, 1), M.gold, 40);
  let k = 0, kl = 0;
  for (let side = 0; side < 4; side++) {
    const rot = (side * Math.PI) / 2;
    _q.setFromAxisAngle(UP, rot);
    for (let i = 0; i < 7; i++) {
      const u = -0.42 + i * 0.14;
      _p.set(u, 0.322, 0.74).applyQuaternion(_q);
      _m4.compose(_p, _q, _s.set(1, 1, 1));
      fingers.setMatrixAt(k, _m4);
      _p.set(u, 0.36, 0.47).applyQuaternion(_q);
      _q2.setFromAxisAngle(UP, rot - Math.PI / 2);
      _m4.compose(_p, _q2, _s.set(1, 1, 1));
      wires.setMatrixAt(k, _m4);
      k++;
    }
    for (let i = 0; i < 10; i++) {
      _p.set(-0.99 + i * 0.22, 0.05, 1.3).applyQuaternion(_q);
      _m4.compose(_p, _q, _s.set(1, 1, 1));
      leads.setMatrixAt(kl++, _m4);
    }
  }
  for (const im of [fingers, wires, leads]) {
    im.castShadow = true;
    g.add(im);
  }
  // Gold lid, lifted off and leaning back.
  const lid = mesh(roundedBox(2.0, 0.035, 2.0, 0.03, 2), M.gold);
  lid.position.set(-1.35, 0.95, -1.45);
  lid.rotation.set(-1.05, 0.5, 0.18);
  g.add(lid);

  // Reservoir: nodes in an ellipsoid with sparse random recurrent links.
  const C = new THREE.Vector3(0, 2.05, 0);
  const N = 46;
  const pos = [];
  for (let tries = 0; pos.length < N && tries < 5000; tries++) {
    const p = new THREE.Vector3((rand() * 2 - 1) * 1.3, (rand() * 2 - 1) * 0.72, (rand() * 2 - 1) * 0.9);
    if ((p.x / 1.3) ** 2 + (p.y / 0.72) ** 2 + (p.z / 0.9) ** 2 > 1) continue;
    if (pos.some((o) => o.distanceTo(p) < 0.3)) continue;
    pos.push(p);
  }
  pos.forEach((p) => p.add(C));
  const n = pos.length;
  const edges = [];
  const inputs = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const near = pos.map((p, j) => [j, p.distanceTo(pos[i])]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 7);
    const picks = new Set();
    while (picks.size < 3) picks.add(near[Math.floor(rand() * near.length)][0]);
    if (rand() < 0.3) picks.add(Math.floor(rand() * n));
    picks.delete(i);
    for (const j of picks) {
      const w = (rand() * 2 - 1) * 0.95;
      edges.push({ a: i, b: j, w });
      inputs[j].push([i, w]);
    }
  }
  const nodeMat = instanceGlow(new THREE.MeshStandardMaterial({ color: 0xa9a49c, metalness: 0.85, roughness: 0.26, emissive: 0xffa458, emissiveIntensity: 1.7 }), 'res');
  const nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 16, 12), nodeMat, n);
  pos.forEach((p, i) => {
    nodes.setMatrixAt(i, _m4.makeTranslation(p.x, p.y, p.z));
    nodes.setColorAt(i, _c.setRGB(0, 0, 0));
  });
  nodes.castShadow = true;
  g.add(nodes);
  const lp = new Float32Array(edges.length * 6);
  const lc = new Float32Array(edges.length * 6);
  edges.forEach((e, i) => {
    pos[e.a].toArray(lp, i * 6);
    pos[e.b].toArray(lp, i * 6 + 3);
  });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  const colAttr = new THREE.BufferAttribute(lc, 3);
  colAttr.setUsage(THREE.DynamicDrawUsage);
  lg.setAttribute('color', colAttr);
  const linkMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const links = new THREE.LineSegments(lg, linkMat);
  g.add(links);
  const beadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.95, 0.55) });
  const BEADS = 40;
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 8, 6), beadMat, BEADS);
  for (let i = 0; i < BEADS; i++) beads.setMatrixAt(i, _m4.makeScale(0, 0, 0));
  beads.frustumCulled = false;
  g.add(beads);
  // Input: the finger-motion signal entering from the left, wired to the left-most nodes.
  const order = pos.map((p, i) => [i, p.x]).sort((a, b) => a[1] - b[1]);
  const inputNodes = order.slice(0, 6).map(([i]) => i);
  const win = new Float32Array(n);
  inputNodes.forEach((i) => (win[i] = (rand() < 0.5 ? -1 : 1) * (0.9 + rand() * 0.5)));
  const HIST = 48;
  const ribbonMat = new THREE.ShaderMaterial({
    uniforms: { uHist: { value: new Float32Array(HIST) }, uLen: { value: 1.1 } },
    vertexShader: /* glsl */ `
      uniform float uHist[${HIST}]; uniform float uLen;
      varying float vX; varying vec3 vN;
      void main() {
        vec3 p = position;
        float f = clamp(p.x / uLen, 0.0, 1.0) * float(${HIST - 1});
        int i0 = int(floor(f));
        int i1 = min(i0 + 1, ${HIST - 1});
        float h = mix(uHist[i0], uHist[i1], fract(f));
        p.y += h * 0.2;
        vX = p.x / uLen;
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vX; varying vec3 vN;
      void main() {
        float lit = 0.6 + 0.4 * max(dot(vN, normalize(vec3(-0.3, 0.8, 0.5))), 0.0);
        vec3 c = mix(vec3(0.55, 0.5, 0.45), vec3(0.98, 0.72, 0.46), smoothstep(0.0, 1.0, vX)) * lit * 1.15;
        gl_FragColor = vec4(c * smoothstep(0.0, 0.12, vX), 1.0);
      }`,
  });
  const ribbon = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.1, 0, 0)), 160, 0.014, 6, false), ribbonMat);
  ribbon.position.set(-2.55, C.y, 0.25);
  ribbon.frustumCulled = false;
  g.add(ribbon);
  const feedPts = [];
  const feedFrom = new THREE.Vector3(-1.45, C.y, 0.25);
  inputNodes.forEach((i) => feedPts.push(feedFrom.x, feedFrom.y, feedFrom.z, pos[i].x, pos[i].y, pos[i].z));
  const feedGeo = new THREE.BufferGeometry();
  feedGeo.setAttribute('position', new THREE.Float32BufferAttribute(feedPts, 3));
  const feedMat = new THREE.LineBasicMaterial({ color: 0x8a7a66, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
  g.add(new THREE.LineSegments(feedGeo, feedMat));

  // Readout: three porcelain plates (rock / scissors / paper) with indicator lamps.
  const right = order.slice(-14).map(([i]) => i);
  const plates = [];
  const plateGeo = roundedBox(0.8, 0.5, 0.06, 0.03, 2);
  const faceGeo = new THREE.PlaneGeometry(0.74, 0.462);
  ['グー', 'チョキ', 'パー'].forEach((name, pi) => {
    const grp = new THREE.Group();
    grp.position.set(2.45, 2.62 - pi * 0.62, 0.15);
    grp.rotation.y = -0.42;
    g.add(grp);
    grp.add(mesh(plateGeo, M.porcelain));
    const tx = plateTextures(name);
    const faceMat = new THREE.MeshStandardMaterial({ map: tx.map, emissiveMap: tx.glow, emissive: new THREE.Color(1.0, 0.62, 0.3), emissiveIntensity: 0, roughness: 0.4 });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.z = 0.032;
    grp.add(face);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x8c8780, metalness: 0.6, roughness: 0.3, emissive: new THREE.Color(1.0, 0.66, 0.36), emissiveIntensity: 0 });
    const lamp = mesh(new THREE.SphereGeometry(0.04, 16, 12), lampMat, -0.5, 0, 0.0);
    grp.add(lamp);
    // readout links from right-hand reservoir nodes to this plate
    const pts = [];
    const anchor = grp.localToWorld(new THREE.Vector3(-0.42, 0, 0));
    grp.updateMatrixWorld(true);
    const a = new THREE.Vector3(-0.42, 0, 0).applyMatrix4(grp.matrix);
    for (let r = 0; r < 5; r++) {
      const ni = right[(pi * 4 + r * 3) % right.length];
      pts.push(pos[ni].x, pos[ni].y, pos[ni].z, a.x, a.y, a.z);
    }
    anchor.copy(a);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const rMat = new THREE.LineBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending });
    g.add(new THREE.LineSegments(rg, rMat));
    plates.push({ grp, faceMat, lampMat, rMat, glow: 0 });
  });

  g.userData = {
    pos, edges, inputs, nodes, links, colAttr, beads, BEADS, beadList: [], win, inputNodes, n,
    x: new Float32Array(n), act: new Float32Array(n), ribbonMat, HIST, plates, C,
    clock: 0, histClock: 0, rand: mulberry32(9),
    mats: [dieMat, nodeMat, linkMat, beadMat, ribbonMat, feedMat, ...plates.flatMap((p) => [p.faceMat, p.lampMat, p.rMat])],
  };
  return g;
}

/* ================================================================ step 4 */

const EYE = { R: 0.62, th0: 0.5, rRet: 0.585, rMid: 0.598, irisZ: 0.52, rPupil: 0.09, rIris: 0.29 };
const LENS_X = 1.12; // lens centre (glasses-local) of the lens in front of the eye
const sag = (x, y) => 0.085 * (x * x + y * y) / 0.9; // spherical lens bend (z offset, glasses-local)

function irisTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const rand = mulberry32(5);
    const cx = w / 2, cy = h / 2, R = w / 2;
    const g = ctx.createRadialGradient(cx, cy, R * 0.28, cx, cy, R);
    g.addColorStop(0, '#9a6630');
    g.addColorStop(0.42, '#6c4524');
    g.addColorStop(0.86, '#3e2816');
    g.addColorStop(1, '#140d08');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const a = rand() * Math.PI * 2;
      const r0 = R * (0.3 + rand() * 0.15), r1 = R * (0.6 + rand() * 0.38);
      ctx.strokeStyle = rand() < 0.5 ? `rgba(220,170,110,${0.08 + rand() * 0.14})` : `rgba(30,18,8,${0.1 + rand() * 0.2})`;
      ctx.lineWidth = 0.6 + rand() * 1.4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.quadraticCurveTo(cx + Math.cos(a + 0.08) * (r0 + r1) / 2, cy + Math.sin(a + 0.08) * (r0 + r1) / 2, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(40,24,12,0.6)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }, { srgb: true });
}

/** Fundus: orange-red retina, macula, optic disc and vessels (planar map around the back pole). */
function fundusTexture(disc) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const rand = mulberry32(11);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#c4552e');
    g.addColorStop(0.6, '#a63c22');
    g.addColorStop(1, '#5a1a10');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const mx = w / 2 + 0.04 * w / 2, my = h / 2;
    const mg = ctx.createRadialGradient(mx, my, 0, mx, my, w * 0.09);
    mg.addColorStop(0, 'rgba(70,20,8,0.75)');
    mg.addColorStop(1, 'rgba(70,20,8,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, w, h);
    const dx = (disc.x * 0.5 + 0.5) * w, dy = (1 - (disc.y * 0.5 + 0.5)) * h;
    const branch = (x, y, a, len, width, depth) => {
      ctx.lineCap = 'round';
      let px = x, py = y, ang = a;
      const steps = 12;
      for (let s = 0; s < steps; s++) {
        ang += (rand() - 0.5) * 0.25;
        const nx = px + Math.cos(ang) * (len / steps), ny = py + Math.sin(ang) * (len / steps);
        ctx.strokeStyle = depth % 2 ? 'rgba(120,22,14,0.85)' : 'rgba(95,14,10,0.9)';
        ctx.lineWidth = Math.max(0.6, width * (1 - s / steps * 0.5));
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        if (depth < 3 && rand() < 0.16) branch(nx, ny, ang + (rand() < 0.5 ? -1 : 1) * (0.4 + rand() * 0.5), len * 0.55, width * 0.6, depth + 1);
        px = nx;
        py = ny;
      }
    };
    // Arcades sweep around the macula; finer vessels fan out nasally.
    branch(dx, dy, -0.55, w * 0.62, 5, 0);
    branch(dx, dy, 0.55, w * 0.62, 5, 0);
    branch(dx, dy, -0.25, w * 0.5, 3.5, 1);
    branch(dx, dy, 0.25, w * 0.5, 3.5, 1);
    branch(dx, dy, Math.PI - 0.5, w * 0.35, 3, 1);
    branch(dx, dy, Math.PI + 0.5, w * 0.35, 3, 1);
    const og = ctx.createRadialGradient(dx, dy, 0, dx, dy, w * 0.05);
    og.addColorStop(0, '#fbe6c4');
    og.addColorStop(0.7, '#e9b98a');
    og.addColorStop(1, 'rgba(200,120,70,0)');
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(dx, dy, w * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }, { srgb: true });
}

/** The picture the laser draws: a small notification card (warm white on black). */
function retinaImage() {
  const tex = canvasTexture(256, 192, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.roundRect(14, 14, w - 28, h - 28, 26);
    ctx.stroke();
    // arrow icon
    ctx.beginPath();
    ctx.moveTo(52, 112);
    ctx.lineTo(98, 66);
    ctx.lineTo(144, 112);
    ctx.lineWidth = 16;
    ctx.stroke();
    ctx.fillRect(90, 74, 16, 74);
    // text lines
    ctx.fillRect(160, 64, 62, 16);
    ctx.fillRect(160, 98, 50, 14);
    ctx.fillRect(160, 128, 38, 14);
  }, { srgb: false });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Inner retina surface: fundus colours plus the raster image arriving through the pupil. */
function retinaMaterial(fundus, image, U) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: fundus, roughness: 0.6, metalness: 0, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U, { uImage: { value: image } });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEyeP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEyeP = position;');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vEyeP;
uniform sampler2D uImage;
uniform vec3 uP, uMc, uXm, uYm, uNm;
uniform float uWm, uHm, uScan, uLines, uOn, uFull;`
      )
      .replace(
        '#include <map_fragment>',
        `vec3 eyeDir = normalize(vEyeP);
  diffuseColor *= texture2D(map, eyeDir.xy * 0.5 + 0.5);
  diffuseColor.rgb *= mix(0.35, 1.0, smoothstep(0.55, 0.2, eyeDir.z));`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  {
    vec3 w = vEyeP - uP;
    float dn = dot(w, uNm);
    if (dn < -1e-4 && uOn > 0.001) {
      vec3 mp = uP - (dot(uP - uMc, uNm) / dn) * w - uMc;
      vec2 iuv = vec2(dot(mp, uXm) / uWm, dot(mp, uYm) / uHm) + 0.5;
      if (iuv.x >= 0.0 && iuv.x <= 1.0 && iuv.y >= 0.0 && iuv.y <= 1.0) {
        float ln = (1.0 - iuv.y) * uLines;
        float li = floor(ln);
        float cl = floor(uScan);
        float cf = fract(uScan);
        float rev = li < cl ? 1.0 : (li == cl && iuv.x <= cf ? 1.0 : 0.0);
        float age = (cl + cf) - (li + iuv.x);
        if (age < 0.0) age += uLines;
        rev = max(rev, uFull);
        float fresh = 0.6 + 0.9 * exp(-age * 0.7);
        float lf = fract(ln);
        float scan = 0.45 + 0.55 * smoothstep(0.0, 0.3, lf) * smoothstep(1.0, 0.7, lf);
        float img = texture2D(uImage, iuv).r;
        totalEmissiveRadiance += vec3(1.0, 0.84, 0.62) * (img * rev * fresh * scan * 1.25 + 0.035) * uOn;
      }
    }
  }`
      );
  };
  m.customProgramCacheKey = () => 'future-retina-v1';
  return m;
}

/** Anatomical eye model looking along +z, with its front-nasal quarter (x<0, z>0) cut away. */
function buildEye(M, retinaU) {
  const g = new THREE.Group();
  const { R, th0, rRet, rMid, irisZ, rPupil, rIris } = EYE;
  const sclera = new THREE.MeshPhysicalMaterial({ color: 0xf3ede6, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12, sheen: 0.3, sheenColor: new THREE.Color(0xffe0d4), envMapIntensity: 1.0 });
  const shell = (r, t0, mat, cast) => {
    const front = new THREE.SphereGeometry(r, 36, 12, Math.PI / 2, Math.PI, t0, Math.PI / 2 - t0);
    const back = new THREE.SphereGeometry(r, 72, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    front.rotateX(Math.PI / 2);
    back.rotateX(Math.PI / 2);
    g.add(mesh(front, mat, 0, 0, 0, cast), mesh(back, mat, 0, 0, 0, cast));
  };
  shell(R, th0, sclera, true);
  const disc = new THREE.Vector3(-0.29, 0.05, -0.955).normalize();
  const fundus = fundusTexture(disc);
  const retina = retinaMaterial(fundus, retinaImage(), retinaU);
  shell(rRet, 0.62, retina, false);
  // Cut faces: sclera (white) and choroid (deep red) bands in the two cutting planes.
  const choroid = new THREE.MeshStandardMaterial({ color: 0x5e1d14, roughness: 0.6, side: THREE.DoubleSide });
  const scleraCut = new THREE.MeshStandardMaterial({ color: 0xe9e1d6, roughness: 0.55, side: THREE.DoubleSide });
  const faceA = (r0, r1, mat) => g.add(mesh(new THREE.RingGeometry(r0, r1, 48, 1, Math.PI / 2, Math.PI), mat, 0, 0, 0, false));
  faceA(rRet, rMid, choroid);
  faceA(rMid, R, scleraCut);
  const faceB = (r0, r1, mat, start) => {
    const geo = new THREE.RingGeometry(r0, r1, 24, 1, start, Math.PI / 2 - th0);
    geo.rotateY(-Math.PI / 2);
    g.add(mesh(geo, mat, 0, 0, 0, false));
  };
  for (const start of [th0, -Math.PI / 2]) {
    faceB(rRet, rMid, choroid, start);
    faceB(rMid, R, scleraCut, start);
  }
  // Cornea, iris, crystalline lens, optic nerve.
  const corneaMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.12, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8, depthWrite: false, side: THREE.DoubleSide });
  const cornea = new THREE.SphereGeometry(0.403, 32, 10, Math.PI / 2, Math.PI, 0, 0.83);
  cornea.rotateX(Math.PI / 2);
  const corneaM = mesh(cornea, corneaMat, 0, 0, 0.272, false);
  corneaM.renderOrder = 5;
  g.add(corneaM);
  const irisMat = new THREE.MeshPhysicalMaterial({ map: irisTexture(), roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3, side: THREE.DoubleSide });
  g.add(mesh(new THREE.RingGeometry(rPupil, rIris, 64, 1, -Math.PI / 2, Math.PI), irisMat, 0, 0, irisZ, false));
  const lensPts = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * (Math.PI / 2);
    lensPts.push(new THREE.Vector2(Math.max(1e-4, Math.sin(a) * 0.23), -0.12 * Math.cos(a)));
  }
  for (let i = 1; i <= 14; i++) {
    const a = (i / 14) * (Math.PI / 2);
    lensPts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * 0.23), 0.07 * Math.sin(a)));
  }
  const lensGeo = new THREE.LatheGeometry(lensPts, 32, 0, Math.PI);
  lensGeo.rotateX(Math.PI / 2);
  const crystal = new THREE.MeshPhysicalMaterial({ color: 0xf2e3c2, roughness: 0.08, transparent: true, opacity: 0.32, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
  const lensM = mesh(lensGeo, crystal, 0, 0, irisZ - 0.075, false);
  lensM.renderOrder = 4;
  g.add(lensM);
  const nerveMat = new THREE.MeshPhysicalMaterial({ color: 0xe6d5b6, roughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color(0xfff0d8) });
  const nerve = mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.42, 24), nerveMat);
  nerve.quaternion.setFromUnitVectors(UP, disc);
  nerve.position.copy(disc).multiplyScalar(R + 0.16);
  g.add(nerve);
  g.userData = { mats: [sclera, retina, choroid, scleraCut, corneaMat, irisMat, crystal, nerveMat], textures: [fundus] };
  return g;
}

function lensOutline(seg = 72) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    let x = 0.95 * Math.sign(c) * Math.pow(Math.abs(c), 2 / 2.7);
    const y = 0.7 * Math.sign(s) * Math.pow(Math.abs(s), 2 / 2.7);
    if (s < 0) x *= 1 - 0.1 * -s; // narrower at the bottom (Wellington shape)
    pts.push(new THREE.Vector2(x, y));
  }
  return pts;
}

/** Thin titanium-look glasses facing +z, lenses centred at x = +-LENS_X. */
function buildGlasses(M) {
  const g = new THREE.Group();
  const frame = new THREE.MeshPhysicalMaterial({ color: 0x4a4d53, metalness: 1, roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.2, envMapIntensity: 1.2 });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f8fb, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8, depthWrite: false, side: THREE.DoubleSide });
  const outline = lensOutline();
  const lensShape = new THREE.Shape(outline);
  for (const sx of [-1, 1]) {
    const geo = extrude(lensShape, 0.05, 0.01, 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - sag(p.getX(i), p.getY(i)));
    geo.computeVertexNormals();
    const lens = mesh(geo, lensMat, sx * LENS_X, 0, 0, false);
    lens.renderOrder = 6;
    g.add(lens);
    const rimPts = outline.map((v) => new THREE.Vector3(v.x * 1.012, v.y * 1.012, -sag(v.x, v.y)));
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 180, 0.026, 8, true), frame, sx * LENS_X, 0, 0));
    // end piece and hinge
    const ex = sx * (LENS_X + 0.97);
    g.add(mesh(roundedBox(0.08, 0.13, 0.3, 0.03, 2), frame, ex, 0.3, -0.24));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 12), M.nickel, ex, 0.3, -0.38));
    // temple
    const tPts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.03, -0.01, -1.0),
      new THREE.Vector3(0.07, -0.04, -2.2),
      new THREE.Vector3(0.08, -0.12, -2.9),
      new THREE.Vector3(0.06, -0.36, -3.35),
      new THREE.Vector3(0.03, -0.55, -3.55),
    ].map((v) => new THREE.Vector3(v.x * sx, v.y, v.z));
    const tCurve = new THREE.CatmullRomCurve3(tPts);
    const tGeo = new THREE.TubeGeometry(tCurve, 140, 0.034, 8, false);
    tGeo.scale(0.6, 1, 1);
    g.add(mesh(tGeo, frame, ex, 0.3, -0.42));
    const tipPts = [];
    for (let i = 0; i <= 20; i++) tipPts.push(tCurve.getPointAt(0.66 + (i / 20) * 0.34));
    const tipGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tipPts), 40, 0.046, 10, false);
    tipGeo.scale(0.7, 1, 1);
    g.add(mesh(tipGeo, M.epoxyGloss, ex, 0.3, -0.42));
    // nose pad on a short arm
    const padArm = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * (LENS_X - 0.8), -0.22, -sag(0.8, 0.22)),
      new THREE.Vector3(sx * (LENS_X - 0.86), -0.26, -0.16),
      new THREE.Vector3(sx * (LENS_X - 0.84), -0.3, -0.22),
    ]);
    g.add(mesh(new THREE.TubeGeometry(padArm, 12, 0.012, 6, false), M.nickel));
    const pad = mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0xf4f1ea, roughness: 0.25, transparent: true, opacity: 0.55, clearcoat: 1, depthWrite: false }), sx * (LENS_X - 0.86), -0.33, -0.23, false);
    pad.scale.set(0.045, 0.1, 0.02);
    pad.rotation.y = sx * 0.55;
    g.add(pad);
  }
  // Bridge between the rims.
  const bridge = new THREE.CatmullRomCurve3([
    new THREE.Vector3(LENS_X - 0.82, 0.36, -sag(0.82, 0.36)),
    new THREE.Vector3(0.16, 0.44, -0.02),
    new THREE.Vector3(0, 0.46, 0.0),
    new THREE.Vector3(-0.16, 0.44, -0.02),
    new THREE.Vector3(-(LENS_X - 0.82), 0.36, -sag(0.82, 0.36)),
  ]);
  g.add(mesh(new THREE.TubeGeometry(bridge, 40, 0.022, 8, false), frame));
  g.userData = { mats: [frame, lensMat] };
  return g;
}

/** Hero station: glasses, laser module, meta-optics mirror film, eye and the scanning beam. */
function buildRetina(M) {
  const g = new THREE.Group();
  const glasses = buildGlasses(M);
  g.add(glasses);
  const E = new THREE.Vector3(LENS_X, 0, -1.38);
  const P = new THREE.Vector3(LENS_X, 0, -1.38 + EYE.irisZ);
  const Mc = new THREE.Vector3(LENS_X + 0.03, 0.03, 0);
  Mc.z = -0.028 - sag(Mc.x - LENS_X, Mc.y);
  const Xm = new THREE.Vector3(-1, 0, 0), Ym = new THREE.Vector3(0, 1, 0), Nm = new THREE.Vector3(0, 0, 1);
  const Wm = 0.4, Hm = 0.3, LINES = 18;
  const U = {
    uP: { value: P.clone().sub(E) },
    uMc: { value: Mc.clone().sub(E) },
    uXm: { value: Xm },
    uYm: { value: Ym },
    uNm: { value: Nm },
    uWm: { value: Wm },
    uHm: { value: Hm },
    uScan: { value: 0 },
    uLines: { value: LINES },
    uOn: { value: 0 },
    uFull: { value: 0 },
  };
  const eye = buildEye(M, U);
  eye.position.copy(E);
  g.add(eye);
  // Meta-optics mirror film on the inner face of the lens.
  const filmTex = canvasTexture(256, 192, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    for (let x = -h; x < w; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + h, 0);
      ctx.stroke();
    }
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);
  }, { srgb: true });
  const filmGeo = new THREE.PlaneGeometry(0.56, 0.42, 14, 10);
  const fp = filmGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setZ(i, -0.028 - sag(fp.getX(i) + (Mc.x - LENS_X), fp.getY(i) + Mc.y) + 0.0);
  filmGeo.computeVertexNormals();
  const filmMat = new THREE.MeshPhysicalMaterial({ color: 0xd6dce6, map: filmTex, metalness: 0.15, roughness: 0.12, transparent: true, opacity: 0.42, iridescence: 1, iridescenceIOR: 1.9, iridescenceThicknessRange: [160, 640], envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide });
  const film = new THREE.Mesh(filmGeo, filmMat);
  film.position.set(Mc.x, Mc.y, 0);
  film.renderOrder = 7;
  g.add(film);
  // Laser module on the inner face of the temple, near the hinge.
  const ex = LENS_X + 0.97;
  g.add(mesh(roundedBox(0.1, 0.14, 0.6, 0.035, 3), M.anodizedDark, ex - 0.075, 0.27, -0.8));
  const L = new THREE.Vector3(ex - 0.13, 0.25, -0.56);
  const ap = mesh(new THREE.TorusGeometry(0.024, 0.007, 8, 20), M.chrome, L.x, L.y, L.z, false);
  ap.lookAt(_v.copy(Mc).sub(L).add(L));
  g.add(ap);
  const apGlow = glowSprite([1.0, 0.8, 0.55], 0.12, 0);
  apGlow.position.copy(L);
  g.add(apGlow);
  // Beam: laser -> mirror -> pupil -> retina (three soft additive segments).
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  beamGeo.translate(0, 0.5, 0);
  const beamMat = beamMaterial([1.0, 0.8, 0.56], 1);
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, 3);
  beams.frustumCulled = false;
  for (let i = 0; i < 3; i++) beams.setMatrixAt(i, _m4.makeScale(0, 0, 0));
  g.add(beams);
  const mGlow = glowSprite([1.0, 0.82, 0.6], 0.1, 0);
  const rGlow = glowSprite([1.0, 0.8, 0.55], 0.12, 0);
  g.add(mGlow, rGlow);
  // Retina point reached by a ray from the mirror point through the pupil.
  const rRet = EYE.rRet;
  const retinaHit = (M0, out) => {
    const d = _w.copy(P).sub(M0).normalize();
    const oc = _s.copy(P).sub(E);
    const b = oc.dot(d), c = oc.lengthSq() - rRet * rRet;
    const t = -b + Math.sqrt(Math.max(0, b * b - c));
    return out.copy(P).addScaledVector(d, t);
  };
  const R0 = retinaHit(Mc, new THREE.Vector3());
  g.userData = {
    glasses, eye, U, E, P, Mc, Xm, Ym, Wm, Hm, LINES, L, beams, beamMat, apGlow, mGlow, rGlow, retinaHit, R0,
    Mp: new THREE.Vector3(), Rp: new THREE.Vector3(), scanT: 0, film,
    mats: [filmMat, beamMat, apGlow.material, mGlow.material, rGlow.material, ...glasses.userData.mats, ...eye.userData.mats],
    textures: [filmTex, ...eye.userData.textures],
  };
  return g;
}

/* ================================================================ chapter */

export class Future extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.env = 'studio';
    this.exposure = 1.0;
    this.shift = 0.2;
    this.look = { bloom: 0.14, threshold: 1.0, vignette: 0.4, saturation: 1.02 };
  }

  build() {
    const M = materials();
    const q = this.app.quality.tier;
    this.addBackdrop({ top: '#111316', bottom: '#050506', glow: '#1e232a', glowPos: [0.68, 0.55], glowSize: 0.6, glowStrength: 0.8 });
    this.addDust({ count: 320, radius: 40, height: 6, size: 0.05, opacity: 0.28, seed: 131, center: [28, 2, 0] });
    const floorMat = new THREE.MeshPhysicalMaterial({ color: 0x111215, roughness: 0.4, clearcoat: 0.45, clearcoatRoughness: 0.3 });
    this.tracker.track(floorMat);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 80), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.add(floor);
    this.key = spot(this.scene, { intensity: 130, pos: [-2, 10, 7], target: [0, 0, 0], angle: 0.55, penumbra: 0.8, shadow: q.shadows, shadowSize: q.shadowSize, far: 40 });
    const rim = new THREE.DirectionalLight(0xd2dcff, 1.8);
    rim.position.set(6, 5, -8);
    this.scene.add(rim, new THREE.HemisphereLight(0xfff0e4, 0x0b0b0c, 0.16));
    this.focus = new THREE.Vector3();

    const track = (g) => {
      for (const m of g.userData.mats || []) this.tracker.track(m);
      for (const t of g.userData.textures || []) this.tracker.track(t);
      g.traverse((o) => {
        if (o.material?.map && !o.material.map.userData?.shared) this.tracker.track(o.material.map);
      });
    };

    /* --- step 0: spin ------------------------------------------------------------------ */
    this.spin = buildSpin(M);
    this.spin.position.copy(SPIN);
    this.add(this.spin);
    track(this.spin);
    const sp = this.spin.userData;
    this.label({ text: '電子のスピン（小さな磁石）', sub: '向きはばらばら', anchor: (o) => this.spin.localToWorld(o.set(-1.35, 1.0, 0.2)), offset: [-24, -54], when: () => this.step === 0 && this.stepTime > 1.6 });
    this.label({ text: '磁性層でそろう', sub: 'スピンの向きが一方向に', anchor: (o) => this.spin.localToWorld(o.set(sp.XS, 1.78, 0.5)), offset: [36, -40], when: () => this.step === 0 && this.stepTime > 2.2 });
    this.label({ text: '磁気トンネル接合（MTJ）', sub: 'HDDヘッドで数十億個の実績', anchor: (o) => this.spin.localToWorld(o.set(2.0, 0.18 + sp.mtjTop, -0.92)), offset: [30, -46], when: () => this.step === 0 && this.stepTime > 2.8 });

    /* --- step 1: crossbar --------------------------------------------------------------- */
    this.cross = buildCrossbar(M);
    this.cross.position.copy(CROSS);
    this.add(this.cross);
    track(this.cross);
    const cx = this.cross.userData;
    this.label({ text: 'スピンメモリスタ', sub: '脳の“シナプス”の役目をする素子', anchor: (o) => this.cross.localToWorld(o.set(cx.at(4), cx.yCol + 0.05, cx.at(4))), offset: [44, -46], when: () => this.step === 1 && this.stepTime > 1.6 });
    this.label({ text: 'つながりの強さを連続的に記憶', sub: '0と1の間の値も覚えられる', anchor: (o) => this.cross.localToWorld(o.set(cx.at(1), cx.yPil + 0.15, cx.at(5))), offset: [40, 46], when: () => this.step === 1 && this.stepTime > 2.2 });

    /* --- step 2: spin photodetector ----------------------------------------------------- */
    this.photo = buildPhoto(M);
    this.photo.position.copy(PHOTO);
    this.add(this.photo);
    track(this.photo);
    const ph = this.photo.userData;
    this.label({ text: 'スピンフォトディテクタ', sub: '光を電気信号に変える', anchor: (o) => this.photo.localToWorld(o.copy(ph.die)), offset: [-30, -60], when: () => this.step === 2 && this.stepTime > 1.6 });
    this.label({ text: '応答 20ピコ秒', sub: '従来の約10倍速い', cls: 'big', anchor: (o) => ph.panel.localToWorld(o.copy(ph.peak1)), offset: [40, -30], when: () => this.step === 2 && this.stepTime > 2.4 });
    this.label({ text: '従来の受光素子', sub: '半導体フォトダイオード', anchor: (o) => ph.panel.localToWorld(o.copy(ph.peak2)), offset: [44, -24], when: () => this.step === 2 && this.stepTime > 3.0 });

    /* --- step 3: reservoir chip --------------------------------------------------------- */
    this.res = buildReservoir(M);
    this.res.position.copy(RES);
    this.add(this.res);
    track(this.res);
    const rs = this.res.userData;
    this.label({ text: 'リザバー（時間の変化を覚える回路）', sub: '信号が響き合い、余韻が残る', anchor: (o) => this.res.localToWorld(o.set(0.2, rs.C.y + 0.78, 0)), offset: [30, -40], when: () => this.step === 3 && this.stepTime > 1.6 });
    this.label({ text: 'じゃんけんの手を先読み', sub: '手の動きから、出す手を予測', anchor: (o) => rs.plates[2].grp.localToWorld(o.set(0.4, -0.25, 0)), offset: [20, 44], when: () => this.step === 3 && this.stepTime > 2.2 });
    this.label({ text: 'アナログリザバーAIチップ', sub: '北海道大学と共同開発', anchor: (o) => this.res.localToWorld(o.set(0.7, 0.36, 0.9)), offset: [-40, 40], when: () => this.step === 3 && this.stepTime > 2.8 });

    /* --- step 4: retinal projection glasses -------------------------------------------- */
    this.retina = buildRetina(M);
    this.retina.position.set(GLASS.x, 1.6, GLASS.z);
    this.add(this.retina);
    track(this.retina);
    const rt = this.retina.userData;
    this.label({ text: 'メタオプティクスミラー', sub: '厚さ 約150nm／透過率 約80%', anchor: (o) => this.retina.localToWorld(o.set(rt.Mc.x - 0.2, rt.Mc.y + 0.2, rt.Mc.z)), offset: [-40, -56], when: () => this.step === 4 && this.stepTime > 1.8 });
    this.label({ text: '網膜に直接描く', sub: 'ミラーで反射し、瞳を通って網膜へ', cls: 'big', anchor: (o) => this.retina.localToWorld(o.copy(rt.R0)), offset: [40, 50], when: () => this.step === 4 && this.stepTime > 2.6 });
    this.label({ text: 'レーザー光源', sub: '光を走査して映像をつくる', anchor: (o) => this.retina.localToWorld(o.copy(rt.L)), offset: [40, -40], when: () => this.step === 4 && this.stepTime > 2.2 });

    // Initial poses for all instanced content.
    this.updateSpin(0, 0);
    this.updateCross(0, 0);
    this.updatePhoto(0, 0);
    this.updateReservoir(0, 0);
    this.updateRetina(0, 0);
  }

  poses() {
    return [
      { pos: [SPIN.x + 2.4, 3.6, 7.4], target: [SPIN.x + 0.5, 0.8, 0], fov: 32, dur: 2.2 },
      { pos: [CROSS.x + 2.8, 5.2, 5.6], target: [CROSS.x + 0.1, 0.35, 0.1], fov: 32, dur: 3.0 },
      { pos: [PHOTO.x + 1.8, 2.8, 7.2], target: [PHOTO.x + 0.7, 1.05, -0.2], fov: 32, dur: 3.0 },
      { pos: [RES.x + 2.0, 3.2, 7.8], target: [RES.x + 0.4, 1.45, 0], fov: 32, dur: 3.0 },
      { pos: [GLASS.x - 0.6, 3.4, 2.9], target: [GLASS.x + 1.0, 1.45, -0.9], fov: 32, dur: 3.2 },
    ];
  }

  onStep(step, instant) {
    const f = [SPIN.x, CROSS.x, PHOTO.x, RES.x, GLASS.x][step];
    this.focusGoal = f;
    if (instant) this.focus.x = f;
    if (step === 4) this.retina.userData.scanT = 0;
  }

  tick(dt, t) {
    this.focus.x = damp(this.focus.x, this.focusGoal ?? 0, 1.5, dt);
    this.key.position.set(this.focus.x - 2, 10, 7);
    this.key.target.position.set(this.focus.x, 0.8, 0);
    const near = (x) => Math.abs(this.focus.x - x) < 11;
    if (near(SPIN.x)) this.updateSpin(dt, t);
    if (near(CROSS.x)) this.updateCross(dt, t);
    if (near(PHOTO.x)) this.updatePhoto(dt, t);
    if (near(RES.x)) this.updateReservoir(dt, t);
    if (near(GLASS.x)) this.updateRetina(dt, t);
  }

  /* --- step 0: electrons tumble, then line up after the ferromagnetic layer ------------- */
  updateSpin(dt, t) {
    const d = this.spin.userData;
    for (let i = 0; i < d.N; i++) {
      const e = d.items[i];
      const u = (e.u0 + t * d.speed) % 1;
      const x = lerp(-2.62, 2.62, u);
      _p.set(x, d.CY + e.y0 + Math.sin(t * 1.4 + e.ph) * 0.025, e.z0 + Math.cos(t * 1.1 + e.ph) * 0.025);
      _q.setFromAxisAngle(e.axis, t * e.w).multiply(e.q0);
      const k = smoothstep(d.XS - 0.1, d.XS + 0.7, x);
      if (k > 0) {
        const a = t * 2.4 + e.ph;
        _v.set(Math.sin(0.16) * Math.cos(a), Math.cos(0.16), Math.sin(0.16) * Math.sin(a));
        _q2.setFromUnitVectors(UP, _v);
        _q.slerp(_q2, k);
      }
      _s.setScalar(smoothstep(0, 0.04, u) * (1 - smoothstep(0.96, 1, u)) + 1e-4);
      _m4.compose(_p, _q, _s);
      d.electrons.setMatrixAt(i, _m4);
      d.shafts.setMatrixAt(i, _m4);
      d.heads.setMatrixAt(i, _m4);
      _c.setRGB(lerp(0.74, 1.0, k), lerp(0.77, 0.64, k), lerp(0.82, 0.38, k));
      d.shafts.setColorAt(i, _c);
      d.heads.setColorAt(i, _c);
    }
    d.electrons.instanceMatrix.needsUpdate = true;
    d.shafts.instanceMatrix.needsUpdate = true;
    d.heads.instanceMatrix.needsUpdate = true;
    d.shafts.instanceColor.needsUpdate = true;
    d.heads.instanceColor.needsUpdate = true;
  }

  /* --- step 1: coincident row/column pulses nudge one device's conductance -------------- */
  updateCross(dt, t) {
    const c = this.cross.userData;
    const N = c.N;
    if (this.step === 1 && this.stepTime > 0.9) {
      c.timer -= dt;
      if (c.timer <= 0 && c.events.length < 4) {
        c.timer = 1.1;
        const i = Math.floor(c.rand() * N), j = Math.floor(c.rand() * N);
        const cell = c.cells[i * N + j];
        const delta = cell.target > 0.72 ? -0.22 : c.rand() < 0.28 ? -0.16 : 0.2;
        c.events.push({ i, j, t: 0, dur: 0.95, delta, done: false });
      }
    }
    for (const e of c.events) {
      e.t += dt;
      if (!e.done && e.t >= e.dur) {
        e.done = true;
        const cell = c.cells[e.i * N + e.j];
        cell.target = Math.min(1, Math.max(0.06, cell.target + e.delta));
        cell.flash = 1;
      }
    }
    c.events = c.events.filter((e) => e.t < e.dur + 0.4);
    for (let k = 0; k < 4; k++) {
      const e = c.events[k];
      if (!e) {
        _m4.makeScale(0, 0, 0);
        c.rowPulse.setMatrixAt(k, _m4);
        c.colPulse.setMatrixAt(k, _m4);
        continue;
      }
      const p = Math.min(1, e.t / e.dur);
      const s = (e.done ? 1 - (e.t - e.dur) / 0.4 : smoothstep(0, 0.12, p)) + 1e-4;
      _s.setScalar(s);
      _m4.compose(_p.set(lerp(-2.2, c.at(e.j), p), c.yRow + 0.045, c.at(e.i)), ID_Q, _s);
      c.rowPulse.setMatrixAt(k, _m4);
      _m4.compose(_p.set(c.at(e.j), c.yCol + 0.045, lerp(-2.2, c.at(e.i), p)), ID_Q, _s);
      c.colPulse.setMatrixAt(k, _m4);
    }
    c.rowPulse.instanceMatrix.needsUpdate = true;
    c.colPulse.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < c.cells.length; k++) {
      const cell = c.cells[k];
      cell.level = damp(cell.level, cell.target, 2.2, dt);
      cell.flash = Math.max(0, cell.flash - dt * 1.4);
      _m4.compose(_p.set(cell.x, c.yPil + 0.05, cell.z), ID_Q, _s.set(1, 0.015 + cell.level * 0.185, 1));
      c.cores.setMatrixAt(k, _m4);
      const gl = 0.22 + cell.level * 0.85 + cell.flash * 0.7;
      c.cores.setColorAt(k, _c.setRGB(1.0 * gl, 0.6 * gl, 0.3 * gl));
    }
    c.cores.instanceMatrix.needsUpdate = true;
    c.cores.instanceColor.needsUpdate = true;
  }

  /* --- step 2: a light packet hits the detector; the scope draws both responses ---------- */
  updatePhoto(dt, t) {
    const d = this.photo.userData;
    const PERIOD = 4.2;
    const on = this.step === 2;
    const tc = on ? (this.stepTime - 0.6) % PERIOD : -1;
    const travel = 1.0;
    if (tc >= 0 && tc < travel) {
      const u = tc / travel;
      d.bareCurve.getPointAt(u, d.packet.position);
      d.packet.quaternion.setFromUnitVectors(UP, d.bareCurve.getTangentAt(u, _v));
      d.packet.visible = true;
      d.halo.position.copy(d.packet.position);
      d.halo.material.opacity = 0.7 * smoothstep(0, 0.1, u);
    } else {
      d.packet.visible = false;
      d.halo.material.opacity = 0;
    }
    const since = tc - travel;
    const flash = tc >= travel ? Math.exp(-since * 7) : 0;
    d.film.emissiveIntensity = flash * 2.2;
    d.hitGlow.material.opacity = flash * 0.9;
    const sweep = clamp01(since / 1.25);
    const fade = tc < 0 ? 0 : tc < travel ? 1 - smoothstep(0, 0.3, tc) : 1;
    const rx = lerp(d.xL, d.xR, sweep);
    for (const tr of d.traces) {
      tr.mat.uniforms.uReveal.value = tc >= travel ? rx : 10;
      tr.mat.uniforms.uFade.value = fade * (this.param('photoOn') > 0.01 ? 1 : 0);
      const tps = sweep * PS_WINDOW;
      tr.dot.position.set(rx, tr.base + tr.fn(tps) * tr.amp, 0.02);
      tr.dot.material.opacity = tc >= travel && sweep < 1 ? 0.9 : 0;
    }
    this.to('photoOn', on ? 1 : 0);
  }

  /* --- step 3: echo-state reservoir driven by a hand-motion signal ----------------------- */
  updateReservoir(dt, t) {
    const d = this.res.userData;
    const hand = Math.floor(t / 2.6) % 3;
    const ph = (t / 2.6) % 1;
    const u = hand === 0 ? 0.9 * Math.sin(t * 4.4) : hand === 1 ? 0.55 * Math.sin(t * 8.2) + 0.35 * Math.sin(t * 16.4) : 0.8 * Math.sin(t * 6.0) * Math.sin(t * 1.3);
    // Fixed-rate state update (10 Hz) with leaky tanh units.
    d.clock += dt;
    while (d.clock >= 0.1) {
      d.clock -= 0.1;
      const nx = new Float32Array(d.n);
      for (let j = 0; j < d.n; j++) {
        let s = d.win[j] * u;
        for (const [i, w] of d.inputs[j]) s += w * d.x[i];
        nx[j] = 0.62 * d.x[j] + 0.38 * Math.tanh(s * 1.15);
      }
      d.x.set(nx);
      // Signals hop along links from active nodes.
      for (const e of d.edges) {
        const a = Math.abs(d.x[e.a]);
        if (a > 0.35 && d.rand() < a * 0.16 && d.beadList.length < d.BEADS) d.beadList.push({ e, t: 0 });
      }
    }
    // input ribbon history
    d.histClock += dt;
    const hist = d.ribbonMat.uniforms.uHist.value;
    while (d.histClock >= 1 / 20) {
      d.histClock -= 1 / 20;
      hist.copyWithin(0, 1);
      hist[d.HIST - 1] = u;
    }
    const pos = d.pos;
    for (let i = 0; i < d.n; i++) {
      d.act[i] = damp(d.act[i], Math.abs(d.x[i]), 8, dt);
      const gl = Math.pow(d.act[i], 1.6) * 1.2;
      d.nodes.setColorAt(i, _c.setRGB(gl, gl, gl));
    }
    d.nodes.instanceColor.needsUpdate = true;
    const col = d.colAttr.array;
    d.edges.forEach((e, i) => {
      const a = 0.09 + d.act[e.a] * 0.32, b = 0.09 + d.act[e.b] * 0.32;
      col[i * 6] = a;
      col[i * 6 + 1] = a * 0.82;
      col[i * 6 + 2] = a * 0.66;
      col[i * 6 + 3] = b;
      col[i * 6 + 4] = b * 0.82;
      col[i * 6 + 5] = b * 0.66;
    });
    d.colAttr.needsUpdate = true;
    d.beadList = d.beadList.filter((b) => (b.t += dt / 0.45) < 1);
    for (let k = 0; k < d.BEADS; k++) {
      const b = d.beadList[k];
      if (!b) {
        d.beads.setMatrixAt(k, _m4.makeScale(0, 0, 0));
        continue;
      }
      _p.lerpVectors(pos[b.e.a], pos[b.e.b], b.t);
      _m4.compose(_p, ID_Q, _s.setScalar(Math.sin(b.t * Math.PI) + 1e-4));
      d.beads.setMatrixAt(k, _m4);
    }
    d.beads.instanceMatrix.needsUpdate = true;
    // Prediction: the plate for the coming hand lights up part-way through the motion.
    d.plates.forEach((p, i) => {
      const target = i === hand ? smoothstep(0.35, 0.55, ph) * (1 - smoothstep(0.92, 1.0, ph)) : 0;
      p.glow = damp(p.glow, target, 6, dt);
      p.faceMat.emissiveIntensity = p.glow * 1.1;
      p.lampMat.emissiveIntensity = p.glow * 2.4;
      p.rMat.opacity = 0.06 + p.glow * 0.3;
      p.grp.position.z = 0.15 + p.glow * 0.08;
    });
  }

  /* --- step 4: raster scan through the meta-optics mirror onto the retina --------------- */
  updateRetina(dt, t) {
    const d = this.retina.userData;
    this.retina.rotation.y = Math.sin(t * 0.17) * 0.025;
    const on = this.step === 4 ? smoothstep(1.0, 1.6, this.stepTime) : 0;
    this.to('beam', on);
    const b = this.param('beam');
    d.U.uOn.value = b;
    if (b > 0.01 && this.step === 4) d.scanT += dt;
    const LINE = 0.1;
    let cur = d.scanT / LINE;
    const full = cur >= d.LINES ? 1 : 0;
    cur %= d.LINES;
    d.U.uScan.value = cur;
    d.U.uFull.value = full;
    const iu = cur % 1, iv = 1 - (Math.floor(cur) + 0.5) / d.LINES;
    const Mp = d.Mp.copy(d.Mc).addScaledVector(d.Xm, (iu - 0.5) * d.Wm).addScaledVector(d.Ym, (iv - 0.5) * d.Hm);
    Mp.z = -0.028 - sag(Mp.x - LENS_X, Mp.y);
    const Rp = d.retinaHit(Mp, d.Rp);
    const seg = (k, A, B, r) => {
      _v.subVectors(B, A);
      const len = _v.length();
      _q.setFromUnitVectors(UP, _v.divideScalar(len || 1));
      _m4.compose(A, _q, _s.set(r * b, len * (b > 0.01 ? 1 : 0), r * b));
      d.beams.setMatrixAt(k, _m4);
    };
    seg(0, d.L, Mp, 0.0075);
    seg(1, Mp, d.P, 0.0075);
    seg(2, d.P, Rp, 0.006);
    d.beams.instanceMatrix.needsUpdate = true;
    d.beamMat.uniforms.uOpacity.value = 0.9 * b;
    d.apGlow.material.opacity = 0.8 * b;
    d.mGlow.position.copy(Mp);
    d.mGlow.material.opacity = 0.7 * b;
    d.rGlow.position.copy(Rp);
    d.rGlow.material.opacity = 0.9 * b;
  }
}
