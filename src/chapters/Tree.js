// CH.03 The Ferrite Tree — a bonsai sculpted from twisted copper wire that grows
// out of a ferrite trunk; its leaves are chip components and its newest buds
// are tiny warm bulbs standing for future technologies.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials, roundedBox } from '../core/kit.js';
import { normalFromHeight } from '../core/textures.js';
import { clamp01, easeOutBack, easeOutCubic, smoothstep, mulberry32, damp } from '../core/math.js';
import { spot } from './common.js';

/** Diagonal grooves of twisted strands, as a tangent-space normal map. */
function strandNormal() {
  const size = 128;
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const s = Math.sin((u * 1 + v * 4) * Math.PI * 2);
      h[y * size + x] = Math.pow(Math.abs(s), 0.6);
    }
  const data = normalFromHeight(h, size, 2.5);
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Merge many tapered tubes into one geometry with per-vertex growth timing.
 * Each branch: { curve, r0, r1, t0, t1 }. Attributes: aT (time this ring appears),
 * aC (ring centre) so the vertex shader can shrink the growing tip.
 */
function branchGeometry(branches, radial = 8, perUnit = 14) {
  const pos = [], nor = [], uv = [], aT = [], aC = [], idx = [];
  let base = 0;
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  for (const b of branches) {
    const len = b.curve.getLength();
    const segs = Math.max(4, Math.ceil(len * perUnit));
    const frames = b.curve.computeFrenetFrames(segs, false);
    for (let i = 0; i <= segs; i++) {
      const s = i / segs;
      b.curve.getPointAt(s, P);
      N.copy(frames.normals[i]);
      B.copy(frames.binormals[i]);
      const r = b.r0 + (b.r1 - b.r0) * s;
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const cx = Math.cos(a), sy = Math.sin(a);
        const nx = cx * N.x + sy * B.x, ny = cx * N.y + sy * B.y, nz = cx * N.z + sy * B.z;
        pos.push(P.x + nx * r, P.y + ny * r, P.z + nz * r);
        nor.push(nx, ny, nz);
        uv.push((s * len) / 0.09, j / radial);
        aT.push(b.t0 + (b.t1 - b.t0) * s);
        aC.push(P.x, P.y, P.z);
      }
    }
    for (let i = 0; i < segs; i++)
      for (let j = 0; j < radial; j++) {
        const a = base + i * (radial + 1) + j;
        const c = a + radial + 1;
        idx.push(a, a + 1, c, c, a + 1, c + 1);
      }
    base += (segs + 1) * (radial + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
  g.setAttribute('aC', new THREE.Float32BufferAttribute(aC, 3));
  g.setIndex(idx);
  return g;
}

/** Patch a lit material so vertices appear progressively as uGrow passes aT. */
function growable(material) {
  const u = { uGrow: { value: 0 } };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrow = u.uGrow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aT;\nattribute vec3 aC;\nuniform float uGrow;\nvarying float vGrowCut;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float gk = clamp((uGrow - aT) * 6.0, 0.0, 1.0);
        transformed = aC + (transformed - aC) * gk;
        vGrowCut = uGrow - aT;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGrowCut;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (vGrowCut < 0.0) discard;');
  };
  material.customProgramCacheKey = () => 'growable-v1';
  material.grow = u;
  return material;
}

