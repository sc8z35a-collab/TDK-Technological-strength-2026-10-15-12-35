// Orchestrates renderer, chapters, navigation, transitions and the overlay.
import * as THREE from 'three';
import { Post } from './Post.js';
import { Quality } from './Quality.js';
import { Input } from './Input.js';
import { EnvironmentLibrary } from './Env.js';
import { setMaxAnisotropy } from './textures.js';
import { materials } from './kit.js';
import { Overlay } from '../ui/Overlay.js';
import { loadFonts } from './fonts.js';
import { clamp01, easeInOutCubic, lerp } from './math.js';

const DEFAULT_LOOK = {
  bloom: 0.1,
  threshold: 1.15,
  knee: 0.7,
  radius: 1.0,
  vignette: 0.3,
  grain: 0.026,
  fringe: 0.0022,
  saturation: 1.06,
  lift: new THREE.Vector3(0.0, 0.0, 0.0),
  gain: new THREE.Vector3(1, 1, 1),
  fade: 0,
  fadeColor: new THREE.Color(0x0b0c0e),
  dof: 0,
};

function mixLook(a, b, t) {
  const o = {};
  for (const k of Object.keys(DEFAULT_LOOK)) {
    const va = a[k] ?? DEFAULT_LOOK[k], vb = b[k] ?? DEFAULT_LOOK[k];
    if (typeof va === 'number') o[k] = lerp(va, vb, t);
    else if (va.isVector3) o[k] = va.clone().lerp(vb, t);
    else if (va.isColor) o[k] = va.clone().lerp(vb, t);
  }
  return o;
}

export class App {
  constructor({ canvas, ui, chapters, registry }) {
    this.canvas = canvas;
    this.uiRoot = ui;
    this.defs = chapters;
    this.registry = registry;
    this.g = 0;
    this.transition = null;
    this.layout = { portrait: false, shiftScale: 1 };
    this.time = 0;
    this.started = false;
    this.ctaDone = false;
    this.transitionDur = 1.35; // seconds; QA scripts may shorten it
  }

