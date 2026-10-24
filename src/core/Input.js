// Unified inspection input: unrestricted orbit, 1–15× wheel/pinch zoom.
// Phase navigation deliberately lives only in the bottom arrow buttons.

export class Input {
  constructor(el, handlers) {
    this.el = el;
    this.h = handlers;
    this.locked = false;
    this.lockUntil = 0;
    this.pointer = { x: 0, y: 0 };
    this.active = null;
    this.points = new Map();
    this.pinch = null;
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
    if (!this.enabled || this.h.isPanelOpen?.()) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    this.h.zoom?.(-dy * 0.0025);
  }

  onDown(e) {
    if (!this.enabled || (e.button !== undefined && e.button !== 0)) return;
    this.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.el.setPointerCapture?.(e.pointerId);
    if (this.points.size === 1) {
      this.active = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        x: e.clientX,
        y: e.clientY,
        mode: null,
        type: e.pointerType,
      };
    } else if (this.points.size === 2) {
      this.pinch = { distance: this.distance() };
      if (this.active) this.active.mode = 'pinch';
      this.h.drag?.(0, 0, 'end');
    }
  }

  distance() {
    const [a, b] = [...this.points.values()];
    return a && b ? Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) : 1;
  }

  onMove(e) {
    const w = window.innerWidth, h = window.innerHeight;
    if (e.pointerType === 'mouse') {
      this.pointer.x = (e.clientX / w) * 2 - 1;
      this.pointer.y = (e.clientY / h) * 2 - 1;
    }
    if (this.points.has(e.pointerId)) this.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.points.size >= 2 && this.pinch) {
      const distance = this.distance();
      this.h.zoom?.(Math.log(distance / this.pinch.distance));
      this.pinch.distance = distance;
      return;
    }
    const a = this.active;
    if (!a || a.id !== e.pointerId || a.mode === 'pinch') return;
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    a.x = e.clientX;
    a.y = e.clientY;
    if (!a.mode && Math.hypot(e.clientX - a.x0, e.clientY - a.y0) > 4) {
      a.mode = 'drag';
      this.h.drag?.(0, 0, 'start');
    }
    if (a.mode === 'drag') this.h.drag?.(dx, dy, 'move');
  }

  onUp(e, cancel = false) {
    this.points.delete(e.pointerId);
    if (this.pinch) {
      if (this.points.size < 2) {
        this.pinch = null;
        this.active = null;
        this.h.drag?.(0, 0, 'end');
      }
      return;
    }
    const a = this.active;
    if (!a || a.id !== e.pointerId) return;
    this.active = null;
    if (a.mode === 'drag') this.h.drag?.(0, 0, 'end');
    // A tap never changes the phase and never triggers scene navigation.
  }

  onKey(e) {
    if (!this.enabled || (e.target && /input|textarea|select/i.test(e.target.tagName))) return;
    const k = e.key;
    if (k === 'Escape') {
      this.h.escape?.();
      return;
    }
    if (this.h.isPanelOpen?.()) return;
    if (k === 'f' || k === 'F') this.h.fullscreen?.();
    else if (k === 'm' || k === 'M') this.h.menu?.();
    else if (k === 'i' || k === 'I') this.h.details?.();
    else if (k === '+' || k === '=') this.h.zoom?.(0.22);
    else if (k === '-' || k === '_') this.h.zoom?.(-0.22);
    else if (k === '0') this.h.resetView?.();
  }
}
