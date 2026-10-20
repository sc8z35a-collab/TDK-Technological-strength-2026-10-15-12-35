// CH.04 By the numbers — a bright white studio with porcelain data sculptures:
// a 70-year skyline of sales, FY2026 vs FY2025 pairs, a ring chart that morphs
// from business segments to regions/markets, and a ranking of Japan's
// largest electronic-component makers.
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials, roundedBox, textPlane } from '../core/kit.js';
import { arcSegmentGeometry, arcMaterial } from '../core/charts.js';
import { clamp01, easeOutCubic, easeInOutCubic, smoothstep, damp, lerp } from '../core/math.js';

export const SALES = [
  [1956, 5.53], [1957, 8.25], [1958, 11.93], [1959, 24.38], [1961, 32.6], [1962, 39.3], [1963, 43], [1964, 55.7], [1965, 58.3],
  [1966, 93.3], [1967, 112], [1968, 176], [1969, 278], [1970, 311], [1971, 296], [1972, 379], [1973, 516], [1974, 560], [1975, 515],
  [1976, 829], [1977, 952], [1978, 1156], [1979, 1442], [1980, 1882], [1981, 2313], [1982, 2607], [1983, 3099], [1984, 3652],
  [1992, 5348], [1993, 5263], [1994, 4573], [1995, 4851], [1996, 5414], [1997, 6206], [1998, 6966], [1999, 6762], [2000, 6744],
  [2001, 6899], [2002, 5642], [2003, 6048], [2004, 6557], [2005, 6578], [2006, 7951], [2007, 8620], [2008, 8662], [2009, 7274],
  [2010, 8088], [2011, 8719], [2012, 8025], [2013, 8418], [2014, 9845], [2015, 10825], [2016, 11522], [2017, 11782], [2018, 12717],
  [2019, 13818], [2020, 13630], [2021, 14790], [2022, 19021], [2023, 21808], [2024, 21039], [2025, 22048], [2026, 25048],
];

const SKY = { x0: -4.3, x1: 4.3, y0: 1956, y1: 2026, H: 3.3 };
const skyX = (y) => SKY.x0 + ((y - SKY.y0) / (SKY.y1 - SKY.y0)) * (SKY.x1 - SKY.x0);

const ST = { pair: 11, ring: 21, rank: 30 };

const DATASETS = {
  segments: [
    ['エナジー応用製品', 54.7, 'copper'],
    ['受動部品', 23.7, 'porcelain'],
    ['磁気応用製品', 10.5, 'steel'],
    ['センサ応用製品', 9.0, 'graphite'],
    ['その他', 2.1, 'pale'],
  ],
  regions: [
    ['中国', 55.0, 'copper'],
    ['アジア・その他', 24.6, 'brass'],
    ['日本', 7.3, 'porcelain'],
    ['欧州', 7.2, 'steel'],
    ['米州', 5.8, 'graphite'],
  ],
  markets: [
    ['ICT', 61.9, 'copper'],
    ['自動車', 18.3, 'steel'],
    ['産業機器', 16.1, 'brass'],
    ['その他', 3.7, 'pale'],
  ],
};

