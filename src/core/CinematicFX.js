// Layered cinematic instrument effects: a live node network, orbital traces,
// scanning beams, embers, meteors and a 30-band phase wipe.
export class CinematicFX {
  constructor(root) {
    this.root = root;
    this.calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.layer = document.createElement('div');
    this.layer.className = 'cinematic-fx';
    this.layer.setAttribute('aria-hidden', 'true');
    this.layer.innerHTML = `
      <canvas class="fx-canvas"></canvas>
      <div class="fx-aurora a"></div><div class="fx-aurora b"></div>
      <div class="fx-grid"></div><div class="fx-scan-beam"></div>
      <div class="fx-reticle"><i></i><i></i><i></i><i></i></div>
      <div class="fx-wipe">${Array.from({ length: 30 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
      <div class="fx-flash"></div>`;
    root.appendChild(this.layer);
    this.canvas = this.layer.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.phaseEnergy = 0;
    this.dir = 1;
    this.seed = 19;
    this.particles = Array.from({ length: this.calm ? 42 : 170 }, (_, i) => ({
      x: this.random(), y: this.random(),
      vx: (this.random() - 0.5) * 0.018,
      vy: (this.random() - 0.5) * 0.014,
      r: 0.35 + this.random() * 1.65,
      p: this.random() * Math.PI * 2,
      band: i % 3,
    }));
    this.meteors = Array.from({ length: this.calm ? 0 : 9 }, () => this.newMeteor(true));
  }

  random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  newMeteor(initial = false) {
    return {
      x: this.random() * 1.3 - 0.15,
      y: initial ? this.random() : -0.15 - this.random() * 0.4,
      speed: 0.09 + this.random() * 0.16,
      len: 0.035 + this.random() * 0.09,
      delay: this.random() * 9,
    };
  }

  resize(w, h) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  phase(dir = 1) {
    this.dir = dir;
    this.phaseEnergy = 1;
    this.layer.dataset.dir = dir > 0 ? 'next' : 'prev';
    this.layer.classList.remove('phase');
    void this.layer.offsetWidth;
    this.layer.classList.add('phase');
    clearTimeout(this.phaseTimer);
    this.phaseTimer = setTimeout(() => this.layer.classList.remove('phase'), 1500);
  }

  update(dt, time, pointer) {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.w, h = this.h, dpr = this.dpr;
    const px = pointer?.x || 0, py = pointer?.y || 0;
    const motion = this.calm ? 0 : 1;
    this.phaseEnergy = Math.max(0, this.phaseEnergy - dt * 0.7);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    // Slow orbital ellipses behave like a precision measuring instrument.
    const cx = w * (0.66 + px * 0.008), cy = h * (0.47 + py * 0.008);
    ctx.lineWidth = 0.65;
    for (let j = 0; j < 7; j++) {
      const radius = Math.min(w, h) * (0.19 + j * 0.065);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * (0.018 + j * 0.003) * motion + j * 0.55);
      ctx.scale(1, 0.29 + j * 0.035);
      ctx.beginPath();
      ctx.arc(0, 0, radius, j * 0.7, j * 0.7 + Math.PI * (0.75 + (j % 3) * 0.27));
      ctx.strokeStyle = `rgba(${j % 2 ? '138,166,200' : '226,180,138'},${0.045 + this.phaseEnergy * 0.08})`;
      ctx.stroke();
      ctx.restore();
    }

    // Dynamic network: particles drift, glow and connect to nearby nodes.
    for (const p of this.particles) {
      p.x += p.vx * dt * motion * (1 + this.phaseEnergy * 5) * this.dir;
      p.y += p.vy * dt * motion;
      if (p.x < -0.04) p.x = 1.04;
      if (p.x > 1.04) p.x = -0.04;
      if (p.y < -0.04) p.y = 1.04;
      if (p.y > 1.04) p.y = -0.04;
      p.sx = (p.x + px * 0.009 * (p.band + 1)) * w;
      p.sy = (p.y + py * 0.007 * (p.band + 1)) * h;
    }
    const threshold = Math.min(w, h) * 0.14;
    ctx.lineWidth = 0.45;
    for (let i = 0; i < this.particles.length; i++) {
      const a = this.particles[i];
      for (let j = i + 1; j < this.particles.length; j++) {
        const b = this.particles[j];
        const dx = a.sx - b.sx, dy = a.sy - b.sy;
        const dist = Math.hypot(dx, dy);
        if (dist < threshold) {
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.strokeStyle = `rgba(138,166,200,${(1 - dist / threshold) * 0.075})`;
          ctx.stroke();
        }
      }
      const pulse = 0.5 + Math.sin(time * 1.7 + a.p) * 0.5;
      ctx.beginPath();
      ctx.arc(a.sx, a.sy, a.r * (0.75 + pulse * 0.45 + this.phaseEnergy), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${a.band === 0 ? '226,180,138' : '175,199,221'},${0.12 + pulse * 0.25})`;
      ctx.fill();
    }

    // Bright filaments occasionally race across the scene.
    for (let i = 0; i < this.meteors.length; i++) {
      const m = this.meteors[i];
      if (m.delay > 0) { m.delay -= dt; continue; }
      m.x += m.speed * dt * this.dir;
      m.y += m.speed * dt * 0.55;
      if (m.x > 1.2 || m.x < -0.2 || m.y > 1.2) Object.assign(m, this.newMeteor());
      const x = m.x * w, y = m.y * h, len = m.len * w;
      const gradient = ctx.createLinearGradient(x - len * this.dir, y - len * 0.55, x, y);
      gradient.addColorStop(0, 'rgba(138,166,200,0)');
      gradient.addColorStop(1, 'rgba(226,180,138,0.42)');
      ctx.beginPath();
      ctx.moveTo(x - len * this.dir, y - len * 0.55);
      ctx.lineTo(x, y);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
