// CH.14 Global — a porcelain-and-graphite globe in a dark studio.
//   0: copper pins pop up at TDK sites in 30+ countries while the globe turns.
//   1: the globe turns to China; two gauge columns rise (sales 55.0%, production ~62%).
//   2: great-circle arcs of acquisitions converge on Tokyo, in chronological order.
//   3: the camera dives into a high-resolution relief of Japan: Akita, the origin,
//      and the plant planned in Ojiya, Niigata.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials } from '../core/kit.js';
import { canvasTexture } from '../core/textures.js';
import { clamp01, damp, easeInOutCubic, easeOutBack, easeOutCubic, latLonToVec3, smoothstep, DEG } from '../core/math.js';
import landUrl from '../assets/land.png';
import japanUrl from '../assets/japan.png';

const R = 2; // globe radius
// High-resolution inset (src/assets/japan.png); keep in sync with scripts/gen-japan.mjs.
const JP_BOX = { lon0: 125, lat0: 26, lon1: 151, lat1: 48 };
const TOKYO = [35.68, 139.77];
const UP = new THREE.Vector3(0, 1, 0);

/* Sites (approximate coordinates). Flags: w = shown on the world view,
   j = shown in the Japan close-up, o = origin (Akita; replaced by its own marker up close). */
const SITES = [
  ['東京・本社', 35.68, 139.77, 'wj'],
  ['秋田・にかほ', 39.25, 139.91, 'wo'],
  ['秋田・稲倉', 39.2, 139.96, 'j'],
  ['秋田・本荘', 39.39, 140.05, 'j'],
  ['岩手・北上', 39.29, 141.11, 'wj'],
  ['山形・酒田', 38.91, 139.84, 'j'],
  ['山形・鶴岡', 38.73, 139.83, 'j'],
  ['千葉・成田', 35.78, 140.32, 'j'],
  ['千葉・市川', 35.72, 139.93, 'j'],
  ['長野・浅間', 36.32, 138.51, 'wj'],
  ['長野・千曲川', 36.25, 138.47, 'j'],
  ['長野・飯田', 35.51, 137.82, 'j'],
  ['山梨・甲府', 35.66, 138.57, 'j'],
  ['静岡', 34.98, 138.38, 'j'],
  ['大分', 33.32, 130.94, 'wj'],
  ['香港', 22.32, 114.17, 'w'],
  ['寧徳', 26.66, 119.55, 'w'],
  ['東莞', 23.02, 113.75, 'w'],
  ['廈門', 24.48, 118.09, 'w'],
  ['珠海', 22.27, 113.58, 'w'],
  ['蘇州', 31.3, 120.62, 'w'],
  ['上海', 31.23, 121.47, 'w'],
  ['台湾', 24.91, 121.15, 'w'],
  ['タイ', 14.35, 100.58, 'w'],
  ['フィリピン', 14.33, 121.08, 'w'],
  ['マレーシア', 3.07, 101.52, 'w'],
  ['インドネシア・バタム', 1.08, 104.03, 'w'],
  ['インド・バーワル', 28.08, 76.58, 'w'],
  ['インド・ソーナ', 28.25, 77.07, 'w'],
  ['インド・ナシク', 19.99, 73.79, 'w'],
  ['ドイツ・ミュンヘン', 48.14, 11.58, 'w'],
  ['ドイツ・フライブルク', 47.99, 7.85, 'w'],
  ['ドイツ・ハイデンハイム', 48.68, 10.15, 'w'],
  ['オーストリア', 46.82, 15.22, 'w'],
  ['ハンガリー', 47.23, 16.62, 'w'],
  ['チェコ', 49.97, 16.97, 'w'],
  ['スペイン', 36.72, -4.42, 'w'],
  ['アイスランド', 65.68, -18.09, 'w'],
  ['イタリア', 45.89, 11.04, 'w'],
  ['ベルギー', 50.88, 4.7, 'w'],
  ['フランス', 45.28, 5.88, 'w'],
  ['米国・ミルピタス', 37.43, -121.9, 'w'],
  ['米国・サンノゼ', 37.25, -121.78, 'w'],
  ['米国・イリノイ', 41.97, -88.02, 'w'],
  ['米国・ニュージャージー', 40.35, -74.66, 'w'],
  ['ブラジル', -29.94, -50.99, 'w'],
];

/* Acquisitions, in order. lift scales the arc height (separates arcs that share a city). */
const DEALS = [
  { year: 1986, name: 'SAE Magnetics', place: '香港', field: 'HDDヘッド', lat: 22.37, lon: 114.12, lift: 0.8, off: [-44, 30] },
  { year: 2000, name: 'Headway', place: '米国', field: 'HDDヘッド', lat: 37.43, lon: -121.9, lift: 1.0, off: [44, 28] },
  { year: 2005, name: 'ATL', place: '香港', field: '電池', lat: 22.3, lon: 114.2, lift: 1.6, off: [-44, 30] },
  { year: 2005, name: 'Lambda', place: '米国', field: '電源', lat: 40.71, lon: -74.0, lift: 1.0, off: [44, -28] },
  { year: 2008, name: 'EPCOS', place: 'ドイツ', field: '受動部品', lat: 48.14, lon: 11.58, lift: 1.0, off: [-44, -30] },
  { year: 2016, name: 'Micronas', place: 'ドイツ', field: 'ホールセンサ', lat: 47.99, lon: 7.85, lift: 1.3, off: [-44, 30] },
  { year: 2017, name: 'InvenSense', place: '米国', field: 'MEMSセンサ', lat: 37.34, lon: -121.89, lift: 1.35, off: [44, -28] },
  { year: 2026, name: 'Linergy', place: 'マレーシア', field: '電池', lat: 3.07, lon: 101.52, lift: 1.0, off: [-44, 30] },
  { year: 2026, name: 'Fabric8Labs', place: '米国・合意', field: '冷却部品', lat: 32.72, lon: -117.16, lift: 1.6, off: [44, 30] },
];
const DEAL_T0 = 1.1; // first arc (step time, s)
const DEAL_DT = 1.2; // spacing between arcs
const DEAL_DRAW = 1.5; // time to draw one arc

