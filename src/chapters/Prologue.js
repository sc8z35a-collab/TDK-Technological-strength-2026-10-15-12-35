// CH.00 Prologue — iron-oxide powder swirls, condenses into a ferrite ring,
// glows as it is sintered, cools to graphite grey and receives its copper winding.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials, toroidCore, toroidWinding, withDissolve } from '../core/kit.js';
import { lightShaft } from '../core/fx.js';
import { clamp01, easeInOutCubic, easeOutCubic, lerp, mulberry32, smoothstep } from '../core/math.js';

export const CORE = { inner: 0.6, outer: 1.0, height: 0.44 };

/** Sphere-impostor point sprites that fly from a swirling cloud onto target points. */
export function powderMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uShrink: { value: 0 },
      uSize: { value: 0.022 },
      uScale: { value: 700 },
      uLightDir: { value: new THREE.Vector3(-0.5, 0.75, 0.55).normalize() },
      uHeat: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aTarget;
      attribute vec4 aRnd;
      uniform float uTime, uProgress, uShrink, uSize, uScale, uHeat;
      varying vec3 vColor;
      varying float vHeat;
      vec3 swirl(vec3 p, float t, vec4 r) {
        float a = t * (0.18 + r.x * 0.22) + r.y * 6.2831;
        float rad = length(p.xz);
        return vec3(cos(a) * rad, p.y + sin(t * 0.6 + r.z * 6.28) * 0.12, sin(a) * rad);
      }
      void main() {
        float delay = aRnd.w * 0.5;
        float k = clamp((uProgress - delay) / 0.5, 0.0, 1.0);
        k = k * k * (3.0 - 2.0 * k);
        vec3 cloud = swirl(position, uTime, aRnd);
        // Curved approach: blend through an elevated midpoint.
        vec3 mid = mix(cloud, aTarget, 0.55) + vec3(0.0, 0.5 * sin(aRnd.x * 6.28), 0.0);
        vec3 p = mix(mix(cloud, mid, k), mix(mid, aTarget, k), k);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float s = uSize * (0.45 + aRnd.z * aRnd.z * 1.6) * (1.0 - uShrink * (0.6 + 0.4 * aRnd.x));
        gl_PointSize = max(0.0, s * uScale / max(-mv.z, 0.1));
        // Hematite red-brown, with darker manganese and pale zinc oxide grains.
        vec3 hem = vec3(0.34, 0.12, 0.06);
        vec3 mn = vec3(0.09, 0.075, 0.07);
        vec3 zn = vec3(0.72, 0.69, 0.62);
        vColor = aRnd.y < 0.62 ? hem * (0.75 + aRnd.x * 0.5) : (aRnd.y < 0.9 ? mn : zn);
        vHeat = uHeat * k;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightDir;
      varying vec3 vColor;
      varying float vHeat;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float d = dot(c, c);
        if (d > 1.0) discard;
        vec3 n = vec3(c.x, -c.y, sqrt(1.0 - d));
        float diff = max(dot(n, uLightDir), 0.0);
        vec3 h = normalize(uLightDir + vec3(0.0, 0.0, 1.0));
        float spec = pow(max(dot(n, h), 0.0), 36.0);
        float rim = pow(1.0 - n.z, 3.0);
        vec3 col = vColor * (0.14 + diff * 1.5) + vec3(1.0, 0.93, 0.84) * spec * 0.7 + vec3(0.66, 0.72, 0.84) * rim * 0.16;
        // Incandescence: deep orange that only nears yellow at the hottest grains.
        col = col * (1.0 - vHeat * 0.75) + mix(vec3(1.0, 0.2, 0.035), vec3(1.0, 0.38, 0.08), vHeat * vHeat) * vHeat * 1.45;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Sample points on the ring surface (superelliptic cross-section). */
export function sampleRing(count, seed = 1, { inner, outer, height } = CORE) {
  const rand = mulberry32(seed);
  const R = (inner + outer) / 2;
  const a = (outer - inner) / 2;
  const b = height / 2;
  const out = new Float32Array(count * 3);
  const n = 6;
  for (let i = 0; i < count; i++) {
    const u = rand() * Math.PI * 2;
    const v = rand() * Math.PI * 2;
    const cv = Math.cos(v), sv = Math.sin(v);
    const x = a * Math.sign(cv) * Math.pow(Math.abs(cv), 2 / n);
    const y = b * Math.sign(sv) * Math.pow(Math.abs(sv), 2 / n);
    const rr = R + x;
    out[i * 3] = Math.cos(u) * rr;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(u) * rr;
  }
  return out;
}

/** Approximate blackbody tint for a glow factor 0..1 (dull red -> orange -> yellow-white). */
export function heatColor(k, out = new THREE.Color()) {
  const t = clamp01(k);
  out.setRGB(1.0, lerp(0.1, 0.5, t * t), lerp(0.02, 0.16, t * t * t));
  return out;
}

/** Deeper ramp for kiln-hot ceramic seen through a filmic tonemapper (stays orange). */
function kilnColor(k, out) {
  const t = clamp01(k);
  return out.setRGB(1.0, lerp(0.06, 0.34, t * t), lerp(0.01, 0.07, t * t * t));
}

export class Prologue extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.dofSteps = [0.006, 0.006];
    this.env = 'studio';
    this.exposure = 1.05;
    this.shift = 0.22;
    this.look = { bloom: 0.16, threshold: 0.95, vignette: 0.38, saturation: 1.04 };
    this.assembled = false;
  }

  build() {
    const M = materials();
    this.addBackdrop({ top: '#16171a', bottom: '#050607', glow: '#2b2119', glowPos: [0.7, 0.5], glowSize: 0.5, glowStrength: 0.9 });
    this.addDust({ count: 420, radius: 4.5, height: 3.4, size: 0.035, opacity: 0.5, seed: 3 });

    const key = new THREE.DirectionalLight(0xfff0dc, 2.6);
    key.position.set(-3, 5, 4);
    const rim = new THREE.DirectionalLight(0xd6e2ff, 2.4);
    rim.position.set(4, 1.5, -5);
    const fill = new THREE.HemisphereLight(0xf6efe6, 0x15161a, 0.16);
    this.heatLight = new THREE.PointLight(0xff8a3c, 0, 6, 1.6);
    this.heatLight.position.set(0, 0.3, 0.6);
    this.scene.add(key, rim, fill, this.heatLight);

    this.shaft = lightShaft({ length: 7, radiusTop: 0.12, radiusBottom: 2.6, opacity: 0.05 });
    this.shaft.position.set(-0.4, 3.8, -1.2);
    this.shaft.rotation.z = 0.2;
    this.add(this.shaft);

    this.pivot = new THREE.Group();
    this.pivot.rotation.set(1.05, 0.0, -0.32);
    this.scene.add(this.pivot);

    const coreGeo = toroidCore({ ...CORE, bevel: 0.07 });
    this.coreMat = withDissolve(M.ferriteGlow, { edgeColor: 0xffa055, edgeWidth: 0.09, scale: 4.2, intensity: 3.2 });
    this.core = new THREE.Mesh(coreGeo, this.coreMat);
    this.pivot.add(this.core);
    this.tracker.track(coreGeo);
    this.tracker.track(this.coreMat);

    const wGeo = toroidWinding({ ...CORE, turns: 26, wire: 0.028, clearance: 0.012, samplesPerTurn: 48 });
    this.windGeo = wGeo;
    this.wind = new THREE.Mesh(wGeo, M.copperWire);
    this.windTotal = wGeo.index ? wGeo.index.count : wGeo.attributes.position.count;
    wGeo.setDrawRange(0, 0);
    this.pivot.add(this.wind);
    this.tracker.track(wGeo);

    // Glint that rides along the wire as it is wound.
    this.tip = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.3, 1.6) }));
    this.tip.visible = false;
    this.pivot.add(this.tip);
    this.tracker.track(this.tip);
    this.tracker.track(this.tip.material);
    const pos = wGeo.parameters.path;
    this.windPath = pos;

    // Lead wires leaving the winding.
    const leadCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.03, 0.0, 0.0),
      new THREE.Vector3(1.4, 0.06, 0.08),
      new THREE.Vector3(1.85, -0.02, 0.3),
      new THREE.Vector3(2.3, -0.3, 0.42),
    ]);
    const leadGeo = new THREE.TubeGeometry(leadCurve, 48, 0.028, 10, false);
    this.lead = new THREE.Mesh(leadGeo, M.copperWire);
    this.leadTotal = leadGeo.index.count;
    leadGeo.setDrawRange(0, 0);
    this.pivot.add(this.lead);
    this.tracker.track(leadGeo);

    // Powder
    const q = this.app.quality.tier.particles;
    const count = Math.round(16000 * q);
    const rand = mulberry32(9);
    const p = new Float32Array(count * 3);
    const rnd = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const r = 0.5 + Math.pow(rand(), 0.7) * 2.8;
      const a = rand() * Math.PI * 2;
      p[i * 3] = Math.cos(a) * r;
      p[i * 3 + 1] = (rand() - 0.5) * (1.9 - r * 0.25);
      p[i * 3 + 2] = Math.sin(a) * r;
      rnd[i * 4] = rand();
      rnd[i * 4 + 1] = rand();
      rnd[i * 4 + 2] = rand();
      rnd[i * 4 + 3] = rand();
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    pGeo.setAttribute('aTarget', new THREE.BufferAttribute(sampleRing(count, 11), 3));
    pGeo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
    this.powderMat = powderMaterial();
    this.powder = new THREE.Points(pGeo, this.powderMat);
    this.powder.frustumCulled = false;
    this.pivot.add(this.powder);
    this.tracker.track(pGeo);
    this.tracker.track(this.powderMat);

    this.label({ id: 'core', text: 'フェライトコア', sub: '酸化鉄＋マンガン・亜鉛の焼結体', anchor: new THREE.Vector3(-0.8, 0.22, 0.0), offset: [-70, -54], when: () => this.T > 9.2 });
    this.label({ id: 'wire', text: '銅線の巻線', sub: '電流を通すと磁束がリングを一周する', anchor: new THREE.Vector3(0.62, 0.3, 0.55), offset: [60, -64], when: () => this.T > 9.8 });
    this.T = 0;
    this._heat = new THREE.Color();
  }

  poses() {
    return [{ pos: [0.15, 0.7, 5.6], target: [0, 0.02, 0], fov: 30, dur: 2.2 }];
  }

  onStep() {}

  tick(dt, t) {
    // The assembly runs on its own clock so it continues across steps.
    this.assemblyT = (this.assemblyT || 0) + dt;
    if (this.assembled) this.assemblyT = Math.max(this.assemblyT, 12);
    const T = (this.T = this.assemblyT);
    const gather = clamp01((T - 0.4) / 3.4);
    const reveal = smoothstep(2.7, 4.6, T);
    const heat = 1 - smoothstep(3.6, 8.2, T);
    const wind = easeInOutCubic(clamp01((T - 4.6) / 3.0));
    const lead = easeOutCubic(clamp01((T - 7.4) / 0.9));

    const u = this.powderMat.uniforms;
    u.uTime.value = t;
    u.uProgress.value = gather;
    u.uShrink.value = smoothstep(3.2, 4.9, T);
    u.uScale.value = (this.app.pixelRatio * this.app.height) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    u.uHeat.value = smoothstep(2.4, 3.6, T) * heat;
    this.powder.visible = T < 5.0;

    this.coreMat.dissolve.uReveal.value = reveal;
    const glow = heat * smoothstep(2.7, 3.6, T);
    kilnColor(glow, this._heat);
    this.coreMat.emissive.copy(this._heat);
    this.coreMat.emissiveIntensity = 1.55 * glow * glow;
    // Hot spots fade out last: the glow gets patchier as the part cools.
    this.coreMat.dissolve.uGlowNoise.value = 0.55 + 0.35 * (1 - glow);
    this.coreMat.dissolve.uEdgeColor.value.copy(this._heat).multiplyScalar(0.5 + glow);
    this.heatLight.color.copy(this._heat);
    this.heatLight.intensity = 3.5 * glow * glow;

    const n = Math.floor(this.windTotal * wind);
    this.windGeo.setDrawRange(0, n - (n % 3));
    this.tip.visible = wind > 0.001 && wind < 0.999;
    if (this.tip.visible) this.windPath.getPointAt(wind, this.tip.position);
    const ln = Math.floor(this.leadTotal * lead);
    this.lead.geometry.setDrawRange(0, ln - (ln % 3));
    if (T > 9) this.assembled = true;

    this.backdrop.material.uniforms.uGlowStrength.value = 0.9 + glow * 0.45;
    this.backdrop.material.uniforms.uGlow.value.setRGB(0.17 + glow * 0.14, 0.13 + glow * 0.03, 0.1 - glow * 0.02);

    const settle = easeOutCubic(clamp01(T / 7));
    this.pivot.rotation.y = 0.9 * (1 - settle) - 0.5 + t * 0.1;
    this.pivot.rotation.x = 1.02 + Math.sin(t * 0.31) * 0.05;
    this.pivot.position.y = Math.sin(t * 0.5) * 0.03;
  }
}
