// CH.17 Epilogue — the ferrite ring from the prologue returns at dawn, and the
// components met along the way orbit it like an orrery; then they settle into
// a single ring as the camera pulls back.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials, toroidCore, toroidWinding } from '../core/kit.js';
import { mlcc, commonModeFilter, powerInductor, ntcBead, pouchCell, lgaPackage, filmCapacitor, electrolytic, arcMagnet, discComponent } from '../core/parts.js';
import { buildSlider } from './History.js';
import { CORE } from './Prologue.js';
import { clamp01, easeInOutCubic, easeOutCubic, smoothstep, mulberry32, damp, lerp } from '../core/math.js';

export class Finale extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.env = 'dawn';
    this.exposure = 1.05;
    this.shift = 0.22;
    this.look = { bloom: 0.18, threshold: 0.9, vignette: 0.36, saturation: 1.05, lift: new THREE.Vector3(0.01, 0.006, 0.0) };
  }

  build() {
    const M = materials();
    this.addBackdrop({ top: '#121722', bottom: '#2a1d16', glow: '#6b4630', glowPos: [0.7, 0.42], glowSize: 0.55, glowStrength: 0.9 });
    this.addDust({ count: 420, radius: 8, height: 6, size: 0.04, opacity: 0.45, seed: 99, center: [0, 1.5, 0] });
    const key = new THREE.DirectionalLight(0xffe0c0, 2.6);
    key.position.set(-4, 5, 3);
    const rim = new THREE.DirectionalLight(0xbfd0ff, 2.2);
    rim.position.set(4, 2, -5);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xffe8d0, 0x101418, 0.25));
    this.glow = new THREE.PointLight(0xffa860, 0, 6, 1.6);
    this.glow.position.set(0, 1.6, 0.4);
    this.scene.add(this.glow);

    // The ferrite ring and its winding.
    const hub = new THREE.Group();
    hub.position.set(0, 1.6, 0);
    hub.rotation.set(1.05, 0, -0.32);
    this.add(hub);
    this.hub = hub;
    const coreMat = M.ferriteGlow.clone();
    this.coreMat = coreMat;
    this.tracker.track(coreMat);
    hub.add(new THREE.Mesh(toroidCore({ ...CORE, bevel: 0.07 }), coreMat));
    hub.add(new THREE.Mesh(toroidWinding({ ...CORE, turns: 26, wire: 0.028, clearance: 0.012, samplesPerTurn: 48 }), M.copperWire));

    // Components met on the journey.
    const makers = [
      () => mlcc({ l: 0.5, w: 0.3, h: 0.3 }),
      () => { const g = commonModeFilter(); g.scale.setScalar(0.22); return g; },
      () => { const g = powerInductor({ size: 0.42 }); return g; },
      () => { const g = ntcBead(); g.scale.setScalar(0.7); return g; },
      () => { const g = pouchCell({ w: 0.42, l: 0.6, t: 0.04, label: true, labelColor: 0x9a5f38 }); return g; },
      () => { const g = buildSlider(M); g.scale.setScalar(0.55); return g; },
      () => lgaPackage({ w: 0.36, d: 0.36, h: 0.1 }),
      () => { const g = filmCapacitor({ w: 0.5, h: 0.36, d: 0.24, text: null }); return g; },
      () => { const g = electrolytic({ r: 0.14, h: 0.42 }); return g; },
      () => { const g = new THREE.Group(); g.add(arcMagnet({ inner: 0.2, outer: 0.28, angle: 1.4, length: 0.36 })); return g; },
      () => { const g = discComponent({ color: 0x2c5b8a }); g.scale.setScalar(0.42); return g; },
      () => mlcc({ l: 0.32, w: 0.16, h: 0.16, body: 'ferrite' }),
    ];
    const rand = mulberry32(17);
    const rings = [
      { r: 2.3, tilt: new THREE.Euler(0.35, 0, 0.12), speed: 0.22 },
      { r: 3.1, tilt: new THREE.Euler(-0.25, 0, -0.18), speed: -0.16 },
      { r: 3.9, tilt: new THREE.Euler(0.12, 0, 0.3), speed: 0.11 },
    ];
    this.rings = rings.map((ring, ri) => {
      const g = new THREE.Group();
      g.position.copy(hub.position);
      g.rotation.copy(ring.tilt);
      this.add(g);
      const line = new THREE.Mesh(new THREE.TorusGeometry(ring.r, 0.004, 6, 220), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.72, 0.55), transparent: true, opacity: 0.22, depthWrite: false }));
      line.rotation.x = Math.PI / 2;
      g.add(line);
      this.tracker.track(line.material);
      return { ...ring, g, line, items: [] };
    });
    this.items = makers.map((make, i) => {
      const obj = make();
      obj.traverse((o) => (o.castShadow = false));
      const ring = this.rings[i % 3];
      const holder = new THREE.Group();
      holder.add(obj);
      ring.g.add(holder);
      const a0 = (i / makers.length) * Math.PI * 2 + rand() * 0.4;
      const spin = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      const it = { holder, obj, ring, a0, spin, rate: 0.3 + rand() * 0.5, idx: i };
      ring.items.push(it);
      return it;
    });
    this.label({ text: 'フェライト', sub: '1930年、ここから始まった', anchor: () => this.hub.localToWorld(new THREE.Vector3(-0.85, 0.2, 0)), offset: [-60, -46], when: () => this.step === 0 && this.stepTime > 2.4 });
  }

  poses() {
    return [
      { pos: [0.6, 2.6, 9.2], target: [0, 1.5, 0], fov: 32, dur: 2.6 },
      { pos: [0.4, 3.6, 13.5], target: [0, 1.7, 0], fov: 30, dur: 3.6 },
    ];
  }

  tick(dt, t) {
    const st = this.stepTime;
    // Ring breathes with a warm glow.
    const g = 0.5 + 0.5 * Math.sin(t * 0.8);
    this.coreMat.emissive.setRGB(1.0, 0.45, 0.16);
    this.coreMat.emissiveIntensity = 0.08 + g * 0.14;
    this.glow.intensity = 1.6 + g * 1.4;
    this.hub.rotation.y = t * 0.12;

    // Orrery; on the last step the orbits flatten and align into one ring.
    this.to('align', this.step === 1 ? smoothstep(0.4, 2.6, st) : 0);
    const al = easeInOutCubic(this.param('align'));
    for (const ring of this.rings) {
      ring.g.rotation.x = lerp(ring.tilt.x, 0.18, al);
      ring.g.rotation.z = lerp(ring.tilt.z, 0, al);
      const R = lerp(ring.r, 3.2, al);
      ring.line.scale.setScalar(R / ring.r);
      ring.line.material.opacity = 0.22 * (1 - al) + 0.3 * al * (ring === this.rings[1] ? 1 : 0);
      for (const it of ring.items) {
        const n = this.items.length;
        const aFree = it.a0 + t * ring.speed;
        const aAligned = (it.idx / n) * Math.PI * 2 + t * 0.08;
        const a = lerp(aFree, aAligned, al);
        it.holder.position.set(Math.cos(a) * R, Math.sin(t * 0.7 + it.idx) * 0.08 * (1 - al), Math.sin(a) * R);
        it.obj.rotation.x += dt * it.rate * it.spin.x * (1 - al * 0.7);
        it.obj.rotation.y += dt * it.rate * it.spin.y;
        it.obj.rotation.z += dt * it.rate * it.spin.z * (1 - al * 0.7);
      }
    }
  }
}