const REGIONS = [
  { text: '日本', sub: '秋田・岩手・長野 ほか', lat: 37.6, lon: 139.6, off: [42, -32] },
  { text: '中国', sub: '香港・寧徳・東莞 ほか', lat: 30.5, lon: 112.5, off: [-44, -34] },
  { text: '欧州', sub: 'ドイツ・オーストリア ほか', lat: 48.6, lon: 11.0, off: [-44, -32] },
  { text: '米国', sub: 'ミルピタス・サンノゼ ほか', lat: 39.0, lon: -98.0, off: [42, -32] },
];

/* China gauge columns: height ∝ share of a full-height (100%) glass sleeve. */
const COLS = [
  { text: '中国向け売上 55.0%', sub: '売上高のうち中国向け', pct: 55.0, lat: 31.5, lon: 103.5, copper: true },
  { text: '中国での生産 約62%', sub: '生産額のうち中国', pct: 62, lat: 31.0, lon: 116.5, copper: false },
];
const H100 = 1.0; // sleeve height = 100 %

// Globe orientation per step: the point (lat, lon) faces the camera (+Z).
const VIEWS = [
  { lat: 22, lon: 128 }, // step 0 spins westward from here
  { lat: -12, lon: 110 }, // China tilted up so the columns rise toward the viewer
  { lat: 60, lon: 150 }, // over the North Pacific: Asia, America and Europe at once
  { lat: -3, lon: 137.6 }, // Japan on the upper front for an oblique close-up
];
const SPIN = 3.2; // deg/s in step 0
const PIN_SCALE = [1, 0.75, 0.7, 0.17];

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

const ll = (lat, lon, r = 1, out = new THREE.Vector3()) => latLonToVec3(lat, lon, r, out);

/* ------------------------------------------------------------------ materials */

const GLOBE_PARS = /* glsl */ `
uniform sampler2D uWorld;
uniform sampler2D uJapan;
uniform vec2 uWorldTexel;
uniform vec2 uJapanTexel;
uniform vec4 uJapanBox;
uniform vec3 uOcean;
uniform vec3 uShelf;
uniform vec3 uLand;
uniform vec3 uGridColor;
uniform vec3 uRimColor;
uniform vec3 uKeyDir;
uniform float uRelief;
uniform float uGrid;
uniform float uCast;
uniform float uCastLen;
uniform float uRadius;
uniform float uRim;
varying vec2 vGeoUv;
varying vec3 vEastV;
varying vec3 vNorthV;
`;

// Runs right after <map_fragment>: picks the world mask or the Japan inset,
// derives colour, a relief normal offset (gPert) and the land factor (gLand).
const GLOBE_SURFACE = /* glsl */ `
float gLon = vGeoUv.x * 360.0 - 180.0;
float gLat = vGeoUv.y * 180.0 - 90.0;
vec2 gLL = vec2(gLon, gLat);
vec3 gM = texture2D(uWorld, vGeoUv).rgb;
vec2 gGrad = vec2(
  texture2D(uWorld, vGeoUv + vec2(uWorldTexel.x, 0.0)).g - gM.g,
  texture2D(uWorld, vGeoUv + vec2(0.0, uWorldTexel.y)).g - gM.g) / (uWorldTexel * vec2(360.0, 180.0));
vec2 gJUv = (gLL - uJapanBox.xy) / uJapanBox.zw;
vec3 gJ = texture2D(uJapan, gJUv).rgb;
vec2 gJGrad = vec2(
  texture2D(uJapan, gJUv + vec2(uJapanTexel.x, 0.0)).g - gJ.g,
  texture2D(uJapan, gJUv + vec2(0.0, uJapanTexel.y)).g - gJ.g) / (uJapanTexel * uJapanBox.zw);
vec2 gIn = min(gLL - uJapanBox.xy, uJapanBox.xy + uJapanBox.zw - gLL);
float gJw = smoothstep(0.3, 1.6, min(gIn.x, gIn.y));
gM = mix(gM, gJ, gJw);
gGrad = mix(gGrad, gJGrad, gJw);
// Crisp, anti-aliased coastline from the coverage mask.
float gAw = clamp(fwidth(gM.r) * 0.75, 0.02, 0.5);
float gLand = smoothstep(0.5 - gAw, 0.5 + gAw, gM.r);
float gCos = max(cos(radians(gLat)), 0.06);
// Relief: the G channel is a height field; gradient per world unit along east/north.
vec2 gSlope = gGrad / (uRadius * 0.01745329) * vec2(1.0 / gCos, 1.0);
vec3 gPert = uRelief * (gSlope.x * vEastV + gSlope.y * vNorthV);
// The raised land throws a short shadow on the sea, away from the key light.
vec2 gL = vec2(dot(uKeyDir, vEastV), dot(uKeyDir, vNorthV));
float gLn = max(dot(uKeyDir, normalize(vNormal)), 0.25);
vec2 gOff = gL / gLn * uCastLen;
gOff *= min(1.0, 3.0 * uCastLen / max(length(gOff), 1e-5));
gOff.x /= gCos;
float gShade = mix(
  texture2D(uWorld, vGeoUv + gOff / vec2(360.0, 180.0)).g,
  texture2D(uJapan, gJUv + gOff / uJapanBox.zw).g, gJw);
float gSea = (1.0 - uCast * smoothstep(0.08, 0.8, gShade)) * (1.0 - 0.3 * gM.g);
vec3 gOcean = mix(uOcean, uShelf, gM.b * gM.b) * gSea;
// Graticule every 15 degrees: faint inlay lines on the sea.
vec2 gG = gLL / 15.0;
vec2 gGd = abs(fract(gG - 0.5) - 0.5) / max(fwidth(gG), vec2(1e-5));
float gLine = (1.0 - clamp(min(gGd.x, gGd.y), 0.0, 1.0)) * (1.0 - smoothstep(70.0, 82.0, abs(gLat)));
gOcean += uGridColor * gLine * uGrid * (1.0 - gM.g);
diffuseColor.rgb = mix(gOcean, uLand * (0.92 + 0.08 * gM.g), gLand);
`;