function buildTree(seed = 7) {
  const rand = mulberry32(seed);
  const branches = [];
  const tips = [];
  const main = [];
  const up = new THREE.Vector3(0, 1, 0);
  const grow = (start, dir, length, r0, depth, t0, mainIdx) => {
    const pts = [start.clone()];
    const p = start.clone();
    const d = dir.clone();
    const n = 5;
    for (let i = 1; i <= n; i++) {
      d.x += (rand() - 0.5) * 0.35;
      d.z += (rand() - 0.5) * 0.35;
      d.y += (rand() - 0.5) * 0.2 + 0.035;
      d.normalize();
      p.addScaledVector(d, length / n);
      pts.push(p.clone());
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const r1 = depth >= 5 ? 0.004 : r0 * 0.64;
    const dur = 0.5 + length * 0.55;
    const b = { curve, r0, r1, t0, t1: t0 + dur, depth, main: mainIdx };
    branches.push(b);
    if (depth === 1) main.push(b);
    if (depth >= 5) {
      tips.push({ p: p.clone(), d: d.clone(), t: b.t1, main: mainIdx });
      return;
    }
    const kids = depth === 0 ? 4 : rand() < (depth < 3 ? 0.55 : 0.3) ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const s = depth === 0 ? 1 : 0.55 + rand() * 0.45;
      const sp = curve.getPointAt(s);
      const tan = curve.getTangentAt(s);
      const axis = new THREE.Vector3().crossVectors(tan, up);
      if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0);
      axis.normalize();
      const around = depth === 0 ? (k / kids) * Math.PI * 2 + 0.4 : rand() * Math.PI * 2;
      const tilt = depth === 0 ? 0.95 + rand() * 0.15 : 0.32 + rand() * 0.4;
      const nd = tan.clone().applyAxisAngle(axis, tilt).applyAxisAngle(tan, around).normalize();
      if (depth === 0) nd.set(Math.cos(around) * Math.sin(tilt), Math.cos(tilt), Math.sin(around) * Math.sin(tilt)).normalize();
      const nl = depth === 0 ? 1.0 : length * (0.7 + rand() * 0.1);
      const nr = (depth === 0 ? b.r1 * 0.78 : b.r1 * 0.85) * (0.9 + rand() * 0.15);
      grow(sp, nd, nl, nr, depth + 1, t0 + dur * s, depth === 0 ? k : mainIdx);
    }
  };
  // Trunk (depth 0) is a separate ferrite piece; branches start at its top.
  grow(new THREE.Vector3(0, 1.25, 0), new THREE.Vector3(0.05, 1, 0.02).normalize(), 0.55, 0.15, 0, 0.6, -1);
  return { branches, tips, main };
}

