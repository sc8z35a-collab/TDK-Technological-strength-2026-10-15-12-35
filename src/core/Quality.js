// Picks a starting quality tier from the device and then keeps the frame rate
// smooth with dynamic resolution. Manual override: 'auto' | 'high' | 'mid' | 'low'.

const TIERS = {
  high: { dof: true, ao: true, dprCap: 2.0, msaa: 4, bloomScale: 0.5, particles: 1.0, shadows: true, shadowSize: 2048, transmission: true },
  mid: { dprCap: 1.6, msaa: 4, bloomScale: 0.5, particles: 0.65, shadows: true, shadowSize: 1024, transmission: false },
  low: { dprCap: 1.15, msaa: 0, bloomScale: 0.5, particles: 0.4, shadows: false, shadowSize: 512, transmission: false },
};

export function detectDevice() {
  const ua = navigator.userAgent || '';
  const iPadOS = navigator.maxTouchPoints > 1 && /Macintosh/.test(ua);
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || iPadOS;
  const iOS = /iPhone|iPad|iPod/i.test(ua) || iPadOS;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  return { mobile, iOS, cores, mem, iPadOS };
}

export class Quality {
  constructor(renderer) {
    this.device = detectDevice();
    this.mode = 'auto';
    try {
      const saved = localStorage.getItem('tdk-atlas-quality');
      if (saved && ['auto', 'high', 'mid', 'low'].includes(saved)) this.mode = saved;
    } catch (e) {
      /* storage unavailable */
    }
    let gpu = '';
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch (e) {
      gpu = '';
    }
    this.gpu = String(gpu || '');
    this.autoTier = this.pickTier();
    this.tierName = this.mode === 'auto' ? this.autoTier : this.mode;
    this.scale = 1;
    // Effects dropped at runtime when the device can't keep up (auto mode only).
    this.shed = { ao: false, dof: false };
    this.samples = [];
    this.lastChange = 0;
    this.onChange = null;
  }

  pickTier() {
    const g = this.gpu.toLowerCase();
    const d = this.device;
    if (/swiftshader|llvmpipe|software/.test(g)) return 'low';
    if (!d.mobile) {
      if (/intel/.test(g) && !/arc|iris xe|iris\(r\) xe/.test(g)) return 'mid';
      return 'high';
    }
    if (/mali-g(5|6|7)\d\b|mali-t|adreno \(tm\) (3|4|5)\d\d|powervr/.test(g)) return 'low';
    if (d.mem && d.mem <= 3) return 'low';
    if (/apple gpu/.test(g)) return 'high';
    return 'mid';
  }

  get tier() {
    return TIERS[this.tierName];
  }

  setMode(mode) {
    this.mode = mode;
    try {
      localStorage.setItem('tdk-atlas-quality', mode);
    } catch (e) {
      /* ignore */
    }
    this.tierName = mode === 'auto' ? this.autoTier : mode;
    this.scale = 1;
    this.shed = { ao: false, dof: false };
    this.samples.length = 0;
    this.onChange?.();
  }

  pixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.tier.dprCap);
    return Math.max(0.6, dpr * this.scale);
  }

  /** Post effects currently allowed (tier minus anything shed for speed). */
  effects() {
    const t = this.tier;
    return { ao: !!t.ao && !this.shed.ao, dof: !!t.dof && !this.shed.dof };
  }

  /** Feed one frame time (ms). Returns true when resolution or effects should change. */
  sample(ms, now) {
    if (this.mode !== 'auto') return false;
    this.samples.push(ms);
    if (this.samples.length < 90) return false;
    const sorted = this.samples.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length * 0.5)];
    this.samples.length = 0;
    if (now - this.lastChange < 2500) return false;
    let changed = false;
    if (median > 24) {
      // Slow: first a little resolution, then the costly full-screen passes
      // (ambient occlusion, then depth of field), then the rest of the resolution.
      const t = this.tier;
      if (t.ao && !this.shed.ao && this.scale <= 0.8) this.shed.ao = changed = true;
      else if (t.dof && !this.shed.dof && this.scale <= 0.68) this.shed.dof = changed = true;
      else if (this.scale > 0.55) {
        this.scale = Math.max(0.55, this.scale - 0.12);
        changed = true;
      }
    } else if (median < 13 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.08);
      changed = true;
    }
    if (changed) this.lastChange = now;
    return changed;
  }
}
