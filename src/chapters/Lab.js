// Development-only parts gallery (not part of the published chapter list).
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { studioLights } from '../core/kit.js';
import * as P from '../core/parts.js';
import { softShadow } from '../core/fx.js';

export class Lab extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.shift = 0;
  }
  build() {
    this.addBackdrop({ top: '#202226', bottom: '#0b0c0e' });
    studioLights(this.scene, { shadows: false });
    const items = [
      P.mlcc({ l: 1.6, w: 0.8, h: 0.8 }),
      P.chipInductor({ l: 1.6, w: 0.8, h: 0.8 }),
      P.commonModeFilter(),
      P.powerInductor(),
      P.ntcBead(),
      P.discComponent(),
      P.discComponent({ color: 0xb5ab98 }),
      P.filmCapacitor(),
      P.electrolytic(),
      P.pouchCell({ label: false }),
      P.lgaPackage(),
      P.powerSupply(),
    ];
    items.forEach((it, i) => {
      const x = (i % 4) * 2.2 - 3.3;
      const z = Math.floor(i / 4) * 2.2 - 2.2;
      it.position.set(x, 0, z);
      this.add(it);
      const sh = softShadow({ radius: 0.9, opacity: 0.5, y: -0.001 });
      sh.position.set(x, -0.001, z);
      this.add(sh);
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    this.add(floor);
  }
  poses() {
    return [{ pos: [0, 5.5, 7.5], target: [0, 0.2, 0], fov: 40 }];
  }
}