export class Tree extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.env = 'studio';
    this.exposure = 1.02;
    this.shift = 0.2;
    this.look = { bloom: 0.16, threshold: 0.95, vignette: 0.42, saturation: 1.04 };
    this.growT = 0;
    this.futureT = 0;
  }

  build() {
    const M = materials();
    const q = this.app.quality.tier;
    this.addBackdrop({ top: '#121110', bottom: '#050505', glow: '#2e2216', glowPos: [0.7, 0.62], glowSize: 0.55, glowStrength: 0.85 });
    this.addDust({ count: 360, radius: 4, height: 5, size: 0.03, opacity: 0.4, seed: 21, center: [0, 2, 0] });

    this.key = spot(this.scene, { intensity: 55, pos: [-3.5, 7.5, 4.5], target: [0, 2, 0], angle: 0.5, penumbra: 0.8, shadow: q.shadows, shadowSize: q.shadowSize });
    const rim = new THREE.DirectionalLight(0xcfdcff, 2.0);
    rim.position.set(4, 5, -5);
    this.scene.add(rim, new THREE.HemisphereLight(0xfff2e4, 0x0d0c0b, 0.16));

    // Stone plinth.
    const stone = new THREE.MeshPhysicalMaterial({ color: 0x1d1e20, roughness: 0.55, normalMap: M.graphite.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 0.25, clearcoatRoughness: 0.5 });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.0, 0.42, 96), stone);
    plinth.position.y = -0.21;
    plinth.receiveShadow = plinth.castShadow = true;
    this.add(plinth);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.42;
    floor.receiveShadow = true;
    this.add(floor);

    this.spin = new THREE.Group();
    this.scene.add(this.spin);
    const add = (o) => {
      this.spin.add(o);
      this.tracker.track(o);
      return o;
    };

    // Ferrite trunk (tapered, slightly twisted lathe).
    const trunkPts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const r = 0.34 - t * 0.19 + Math.pow(1 - t, 6) * 0.22;
      trunkPts.push(new THREE.Vector2(r, t * 1.32 - 0.02));
    }
    const trunkGeo = new THREE.LatheGeometry(trunkPts, 48);
    const tp = trunkGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i), x = tp.getX(i), z = tp.getZ(i);
      const a = y * 0.6;
      tp.setXYZ(i, x * Math.cos(a) - z * Math.sin(a) + Math.sin(y * 2.2) * 0.04, y, x * Math.sin(a) + z * Math.cos(a));
    }
    trunkGeo.computeVertexNormals();
    this.trunk = new THREE.Mesh(trunkGeo, M.ferrite);
    this.trunk.castShadow = this.trunk.receiveShadow = true;
    add(this.trunk);

    // Copper branches, roots and future shoots share one growable material.
    const copper = M.copperWire.clone();
    copper.normalMap = strandNormal();
    copper.normalScale = new THREE.Vector2(0.35, 0.35);
    copper.roughness = 0.26;
    copper.envMapIntensity = 1.6;
    copper.color = new THREE.Color(0xc8805a);
    growable(copper);
    this.copper = copper;
    this.tracker.track(copper);

    const tree = buildTree(11);
    this.treeData = tree;
    const radial = q.particles < 0.6 ? 6 : 8;
    const geo = branchGeometry(tree.branches, radial);
    const mesh = new THREE.Mesh(geo, copper);
    this.branchMesh = mesh;
    mesh.frustumCulled = false;
    add(mesh);
    this.growEnd = Math.max(...tree.branches.map((b) => b.t1));

    // Roots spreading over the plinth.
    const rand = mulberry32(5);
    const roots = [];
    this.rootTips = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rand() * 0.3;
      const pts = [];
      const len = 1.05 + rand() * 0.6;
      for (let i = 0; i <= 6; i++) {
        const s = i / 6;
        const r = 0.24 + s * len;
        const wob = Math.sin(s * 5 + k) * 0.12 * s;
        pts.push(new THREE.Vector3(Math.cos(a + wob) * r, 0.25 * Math.pow(1 - s, 2.2) + 0.012, Math.sin(a + wob) * r));
      }
      roots.push({ curve: new THREE.CatmullRomCurve3(pts), r0: 0.07, r1: 0.008, t0: 0.0 + rand() * 0.3, t1: 1.4 + rand() * 0.4 });
      this.rootTips.push(pts[4]);
    }
    const rootMesh = new THREE.Mesh(branchGeometry(roots, radial, 18), copper);
    this.rootMesh = rootMesh;
    rootMesh.frustumCulled = false;
    add(rootMesh);

    // Leaves: chip components at twig tips.
    const leafBody = new THREE.BoxGeometry(0.06, 0.03, 0.032);
    const leafTerm = new THREE.BoxGeometry(0.013, 0.033, 0.036);
    this.tracker.track(leafBody);
    this.tracker.track(leafTerm);
    const leafMats = [M.ceramicTan, M.ferrite, M.porcelain];
    const perTip = q.particles < 0.6 ? 5 : 9;
    const leaves = [];
    tree.tips.forEach((tip) => {
      for (let i = 0; i < perTip; i++) {
        const p = tip.p.clone().add(new THREE.Vector3((rand() - 0.5) * 0.26, (rand() - 0.3) * 0.18, (rand() - 0.5) * 0.26));
        leaves.push({ p, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6.28, rand() * 6.28, rand() * 6.28)), t: tip.t + 0.1 + rand() * 0.5, kind: Math.floor(rand() * 3), s: 0.75 + rand() * 0.6 });
      }
    });
    this.leafSets = leafMats.map((mat, kind) => {
      const list = leaves.filter((l) => l.kind === kind);
      const body = new THREE.InstancedMesh(leafBody, mat, list.length);
      const term = new THREE.InstancedMesh(leafTerm, M.tin, list.length * 2);
      body.castShadow = term.castShadow = true;
      add(body);
      add(term);
      return { list, body, term };
    });

    // Future buds: small glass bulbs with a warm filament, on new thin shoots.
    const future = [];
    const budPos = [];
    const sorted = [...tree.tips].sort((a, b) => b.p.y - a.p.y);
    for (let i = 0; i < 8; i++) {
      const tip = sorted[i * 2];
      const d = tip.d.clone().add(new THREE.Vector3((rand() - 0.5) * 0.6, 0.6, (rand() - 0.5) * 0.6)).normalize();
      const end = tip.p.clone().addScaledVector(d, 0.45 + rand() * 0.25);
      const mid = tip.p.clone().lerp(end, 0.5).add(new THREE.Vector3((rand() - 0.5) * 0.12, 0.05, (rand() - 0.5) * 0.12));
      future.push({ curve: new THREE.CatmullRomCurve3([tip.p.clone(), mid, end]), r0: 0.012, r1: 0.006, t0: 0.1 + i * 0.22, t1: 0.9 + i * 0.22 });
      budPos.push({ p: end, t: 0.9 + i * 0.22 });
    }
    const futureMat = copper.clone();
    growable(futureMat);
    futureMat.color = new THREE.Color(0xd9a066);
    this.futureMat = futureMat;
    this.tracker.track(futureMat);
    const futureMesh = new THREE.Mesh(branchGeometry(future, 6, 24), futureMat);
    futureMesh.frustumCulled = false;
    add(futureMesh);
    const bulbGeo = new THREE.SphereGeometry(0.06, 24, 16);
    const capGeo = new THREE.CylinderGeometry(0.026, 0.03, 0.035, 16);
    const filGeo = new THREE.SphereGeometry(0.018, 12, 8);
    this.tracker.track(bulbGeo);
    this.buds = budPos.map((b) => {
      const g = new THREE.Group();
      const glass = new THREE.Mesh(bulbGeo, M.glass);
      const cap = new THREE.Mesh(capGeo, M.brass);
      cap.position.y = -0.065;
      const fil = new THREE.Mesh(filGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) }));
      g.add(fil, cap, glass);
      g.position.copy(b.p).add(new THREE.Vector3(0, 0.07, 0));
      g.scale.setScalar(0.0001);
      add(g);
      return { g, fil, t: b.t };
    });
    this.budLight = new THREE.PointLight(0xffb070, 0, 4, 1.6);
    this.budLight.position.set(0, 3.6, 0.4);
    this.spin.add(this.budLight);

    /* labels */
    this.label({ text: '根', sub: '企業文化・材料とプロセスの技術・人・顧客', anchor: this.local(this.rootTips[1].clone()), offset: [50, 34], when: () => this.step === 0 && this.growT > 1.6, cls: 'big' });
    this.label({ text: '幹＝フェライト', sub: '1930年の発明から', anchor: this.local(new THREE.Vector3(0.15, 0.85, 0.25)), offset: [60, -40], when: () => this.step === 0 && this.growT > 1.2, cls: 'big' });
    const mainNames = [['フェライトコア', '1937〜'], ['磁気テープ', '1966〜 塗布技術'], ['積層技術', '1980〜'], ['薄膜技術', '1987〜']];
    tree.main.forEach((b, i) => {
      const p = b.curve.getPointAt(0.92);
      const side = new THREE.Vector3(p.x, 0, p.z).normalize();
      const offs = [[-70, -36], [70, -36], [-70, 40], [70, 40]];
      const o = offs[(side.x >= 0 ? 1 : 0) + (side.z >= 0 ? 2 : 0)];
      this.label({ text: mainNames[i][0], sub: mainNames[i][1], anchor: this.local(p), offset: o, when: () => this.step === 1 && this.growT > b.t1 });
    });
    const futureNames = ['スピンフォトディテクタ', '脳を模した素子', 'フルカラーレーザー', 'エッジAI', '量子コンピュータ用部品', '生体磁気センサ'];
    // Label the buds furthest apart on screen-left/right to avoid overlaps.
    const order = this.buds.map((b, i) => i).sort((a, b) => this.buds[a].g.position.x - this.buds[b].g.position.x);
    [order[0], order[order.length - 1], order[2], order[order.length - 3]].forEach((bi, k) => {
      const b = this.buds[bi];
      this.label({ text: futureNames[k], anchor: (out) => b.g.getWorldPosition(out), offset: [k % 2 ? 50 : -50, k < 2 ? -40 : 34], when: () => this.step === 2 && this.futureT > b.t + 0.4 });
    });
  }

  /** Anchor helper: a point in the spinning group's local space. */
  local(p) {
    return (out) => out.copy(p).applyMatrix4(this.spin.matrixWorld);
  }

  poses() {
    return [
      { pos: [2.1, 1.25, 4.6], target: [0.15, 0.8, 0], fov: 30, dur: 2.2 },
      { pos: [3.1, 2.9, 7.4], target: [0.0, 2.3, 0], fov: 31, dur: 2.6 },
      { pos: [-2.8, 4.5, 7.2], target: [0.1, 3.05, 0], fov: 31, dur: 2.6 },
    ];
  }

  tick(dt, t) {
    // Growth runs once and then holds; going back keeps it grown.
    this.growT += dt * (this.growT < this.growEnd + 1 ? 1.0 : 0);
    this.copper.grow.uGrow.value = this.growT;
    // Depth materials don't know about growth, so only cast shadows once grown.
    const grown = this.growT > this.growEnd;
    this.branchMesh.castShadow = grown;
    this.rootMesh.castShadow = grown;
    if (this.step === 2) this.futureT += dt;
    this.futureMat.grow.uGrow.value = this.futureT;

    // Leaves pop in after their twig.
    if (!this._leavesDone) {
      const m4 = new THREE.Matrix4(), s3 = new THREE.Vector3(), off = new THREE.Vector3();
      let all = true;
      for (const set of this.leafSets) {
        set.list.forEach((l, i) => {
          const k = easeOutBack(clamp01((this.growT - l.t) / 0.4));
          if (k < 1) all = false;
          s3.setScalar(Math.max(0.0001, k * l.s));
          m4.compose(l.p, l.q, s3);
          set.body.setMatrixAt(i, m4);
          for (const sgn of [-1, 1]) {
            off.set(sgn * 0.03 * k * l.s, 0, 0).applyQuaternion(l.q);
            m4.compose(off.add(l.p), l.q, s3);
            set.term.setMatrixAt(i * 2 + (sgn > 0 ? 1 : 0), m4);
          }
        });
        set.body.instanceMatrix.needsUpdate = true;
        set.term.instanceMatrix.needsUpdate = true;
      }
      this._leavesDone = all;
    }

    // Buds light up on the future step.
    let glowSum = 0;
    this.buds.forEach((b, i) => {
      const k = easeOutBack(clamp01((this.futureT - b.t) / 0.5));
      b.g.scale.setScalar(Math.max(0.0001, k));
      const on = this.step === 2 ? k : damp(b.fil.material.color.r / 3, 0, 3, dt);
      const fl = on * (0.9 + Math.sin(t * 3 + i) * 0.06);
      b.fil.material.color.setRGB(3.0 * fl, 1.45 * fl, 0.55 * fl);
      glowSum += fl;
    });
    this.budLight.intensity = glowSum * 0.9;
    this.key.intensity = 55 - glowSum * 2;
    this.scene.rotation.y = 0;
    this.spin.rotation.y = Math.sin(t * 0.12) * 0.35 + t * 0.02;
  }
}
