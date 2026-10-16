// Data-sculpture helpers: an annular segment whose start/end angles, radii and
// height are uniforms (so ring charts can morph between datasets on the GPU).
import * as THREE from 'three';

/**
 * Normalised arc-segment geometry. position.x = angle fraction u (0..1),
 * position.y = height fraction (0..1), position.z = radius fraction (0..1);
 * attribute aN = profile normal (nr, ny), aCap = -1/0/+1 for start cap/side/end cap.
 */
export function arcSegmentGeometry({ segments = 64, bevel = 0.08, bevelSeg = 3 } = {}) {
  // Rounded-rectangle profile in (r, y) unit square, counter-clockwise.
  const prof = [];
  const b = bevel;
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= bevelSeg; i++) {
      const a = a0 + (i / bevelSeg) * (Math.PI / 2);
      prof.push({ r: cx + Math.cos(a) * b, y: cy + Math.sin(a) * b, nr: Math.cos(a), ny: Math.sin(a) });
    }
  };
  corner(1 - b, b, -Math.PI / 2);
  corner(1 - b, 1 - b, 0);
  corner(b, 1 - b, Math.PI / 2);
  corner(b, b, Math.PI);
  prof.push({ ...prof[0] });
  const pos = [], an = [], cap = [], idx = [];
  const P = prof.length;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    for (const p of prof) {
      pos.push(u, p.y, p.r);
      an.push(p.nr, p.ny);
      cap.push(0);
    }
  }
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < P - 1; j++) {
      const a = i * P + j, c = a + P;
      idx.push(a, a + 1, c, c, a + 1, c + 1);
    }
  // Caps: fan from the profile centroid.
  for (const [u, sgn] of [[0, -1], [1, 1]]) {
    const base = pos.length / 3;
    pos.push(u, 0.5, 0.5);
    an.push(0, 0);
    cap.push(sgn);
    for (const p of prof) {
      pos.push(u, p.y, p.r);
      an.push(0, 0);
      cap.push(sgn);
    }
    for (let j = 0; j < P - 1; j++) {
      if (sgn < 0) idx.push(base, base + 1 + j + 1, base + 1 + j);
      else idx.push(base, base + 1 + j, base + 1 + j + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0), 3));
  g.setAttribute('aN', new THREE.Float32BufferAttribute(an, 2));
  g.setAttribute('aCap', new THREE.Float32BufferAttribute(cap, 1));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
  return g;
}

/** Clone a lit material and drive its vertices with arc uniforms. */
export function arcMaterial(base) {
  const m = base.clone();
  const u = {
    uA0: { value: 0 },
    uA1: { value: 1 },
    uR0: { value: 1 },
    uR1: { value: 1.6 },
    uH: { value: 0.3 },
    uY: { value: 0 },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aN;\nattribute float aCap;\nuniform float uA0, uA1, uR0, uR1, uH, uY;')
      .replace(
        '#include <beginnormal_vertex>',
        `float arcA = mix(uA0, uA1, position.x);
        vec3 objectNormal = aCap == 0.0
          ? vec3(cos(arcA) * aN.x, aN.y, sin(arcA) * aN.x)
          : vec3(-sin(arcA), 0.0, cos(arcA)) * aCap;
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(0.0, 1.0, 0.0);
        #endif`
      )
      .replace('#include <begin_vertex>', ARC_BEGIN);
  };
  m.customProgramCacheKey = () => 'arc-v1';
  m.arc = u;
  m.arcDepth = arcDepthMaterial(u);
  return m;
}

const ARC_BEGIN = `float arcAp = mix(uA0, uA1, position.x);
        float arcR = mix(uR0, uR1, position.z);
        vec3 transformed = vec3(cos(arcAp) * arcR, uY + position.y * uH, sin(arcAp) * arcR);
        #ifdef USE_ALPHAHASH
          vPosition = vec3( position );
        #endif`;

/** Depth material sharing the arc uniforms, so shadows match the morphing shape. */
export function arcDepthMaterial(u) {
  const m = new THREE.MeshDepthMaterial();
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uA0, uA1, uR0, uR1, uH, uY;')
      .replace('#include <begin_vertex>', ARC_BEGIN);
  };
  m.customProgramCacheKey = () => 'arc-depth-v1';
  return m;
}
