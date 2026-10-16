// Placeholder scene used while a chapter is under construction.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials, toroidCore } from '../core/kit.js';

export class Stub extends Chapter {
  build() {
    const M = materials();
    this.addBackdrop({});
    this.addDust({ count: 300 });
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
    key.position.set(-3, 5, 4);
    this.scene.add(key);
    this.ring = new THREE.Mesh(toroidCore({ inner: 0.6, outer: 1, height: 0.44 }), M.ferrite);
    this.ring.rotation.x = 1.1;
    this.add(this.ring);
  }
  poses() {
    return this.def.steps.map((_, i) => ({ pos: [Math.sin(i) * 1.5, 0.6, 5.5], target: [0, 0, 0], fov: 30 }));
  }
  tick(dt, t) {
    this.ring.rotation.z = t * 0.2;
  }
}
