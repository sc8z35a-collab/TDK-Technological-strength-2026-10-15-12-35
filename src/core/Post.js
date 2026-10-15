// Custom HDR post pipeline:
//   scene A (and B during chapter transitions) -> MSAA half-float targets
//   -> physically-flavoured bloom (13-tap downsample / tent upsample mip chain)
//   -> composite: dissolve transition, AgX tone mapping, vignette, subtle
//      chromatic fringe, film grain, dithering, sRGB encode.
// Everything is tuned to stay photographic: bloom only catches true highlights.
import * as THREE from 'three';

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const COMMON = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(i), b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }
  // Transition mask: 0 shows A, 1 shows B.
  uniform float uMix;
  uniform vec2 uDir;
  uniform float uSeed;
  uniform float uAspect;
  float transitionMask(vec2 uv) {
    if (uMix <= 0.0) return 0.0;
    if (uMix >= 1.0) return 1.0;
    vec2 q = vec2((uv.x - 0.5) * uAspect, uv.y - 0.5);
    float g = dot(q, normalize(uDir)) / (0.5 * (abs(uDir.x) * uAspect + abs(uDir.y)) + 1e-4) * 0.5 + 0.5;
    float n = fbm(q * 3.2 + uSeed);
    float v = clamp(mix(g, n, 0.42), 0.0, 1.0);
    float w = 0.16;
    float t = uMix * (1.0 + 2.0 * w) - w;
    return smoothstep(v - w, v + w, t);
  }
  uniform sampler2D tA;
  uniform sampler2D tB;
  uniform float uExpA;
  uniform float uExpB;
  vec2 zoomUv(vec2 uv, float s) { return (uv - 0.5) / s + 0.5; }
  vec3 sceneColor(vec2 uv) {
    float m = transitionMask(uv);
    float ease = uMix * uMix * (3.0 - 2.0 * uMix);
    vec3 a = texture2D(tA, zoomUv(uv, 1.0 + 0.045 * ease)).rgb * uExpA;
    if (m <= 0.0) return a;
    vec3 b = texture2D(tB, zoomUv(uv, 1.06 - 0.06 * ease)).rgb * uExpB;
    return mix(a, b, m);
  }
`;

const PREFILTER_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform vec2 uTexel;
  uniform float uThreshold;
  uniform float uKnee;
  ${COMMON}
  vec3 prefilter(vec3 c) {
    float br = max(c.r, max(c.g, c.b));
    float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    rq = (rq * rq) / (4.0 * uKnee + 1e-4);
    float w = max(rq, br - uThreshold) / max(br, 1e-4);
    return c * w;
  }
  void main() {
    // 4-tap box with Karis average to suppress fireflies.
    vec3 s0 = sceneColor(vUv + uTexel * vec2(-1.0, -1.0));
    vec3 s1 = sceneColor(vUv + uTexel * vec2( 1.0, -1.0));
    vec3 s2 = sceneColor(vUv + uTexel * vec2(-1.0,  1.0));
    vec3 s3 = sceneColor(vUv + uTexel * vec2( 1.0,  1.0));
    float w0 = 1.0 / (1.0 + max(s0.r, max(s0.g, s0.b)));
    float w1 = 1.0 / (1.0 + max(s1.r, max(s1.g, s1.b)));
    float w2 = 1.0 / (1.0 + max(s2.r, max(s2.g, s2.b)));
    float w3 = 1.0 / (1.0 + max(s3.r, max(s3.g, s3.b)));
    vec3 c = (s0 * w0 + s1 * w1 + s2 * w2 + s3 * w3) / (w0 + w1 + w2 + w3);
    gl_FragColor = vec4(prefilter(min(c, vec3(64.0))), 1.0);
  }
`;

const DOWN_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  void main() {
    vec2 t = uTexel;
    vec3 a = texture2D(tSrc, vUv + t * vec2(-2.0, 2.0)).rgb;
    vec3 b = texture2D(tSrc, vUv + t * vec2( 0.0, 2.0)).rgb;
    vec3 c = texture2D(tSrc, vUv + t * vec2( 2.0, 2.0)).rgb;
    vec3 d = texture2D(tSrc, vUv + t * vec2(-2.0, 0.0)).rgb;
    vec3 e = texture2D(tSrc, vUv).rgb;
    vec3 f = texture2D(tSrc, vUv + t * vec2( 2.0, 0.0)).rgb;
    vec3 g = texture2D(tSrc, vUv + t * vec2(-2.0,-2.0)).rgb;
    vec3 h = texture2D(tSrc, vUv + t * vec2( 0.0,-2.0)).rgb;
    vec3 i = texture2D(tSrc, vUv + t * vec2( 2.0,-2.0)).rgb;
    vec3 j = texture2D(tSrc, vUv + t * vec2(-1.0, 1.0)).rgb;
    vec3 k = texture2D(tSrc, vUv + t * vec2( 1.0, 1.0)).rgb;
    vec3 l = texture2D(tSrc, vUv + t * vec2(-1.0,-1.0)).rgb;
    vec3 m = texture2D(tSrc, vUv + t * vec2( 1.0,-1.0)).rgb;
    vec3 o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
    gl_FragColor = vec4(o, 1.0);
  }
