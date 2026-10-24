// Cinematic camera: poses are { pos:[x,y,z], target:[x,y,z], fov }.
// Moves along an arc around the targets (spherical interpolation of the offset),
// adds a breathing sway, pointer parallax and a spring-back orbit from dragging.
import * as THREE from 'three';
import { clamp, easeInOutCubic, damp, Spring } from './math.js';

const _off0 = new THREE.Vector3();
const _off1 = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qk = new THREE.Quaternion();
const _sph = new THREE.Spherical();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 0, 10);
    this.target = new THREE.Vector3();
    this.fov = 30;
    this.from = null;
    this.to = null;
    this.t = 1;
    this.duration = 1.6;
    this.ease = easeInOutCubic;
    this.yaw = new Spring(0, 60, 2 * Math.sqrt(60) * 0.9);
    this.pitch = new Spring(0, 60, 2 * Math.sqrt(60) * 0.9);
    this.dragging = false;
    this.zoom = 1;
    this.zoomTarget = 1;
    this.minZoom = 1;
    this.maxZoom = 15;
    // "Reduce motion" turns off the idle breathing and pointer parallax.
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.swayAmount = calm ? 0 : 1;
    this.parallax = new THREE.Vector2();
    this.parallaxAmount = calm ? 0 : 0.12;
    this.shiftX = 0;
    this.shiftY = 0;
    this.width = 1;
    this.height = 1;
    this.roll = 0;
  }

  static pose(pos, target, fov = 30) {
    return { pos, target, fov };
  }

  set(pose) {
    this.pos.fromArray(pose.pos);
    this.target.fromArray(pose.target);
    this.fov = pose.fov ?? this.fov;
    this.from = null;
    this.to = null;
    this.t = 1;
  }

  go(pose, duration = 1.6, ease = easeInOutCubic) {
    this.from = {
      pos: this.pos.clone(),
      target: this.target.clone(),
      fov: this.fov,
    };
    this.to = {
      pos: new THREE.Vector3().fromArray(pose.pos),
      target: new THREE.Vector3().fromArray(pose.target),
      fov: pose.fov ?? this.fov,
    };
    this.t = 0;
    this.duration = Math.max(0.01, duration);
    this.ease = ease;
  }

  drag(dx, dy, phase) {
    if (phase === 'start') this.dragging = true;
    if (phase === 'end') {
      // Keep the inspected angle instead of springing back to the authored pose.
      this.dragging = false;
      return;
    }
    this.yaw.target -= dx * 0.006;
    this.pitch.target -= dy * 0.004;
  }

  zoomBy(delta) {
    this.zoomTarget = clamp(this.zoomTarget * Math.exp(delta), this.minZoom, this.maxZoom);
    return this.zoomTarget;
  }

  setZoom(value) {
    this.zoomTarget = clamp(value, this.minZoom, this.maxZoom);
    return this.zoomTarget;
  }

  resetView() {
    this.yaw.target = 0;
    this.pitch.target = 0;
    this.zoomTarget = 1;
  }

  setViewport(w, h, shiftX = 0, shiftY = 0) {
    this.width = w;
    this.height = h;
    this.shiftX = shiftX;
    this.shiftY = shiftY;
  }

  update(dt, time, pointer) {
    if (this.to) {
      this.t = Math.min(1, this.t + dt / this.duration);
      const k = this.ease(this.t);
      const f = this.from, to = this.to;
      this.target.lerpVectors(f.target, to.target, k);
      _off0.subVectors(f.pos, f.target);
      _off1.subVectors(to.pos, to.target);
      const r0 = _off0.length(), r1 = _off1.length();
      _off0.normalize();
      _off1.normalize();
      const dot = clamp(_off0.dot(_off1), -1, 1);
      if (dot > 0.9999 || dot < -0.98) {
        _tmp.lerpVectors(_off0, _off1, k).normalize();
      } else {
        _q.setFromUnitVectors(_off0, _off1);
        _tmp.copy(_off0).applyQuaternion(_qk.identity().slerp(_q, k));
      }
      this.pos.copy(this.target).addScaledVector(_tmp, r0 + (r1 - r0) * k);
      this.fov = f.fov + (to.fov - f.fov) * k;
      if (this.t >= 1) {
        this.from = null;
        this.to = null;
      }
    }

    if (pointer) {
      this.parallax.x = damp(this.parallax.x, pointer.x, 3, dt);
      this.parallax.y = damp(this.parallax.y, pointer.y, 3, dt);
    }
    this.yaw.update(dt);
    this.pitch.update(dt);
    this.zoom = damp(this.zoom, this.zoomTarget, 9, dt);

    // Orbit offset around the target.
    _off0.subVectors(this.pos, this.target);
    const radius = _off0.length();
    const sway = this.swayAmount;
    const yaw = this.yaw.value + Math.sin(time * 0.21) * 0.025 * sway + this.parallax.x * this.parallaxAmount * 0.5;
    const pitch = this.pitch.value + Math.sin(time * 0.17 + 1.3) * 0.015 * sway - this.parallax.y * this.parallaxAmount * 0.3;
    const sph = _sph.setFromVector3(_off0);
    sph.theta += yaw;
    sph.phi = clamp(sph.phi + pitch, 0.05, Math.PI - 0.05);
    _off1.setFromSpherical(sph);
    _off1.multiplyScalar(1 / this.zoom);
    const cam = this.camera;
    cam.position.copy(this.target).add(_off1);
    cam.position.y += Math.sin(time * 0.33) * 0.004 * radius * sway;
    cam.up.set(Math.sin(this.roll), Math.cos(this.roll), 0);
    cam.lookAt(this.target);
    if (cam.fov !== this.fov) cam.fov = this.fov;
    const w = this.width, h = this.height;
    cam.aspect = w / h;
    if (this.shiftX !== 0 || this.shiftY !== 0) {
      cam.setViewOffset(w, h, -this.shiftX * w, this.shiftY * h, w, h);
    } else if (cam.view) {
      cam.clearViewOffset();
    }
    cam.updateProjectionMatrix();
  }
}
