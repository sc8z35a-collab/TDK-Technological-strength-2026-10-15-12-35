// A stylised AI accelerator board: GPU package with HBM stacks, power stages,
// thin-film inductors, MLCC clouds, µPOL modules and an edge connector.
import * as THREE from 'three';
import { materials, roundedBox } from '../core/kit.js';
import { pcbTexture, scatterChips } from '../core/parts.js';
import { mulberry32 } from '../core/math.js';

export function buildAIBoard({ w = 7.2, d = 4.6, quality = 1 } = {}) {
  const M = materials();
  const g = new THREE.Group();
  const rand = mulberry32(3);
  const pcbMat = new THREE.MeshPhysicalMaterial({
    map: pcbTexture({ size: 2048, seed: 5, mask: '#0f1d18', key: 'aiBoardPcb', traces: 260 }),
    roughness: 0.42,
    clearcoat: 0.7,
    clearcoatRoughness: 0.22,
  });
  const pcb = new THREE.Mesh(roundedBox(w, 0.08, d, 0.02, 2), pcbMat);
  pcb.position.y = 0.04;
  pcb.receiveShadow = true;
  g.add(pcb);
  const top = 0.08;

  // GPU package: substrate, stiffener, die, HBM stacks.
  const gpu = new THREE.Group();
  gpu.position.set(0.3, top, 0);
  g.add(gpu);
  const substrate = new THREE.Mesh(roundedBox(2.1, 0.07, 2.1, 0.02, 2), new THREE.MeshPhysicalMaterial({ color: 0x2c3a2a, roughness: 0.5, clearcoat: 0.5 }));
  substrate.position.y = 0.035;
  substrate.castShadow = substrate.receiveShadow = true;
  gpu.add(substrate);
  const ring = new THREE.Shape();
  ring.moveTo(-0.98, -0.98);
  ring.lineTo(0.98, -0.98);
  ring.lineTo(0.98, 0.98);
  ring.lineTo(-0.98, 0.98);
  ring.lineTo(-0.98, -0.98);
  const hole = new THREE.Path();
  hole.moveTo(-0.84, -0.84);
  hole.lineTo(-0.84, 0.84);
  hole.lineTo(0.84, 0.84);
  hole.lineTo(0.84, -0.84);
  hole.lineTo(-0.84, -0.84);
  ring.holes.push(hole);
  const stiff = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.06, bevelEnabled: false }), M.nickel);
  stiff.rotation.x = -Math.PI / 2;
  stiff.position.y = 0.07;
  stiff.castShadow = true;
  gpu.add(stiff);
  const die = new THREE.Mesh(roundedBox(0.95, 0.05, 0.8, 0.01, 2), M.silicon);
  die.position.y = 0.095;
  die.castShadow = true;
  gpu.add(die);
  const hbmMat = new THREE.MeshPhysicalMaterial({ color: 0x2a2c31, metalness: 0.5, roughness: 0.3, clearcoat: 0.6 });
  for (const sx of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const h = new THREE.Mesh(roundedBox(0.24, 0.06, 0.24, 0.01, 1), hbmMat);
      h.position.set(sx * 0.63, 0.1, -0.3 + i * 0.3);
      h.castShadow = true;
      gpu.add(h);
    }
  g.userData.gpu = gpu;
  g.userData.die = die;

  // Power stages + thin-film inductors in rows on both sides (the VRM).
  const indGeo = roundedBox(0.2, 0.09, 0.15, 0.015, 2);
  const stageGeo = roundedBox(0.15, 0.04, 0.15, 0.008, 1);
  const indMat = new THREE.MeshPhysicalMaterial({ color: 0x3a3c40, metalness: 0.35, roughness: 0.4, clearcoat: 0.4 });
  const termMat = M.tin;
  const nRow = 10;
  const inds = new THREE.InstancedMesh(indGeo, indMat, nRow * 4);
  const stages = new THREE.InstancedMesh(stageGeo, M.epoxy, nRow * 4);
  const caps = new THREE.InstancedMesh(roundedBox(0.035, 0.09, 0.15, 0.01, 1), termMat, nRow * 8);
  const m4 = new THREE.Matrix4();
  let k = 0, c = 0;
  const indPos = [];
  for (const side of [-1, 1])
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < nRow; i++) {
        const z = -1.6 + i * 0.355;
        const x = 0.3 + side * (1.55 + row * 0.42);
        m4.makeTranslation(x, top + 0.045, z);
        inds.setMatrixAt(k, m4);
        indPos.push(new THREE.Vector3(x, top + 0.09, z));
        for (const e of [-1, 1]) {
          m4.makeTranslation(x + e * 0.1, top + 0.045, z);
          caps.setMatrixAt(c++, m4);
        }
        m4.makeTranslation(x + side * 0.0, top + 0.02, z + 0.17);
        stages.setMatrixAt(k, m4);
        k++;
      }
  [inds, stages, caps].forEach((im) => {
    im.castShadow = true;
    im.receiveShadow = true;
    g.add(im);
  });
  g.userData.inductors = indPos;
  g.userData.indMesh = inds;

  // µPOL modules near the package corners.
  const upol = [];
  for (const [x, z] of [[-1.2, 1.55], [-0.75, 1.55], [1.35, 1.55], [1.8, 1.55], [-1.2, -1.75], [1.8, -1.75]]) {
    const mod = new THREE.Group();
    const base = new THREE.Mesh(roundedBox(0.3, 0.05, 0.3, 0.01, 1), M.epoxy);
    base.position.y = 0.025;
    const ind = new THREE.Mesh(roundedBox(0.28, 0.12, 0.28, 0.02, 2), new THREE.MeshPhysicalMaterial({ color: 0x8e9196, metalness: 0.6, roughness: 0.35 }));
    ind.position.y = 0.11;
    mod.add(base, ind);
    mod.position.set(x + 0.3, top, z);
    mod.traverse((o) => (o.castShadow = true));
    g.add(mod);
    upol.push(mod);
  }
  g.userData.upol = upol;

  // MLCC clouds (decoupling) around the package and everywhere else.
  const chips = scatterChips(Math.round(900 * quality), {
    area: [w - 0.4, d - 0.4],
    y: top,
    seed: 9,
    sizes: [[0.1, 0.05, 0.05], [0.16, 0.08, 0.08], [0.2, 0.125, 0.1]],
    avoid: [[0.3, 0, 2.3, 2.3], [0.3 - 1.76, 0, 1.2, 3.8], [0.3 + 1.76, 0, 1.2, 3.8], [-3.2, 0, 0.8, 3.6]],
  });
  g.add(chips);
  // Ring of decoupling caps right around the die.
  const ringCaps = new THREE.InstancedMesh(roundedBox(0.09, 0.045, 0.045, 0.01, 1), M.ceramicTan, 64);
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const rr = 1.12 + (i % 2) * 0.06;
    m4.makeRotationY(-a + Math.PI / 2);
    m4.setPosition(0.3 + Math.cos(a) * rr, top + 0.03, Math.sin(a) * rr);
    ringCaps.setMatrixAt(i, m4);
  }
  ringCaps.castShadow = true;
  g.add(ringCaps);

  // Edge connector (gold fingers) and a high-current power connector.
  const fingers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.012, 0.32), M.gold, 60);
  for (let i = 0; i < 60; i++) {
    m4.makeTranslation(-w / 2 + 0.6 + i * 0.075, top + 0.004, d / 2 - 0.2);
    fingers.setMatrixAt(i, m4);
  }
  g.add(fingers);
  const pwr = new THREE.Mesh(roundedBox(0.9, 0.42, 0.5, 0.04, 2), M.epoxy);
  pwr.position.set(-w / 2 + 0.75, top + 0.21, -1.4);
  pwr.castShadow = true;
  g.add(pwr);
  for (let i = 0; i < 6; i++) {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12), M.gold);
    pin.position.set(-w / 2 + 0.47 + (i % 3) * 0.28, top + 0.44, -1.52 + Math.floor(i / 3) * 0.24);
    g.add(pin);
  }
  // Bulk electrolytic caps near the power connector.
  for (let i = 0; i < 4; i++) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 32), new THREE.MeshPhysicalMaterial({ color: 0x2b3a4e, roughness: 0.3, clearcoat: 0.8 }));
    cap.position.set(-w / 2 + 0.45 + i * 0.4, top + 0.25, -0.5);
    cap.castShadow = true;
    g.add(cap);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.01, 32), M.aluminum);
    lid.position.set(cap.position.x, top + 0.505, -0.5);
    g.add(lid);
  }
  void rand;
  return g;
}