/** Porcelain-and-graphite globe material (MeshPhysicalMaterial + land mask shader). */
function globeMaterial(world, japan) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.44,
    metalness: 0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.0,
  });
  const u = {
    uWorld: { value: world },
    uJapan: { value: japan },
    uWorldTexel: { value: new THREE.Vector2(1 / 2048, 1 / 1024) },
    uJapanTexel: { value: new THREE.Vector2(1 / 1408, 1 / 1464) },
    uJapanBox: { value: new THREE.Vector4(JP_BOX.lon0, JP_BOX.lat0, JP_BOX.lon1 - JP_BOX.lon0, JP_BOX.lat1 - JP_BOX.lat0) },
    uOcean: { value: new THREE.Color('#141c28') },
    uShelf: { value: new THREE.Color('#25354a') },
    uLand: { value: new THREE.Color('#ddd4c4') },
    uGridColor: { value: new THREE.Color(0.055, 0.04, 0.028) },
    uRimColor: { value: new THREE.Color(0.5, 0.62, 0.85) },
    uKeyDir: { value: new THREE.Vector3(-0.5, 0.5, 0.7).normalize() },
    uRelief: { value: 0.009 },
    uGrid: { value: 1 },
    uCast: { value: 0.55 },
    uCastLen: { value: 0.3 },
    uRadius: { value: R },
    uRim: { value: 0.05 },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vGeoUv;
varying vec3 vEastV;
varying vec3 vNorthV;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vGeoUv = uv;
vec3 gN = normalize(position);
vec3 gE = vec3(gN.z, 0.0, -gN.x);
float gEl = length(gE);
gE = gEl > 1e-5 ? gE / gEl : vec3(1.0, 0.0, 0.0);
vEastV = normalize(normalMatrix * gE);
vNorthV = normalize(normalMatrix * cross(gN, gE));`
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLOBE_PARS}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${GLOBE_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.5, 0.34, gLand);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal - gPert);')
      .replace(
        '#include <clearcoat_normal_fragment_maps>',
        `#include <clearcoat_normal_fragment_maps>
#ifdef USE_CLEARCOAT
clearcoatNormal = normalize(clearcoatNormal - gPert * 0.8);
#endif`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
float gFr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
totalEmissiveRadiance += uRimColor * gFr * uRim;`
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
material.clearcoat *= mix(0.6, 1.0, gLand);
material.clearcoatRoughness = mix(0.2, 0.12, gLand);
#endif`
      );
  };
  m.customProgramCacheKey = () => 'tdk-globe-v1';
  m.globe = u;
  return m;
}

