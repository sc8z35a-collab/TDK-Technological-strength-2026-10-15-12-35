// Unified input: mouse wheel / trackpad, touch swipes, drag-to-orbit, keyboard.
// Navigation intents are throttled so one gesture moves exactly one step.

export class Input {
  constructor(el, handlers) {
    this.el = el;
    this.h = handlers;
    this.locked = false;
    this.lockUntil = 0;
    this.wheelAcc = 0;
    this.lastWheel = 0;
    this.pointer = { x: 0, y: 0 };
    this.active = null;
    this.enabled = true;

    el.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  now() {
    return performance.now();
  }

  lock(ms) {
    this.lockUntil = Math.max(this.lockUntil, this.now() + ms);
  }

  canNavigate() {
    return this.enabled && this.now() > this.lockUntil;
  }

  onWheel(e) {
    if (!this.enabled) return;
    if (this.h.isPanelOpen?.()) return;
    e.preventDefault();
    const t = this.now();
    const dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const dx = e.deltaMode === 1 ? e.deltaX * 32 : e.deltaX;
    const d = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
    // A pause in the wheel stream ends the gesture.
    if (t - this.lastWheel > 220) this.wheelAcc = 0;
    this.lastWheel = t;
    if (!this.canNavigate()) {
      this.wheelAcc = 0;
      return;
    }
    this.wheelAcc += d;
    if (Math.abs(this.wheelAcc) > 70) {
      const dir = Math.sign(this.wheelAcc);
      this.wheelAcc = 0;
      this.lock(950);
      this.h.navigate(dir);
    }
  }

  onDown(e) {
    if (!this.enabled) return;
    if (e.button !== undefined && e.button !== 0) return;
    this.active = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      t0: this.now(),
      mode: null,
      type: e.pointerType,
    };
    this.el.setPointerCapture?.(e.pointerId);
  }

  onMove(e) {
    const w = window.innerWidth, h = window.innerHeight;
    if (e.pointerType === 'mouse') {
      this.pointer.x = (e.clientX / w) * 2 - 1;
      this.pointer.y = (e.clientY / h) * 2 - 1;
    }
    const a = this.active;
    if (!a || a.id !== e.pointerId) return;
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    a.x = e.clientX;
    a.y = e.clientY;
    const tx = e.clientX - a.x0, ty = e.clientY - a.y0;
    if (!a.mode && Math.hypot(tx, ty) > 9) {
      if (a.type !== 'mouse' && Math.abs(ty) > Math.abs(tx) * 1.1) a.mode = 'swipe';
      else {
        a.mode = 'drag';
        this.h.drag?.(0, 0, 'start');
      }
    }
    if (a.mode === 'drag') this.h.drag?.(dx, dy, 'move');
  }

  onUp(e, cancel = false) {
    const a = this.active;
    if (!a || a.id !== e.pointerId) return;
    this.active = null;
    const tx = e.clientX - a.x0, ty = e.clientY - a.y0;
    const dt = Math.max(1, this.now() - a.t0);
    if (a.mode === 'drag') {
      this.h.drag?.(0, 0, 'end');
      // A fast horizontal flick on touch also navigates.
      if (!cancel && a.type !== 'mouse' && Math.abs(tx) > 90 && Math.abs(tx) / dt > 0.5 && this.canNavigate()) {
        this.lock(950);
        this.h.navigate(tx < 0 ? 1 : -1);
      }
      return;
    }
    if (a.mode === 'swipe') {
      if (cancel) return;
      const v = Math.abs(ty) / dt;
      if ((Math.abs(ty) > 42 || v > 0.35) && this.canNavigate()) {
        this.lock(950);
        this.h.navigate(ty < 0 ? 1 : -1);
      }
      return;
    }
    if (!cancel && dt < 450) {
      const w = window.innerWidth, h = window.innerHeight;
      this.h.tap?.((e.clientX / w) * 2 - 1, -(e.clientY / h) * 2 + 1, e);
    }
  }

  onKey(e) {
    if (!this.enabled) return;
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    const k = e.key;
    if (k === 'Escape') {
      this.h.escape?.();
      return;
    }
    if (this.h.isPanelOpen?.()) return;
    const next = ['ArrowDown', 'ArrowRight', 'PageDown', ' ', 'Enter'];
    const prev = ['ArrowUp', 'ArrowLeft', 'PageUp', 'Backspace'];
    if (next.includes(k) || prev.includes(k)) {
      e.preventDefault();
      if (!this.canNavigate()) return;
      this.lock(650);
      this.h.navigate(next.includes(k) ? 1 : -1);
    } else if (k === 'Home') {
      this.h.jump?.(0);
    } else if (k === 'End') {
      this.h.jump?.(-1);
    } else if (k === 'f' || k === 'F') {
      this.h.fullscreen?.();
    } else if (k === 'm' || k === 'M') {
      this.h.menu?.();
    } else if (k === 'i' || k === 'I') {
      this.h.details?.();
    } else if (k === 'p' || k === 'P') {
      this.h.play?.();
    }
  }
}