`;

const UP_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform float uRadius;
  uniform float uWeight;
  void main() {
    vec2 t = uTexel * uRadius;
    vec3 s = texture2D(tSrc, vUv + vec2(-t.x, t.y)).rgb
      + texture2D(tSrc, vUv + vec2(0.0, t.y)).rgb * 2.0
      + texture2D(tSrc, vUv + vec2(t.x, t.y)).rgb
      + texture2D(tSrc, vUv + vec2(-t.x, 0.0)).rgb * 2.0
      + texture2D(tSrc, vUv).rgb * 4.0
      + texture2D(tSrc, vUv + vec2(t.x, 0.0)).rgb * 2.0
      + texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb
      + texture2D(tSrc, vUv + vec2(0.0, -t.y)).rgb * 2.0
      + texture2D(tSrc, vUv + vec2(t.x, -t.y)).rgb;
    gl_FragColor = vec4(s / 16.0 * uWeight, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tBloom;
  uniform float uBloom;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uFringe;
  uniform float uSaturation;
  uniform vec3 uLift;
  uniform vec3 uGain;
  uniform float uFade;
  uniform vec3 uFadeColor;
  ${COMMON}

  // AgX (Troy Sobotka) minimal approximation by Benjamin Wrensch.
  vec3 agxContrast(vec3 x) {
    vec3 x2 = x * x;
    vec3 x4 = x2 * x2;
    return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
  }
  vec3 agx(vec3 v) {
    const mat3 m = mat3(
      0.842479062253094, 0.0423282422610123, 0.0423756549057051,
      0.0784335999999992, 0.878468636469772, 0.0784336,
      0.0792237451477643, 0.0791661274605434, 0.879142973793104);
    const float minEv = -12.47393;
    const float maxEv = 4.026069;
    v = m * v;
    v = clamp(log2(max(v, vec3(1e-10))), minEv, maxEv);
    v = (v - minEv) / (maxEv - minEv);
    return agxContrast(v);
  }
  vec3 agxEotf(vec3 v) {
    const mat3 mi = mat3(
      1.19687900512017, -0.0528968517574562, -0.0529716355144438,
      -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
      -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
    v = mi * v;
    return pow(max(v, vec3(0.0)), vec3(2.2));
  }
  vec3 agxLook(vec3 v) {
    float luma = dot(v, vec3(0.2126, 0.7152, 0.0722));
    v = pow(max(v, vec3(0.0)), vec3(1.08));
    return luma + uSaturation * (v - luma);
  }
  vec3 linearToSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec2 uv = vUv;
    vec2 d = uv - 0.5;
    float r2 = dot(d * vec2(uAspect, 1.0), d * vec2(uAspect, 1.0));
    vec3 col;
    if (uFringe > 0.0) {
      vec2 off = d * r2 * uFringe;
      col = vec3(sceneColor(uv - off).r, sceneColor(uv).g, sceneColor(uv + off).b);
    } else {
      col = sceneColor(uv);
    }
    col += texture2D(tBloom, uv).rgb * uBloom;
    col = agx(col);
    col = agxLook(col);
    col = agxEotf(col);
    col = col * uGain + uLift * (1.0 - col);
    float vig = smoothstep(1.15, 0.18, r2 * 1.6);
    col *= mix(1.0 - uVignette, 1.0, vig);
    col = mix(col, uFadeColor, uFade);
    vec3 srgb = linearToSrgb(col);
    float lum = dot(srgb, vec3(0.299, 0.587, 0.114));
    float g = hash12(uv * uResolution + fract(uTime * 7.13) * 431.0) - 0.5;
    srgb += g * uGrain * (0.35 + 0.65 * (1.0 - abs(lum * 2.0 - 1.0)));
    srgb += (hash12(uv * uResolution * 1.37 + 3.1) - 0.5) / 255.0;
    gl_FragColor = vec4(srgb, 1.0);
  }
`;