  async init() {
    const r = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
    });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.setClearColor(0x0b0c0e, 1);
    r.localClippingEnabled = true;
    this.renderer = r;
    this.quality = new Quality(r);
    this.quality.onChange = () => this.resize(true);
    setMaxAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy()));
    r.shadowMap.enabled = this.quality.tier.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;

    this.overlay = new Overlay(this.uiRoot, this);
    this.overlay.setProgress(0.05);
    await nextFrame();

    this.envs = new EnvironmentLibrary(r);
    this.post = new Post(r);

    // Flatten steps.
    this.flat = [];
    this.defs.forEach((c, ci) => c.steps.forEach((s, si) => this.flat.push({ chapter: ci, step: si })));
    this.chapters = this.defs.map((def, i) => {
      const Cls = this.registry[def.id];
      return new Cls(this, def, i);
    });
    this.overlay.buildNav(this.defs, this.flat);

    this.input = new Input(this.canvas, {
      navigate: (d) => this.navigate(d),
      drag: (dx, dy, phase) => this.current.drag(dx, dy, phase),
      tap: (x, y, e) => this.current.tap(x, y, e),
      jump: (i) => this.goTo(i < 0 ? this.flat.length - 1 : i),
      fullscreen: () => this.toggleFullscreen(),
      menu: () => this.overlay.toggleMenu(),
      details: () => this.overlay.toggleDetails(),
      escape: () => {
        this.overlay.closePanel();
        this.overlay.closeMenu();
      },
      isPanelOpen: () => this.overlay.isPanelOpen(),
    });

    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    screen.orientation?.addEventListener?.('change', () => setTimeout(() => this.resize(), 120));
    document.addEventListener('fullscreenchange', () => setTimeout(() => this.resize(), 60));

    // Start position from hash (#3 or #3.2).
    const m = /^#(\d+)(?:\.(\d+))?/.exec(location.hash || '');
    if (m) {
      const ci = Math.min(this.defs.length - 1, Number(m[1]));
      const si = Math.min(this.defs[ci].steps.length - 1, Number(m[2] || 0));
      this.g = this.flat.findIndex((f) => f.chapter === ci && f.step === si);
      if (this.g < 0) this.g = 0;
    }

    this.overlay.setProgress(0.15);
    await loadFonts();
    this.overlay.setProgress(0.25);
    materials();
    this.envs.get('studio');
    this.overlay.setProgress(0.45);
    await nextFrame();

    this.resize(true);
    const f = this.flat[this.g];
    this.current = this.chapters[f.chapter];
    this.current.ensureBuilt();
    this.current.resize(this.width, this.height);
    this.overlay.setProgress(0.75);
    await nextFrame();
    try {
      await this.renderer.compileAsync(this.current.scene, this.current.camera);
    } catch (e) {
      /* compileAsync is optional */
    }
    this.current.enter(f.step, 1);
    this.overlay.setLabels(this.current.labels);
    this.overlay.showStep(this.current.def, f.chapter, this.current.def.steps[f.step], 1);
    this.overlay.setProgressMarker(this.g, f.chapter, this.current.def);
    this.overlay.setProgress(1);
    this.overlay.updateRotate();
    setTimeout(() => this.overlay.hideLoader(), 250);
    this.started = true;
    this.lastFrame = performance.now();
    this.prefetch();
    setTimeout(() => this.overlay.showHint(this.g < 2), 2600);
    requestAnimationFrame((t) => this.frame(t));
  }

  /* ------------------------------------------------------------ layout */
  resize(force = false) {
    const vv = window.visualViewport;
    const w = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
    const h = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
    const pr = this.quality.pixelRatio();
    if (!force && w === this.width && h === this.height && pr === this.pixelRatio) return;
    this.width = w;
    this.height = h;
    this.pixelRatio = pr;
    const aspect = w / h;
    this.layout.portrait = aspect < 1;
    this.layout.shiftScale = clamp01((aspect - 1.15) / 0.6);
    this.layout.compact = h < 520;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const t = this.quality.tier;
    this.renderer.shadowMap.enabled = t.shadows;
    this.post.setSize(w * pr, h * pr, t.msaa, t.bloomScale, !!t.dof);
    this.chapters?.forEach((c) => c.built && c.resize(w, h));
    document.documentElement.classList.toggle('portrait', this.layout.portrait);
    document.documentElement.classList.toggle('compact', this.layout.compact);
    this.overlay?.updateRotate();
    this.overlay?.measureCaption();
  }

  setQuality(mode) {
    this.quality.setMode(mode);
  }

  /* ------------------------------------------------------------ navigation */
  navigate(dir, fromButton = false) {
    if (this.overlay.isPanelOpen()) return;
    if (fromButton) this.input.lock(700);
    const g = Math.max(0, Math.min(this.flat.length - 1, this.g + dir));
    this.goTo(g);
  }

  goTo(g) {
    if (!this.started || g === this.g || g < 0 || g >= this.flat.length) return;
    this.overlay.showHint(false);
    const from = this.flat[this.g];
    const to = this.flat[g];
    const dir = g > this.g ? 1 : -1;
    this.g = g;
    const B = this.chapters[to.chapter];
    if (from.chapter === to.chapter && !this.transition) {
      B.setStep(to.step, false, dir);
    } else {
      if (this.transition) this.finishTransition();
      const A = this.current;
      B.ensureBuilt();
      B.resize(this.width, this.height);
      B.enter(to.step, dir);
      this.post.shared.uDir.value.set(dir > 0 ? 1 : -1, dir > 0 ? 0.32 : -0.32);
      this.post.shared.uSeed.value = Math.random() * 10;
      this.transition = { from: A, to: B, t: 0, dur: this.transitionDur };
      this.current = B;
      this.overlay.setLabels(B.labels);
    }
    this.overlay.showStep(B.def, to.chapter, B.def.steps[to.step], dir);
    this.overlay.setProgressMarker(g, to.chapter, B.def);
    history.replaceState(null, '', `#${to.chapter}.${to.step}`);
    this.prefetch();
  }

  finishTransition() {
    const tr = this.transition;
    if (!tr) return;
    if (tr.from !== this.current) tr.from.leave();
    this.transition = null;
    this.gc();
  }

  prefetch() {
    clearTimeout(this._pf);
    this._pf = setTimeout(() => {
      const ci = this.flat[this.g].chapter;
      for (const n of [ci + 1, ci - 1]) {
        const c = this.chapters[n];
        if (c && !c.built) {
          c.ensureBuilt();
          c.resize(this.width, this.height);
          c.enter(0, 1);
          c.leave();
          this.renderer.compileAsync?.(c.scene, c.camera).catch(() => {});
          break;
        }
      }
    }, 900);
  }

  gc() {
    const ci = this.flat[this.g].chapter;
    this.chapters.forEach((c, i) => {
      if (c.built && Math.abs(i - ci) > 2 && c !== this.current) c.dispose();
    });
  }

  onCta(step) {
    if (step.action === 'start') {
      if (this.quality.device.mobile && !document.fullscreenElement) this.toggleFullscreen(true);
      this.navigate(1, true);
    } else if (step.action === 'restart') {
      this.goTo(0);
    } else if (step.action === 'details') {
      this.overlay.openDetails();
    } else if (step.action === 'menu') {
      this.overlay.openMenu();
    }
  }

  toggleFullscreen(silent = false) {
    const d = document;
    const el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
      return;
    }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    const fallback = () => {
      if (!silent || this.quality.device.iOS)
        this.overlay.toast('この端末のブラウザは全画面表示に対応していません。iPhoneはSafariの共有ボタンから<b>「ホーム画面に追加」</b>して開くと全画面で見られます。', 6500);
    };
    if (!req) return fallback();
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      if (p && p.then) {
        p.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(fallback);
      }
    } catch (e) {
      fallback();
    }
  }

  /** Debug/QA helper: fast-forward the current chapter's animation clock. */
  skip(seconds, step = 1 / 30) {
    const n = Math.round(seconds / step);
    for (let i = 0; i < n; i++) {
      this.time += step;
      this.current.update(step, this.time);
    }
    this.overlay.updateCounters(seconds);
  }

  /* ------------------------------------------------------------ loop */
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    if (document.hidden) {
      this.lastFrame = now;
      return;
    }
    const ms = now - this.lastFrame;
    this.lastFrame = now;
    const dt = Math.min(0.05, Math.max(0.0001, ms / 1000));
    this.time += dt;
    if (this.quality.sample(ms, now)) this.resize(true);

    const tr = this.transition;
    let mix = 0;
    if (tr) {
      tr.t += dt / tr.dur;
      mix = easeInOutCubic(clamp01(tr.t));
      tr.from.update(dt, this.time);
    }
    this.current.update(dt, this.time);
    this.overlay.updateCounters(dt);
    const labels = this.current.projectLabels(this.width, this.height);
    this.overlay.updateLabels(labels, dt);

    const a = tr ? tr.from : this.current;
    const b = tr ? tr.to : null;
    const look = tr ? mixLook(a.look, b.look, mix) : mixLook(a.look, a.look, 0);
    this.post.render(
      { scene: a.scene, camera: a.camera, exposure: a.exposure, focus: a.camera.position.distanceTo(a.rig.target) },
      b ? { scene: b.scene, camera: b.camera, exposure: b.exposure } : null,
      mix,
      this.time,
      look
    );
    if (tr && tr.t >= 1) this.finishTransition();
  }
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
