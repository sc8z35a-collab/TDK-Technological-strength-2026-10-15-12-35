// Studio lighting environments rendered into PMREM maps.
// Softboxes are emissive planes with HDR intensities, so metals and glazes pick up
// clean, photographic highlights instead of a generic sky.
import * as THREE from 'three';

const PRESETS = {
  // Dark product studio: warm key strip, cool rim, large top softbox.
  studio: {
    ground: [0.012, 0.012, 0.014],
    sky: [0.035, 0.036, 0.04],
    boxes: [
      { pos: [0, 9, 1], rot: [-Math.PI / 2, 0, 0], size: [9, 6], color: [1.0, 0.97, 0.92], intensity: 3.2 },
      { pos: [-9, 2.5, 3], rot: [0, Math.PI / 2.2, 0], size: [2.2, 8], color: [1.0, 0.94, 0.86], intensity: 7.5 },
      { pos: [9, 3, -4], rot: [0, -Math.PI / 2.6, 0], size: [1.6, 9], color: [0.84, 0.9, 1.0], intensity: 6.0 },
      { pos: [2, -6, 6], rot: [Math.PI / 2.5, 0, 0], size: [10, 3], color: [0.9, 0.85, 0.78], intensity: 0.35 },
      { pos: [0, 3, -10], rot: [0, 0, 0], size: [6, 2], color: [1.0, 0.98, 0.95], intensity: 2.2 },
    ],
  },
  // Bright gallery for the world-share room.
  gallery: {
    ground: [0.32, 0.31, 0.3],
    sky: [0.62, 0.61, 0.6],
    boxes: [
      { pos: [0, 10, 0], rot: [-Math.PI / 2, 0, 0], size: [14, 10], color: [1.0, 0.98, 0.95], intensity: 4.0 },
      { pos: [-10, 4, 4], rot: [0, Math.PI / 2.3, 0], size: [4, 8], color: [1.0, 0.96, 0.9], intensity: 5.0 },
      { pos: [10, 4, -2], rot: [0, -Math.PI / 2.3, 0], size: [3, 8], color: [0.92, 0.95, 1.0], intensity: 3.5 },
    ],
  },
  // Space / satellite light: a single strong sun box plus faint fill.
  space: {
    ground: [0.004, 0.005, 0.008],
    sky: [0.01, 0.012, 0.02],
    boxes: [
      { pos: [-10, 5, 7], rot: [0, Math.PI / 3.5, 0], size: [5, 5], color: [1.0, 0.96, 0.9], intensity: 9.0 },
      { pos: [9, -2, -6], rot: [0, -Math.PI / 2.4, 0], size: [2, 8], color: [0.7, 0.8, 1.0], intensity: 1.6 },
      { pos: [0, 9, 0], rot: [-Math.PI / 2, 0, 0], size: [8, 8], color: [0.9, 0.92, 1.0], intensity: 0.8 },
    ],
  },
  // Warm dawn used by the finale.
  dawn: {
    ground: [0.03, 0.025, 0.022],
    sky: [0.12, 0.1, 0.09],
    boxes: [
      { pos: [0, 8, -6], rot: [-Math.PI / 3, 0, 0], size: [12, 4], color: [1.0, 0.86, 0.7], intensity: 5.0 },
      { pos: [-8, 2, 5], rot: [0, Math.PI / 2.4, 0], size: [3, 7], color: [1.0, 0.92, 0.82], intensity: 5.0 },
      { pos: [8, 3, 2], rot: [0, -Math.PI / 2.4, 0], size: [2, 7], color: [0.8, 0.86, 1.0], intensity: 3.0 },
    ],
  },
};

function buildEnvScene(preset) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(30, 48, 24);
  const top = new THREE.Color(...preset.sky);
  const bottom = new THREE.Color(...preset.ground);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: top }, bottom: { value: bottom } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 bottom; varying vec3 vDir;
      void main() {
        float t = smoothstep(-0.6, 0.8, vDir.y);
        gl_FragColor = vec4(mix(bottom, top, t), 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(geo, mat));
  for (const b of preset.boxes) {
    const color = new THREE.Color(...b.color).multiplyScalar(b.intensity);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(b.size[0], b.size[1]),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    );
    m.position.set(...b.pos);
    m.rotation.set(...b.rot);
    scene.add(m);
  }
  return scene;
}

export class EnvironmentLibrary {
  constructor(renderer) {
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.maps = new Map();
  }
  get(name = 'studio') {
    if (!this.maps.has(name)) {
      const scene = buildEnvScene(PRESETS[name] || PRESETS.studio);
      const rt = this.pmrem.fromScene(scene, 0.02, 0.1, 100);
      this.maps.set(name, rt.texture);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    return this.maps.get(name);
  }
}