function makeRT(w, h, samples = 0, depth = true) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    samples,
    depthBuffer: depth,
    stencilBuffer: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });
}

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.mips = [];
    this.levels = 6;
    this.msaa = 4;
    this.bloomEnabled = true;
    this.bloomScale = 0.5;

    const sharedUniforms = {
      uMix: { value: 0 },
      uDir: { value: new THREE.Vector2(1, 0.35) },
      uSeed: { value: 3.7 },
      uAspect: { value: 1 },
      tA: { value: null },
      tB: { value: null },
      uExpA: { value: 1 },
      uExpB: { value: 1 },
    };
    this.shared = sharedUniforms;

    this.prefilterMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: PREFILTER_FRAG,
      uniforms: {
        ...sharedUniforms,
        uTexel: { value: new THREE.Vector2() },
        uThreshold: { value: 1.1 },
        uKnee: { value: 0.6 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.downMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: DOWN_FRAG,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    });
    this.upMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: UP_FRAG,
      uniforms: {
        tSrc: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uRadius: { value: 1.0 },
        uWeight: { value: 1.0 },
      },
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    });
    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        ...sharedUniforms,
        tBloom: { value: null },
        uBloom: { value: 0.12 },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uVignette: { value: 0.32 },
        uGrain: { value: 0.028 },
        uFringe: { value: 0.0025 },
        uSaturation: { value: 1.08 },
        uLift: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
        uGain: { value: new THREE.Vector3(1, 1, 1) },
        uFade: { value: 0 },
        uFadeColor: { value: new THREE.Color(0x0b0c0e) },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    // The bloom chain starts black until the first frame.
    this.blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.blackTex.needsUpdate = true;
  }

  setSize(width, height, msaa, bloomScale) {
    this.width = Math.max(2, Math.floor(width));
    this.height = Math.max(2, Math.floor(height));
    this.msaa = msaa;
    this.bloomScale = bloomScale;
    const w = this.width, h = this.height;
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.rtA = makeRT(w, h, msaa, true);
    this.rtB = makeRT(w, h, msaa, true);
    this.mips.forEach((m) => m.dispose());
    this.mips = [];
    let mw = Math.max(2, Math.floor(w * bloomScale));
    let mh = Math.max(2, Math.floor(h * bloomScale));
    for (let i = 0; i < this.levels; i++) {
      this.mips.push(makeRT(mw, mh, 0, false));
      mw = Math.max(2, Math.floor(mw / 2));
      mh = Math.max(2, Math.floor(mh / 2));
    }
    this.shared.uAspect.value = w / h;
    this.compositeMat.uniforms.uResolution.value.set(w, h);
  }

  blit(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * @param {{scene:THREE.Scene, camera:THREE.Camera, exposure:number}} a
   * @param {{scene:THREE.Scene, camera:THREE.Camera, exposure:number}|null} b
   */
  render(a, b, mix, time, look) {
    const r = this.renderer;
    r.setRenderTarget(this.rtA);
    r.clear();
    r.render(a.scene, a.camera);
    this.shared.tA.value = this.rtA.texture;
    this.shared.uExpA.value = a.exposure;
    if (b && mix > 0) {
      r.setRenderTarget(this.rtB);
      r.clear();
      r.render(b.scene, b.camera);
      this.shared.tB.value = this.rtB.texture;
      this.shared.uExpB.value = b.exposure;
      this.shared.uMix.value = mix;
    } else {
      this.shared.tB.value = this.rtA.texture;
      this.shared.uMix.value = 0;
    }

    const cu = this.compositeMat.uniforms;
    if (this.bloomEnabled && look.bloom > 0.001) {
      const m0 = this.mips[0];
      this.prefilterMat.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
      this.prefilterMat.uniforms.uThreshold.value = look.threshold;
      this.prefilterMat.uniforms.uKnee.value = look.knee;
      this.blit(this.prefilterMat, m0);
      for (let i = 1; i < this.mips.length; i++) {
        const src = this.mips[i - 1];
        this.downMat.uniforms.tSrc.value = src.texture;
        this.downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.blit(this.downMat, this.mips[i]);
      }
      for (let i = this.mips.length - 1; i > 0; i--) {
        const src = this.mips[i];
        this.upMat.uniforms.tSrc.value = src.texture;
        this.upMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.upMat.uniforms.uRadius.value = look.radius;
        this.upMat.uniforms.uWeight.value = 1.0;
        this.quad.material = this.upMat;
        r.setRenderTarget(this.mips[i - 1]);
        r.autoClear = false;
        r.render(this.scene, this.camera);
        r.autoClear = true;
      }
      cu.tBloom.value = this.mips[0].texture;
      cu.uBloom.value = look.bloom;
    } else {
      cu.tBloom.value = this.blackTex;
      cu.uBloom.value = 0;
    }
    cu.uTime.value = time;
    cu.uVignette.value = look.vignette;
    cu.uGrain.value = look.grain;
    cu.uFringe.value = look.fringe;
    cu.uSaturation.value = look.saturation;
    cu.uLift.value.copy(look.lift);
    cu.uGain.value.copy(look.gain);
    cu.uFade.value = look.fade;
    cu.uFadeColor.value.copy(look.fadeColor);
    this.blit(this.compositeMat, null);
  }

  dispose() {
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.mips.forEach((m) => m.dispose());
  }
}