/** Copper arc that draws itself (uTail..uReveal along the tube) with a warm travelling highlight. */
function arcMaterial(base) {
  const m = base.clone();
  const u = {
    uReveal: { value: 0 },
    uTail: { value: 0 },
    uFlow: { value: 0 },
    uGlow: { value: 1 },
    uHot: { value: new THREE.Color(1.0, 0.6, 0.3) },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vArcU;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvArcU = uv.x;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vArcU;\nuniform float uReveal, uTail, uFlow, uGlow;\nuniform vec3 uHot;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vArcU > uReveal || vArcU < uTail) discard;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
float arcHead = exp(-pow((uReveal - vArcU) * 26.0, 2.0)) * (1.0 - step(0.999, uReveal));
float arcD = fract(vArcU - uFlow + 0.5) - 0.5;
float arcFlow = exp(-arcD * arcD * 160.0) * step(0.999, uReveal);
totalEmissiveRadiance += uHot * (arcHead * 2.4 + arcFlow * 0.55) * uGlow;`
      );
  };
  m.customProgramCacheKey = () => 'tdk-arc-v1';
  m.arc = u;
  return m;
}

/** Shadow-map depth material honouring the arc's reveal window. */
function arcDepthMaterial(u) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (s) => {
    s.uniforms.uReveal = u.uReveal;
    s.uniforms.uTail = u.uTail;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vArcU;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvArcU = uv.x;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vArcU;\nuniform float uReveal, uTail;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vArcU > uReveal || vArcU < uTail) discard;');
  };
  m.customProgramCacheKey = () => 'tdk-arc-depth-v1';
  return m;
}

/** Great-circle arc from a to b (unit vectors) lifted above the globe. */
function greatCircle(a, b, lift, n = 80) {
  const ang = a.angleTo(b);
  const s = Math.sin(ang);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3()
      .copy(a)
      .multiplyScalar(Math.sin((1 - t) * ang) / s)
      .addScaledVector(b, Math.sin(t * ang) / s);
    p.normalize().multiplyScalar(R + 0.006 + lift * Math.sin(Math.PI * t));
    pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}

/* ------------------------------------------------------------------ chapter */

export class Global extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.env = 'space';
    this.exposure = 1.0;
    this.shift = 0.2;
    this.look = { bloom: 0.12, threshold: 1.0, vignette: 0.42, saturation: 1.03 };
    this.view = { lat: VIEWS[0].lat, lon: VIEWS[0].lon };
    this.spinLon = VIEWS[0].lon;
    this.worldPopped = false;
  }

  build() {
    const M = materials();
    const q = this.app.quality.tier;
    this.addBackdrop({ top: '#101216', bottom: '#040506', glow: '#1b2330', glowPos: [0.7, 0.52], glowSize: 0.5, glowStrength: 0.9 });
    this.addDust({ count: 260, radius: 7, height: 6, size: 0.04, opacity: 0.3, seed: 141 });

    /* --- lights ---------------------------------------------------------------- */
    this.keyDir = new THREE.Vector3(-0.55, 0.45, 0.7).normalize();
    this.keyDirGoal = this.keyDir.clone();
    this.focus = new THREE.Vector3();
    this.key = new THREE.DirectionalLight(0xfff0de, 3.2);
    this.key.castShadow = q.shadows;
    if (q.shadows) {
      this.key.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      const sc = this.key.shadow.camera;
      sc.near = 1;
      sc.far = 24;
      this.key.shadow.bias = -0.0004;
      this.key.shadow.normalBias = 0.012;
      this.key.shadow.radius = 3;
    }
    this.shadowSize = 2.6;
    this.scene.add(this.key, this.key.target);
    const rim = new THREE.DirectionalLight(0xc9d8ff, 2.2);
    rim.position.set(6, 3, -7);
    this.scene.add(rim, new THREE.HemisphereLight(0xfff0e4, 0x0a0b0d, 0.22));
    this.chinaSpot = new THREE.SpotLight(0xffe2c2, 0, 0, 0.2, 0.85, 0);
    this.scene.add(this.chinaSpot, this.chinaSpot.target);

    /* --- globe ----------------------------------------------------------------- */
    this.tilt = new THREE.Group();
    this.spin = new THREE.Group();
    this.tilt.add(this.spin);
    this.scene.add(this.tilt);
    const aniso = Math.min(8, this.app.renderer.capabilities.getMaxAnisotropy());
    const loader = new THREE.TextureLoader();
    const world = loader.load(landUrl, (t) => this.globeMat.globe.uWorldTexel.value.set(1 / t.image.width, 1 / t.image.height));
    world.wrapS = THREE.RepeatWrapping;
    world.wrapT = THREE.ClampToEdgeWrapping;
    world.anisotropy = aniso;
    const japan = loader.load(japanUrl, (t) => this.globeMat.globe.uJapanTexel.value.set(1 / t.image.width, 1 / t.image.height));
    japan.wrapS = japan.wrapT = THREE.ClampToEdgeWrapping;
    japan.anisotropy = aniso;
    this.tracker.track(world);
    this.tracker.track(japan);
    this.globeMat = globeMaterial(world, japan);
    this.tracker.track(this.globeMat);
    this.globe = new THREE.Mesh(new THREE.SphereGeometry(R, 192, 96), this.globeMat);
    this.globe.receiveShadow = true;
    this.spin.add(this.globe);

    this.buildPins(M);
    this.buildColumns(M);
    this.buildArcs(M);
    this.buildJapan(M);

    /* --- labels ---------------------------------------------------------------- */
    REGIONS.forEach((r, i) => {
      const p = ll(r.lat, r.lon, R + 0.02);
      this.label({
        text: r.text,
        sub: r.sub,
        anchor: (out) => this.spin.localToWorld(out.copy(p)),
        offset: r.off,
        when: () => this.step === 0 && this.stepTime > 1.8 + i * 0.25 && this.facing(p) > 0.28,
      });
    });
    this.applyView();
  }

  /* ------------------------------------------------------------------ pins */
  buildPins(M) {
    const needleGeo = new THREE.CylinderGeometry(0.0055, 0.002, 0.15, 6, 1);
    needleGeo.translate(0, 0.075, 0);
    const headGeo = new THREE.SphereGeometry(0.034, 18, 12);
    headGeo.translate(0, 0.166, 0);
    const decalGeo = new THREE.PlaneGeometry(0.15, 0.15);
    decalGeo.rotateX(-Math.PI / 2);
    decalGeo.translate(0, 0.003, 0);
    [needleGeo, headGeo, decalGeo].forEach((g) => this.tracker.track(g));
    const headMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.26, clearcoat: 0.6, clearcoatRoughness: 0.12, envMapIntensity: 1.2 });
    const shadowTex = canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.8)');
      g.addColorStop(0.3, 'rgba(0,0,0,0.42)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { srgb: false });
    shadowTex.wrapS = shadowTex.wrapT = THREE.ClampToEdgeWrapping;
    const decalMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: shadowTex, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    [headMat, shadowTex, decalMat].forEach((x) => this.tracker.track(x));

    const pins = SITES.map(([name, lat, lon, flags]) => {
      const n = ll(lat, lon);
      return {
        name,
        flags,
        n,
        pos: n.clone().multiplyScalar(R),
        quat: new THREE.Quaternion().setFromUnitVectors(UP, n),
        k: 0,
        k0: 0,
        on: false,
        at: 0,
      };
    });
    this.pins = pins;
    const N = pins.length;
    this.needles = new THREE.InstancedMesh(needleGeo, M.nickel, N);
    this.heads = new THREE.InstancedMesh(headGeo, headMat, N);
    this.decals = new THREE.InstancedMesh(decalGeo, decalMat, N);
    // One matrix buffer drives needle, head and contact shadow.
    this.heads.instanceMatrix = this.needles.instanceMatrix;
    this.decals.instanceMatrix = this.needles.instanceMatrix;
    const copper = new THREE.Color(0xc98656);
    const gold = new THREE.Color(0xe3b868);
    pins.forEach((p, i) => this.heads.setColorAt(i, p.name === '東京・本社' ? gold : copper));
    for (const m of [this.needles, this.heads, this.decals]) {
      m.frustumCulled = false;
      for (let i = 0; i < N; i++) m.setMatrixAt(i, _zero);
      this.spin.add(m);
    }
    this.needles.castShadow = this.heads.castShadow = true;
    this.decals.renderOrder = 2;
    this.pinScale = PIN_SCALE[0];
  }

  pinWanted(p, step) {
    if (p.flags.includes('o')) return step !== 3;
    if (p.flags.includes('w')) return true;
    return step === 3;
  }

  /** Schedule pin pop-ups for a step: world pins radiate from the view centre on first entry. */
  schedulePins(step) {
    const center = ll(this.view.lat, this.view.lon);
    const first = !this.worldPopped;
    const akita = ll(39.25, 139.91);
    for (const p of this.pins) {
      const want = this.pinWanted(p, step);
      if (want && !p.on) {
        let delay = 0.25 + Math.random() * 0.3;
        if (first && p.flags.includes('w')) delay = 0.55 + (p.n.angleTo(center) / Math.PI) * 2.4;
        else if (step === 3 && !p.flags.includes('w')) delay = 1.1 + p.n.angleTo(akita) * 9;
        p.on = true;
        p.at = this.time + delay;
        p.k0 = p.k;
      } else if (!want) p.on = false;
    }
    this.worldPopped = true;
  }

  updatePins(dt) {
    let dirty = false;
    const sc = this.pinScale;
    for (let i = 0; i < this.pins.length; i++) {
      const p = this.pins[i];
      let k;
      if (p.on) {
        const u = clamp01((this.time - p.at) / 0.6);
        k = u >= 1 ? 1 : Math.max(p.k0, easeOutBack(u, 1.7));
      } else k = p.k < 0.002 ? 0 : damp(p.k, 0, 9, dt);
      if (k !== p.k || this.pinScaleDirty) {
        p.k = k;
        dirty = true;
        if (k <= 0) this.needles.setMatrixAt(i, _zero);
        else {
          const s = k * sc;
          _m4.compose(p.pos, p.quat, _s.set(s, s, s));
          this.needles.setMatrixAt(i, _m4);
        }
      }
    }
    this.pinScaleDirty = false;
    if (dirty) this.needles.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ China */
  buildColumns(M) {
    const fillGeo = new THREE.CylinderGeometry(0.052, 0.052, 1, 48, 1);
    fillGeo.translate(0, 0.5, 0);
    const capGeo = new THREE.SphereGeometry(0.052, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    capGeo.scale(1, 0.32, 1);
    const sleeveGeo = new THREE.CylinderGeometry(0.075, 0.075, H100, 48, 1, true);
    sleeveGeo.translate(0, H100 / 2, 0);
    const rimGeo = new THREE.TorusGeometry(0.075, 0.0055, 10, 64);
    rimGeo.rotateX(Math.PI / 2);
    const tickGeo = new THREE.TorusGeometry(0.0765, 0.0022, 6, 64);
    tickGeo.rotateX(Math.PI / 2);
    const collarGeo = new THREE.CylinderGeometry(0.1, 0.118, 0.034, 48);
    [fillGeo, capGeo, sleeveGeo, rimGeo, tickGeo, collarGeo].forEach((g) => this.tracker.track(g));
    const copper = new THREE.MeshPhysicalMaterial({ color: 0xc8845a, metalness: 1, roughness: 0.24, clearcoat: 0.5, clearcoatRoughness: 0.15 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.2,
      depthWrite: false,
    });
    [copper, glass].forEach((m) => this.tracker.track(m));
    this.cols = COLS.map((c, i) => {
      const g = new THREE.Group();
      const n = ll(c.lat, c.lon);
      g.position.copy(n).multiplyScalar(R);
      g.quaternion.setFromUnitVectors(UP, n);
      g.scale.setScalar(0.0001);
      this.spin.add(g);
      const mat = c.copper ? copper : M.porcelain;
      const fill = new THREE.Mesh(fillGeo, mat);
      const cap = new THREE.Mesh(capGeo, mat);
      const sleeve = new THREE.Mesh(sleeveGeo, glass);
      sleeve.renderOrder = 3;
      const rimTop = new THREE.Mesh(rimGeo, M.nickel);
      rimTop.position.y = H100;
      const collar = new THREE.Mesh(collarGeo, M.anodizedDark);
      g.add(fill, cap, sleeve, rimTop, collar);
      for (const f of [0.25, 0.5, 0.75]) {
        const t = new THREE.Mesh(tickGeo, M.nickel);
        t.position.y = H100 * f;
        t.scale.setScalar(f === 0.5 ? 1.0 : 0.995);
        g.add(t);
      }
      fill.castShadow = cap.castShadow = collar.castShadow = true;
      const col = { g, fill, cap, h: (H100 * c.pct) / 100, k: 0, show: 0 };
      this.label({
        text: c.text,
        sub: c.sub,
        cls: 'big',
        anchor: (out) => g.localToWorld(out.set(0, Math.max(0.02, col.fill.scale.y) + 0.03, 0)),
        offset: i === 0 ? [-46, -30] : [46, -34],
        when: () => this.step === 1 && this.stepTime > 2.3 + i * 0.35,
      });
      return col;
    });
    // The spotlight's aim point between the two columns.
    this.chinaPoint = ll(31.5, 110, R);
    this.jpCenter = ll(37, 138.5, R);
  }

  updateColumns(dt) {
    const st = this.stepTime;
    this.cols.forEach((c, i) => {
      const on = this.step === 1;
      c.show = damp(c.show, on ? 1 : 0, on ? 5 : 4, dt);
      const grow = on ? easeOutCubic(clamp01((st - 1.0 - i * 0.35) / 1.6)) : 0;
      c.k = on ? Math.max(c.k, grow) : damp(c.k, 0, 4, dt);
      const s = Math.max(0.0001, easeOutCubic(clamp01(c.show)));
      c.g.scale.setScalar(s);
      c.g.visible = s > 0.002;
      const h = Math.max(0.0005, c.h * c.k);
      c.fill.scale.y = h;
      c.cap.position.y = h;
      c.cap.visible = h > 0.004;
    });
  }

  /* ------------------------------------------------------------------ M&A arcs */
  buildArcs(M) {
    const tokyo = ll(TOKYO[0], TOKYO[1]);
    const base = new THREE.MeshStandardMaterial({ color: 0xc8845a, metalness: 1, roughness: 0.3, envMapIntensity: 1.15, emissive: 0x000000 });
    this.tracker.track(base);
    const ringGeo = new THREE.TorusGeometry(0.034, 0.0045, 8, 40);
    ringGeo.rotateX(Math.PI / 2);
    this.tracker.track(ringGeo);
    this.deals = DEALS.map((d, i) => {
      const a = ll(d.lat, d.lon);
      const ang = a.angleTo(tokyo);
      const lift = (0.05 + 0.24 * (ang / Math.PI)) * R * d.lift;
      const curve = greatCircle(a, tokyo, lift);
      const geo = new THREE.TubeGeometry(curve, 180, 0.013, 8, false);
      this.tracker.track(geo);
      const mat = arcMaterial(base);
      this.tracker.track(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.customDepthMaterial = arcDepthMaterial(mat.arc);
      this.tracker.track(mesh.customDepthMaterial);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.spin.add(mesh);
      const ring = new THREE.Mesh(ringGeo, M.copper);
      ring.position.copy(a).multiplyScalar(R + 0.002);
      ring.quaternion.setFromUnitVectors(UP, a);
      ring.scale.setScalar(0.0001);
      this.spin.add(ring);
      const src = a.clone().multiplyScalar(R + 0.03);
      const deal = { ...d, mesh, mat, ring, src, a, t0: DEAL_T0 + i * DEAL_DT, rev: 0, tail: 0, ringK: 0, labelOn: false };
      this.label({
        text: `${d.year}　${d.name}`,
        sub: `${d.place}｜${d.field}`,
        anchor: (out) => this.spin.localToWorld(out.copy(src)),
        offset: d.off,
        when: () => this.step === 2 && deal.labelOn && this.facing(src) > 0.02,
      });
      return deal;
    });
    // Tokyo hub where every arc lands.
    const hub = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 10, 48), M.brass);
    hub.geometry.rotateX(Math.PI / 2);
    hub.position.copy(tokyo).multiplyScalar(R + 0.002);
    hub.quaternion.setFromUnitVectors(UP, tokyo);
    hub.scale.setScalar(0.0001);
    this.spin.add(hub);
    this.hub = hub;
    this.hubK = 0;
    const tokyoTop = tokyo.clone().multiplyScalar(R + 0.04);
    this.label({
      text: '東京',
      sub: '本社',
      anchor: (out) => this.spin.localToWorld(out.copy(tokyoTop)),
      offset: [36, 30],
      when: () => this.step === 2 && this.stepTime > 1.6 && this.facing(tokyoTop) > 0.1,
    });
  }

  updateArcs(dt) {
    const st = this.stepTime;
    const on = this.step === 2;
    let pulse = 0;
    for (const d of this.deals) {
      if (on) {
        d.rev = easeInOutCubic(clamp01((st - d.t0) / DEAL_DRAW));
        d.tail = 0;
        const land = st - d.t0 - DEAL_DRAW;
        if (land > 0) pulse = Math.max(pulse, Math.exp(-land * 2.5));
      } else if (d.rev > 0) {
        // Leaving the step: the arcs run into Tokyo and vanish.
        d.tail = Math.min(1, d.tail + dt * 1.4);
        if (d.tail >= d.rev - 0.001) d.rev = d.tail = 0;
      }
      d.ringK = damp(d.ringK, on && st > d.t0 ? 1 : 0, 6, dt);
      d.ring.scale.setScalar(Math.max(0.0001, d.ringK));
      d.mesh.visible = d.rev > 0.001;
      const u = d.mat.arc;
      u.uReveal.value = d.rev;
      u.uTail.value = d.tail;
      u.uFlow.value = (this.time * 0.22 + d.t0 * 0.37) % 1;
    }
    this.hubK = damp(this.hubK, on ? 1 : 0, 5, dt);
    this.hub.scale.setScalar(Math.max(0.0001, this.hubK * (1 + pulse * 0.35)));
    // Labels: the newest two arcs; an older one yields when a newer one is close by.
    let a = -1, b = -1;
    this.deals.forEach((d, i) => {
      d.labelOn = false;
      if (on && st > d.t0 + 0.35) {
        a = b;
        b = i;
      }
    });
    if (b >= 0) this.deals[b].labelOn = true;
    if (a >= 0 && this.deals[a].a.angleTo(this.deals[b].a) > 0.3) this.deals[a].labelOn = true;
  }

  /* ------------------------------------------------------------------ Japan */
  buildJapan(M) {
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xe6bd72, metalness: 1, roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.1, emissive: 0xffa860, emissiveIntensity: 0.0 });
    const glassHead = new THREE.MeshPhysicalMaterial({ color: 0xf4efe6, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.5, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false });
    this.pulseMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.45), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    [gold, glassHead, this.pulseMat].forEach((m) => this.tracker.track(m));
    this.goldMat = gold;

    const marker = (lat, lon) => {
      const g = new THREE.Group();
      const n = ll(lat, lon);
      g.position.copy(n).multiplyScalar(R);
      g.quaternion.setFromUnitVectors(UP, n);
      g.scale.setScalar(0.0001);
      this.spin.add(g);
      return g;
    };
    const needleGeo = new THREE.CylinderGeometry(0.0013, 0.0007, 0.05, 8);
    needleGeo.translate(0, 0.025, 0);
    this.tracker.track(needleGeo);

    // Akita (Nikaho): the origin — a gold pin inside a gold ring, with a slow ripple.
    const akita = marker(39.25, 139.91);
    const aNeedle = new THREE.Mesh(needleGeo, M.nickel);
    const aHead = new THREE.Mesh(new THREE.SphereGeometry(0.0082, 24, 16), gold);
    aHead.position.y = 0.055;
    const aRing = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0016, 8, 72), gold);
    aRing.geometry.rotateX(Math.PI / 2);
    aRing.position.y = 0.001;
    const aPulse = new THREE.Mesh(new THREE.RingGeometry(0.0255, 0.0285, 72), this.pulseMat);
    aPulse.geometry.rotateX(-Math.PI / 2);
    aPulse.position.y = 0.0015;
    akita.add(aNeedle, aHead, aRing, aPulse);
    [aNeedle, aHead, aRing].forEach((m) => (m.castShadow = true));
    this.akita = { g: akita, pulse: aPulse, k: 0 };

    // Niigata (Ojiya): planned plant — a translucent head and a dashed, turning ring.
    const ojiya = marker(37.31, 138.79);
    const oNeedle = new THREE.Mesh(needleGeo, M.nickel);
    oNeedle.scale.y = 0.85;
    const oHead = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 24, 16), glassHead);
    oHead.position.y = 0.0475;
    const dashes = new THREE.Group();
    const dashGeo = new THREE.BoxGeometry(0.0085, 0.0012, 0.0026);
    this.tracker.track(dashGeo);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const d = new THREE.Mesh(dashGeo, M.porcelain);
      d.position.set(Math.cos(a) * 0.023, 0.001, Math.sin(a) * 0.023);
      d.rotation.y = -a + Math.PI / 2;
      dashes.add(d);
    }
    ojiya.add(oNeedle, oHead, dashes);
    oNeedle.castShadow = true;
    this.ojiya = { g: ojiya, dashes, k: 0 };

    const aTop = ll(39.25, 139.91, R + 0.062);
    const oTop = ll(37.31, 138.79, R + 0.054);
    this.label({
      text: '秋田・にかほ',
      sub: '創業者の故郷・1940年 平沢工場',
      cls: 'big',
      anchor: (out) => this.spin.localToWorld(out.copy(aTop)),
      offset: [-48, -34],
      when: () => this.step === 3 && this.stepTime > 1.9,
    });
    this.label({
      text: '新潟・小千谷',
      sub: '2029年 新工場予定',
      anchor: (out) => this.spin.localToWorld(out.copy(oTop)),
      offset: [-44, 30],
      when: () => this.step === 3 && this.stepTime > 2.6,
    });
  }

  updateJapan(dt) {
    const st = this.stepTime;
    const on = this.step === 3;
    const a = this.akita, o = this.ojiya;
    a.k = on ? Math.max(a.k, easeOutBack(clamp01((st - 0.9) / 0.7), 1.6)) : damp(a.k, 0, 8, dt);
    o.k = on ? Math.max(o.k, easeOutBack(clamp01((st - 1.9) / 0.7), 1.6)) : damp(o.k, 0, 8, dt);
    a.g.scale.setScalar(Math.max(0.0001, a.k));
    o.g.scale.setScalar(Math.max(0.0001, o.k));
    a.g.visible = a.k > 0.002;
    o.g.visible = o.k > 0.002;
    // Ripple from the origin.
    const ph = (this.time * 0.45) % 1;
    a.pulse.scale.setScalar(1 + ph * 2.2);
    this.pulseMat.opacity = on ? 0.55 * (1 - ph) * (1 - ph) * a.k : 0;
    this.goldMat.emissiveIntensity = on ? 0.18 + 0.12 * Math.sin(this.time * 1.6) : 0;
    o.dashes.rotation.y = this.time * 0.35;
  }

  /* ------------------------------------------------------------------ camera & view */
  poses() {
    return [
      { pos: [0, 0.6, 10.0], target: [0, 0.05, 0], fov: 30, dur: 2.4 },
      { pos: [0, 2.3, 8.4], target: [0, 1.25, 0.4], fov: 30, dur: 2.8 },
      { pos: [0, 0.5, 10.4], target: [0, 0.1, 0], fov: 30, dur: 2.8 },
      { pos: [0, 1.33, 2.62], target: [0, 1.29, 1.53], fov: 30, dur: 3.0 },
    ];
  }

  onStep(step, instant) {
    if (step === 0) this.spinLon = this.view.lon;
    if (instant) {
      if (step !== 0) {
        this.view.lat = VIEWS[step].lat;
        this.view.lon = VIEWS[step].lon;
      }
      this.applyView();
    }
    this.schedulePins(step);
    this.pinScaleGoal = PIN_SCALE[step];
    if (instant) {
      this.pinScale = this.pinScaleGoal;
      this.pinScaleDirty = true;
    }
    // Key light: high front-left on the globe; raking from the west for the relief of Japan.
    this.keyDirGoal.set(...(step === 3 ? [-0.82, 0.5, 0.28] : [-0.55, 0.45, 0.7])).normalize();
    if (instant) this.keyDir.copy(this.keyDirGoal);
  }

  /** Tilt/spin the globe so that (view.lat, view.lon) faces +Z. */
  applyView() {
    this.tilt.rotation.x = this.view.lat * DEG;
    this.spin.rotation.y = -(this.view.lon + 90) * DEG;
  }

  /** Cosine between the globe normal at a local point and the direction to the camera. */
  facing(local) {
    this.spin.localToWorld(_w.copy(local));
    _v.copy(_w).normalize();
    _c.copy(this.camera.position).sub(_w).normalize();
    return _v.dot(_c);
  }

  tick(dt, t) {
    const step = this.step;
    // Globe orientation.
    if (step === 0) this.spinLon -= SPIN * dt;
    const goalLat = VIEWS[step].lat;
    const goalLon = step === 0 ? this.spinLon : VIEWS[step].lon;
    const k = 1 - Math.exp(-1.7 * dt);
    const dLon = ((((goalLon - this.view.lon) % 360) + 540) % 360) - 180;
    this.view.lon += dLon * k;
    this.view.lat += (goalLat - this.view.lat) * k;
    this.applyView();
    this.tilt.updateMatrixWorld(true);

    // Pins.
    if (this.pinScaleGoal !== undefined && Math.abs(this.pinScale - this.pinScaleGoal) > 1e-4) {
      this.pinScale = damp(this.pinScale, this.pinScaleGoal, 2.4, dt);
      this.pinScaleDirty = true;
    }
    this.updatePins(dt);
    this.updateColumns(dt);
    this.updateArcs(dt);
    this.updateJapan(dt);

    // Key light follows the focus (globe centre, or Japan up close).
    this.keyDir.lerp(this.keyDirGoal, 1 - Math.exp(-2 * dt)).normalize();
    this.to('jpFocus', step === 3 ? 1 : 0);
    const jf = this.param('jpFocus');
    this.spin.localToWorld(_w.copy(this.jpCenter));
    this.focus.set(0, 0, 0).lerp(_w, jf);
    this.key.target.position.copy(this.focus);
    this.key.position.copy(this.focus).addScaledVector(this.keyDir, 10);
    const sz = 2.6 + (0.75 - 2.6) * jf;
    if (this.key.castShadow && Math.abs(sz - this.shadowSize) > 1e-3) {
      const sc = this.key.shadow.camera;
      sc.left = sc.bottom = -sz;
      sc.right = sc.top = sz;
      sc.updateProjectionMatrix();
      this.shadowSize = sz;
    }
    this.key.intensity = 3.2 - 1.0 * this.param('china');
    _v.copy(this.keyDir).transformDirection(this.camera.matrixWorldInverse);
    this.globeMat.globe.uKeyDir.value.copy(_v);
    // Shorter cast shadows on the world view, longer raking ones over Japan.
    this.globeMat.globe.uCastLen.value = 0.3 - 0.18 * jf;

    // China spotlight: the "stage".
    this.to('china', step === 1 ? 1 : 0);
    const ch = this.param('china');
    this.spin.localToWorld(_w.copy(this.chinaPoint));
    this.chinaSpot.target.position.copy(_w);
    _v.copy(_w).normalize();
    this.chinaSpot.position.copy(_w).addScaledVector(_v, 5).add(_c.set(-1.6, 1.4, 1.2));
    this.chinaSpot.intensity = ch * 4.5;
    this.backdrop.material.uniforms.uGlowStrength.value = 0.9 + ch * 0.3;
  }

  dispose() {
    for (const m of [this.needles, this.heads, this.decals]) m?.dispose();
    super.dispose();
  }
}