export class Numbers extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.env = 'gallery';
    this.exposure = 0.92;
    this.shift = 0.2;
    this.look = { bloom: 0.05, threshold: 1.4, vignette: 0.16, grain: 0.02, saturation: 1.0, fadeColor: new THREE.Color(0xf2efe9) };
    this.dolly = false;
  }

  build() {
    const M = materials();
    const q = this.app.quality.tier;
    const bg = 0xece8e1;
    this.addBackdrop({ top: '#f6f4f0', bottom: '#e9e4dc', glow: '#ffffff', glowPos: [0.65, 0.7], glowSize: 0.7, glowStrength: 0.25, noise: 0.006 });
    this.scene.fog = new THREE.Fog(bg, 16, 34);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 80), new THREE.MeshStandardMaterial({ color: 0xefebe4, roughness: 0.92 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.add(floor);

    this.sun = new THREE.DirectionalLight(0xfffaf2, 2.2);
    this.sun.position.set(-4, 9, 6);
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    const sc = this.sun.shadow.camera;
    sc.left = -7;
    sc.right = 7;
    sc.top = 7;
    sc.bottom = -7;
    sc.near = 0.5;
    sc.far = 30;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 6;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d0c4, 0.55));
    this.focus = new THREE.Vector3(0, 0, 0);

    const pale = new THREE.MeshPhysicalMaterial({ color: 0xd6d2cb, roughness: 0.5, clearcoat: 0.3 });
    const graphite = new THREE.MeshPhysicalMaterial({ color: 0x2b2d31, roughness: 0.45, metalness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    const copper = new THREE.MeshPhysicalMaterial({ color: 0xc8845a, metalness: 1, roughness: 0.28, clearcoat: 0.4, clearcoatRoughness: 0.2 });
    this.mats = { copper, porcelain: M.porcelain, steel: M.steel, graphite, pale, brass: M.brass };
    [pale, graphite, copper].forEach((m) => this.tracker.track(m));
    const ink = '#3a3d43';

    /* --- skyline -------------------------------------------------------------- */
    // One instanced draw for the 70 years; a graphite → steel → copper ramp
    // reads as time on the white set. The record year is its own copper bar.
    const barGeo = roundedBox(0.09, 1, 0.34, 0.025, 2);
    barGeo.translate(0, 0.5, 0);
    this.tracker.track(barGeo);
    const skyMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.36, metalness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.22 });
    this.tracker.track(skyMat);
    const past = SALES.filter(([y]) => y !== 2026);
    this.skyIM = new THREE.InstancedMesh(barGeo, skyMat, past.length);
    this.skyIM.castShadow = this.skyIM.receiveShadow = true;
    this.skyIM.frustumCulled = false;
    this.add(this.skyIM);
    const RAMP = [[1956, new THREE.Color(0x4a4744)], [1996, new THREE.Color(0x8a8f96)], [2025, new THREE.Color(0xcf9a72)]];
    const tint = (y, out) => {
      const [a, b] = y < RAMP[1][0] ? [RAMP[0], RAMP[1]] : [RAMP[1], RAMP[2]];
      return out.copy(a[1]).lerp(b[1], clamp01((y - a[0]) / (b[0] - a[0])));
    };
    const col = new THREE.Color();
    this.lastBar = new THREE.Mesh(barGeo, copper);
    this.lastBar.position.set(skyX(2026), 0, 0);
    this.lastBar.scale.y = 0.0001;
    this.lastBar.castShadow = this.lastBar.receiveShadow = true;
    this.add(this.lastBar);
    this.bars = SALES.map(([y, v], i) => {
      const last = y === 2026;
      const idx = last ? -1 : past.findIndex((p) => p[0] === y);
      if (!last) this.skyIM.setColorAt(idx, tint(y, col));
      return { idx, x: skyX(y), h: Math.max(0.006, (v / 25048) * SKY.H), t: 0.35 + i * 0.065, y, v, k: 0 };
    });
    this.skyIM.instanceColor.needsUpdate = true;
    this.skyM4 = new THREE.Matrix4();
    const barTop = (y) => {
      const b = this.bars.find((x) => x.y === y);
      return (out) => out.set(b.x, Math.max(0.05, b.h * b.k) + 0.04, 0.17);
    };
    const shown = (y, delay = 0.5) => () => {
      const b = this.bars.find((x) => x.y === y);
      return this.step === 0 && b.k > 0.98 && this.stepTime > b.t + 0.7 + delay;
    };
    this.label({ text: '1966年', sub: '国産初のカセットテープ', anchor: barTop(1966), offset: [-34, -46], when: shown(1966) });
    this.label({ text: '2009年3月期', sub: 'リーマン・ショックで営業赤字', anchor: barTop(2009), offset: [-46, -52], when: shown(2009) });
    this.label({ text: '2026年3月期', sub: '過去最高 2兆5,048億円', anchor: barTop(2026), offset: [-40, 30], when: shown(2026, 0.2), cls: 'big' });
    for (let d = 1960; d <= 2020; d += 10) {
      const tp = textPlane(String(d), { width: 0.7, height: 0.2, px: 256, color: ink, key: `yr${d}` });
      tp.rotation.x = -Math.PI / 2;
      tp.position.set(skyX(d), 0.002, 0.45);
      this.add(tp);
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.002, 0.12), new THREE.MeshBasicMaterial({ color: ink }));
      tick.position.set(skyX(d), 0.001, 0.26);
      this.add(tick);
    }
    const gap = textPlane(['1985–1991', 'データ未確認'], { width: 0.9, height: 0.3, px: 256, color: '#8a8d92', key: 'skygap' });
    gap.rotation.x = -Math.PI / 2;
    gap.position.set(skyX(1988), 0.002, 0.05);
    this.add(gap);

    /* --- FY pairs --------------------------------------------------------------- */
    const pairs = [
      ['売上高', 22048, 25048, '+13.6%'],
      ['営業利益', 2242, 2724, '+21.5%'],
      ['当期利益', 1673, 1957, '+17.0%'],
    ];
    const colGeo = roundedBox(0.5, 1, 0.5, 0.04, 3);
    colGeo.translate(0, 0.5, 0);
    this.tracker.track(colGeo);
    this.pairs = pairs.map(([name, prev, cur, pct], i) => {
      const x = ST.pair - 1.6 + i * 1.6;
      const H = 2.4;
      const a = new THREE.Mesh(colGeo, pale);
      a.position.set(x - 0.3, 0, 0);
      const b = new THREE.Mesh(colGeo, copper);
      b.position.set(x + 0.3, 0, 0);
      [a, b].forEach((m) => {
        m.castShadow = m.receiveShadow = true;
        m.scale.y = 0.0001;
        this.add(m);
      });
      const t = textPlane(name, { width: 1.2, height: 0.26, px: 256, color: ink, key: `pair${name}`, font: '600 80px "IBM Plex Sans JP", sans-serif' });
      t.rotation.x = -Math.PI / 2;
      t.position.set(x, 0.002, 0.62);
      this.add(t);
      this.label({ text: pct, sub: `${name} ${cur.toLocaleString('ja-JP')}億円`, anchor: () => b.localToWorld(new THREE.Vector3(0, 1, 0)), offset: [30, -30], when: () => this.step === 1 && this.stepTime > 1.6 + i * 0.2 });
      return { a, b, ha: (prev / cur) * H, hb: H, i };
    });
    this.label({ text: '2025年3月期', anchor: () => this.pairs[0].a.localToWorld(new THREE.Vector3(0, 0.6, 0.3)), offset: [-60, 40], when: () => this.step === 1 && this.stepTime > 1.4 });
    this.label({ text: '2026年3月期', anchor: () => this.pairs[2].b.localToWorld(new THREE.Vector3(0, 0.5, 0.3)), offset: [50, 50], when: () => this.step === 1 && this.stepTime > 1.4 });

    /* --- ring chart --------------------------------------------------------------- */
    const segGeo = arcSegmentGeometry({ segments: 96 });
    this.tracker.track(segGeo);
    const makeRing = (n, r0, r1, y) =>
      Array.from({ length: n }, () => {
        const mat = arcMaterial(M.porcelain);
        const mesh = new THREE.Mesh(segGeo, mat);
        mesh.customDepthMaterial = mat.arcDepth;
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.position.set(ST.ring, 0, 0);
        mesh.frustumCulled = false;
        this.add(mesh);
        mat.arc.uR0.value = r0;
        mat.arc.uR1.value = r1;
        mat.arc.uY.value = y;
        this.tracker.track(mat);
        return { mesh, mat, cur: { a0: 0, a1: 0, h: 0.0001, mat: 'porcelain' }, tgt: { a0: 0, a1: 0, h: 0.0001 } };
      });
    this.outer = makeRing(5, 1.25, 2.15, 0);
    this.inner = makeRing(4, 0.45, 1.05, 0);
    this.ringLabels = [];
    for (let i = 0; i < 5; i++) {
      const l = this.label({ text: '', sub: '', anchor: (out) => this.segAnchor(this.outer[i], out), offset: [40, -30], when: () => (this.step === 2 || this.step === 3) && this.outer[i].tgt.h > 0.01 && this.ringReady > 1.2 + i * 0.1 });
      this.ringLabels.push(l);
    }
    this.innerLabels = [];
    for (let i = 0; i < 4; i++) {
      const l = this.label({ text: '', sub: '', anchor: (out) => this.segAnchor(this.inner[i], out), offset: [-40, 36], when: () => this.step === 3 && this.inner[i].tgt.h > 0.01 && this.ringReady > 1.6 + i * 0.1 });
      this.innerLabels.push(l);
    }

    /* --- ranking --------------------------------------------------------------------- */
    const rank = [
      ['TDK', 25048, copper],
      ['京セラ', 20702, M.porcelain],
      ['村田製作所', 18309, M.porcelain],
    ];
    this.rank = rank.map(([name, v, mat], i) => {
      const x = ST.rank - 1.5 + i * 1.5;
      const m = new THREE.Mesh(colGeo, mat);
      m.position.set(x, 0, 0);
      m.scale.set(1.5, 0.0001, 1.5);
      m.castShadow = m.receiveShadow = true;
      this.add(m);
      const t = textPlane(name, { width: 1.3, height: 0.3, px: 256, color: ink, key: `rank${name}`, font: '600 84px "IBM Plex Sans JP", sans-serif' });
      t.rotation.x = -Math.PI / 2;
      t.position.set(x, 0.002, 0.85);
      this.add(t);
      this.label({ text: `${name}`, sub: `売上高 ${v.toLocaleString('ja-JP')}億円`, anchor: () => m.localToWorld(new THREE.Vector3(0, 1, 0)), offset: [26, -34], when: () => this.step === 4 && this.stepTime > 1.6 + i * 0.25 });
      return { m, h: (v / 25048) * 2.9, i };
    });
  }

  /** Mid-point on top of a ring segment (world space). */
  segAnchor(seg, out) {
    const a = (seg.cur.a0 + seg.cur.a1) / 2;
    const r = (seg.mat.arc.uR0.value + seg.mat.arc.uR1.value) / 2;
    return out.set(ST.ring + Math.cos(a) * r, seg.cur.h + 0.02, Math.sin(a) * r);
  }

  poses() {
    return [
      { pos: [-6.6, 0.75, 3.6], target: [-3.4, 0.35, 0], fov: 30, dur: 1.6 },
      { pos: [ST.pair + 2.6, 2.6, 7.4], target: [ST.pair, 1.15, 0], fov: 30, dur: 2.6 },
      { pos: [ST.ring + 2.6, 4.6, 6.4], target: [ST.ring, 0.2, 0], fov: 32, dur: 2.6 },
      { pos: [ST.ring - 1.4, 5.6, 5.4], target: [ST.ring, 0.1, 0.1], fov: 33, dur: 2.2 },
      { pos: [ST.rank + 2.3, 2.7, 9.2], target: [ST.rank, 1.35, 0], fov: 30, dur: 2.6 },
    ];
  }

  onStep(step, instant) {
    this.dolly = false;
    const foci = [[0, 0, 0], [ST.pair, 0, 0], [ST.ring, 0, 0], [ST.ring, 0, 0], [ST.rank, 0, 0]];
    this.focusGoal = foci[step];
    if (instant) this.focus.fromArray(foci[step]);
    if (step === 2) this.setRing('segments', null);
    if (step === 3) this.setRing('regions', 'markets');
    if (step < 2 || step > 3) this.setRing(null, null);
    if (step === 2 || step === 3) this.ringReady = 0;
  }

  setRing(outerKey, innerKey) {
    const apply = (ring, key, labels, r0) => {
      const data = key ? DATASETS[key] : null;
      let acc = -Math.PI / 2 - 0.3;
      const gapA = 0.025;
      ring.forEach((seg, i) => {
        const d = data && data[i];
        if (!d) {
          seg.tgt = { a0: seg.cur.a0, a1: seg.cur.a0 + 0.0001, h: 0.0001 };
          return;
        }
        const span = (d[1] / 100) * Math.PI * 2;
        const hl = i === 0;
        seg.tgt = { a0: acc + gapA / 2, a1: acc + span - gapA / 2, h: hl ? 0.62 : 0.34 + (d[1] / 100) * 0.3 };
        if (seg.cur.h > 0.05 && d[2] !== seg.cur.mat) seg.dip = 0.55;
        seg.nextMat = d[2];
        if (seg.cur.h < 0.002) {
          seg.cur.a0 = seg.tgt.a0;
          seg.cur.a1 = seg.tgt.a0 + 0.0001;
        }
        acc += span;
        if (labels && labels[i]) {
          labels[i].text = d[0];
          labels[i].sub = `${d[1].toFixed(1)}%`;
        }
      });
    };
    apply(this.outer, outerKey, this.ringLabels);
    apply(this.inner, innerKey, this.innerLabels);
    if (this.app.current === this) this.app.overlay.setLabels(this.labels);
  }

  tick(dt, t) {
    const st = this.stepTime;
    // Light follows the current station.
    if (this.focusGoal) {
      this.focus.x = damp(this.focus.x, this.focusGoal[0], 2.2, dt);
    }
    this.sun.position.set(this.focus.x - 4, 9, 6);
    this.sun.target.position.set(this.focus.x, 0, 0);

    // Skyline: slow dolly while the bars rise year by year.
    if (this.step === 0 && st > 0.25 && !this.dolly) {
      this.dolly = true;
      this.rig.go({ pos: [4.6, 2.9, 10.4], target: [1.25, 1.55, 0], fov: 30 }, 7.5, easeInOutCubic);
    }
    const m4 = this.skyM4;
    for (const b of this.bars) {
      const k = this.step === 0 ? easeOutCubic(clamp01((st - b.t) / 0.7)) : this.step > 0 ? 1 : 0;
      b.k = this.barsDone ? 1 : k;
      const sy = Math.max(0.0001, b.h * b.k);
      if (b.idx < 0) this.lastBar.scale.y = sy;
      else this.skyIM.setMatrixAt(b.idx, m4.makeScale(1, sy, 1).setPosition(b.x, 0, 0));
    }
    this.skyIM.instanceMatrix.needsUpdate = true;
    if (this.step === 0 && st > 0.35 + this.bars.length * 0.065 + 0.8) this.barsDone = true;

    // Pairs grow when visible.
    for (const p of this.pairs) {
      const k = this.step === 1 ? easeOutCubic(clamp01((st - 0.4 - p.i * 0.18) / 1.0)) : this.step > 1 ? 1 : 0;
      p.a.scale.y = Math.max(0.0001, damp(p.a.scale.y, p.ha * k, 6, dt));
      p.b.scale.y = Math.max(0.0001, damp(p.b.scale.y, p.hb * k, 6, dt));
    }

    // Ring segments morph toward their targets; material swaps happen while low.
    this.ringReady = (this.ringReady || 0) + dt;
    for (const seg of [...this.outer, ...this.inner]) {
      const c = seg.cur, g = seg.tgt;
      const sp = 3.2;
      if (seg.dip > 0) seg.dip -= dt;
      c.a0 = damp(c.a0, g.a0, sp, dt);
      c.a1 = damp(c.a1, g.a1, sp, dt);
      c.h = damp(c.h, seg.dip > 0 ? 0.04 : g.h, seg.dip > 0 ? 7 : sp, dt);
      if (seg.nextMat && seg.nextMat !== c.mat && c.h < 0.12) {
        const src = this.mats[seg.nextMat];
        seg.mat.color.copy(src.color);
        seg.mat.metalness = src.metalness;
        seg.mat.roughness = src.roughness;
        seg.mat.roughnessMap = src.roughnessMap || null;
        seg.mat.needsUpdate = true;
        c.mat = seg.nextMat;
      }
      seg.mat.arc.uA0.value = c.a0;
      seg.mat.arc.uA1.value = c.a1;
      seg.mat.arc.uH.value = c.h;
    }

    // Ranking columns.
    for (const r of this.rank) {
      const k = this.step === 4 ? easeOutCubic(clamp01((st - 0.5 - r.i * 0.22) / 1.1)) : 0;
      r.m.scale.y = Math.max(0.0001, damp(r.m.scale.y, r.h * k, 7, dt));
    }
  }
}
