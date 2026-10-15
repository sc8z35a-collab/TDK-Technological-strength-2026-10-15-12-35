// Base class for every chapter scene.
import * as THREE from 'three';
import { CameraRig } from './CameraRig.js';
import { Backdrop, Dust } from './fx.js';
import { Tracker } from './kit.js';
import { damp } from './math.js';

const _v = new THREE.Vector3();

export class Chapter {
  constructor(app, def, index) {
    this.app = app;
    this.def = def;
    this.index = index;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.02, 300);
    this.rig = new CameraRig(this.camera);
    this.tracker = new Tracker();
    this.step = 0;
    this.prevStep = 0;
    this.stepTime = 0;
    this.time = 0;
    this.built = false;
    this.active = false;
    this.labels = [];
    this.env = 'studio';
    this.exposure = 1.0;
    this.look = {};
    this.backdrop = null;
    this.dust = null;
    this.shift = 0.2;
    this.params = {};
    this.paramTargets = {};
  }

  /* ---------- lifecycle ---------- */
  ensureBuilt() {
    if (this.built) return;
    this.scene.environment = this.app.envs.get(this.env);
    this.build();
    this.built = true;
  }
  build() {}
  /** Array of camera poses, one per step. */
  poses() {
    return [];
  }
  enter(step, dir = 1) {
    this.active = true;
    this.setStep(step, true, dir);
  }
  leave() {
    this.active = false;
  }
  setStep(step, instant = false, dir = 1) {
    this.prevStep = this.step;
    this.step = step;
    this.stepTime = 0;
    const pose = this.poses()[step];
    if (pose) {
      if (instant) this.rig.set(pose);
      else this.rig.go(pose, pose.dur ?? 2.0);
    }
    this.onStep(step, instant, dir);
  }
  onStep() {}

  /* ---------- animated parameters (reversible) ---------- */
  param(name, initial = 0) {
    if (!(name in this.params)) {
      this.params[name] = initial;
      this.paramTargets[name] = initial;
    }
    return this.params[name];
  }
  to(name, target, instant = false) {
    this.param(name, target);
    this.paramTargets[name] = target;
    if (instant) this.params[name] = target;
  }
  updateParams(dt, speed = 2.6) {
    for (const k in this.paramTargets) {
      this.params[k] = damp(this.params[k], this.paramTargets[k], speed, dt);
    }
  }

  /* ---------- per frame ---------- */
  update(dt, time) {
    this.time += dt;
    this.stepTime += dt;
    this.updateParams(dt);
    this.rig.update(dt, this.time, this.app.input.pointer);
    if (this.dust) this.dust.update(this.time, this.app.pixelRatio, this.app.height);
    this.tick(dt, this.time);
  }
  tick() {}

  resize(w, h) {
    const layout = this.app.layout;
    const shift = layout.portrait ? 0 : this.shift * layout.shiftScale;
    const shiftY = layout.portrait ? -0.16 : 0;
    this.rig.setViewport(w, h, shift, shiftY);
    this.backdrop?.setAspect(w / h);
  }

  /* ---------- helpers ---------- */
  add(obj) {
    this.scene.add(obj);
    this.tracker.track(obj);
    return obj;
  }
  addBackdrop(params) {
    this.backdrop = new Backdrop(params);
    this.scene.add(this.backdrop);
    return this.backdrop;
  }
  addDust(params = {}) {
    const q = this.app.quality.tier.particles;
    this.dust = new Dust({ ...params, count: Math.round((params.count ?? 420) * q) });
    this.scene.add(this.dust);
    return this.dust;
  }
  /** Register an HTML label anchored to a 3D point/object. */
  label(def) {
    const l = {
      id: def.id || `l${this.labels.length}`,
      text: def.text,
      sub: def.sub || '',
      anchor: def.anchor,
      offset: def.offset || [40, -30],
      steps: def.steps || null,
      when: def.when || null,
      cls: def.cls || '',
      visible: false,
      x: 0,
      y: 0,
    };
    this.labels.push(l);
    return l;
  }
  labelVisible(l) {
    if (l.when) return l.when(this.step, this);
    if (!l.steps) return true;
    return l.steps.includes(this.step);
  }
  projectLabels(w, h) {
    for (const l of this.labels) {
      const show = this.labelVisible(l);
      if (!show) {
        l.visible = false;
        continue;
      }
      if (l.anchor?.isObject3D) l.anchor.getWorldPosition(_v);
      else if (l.anchor?.isVector3) _v.copy(l.anchor);
      else if (Array.isArray(l.anchor)) _v.fromArray(l.anchor);
      else if (typeof l.anchor === 'function') {
        const r = l.anchor(_v);
        if (r && r.isVector3 && r !== _v) _v.copy(r);
      }
      _v.project(this.camera);
      l.visible = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
      l.x = (_v.x * 0.5 + 0.5) * w;
      l.y = (-_v.y * 0.5 + 0.5) * h;
    }
    return this.labels;
  }
  tap() {
    return false;
  }
  drag(dx, dy, phase) {
    this.rig.drag(dx, dy, phase);
  }
  dispose() {
    this.tracker.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
    });
    this.built = false;
    this.scene = new THREE.Scene();
    this.labels = [];
  }
}
