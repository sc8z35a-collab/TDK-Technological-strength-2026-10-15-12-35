// Shared scene effects: gradient backdrop, floating dust, soft ground shadow,
// light beams. All tuned for a photographic, non-neon look.
import * as THREE from 'three';
import { mulberry32 } from './math.js';

/** Full-screen gradient drawn behind everything in a scene. */
export class Backdrop extends THREE.Mesh {
  constructor({
    top = '#15171b',
    bottom = '#07080a',
    glow = '#2a2622',
    glowPos = [0.62, 0.55],
    glowSize = 0.65,
    glowStrength = 1.0,
    noise = 0.012,
  } = {}) {
    const material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(top) },
        uBottom: { value: new THREE.Color(bottom) },
        uGlow: { value: new THREE.Color(glow) },
        uGlowPos: { value: new THREE.Vector2(...glowPos) },
        uGlowSize: { value: glowSize },
        uGlowStrength: { value: glowStrength },
        uNoise: { value: noise },
        uAspect: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = position.xy * 0.5 + 0.5;
          gl_Position = vec4(position.xy, 0.9999, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform vec3 uTop, uBottom, uGlow;
        uniform vec2 uGlowPos;
        uniform float uGlowSize, uGlowStrength, uNoise, uAspect;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec3 c = mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y));
          vec2 d = (vUv - uGlowPos) * vec2(uAspect, 1.0);
          float g = exp(-dot(d, d) / (uGlowSize * uGlowSize));
          c += uGlow * g * uGlowStrength;
          c += (hash(vUv * 731.7) - 0.5) * uNoise;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    super(new THREE.PlaneGeometry(2, 2), material);
    this.frustumCulled = false;
    this.renderOrder = -1000;
  }
  setAspect(a) {
    this.material.uniforms.uAspect.value = a;
  }
  set(params) {
    const u = this.material.uniforms;
    if (params.top) u.uTop.value.set(params.top);
    if (params.bottom) u.uBottom.value.set(params.bottom);
    if (params.glow) u.uGlow.value.set(params.glow);
    if (params.glowPos) u.uGlowPos.value.set(...params.glowPos);
    if (params.glowSize !== undefined) u.uGlowSize.value = params.glowSize;
    if (params.glowStrength !== undefined) u.uGlowStrength.value = params.glowStrength;
  }
}

/** Drifting dust motes caught in the studio light. */
export class Dust extends THREE.Points {
  constructor({ count = 500, radius = 6, height = 4, color = '#f2e6d4', size = 0.035, opacity = 0.55, seed = 1, center = [0, 0, 0] } = {}) {
    const rand = mulberry32(seed);
    const pos = new Float32Array(count * 3);
    const rnd = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const r = radius * Math.sqrt(rand());
      const a = rand() * Math.PI * 2;
      pos[i * 3] = center[0] + Math.cos(a) * r;
      pos[i * 3 + 1] = center[1] + (rand() - 0.5) * height;
      pos[i * 3 + 2] = center[2] + Math.sin(a) * r;
      rnd[i * 4] = rand();
      rnd[i * 4 + 1] = rand();
      rnd[i * 4 + 2] = rand();
      rnd[i * 4 + 3] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uSize: { value: size },
        uOpacity: { value: opacity },
        uPixelRatio: { value: 1 },
        uHeight: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aRnd;
        uniform float uTime, uSize, uPixelRatio, uHeight;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          float t = uTime * (0.05 + aRnd.x * 0.08);
          p.x += sin(t * 2.1 + aRnd.y * 30.0) * 0.35;
          p.y += sin(t * 1.3 + aRnd.z * 20.0) * 0.25 + mod(uTime * 0.03 * (0.3 + aRnd.w), 1.0) * 0.4;
          p.z += cos(t * 1.7 + aRnd.x * 40.0) * 0.35;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float depth = -mv.z;
          gl_PointSize = uSize * uHeight * uPixelRatio * (0.5 + aRnd.w) / max(depth, 0.1);
          float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aRnd.y) + aRnd.z * 6.28);
          vAlpha = tw * smoothstep(0.3, 2.0, depth) * (1.0 - smoothstep(10.0, 30.0, depth));
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOpacity;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          a *= a;
          gl_FragColor = vec4(uColor * a * vAlpha * uOpacity, 1.0);
        }`,
    });
    super(geo, mat);
    this.frustumCulled = false;
  }
  update(time, pixelRatio, viewportHeight) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uPixelRatio.value = pixelRatio;
    u.uHeight.value = viewportHeight * 0.5;
  }
}

/** Soft radial contact shadow on a ground plane (cheap, static). */
export function softShadow({ radius = 2, opacity = 0.55, color = '#000000', y = 0, squash = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.15)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2 * squash),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, color })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.renderOrder = -1;
  return m;
}

/** A faint volumetric light shaft (additive cone with soft edges). */
export function lightShaft({ length = 8, radiusTop = 0.2, radiusBottom = 2.2, color = '#fff1dc', opacity = 0.06 } = {}) {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 48, 1, true);
  geo.translate(0, -length / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vY = uv.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float f = abs(dot(normalize(vN), normalize(vV)));
        float a = pow(f, 2.5) * smoothstep(0.0, 0.25, vY) * smoothstep(1.0, 0.6, vY);
        gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}
