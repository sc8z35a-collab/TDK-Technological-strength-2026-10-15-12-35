// DOM overlay: loader, captions with kinetic typography, 3D-anchored labels,
// the ruler-style progress rail, chapter menu, detail panel, toasts.
import { formatNumber, easeOutExpo, clamp01 } from '../core/math.js';

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html !== undefined) el.innerHTML = html;
  return el;
};

const LATIN = /[A-Za-z0-9.,:%+\-/~°µ×·'’&()]+/y;

/** Split text into animated character spans; Latin runs stay unbreakable. */
function kinetic(text, base = 0, step = 22) {
  let i = 0;
  let out = '';
  const lines = String(text).split('\n');
  lines.forEach((line, li) => {
    let p = 0;
    while (p < line.length) {
      LATIN.lastIndex = p;
      const m = LATIN.exec(line);
      if (m && m.index === p) {
        out += '<span class="word">';
        for (const ch of m[0]) out += `<span class="ch" style="--i:${base + i++}">${ch}</span>`;
        out += '</span>';
        p += m[0].length;
      } else {
        const ch = line[p];
        out += ch === ' ' ? ' ' : `<span class="ch" style="--i:${base + i++}">${ch}</span>`;
        p += 1;
      }
    }
    if (li < lines.length - 1) out += '<br>';
  });
  return { html: out, count: i, step };
}

export class Overlay {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.counters = [];
    this.labelEls = new Map();
    this.build();
  }

  build() {
    const r = this.root;
    r.innerHTML = '';

    this.loader = h('div', 'loader');
    this.loader.innerHTML = `
      <div class="loader-inner">
        <div class="loader-mark"><span></span></div>
        <div class="loader-title">TDK TECHNOLOGY ATLAS <em>2026</em></div>
        <div class="loader-sub">フェライトを焼成しています</div>
        <div class="loader-meter"><div class="loader-bar"></div></div>
        <div class="loader-temp"><b>20</b><small>℃</small></div>
      </div>`;
    r.appendChild(this.loader);

    this.top = h('header', 'topbar');
    this.top.innerHTML = `
      <div class="brand"><span class="brand-mark"></span><span class="brand-name">TDK TECHNOLOGY ATLAS</span><span class="brand-date">2026.10.15</span></div>
      <div class="top-chapter"><span class="tc-num"></span><span class="tc-name"></span></div>
      <div class="top-actions">
        <button class="ic-btn btn-details" aria-label="詳しく見る" title="詳しく (I)"><svg viewBox="0 0 24 24"><path d="M12 7.2v.2M12 11v6" /><circle cx="12" cy="12" r="9"/></svg></button>
        <button class="ic-btn btn-menu" aria-label="目次" title="目次 (M)"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg></button>
        <button class="ic-btn btn-fs" aria-label="全画面" title="全画面 (F)"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
      </div>`;
    r.appendChild(this.top);

    this.scrim = h('div', 'scrim');
    r.appendChild(this.scrim);

    this.mark = h('div', 'chapter-mark');
    r.appendChild(this.mark);

    this.captionWrap = h('section', 'caption-wrap');
    r.appendChild(this.captionWrap);

    this.labelsLayer = h('div', 'labels');
    r.appendChild(this.labelsLayer);

    this.rail = h('nav', 'rail');
    this.rail.innerHTML = `
      <button class="ic-btn rail-prev" aria-label="前へ"><svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg></button>
      <div class="ruler"><div class="ruler-track"></div><div class="ruler-marker"></div></div>
      <div class="rail-count"><b class="rc-cur">01</b><span>/</span><span class="rc-total">00</span></div>
      <button class="ic-btn rail-play" aria-label="自動再生" aria-pressed="false" title="自動再生 (P)"><svg class="ring" viewBox="0 0 38 38"><circle cx="19" cy="19" r="17.5"/></svg><svg class="ico" viewBox="0 0 24 24"><path class="i-play" d="M9.2 6.8l8.6 5.2-8.6 5.2z"/><path class="i-pause" d="M9.6 7.2v9.6M14.4 7.2v9.6"/></svg></button>
      <button class="ic-btn rail-next" aria-label="次へ"><svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg></button>`;
    r.appendChild(this.rail);

    this.hint = h('div', 'hint', `<span class="hint-ico"></span><span class="hint-text">スワイプ・スクロール・矢印キーで進む</span>`);
    r.appendChild(this.hint);

    this.panel = h('aside', 'panel');
    this.panel.innerHTML = `
      <div class="panel-head"><div class="panel-kicker"></div><h2 class="panel-title"></h2><button class="ic-btn panel-close" aria-label="閉じる"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="panel-body"></div>`;
    r.appendChild(this.panel);

    this.menu = h('div', 'menu');
    this.menu.innerHTML = `
      <div class="menu-inner">
        <div class="menu-head"><span class="menu-kicker">CONTENTS</span><h2>目次</h2><button class="ic-btn menu-close" aria-label="閉じる"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <ol class="menu-list"></ol>
        <div class="menu-foot">
          <div class="menu-quality"><span>画質</span><button data-q="auto">自動</button><button data-q="high">高</button><button data-q="mid">標準</button><button data-q="low">軽量</button></div>
          <p class="menu-note">本サイトは2026年10月15日時点の公開情報をもとに作成した<b>非公式の学習用コンテンツ</b>です。TDK株式会社とは関係ありません。<a class="menu-text" href="?text">テキスト版で読む</a></p>
        </div>
      </div>`;
    r.appendChild(this.menu);

    this.rotate = h('div', 'rotate');
    this.rotate.innerHTML = `
      <div class="rotate-inner">
        <div class="rotate-phone"><span></span></div>
        <p class="rotate-title">横向きにして全画面でどうぞ</p>
        <p class="rotate-text">このサイトはスマートフォンの横画面に最適化しています。</p>
        <button class="pill rotate-go">このまま見る</button>
      </div>`;
    r.appendChild(this.rotate);

    this.toastEl = h('div', 'toast');
    r.appendChild(this.toastEl);

    // events
    const app = this.app;
    this.top.querySelector('.btn-menu').addEventListener('click', () => this.toggleMenu());
    this.top.querySelector('.btn-fs').addEventListener('click', () => app.toggleFullscreen());
    this.top.querySelector('.btn-details').addEventListener('click', () => this.toggleDetails());
    this.rail.querySelector('.rail-prev').addEventListener('click', () => app.navigate(-1, true));
    this.rail.querySelector('.rail-next').addEventListener('click', () => app.navigate(1, true));
    this.playBtn = this.rail.querySelector('.rail-play');
    this.playBtn.addEventListener('click', () => app.setAutoplay(!app.auto.on));
    this.panel.querySelector('.panel-close').addEventListener('click', () => this.closePanel());
    this.menu.querySelector('.menu-close').addEventListener('click', () => this.closeMenu());
    this.menu.addEventListener('click', (e) => {
      if (e.target === this.menu) this.closeMenu();
    });
    this.menu.querySelectorAll('.menu-quality button').forEach((b) =>
      b.addEventListener('click', () => {
        app.setQuality(b.dataset.q);
        this.syncQuality();
      })
    );
    this.rotate.querySelector('.rotate-go').addEventListener('click', () => {
      this.rotateDismissed = true;
      this.updateRotate();
    });
    this.panel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  }

  /* ------------------------------------------------------------ loader */
  setProgress(p) {
    const bar = this.loader.querySelector('.loader-bar');
    const temp = this.loader.querySelector('.loader-temp b');
    bar.style.transform = `scaleX(${clamp01(p)})`;
    temp.textContent = formatNumber(Math.round(20 + 1280 * clamp01(p)));
  }
  hideLoader() {
    this.loader.classList.add('done');
    setTimeout(() => this.loader.remove(), 1400);
  }

  /* ------------------------------------------------------------ rail & menu */
  buildNav(chapters, flat) {
    const track = this.rail.querySelector('.ruler-track');
    track.innerHTML = '';
    this.ticks = [];
    flat.forEach((f, i) => {
      const t = h('button', `tick${f.step === 0 ? ' major' : ''}`);
      t.style.left = `${(i / Math.max(1, flat.length - 1)) * 100}%`;
      t.setAttribute('aria-label', `${chapters[f.chapter].nav} ${f.step + 1}`);
      if (f.step === 0) t.innerHTML = `<span>${String(f.chapter).padStart(2, '0')}</span>`;
      t.addEventListener('click', () => this.app.goTo(i));
      track.appendChild(t);
      this.ticks.push(t);
    });
    this.rail.querySelector('.rc-total').textContent = String(chapters.length - 1).padStart(2, '0');

    const list = this.menu.querySelector('.menu-list');
    list.innerHTML = '';
    chapters.forEach((c, ci) => {
      const li = h('li', 'menu-item');
      li.innerHTML = `<button><span class="mi-num">${String(ci).padStart(2, '0')}</span><span class="mi-title">${c.nav}</span><span class="mi-sub">${c.en || ''}</span></button>`;
      li.querySelector('button').addEventListener('click', () => {
        this.closeMenu();
        this.app.goTo(flat.findIndex((f) => f.chapter === ci));
      });
      list.appendChild(li);
    });
    this.menuItems = [...list.children];
    this.flatLen = flat.length;
  }

  setProgressMarker(globalIndex, chapterIndex, chapter) {
    const pct = (globalIndex / Math.max(1, this.flatLen - 1)) * 100;
    this.rail.querySelector('.ruler-marker').style.left = `${pct}%`;
    this.ticks?.forEach((t, i) => t.classList.toggle('done', i <= globalIndex));
    this.rail.querySelector('.rc-cur').textContent = String(chapterIndex).padStart(2, '0');
    this.top.querySelector('.tc-num').textContent = `CH.${String(chapterIndex).padStart(2, '0')}`;
    this.top.querySelector('.tc-name').textContent = chapter.nav;
    this.menuItems?.forEach((li, i) => li.classList.toggle('current', i === chapterIndex));
  }

  syncQuality() {
    const q = this.app.quality.mode;
    this.menu.querySelectorAll('.menu-quality button').forEach((b) => b.classList.toggle('on', b.dataset.q === q));
  }

  toggleMenu() {
    this.menu.classList.contains('open') ? this.closeMenu() : this.openMenu();
  }
  openMenu() {
    this.closePanel();
    this.syncQuality();
    this.menu.classList.add('open');
  }
  closeMenu() {
    this.menu.classList.remove('open');
  }

  /* ------------------------------------------------------------ captions */
  showStep(chapter, chapterIndex, stepDef, dir = 1) {
    const old = this.captionWrap.querySelectorAll('.caption:not(.out)');
    old.forEach((el) => {
      el.classList.add('out', dir > 0 ? 'out-up' : 'out-down');
      setTimeout(() => el.remove(), 700);
    });
    this.counters = [];
    const tone = stepDef.tone || chapter.tone || 'dark';
    this.root.dataset.tone = tone;
    this.root.dataset.scrim = stepDef.scrim === false ? 'off' : 'on';
    const c = h('div', `caption in ${stepDef.align === 'center' ? 'center' : ''} ${stepDef.big ? 'big' : ''}`);
    const eyebrow = stepDef.eyebrow ?? `${String(chapterIndex).padStart(2, '0')} — ${chapter.nav}`;
    const title = kinetic(stepDef.title || '', 0, 22);
    let html = `<div class="eyebrow"><span class="eb-line"></span><span class="eb-text">${eyebrow}</span></div>`;
    html += `<h1 class="title" style="--n:${title.count}">${title.html}</h1>`;
    if (stepDef.lead) html += `<p class="lead">${stepDef.lead}</p>`;
    if (stepDef.stats?.length) {
      html += `<div class="stats n${stepDef.stats.length}">`;
      stepDef.stats.forEach((s, i) => {
        const valueHtml = s.text !== undefined
          ? `<span class="sv-text">${s.text}</span>`
          : `<span class="sv-num" data-i="${i}">0</span>`;
        html += `<div class="stat" style="--d:${i}">
          <div class="sv">${s.prefix ? `<small class="pre">${s.prefix}</small>` : ''}${valueHtml}${s.unit ? `<small class="unit">${s.unit}</small>` : ''}</div>
          <div class="sl">${s.label || ''}</div>
        </div>`;
      });
      html += `</div>`;
    }
    if (stepDef.note) html += `<p class="note">${stepDef.note}</p>`;
    const actions = [];
    if (stepDef.cta) actions.push(`<button class="pill primary cap-cta">${stepDef.cta}</button>`);
    if (stepDef.cta2) actions.push(`<button class="pill cap-cta2"><svg viewBox="0 0 24 24"><path d="M9.2 6.8l8.6 5.2-8.6 5.2z"/></svg>${stepDef.cta2}</button>`);
    if (chapter.details) actions.push(`<button class="pill cap-more">詳しく見る</button>`);
    if (actions.length) html += `<div class="cap-actions">${actions.join('')}</div>`;
    c.innerHTML = html;
    this.captionWrap.appendChild(c);
    c.querySelector('.cap-more')?.addEventListener('click', () => this.openDetails());
    c.querySelector('.cap-cta')?.addEventListener('click', () => this.app.onCta(stepDef));
    c.querySelector('.cap-cta2')?.addEventListener('click', () => this.app.onCta({ action: stepDef.action2 }));

    // count-up numbers
    (stepDef.stats || []).forEach((s, i) => {
      if (s.text !== undefined) return;
      const el = c.querySelector(`.sv-num[data-i="${i}"]`);
      this.counters.push({ el, to: s.value, from: s.from ?? 0, dec: s.decimals ?? 0, fmt: s.fmt ?? (s.unit === '年' && s.value > 1800 ? 'year' : undefined), t: -0.35 - i * 0.12, dur: 1.4 });
    });
    if (this.markIndex !== chapterIndex) {
      this.markIndex = chapterIndex;
      const old = this.mark.querySelector('.cm:not(.out)');
      if (old) {
        old.classList.add('out');
        setTimeout(() => old.remove(), 900);
      }
      const m = h('div', 'cm', `<b>${String(chapterIndex).padStart(2, '0')}</b><span>${chapter.en || ''}</span>`);
      this.mark.appendChild(m);
    }
    this.currentChapter = chapter;
    clearTimeout(this._capT);
    this._capT = setTimeout(() => this.measureCaption(), 1300);
    this.capRect = null;
  }

  updateCounters(dt) {
    for (const k of this.counters) {
      if (k.t >= k.dur) continue;
      k.t += dt;
      const p = easeOutExpo(clamp01(k.t / k.dur));
      const v = k.from + (k.to - k.from) * p;
      if (k.fmt === 'oku' && v >= 10000) {
        // 25048 (億円) -> 2兆5,048
        const r = Math.round(v);
        k.el.textContent = `${Math.floor(r / 10000)}兆${formatNumber(r % 10000)}`;
      } else if (k.fmt === 'year') k.el.textContent = String(Math.round(v));
      else k.el.textContent = formatNumber(v, k.dec);
    }
  }

  /* ------------------------------------------------------------ autoplay */
  setPlaying(on) {
    this.playBtn.classList.toggle('playing', on);
    this.playBtn.setAttribute('aria-pressed', String(on));
    this.playBtn.setAttribute('aria-label', on ? '自動再生を止める' : '自動再生');
    document.documentElement.classList.toggle('cinema', on);
    this._autoP = -1;
    this.setAutoProgress(0);
  }
  setAutoProgress(p) {
    p = Math.min(1, Math.max(0, p));
    if (Math.abs(p - this._autoP) < 0.002) return;
    this._autoP = p;
    this.playBtn.style.setProperty('--p', p.toFixed(4));
  }

  /* ------------------------------------------------------------ labels */
  setLabels(labels) {
    this.labelsLayer.innerHTML = '';
    this.labelEls.clear();
    for (const l of labels) {
      const el = h('div', `lbl ${l.cls || ''}`);
      el.innerHTML = `<i class="dot"></i><span class="leader"></span><div class="box"><b>${l.text}</b>${l.sub ? `<small>${l.sub}</small>` : ''}</div>`;
      this.labelsLayer.appendChild(el);
      const rec = { el, bw: 0, bh: 0, flipX: false, flipY: false, sx: 0, sy: 0, placed: false, gdx: NaN, gdy: NaN, left: null };
      this.labelEls.set(l, rec);
    }
    this.measureCaption();
  }
  applyLabelGeom(rec, dx, dy) {
    if (Math.abs(dx - rec.gdx) < 0.25 && Math.abs(dy - rec.gdy) < 0.25) return;
    rec.gdx = dx;
    rec.gdy = dy;
    const len = Math.hypot(dx, dy);
    const st = rec.el.style;
    st.setProperty('--dx', `${dx.toFixed(1)}px`);
    st.setProperty('--dy', `${dy.toFixed(1)}px`);
    st.setProperty('--len', `${Math.max(0, len - 4).toFixed(1)}px`);
    st.setProperty('--ang', `${Math.atan2(dy, dx).toFixed(4)}rad`);
  }
  measureCaption() {
    const c = this.captionWrap.querySelector('.caption:not(.out)');
    this.capRect = c ? c.getBoundingClientRect() : null;
  }
  /**
   * Places the 3D-anchored labels: picks the side that fits (never into the
   * caption), keeps boxes inside the safe area and pushes overlapping boxes
   * apart vertically. The resolved shift is stored relative to the anchor and
   * eased, so labels glide apart without trailing behind moving objects.
   */
  updateLabels(labels, dt = 1 / 60) {
    const W = this.app.width, H = this.app.height;
    const cap = this.capRect;
    const portrait = this.app.layout.portrait;
    const minX = cap && !portrait ? cap.right + 6 : 8;
    const maxX = W - 8, top = 56, bottom = H - 64;
    const live = [];
    for (const l of labels) {
      const rec = this.labelEls.get(l);
      if (!rec) continue;
      const el = rec.el;
      let vis = l.visible;
      // Hide labels whose anchor sits under the caption text.
      if (vis && cap && !portrait && l.x < cap.right + 8 && l.y > cap.top - 10 && l.y < cap.bottom + 10) vis = false;
      if (!vis) {
        if (el.classList.contains('on')) el.classList.remove('on');
        rec.placed = false;
        continue;
      }
      if (!rec.bw) {
        const b = el.querySelector('.box');
        rec.bw = b.offsetWidth || 120;
        rec.bh = b.offsetHeight || 34;
      }
      const ox = Math.abs(l.offset[0]), oy = l.offset[1];
      const need = ox + rec.bw + 8;
      const roomR = maxX - l.x, roomL = l.x - minX;
      // Preferred side unless it doesn't fit and the other side does better.
      let right = l.offset[0] >= 0;
      if (right && roomR < need && roomL > roomR) right = false;
      else if (!right && roomL < need && roomR > roomL) right = true;
      const fy = l.y + oy < top || l.y + oy > bottom;
      const dx = right ? ox : -ox;
      const dy = fy ? -oy : oy;
      // Box rectangle in screen space before shifting.
      const x0 = right ? l.x + dx + 6 : l.x + dx - 6 - rec.bw;
      let tx = 0;
      if (x0 + rec.bw > maxX) tx = maxX - (x0 + rec.bw);
      if (x0 + tx < minX) tx = minX - x0;
      live.push({ l, rec, right, dx, dy, x0: x0 + tx, x1: x0 + tx + rec.bw, cy: l.y + dy, h: rec.bh, tx });
    }
    // Vertical relaxation between overlapping boxes, then clamp to the safe area.
    for (let it = 0; it < 6; it++) {
      live.sort((a, b) => a.cy - b.cy);
      let moved = false;
      for (let i = 0; i < live.length; i++) {
        const a = live[i];
        for (let j = i + 1; j < live.length; j++) {
          const b = live[j];
          if (a.x0 > b.x1 + 6 || b.x0 > a.x1 + 6) continue;
          const gap = (a.h + b.h) / 2 + 5 - (b.cy - a.cy);
          if (gap > 0) {
            a.cy -= gap / 2;
            b.cy += gap / 2;
            moved = true;
          }
        }
      }
      for (const a of live) a.cy = Math.min(Math.max(a.cy, top + a.h / 2), bottom - a.h / 2);
      if (!moved) break;
    }
    const k = 1 - Math.exp(-dt * 10);
    for (const a of live) {
      const { rec, l } = a;
      const ty = a.cy - (l.y + a.dy);
      if (!rec.placed || rec.left !== !a.right) {
        rec.sx = a.tx;
        rec.sy = ty;
      } else {
        rec.sx += (a.tx - rec.sx) * k;
        rec.sy += (ty - rec.sy) * k;
      }
      rec.placed = true;
      if (rec.left !== !a.right) {
        rec.left = !a.right;
        rec.el.classList.toggle('left', rec.left);
      }
      this.applyLabelGeom(rec, a.dx + rec.sx, a.dy + rec.sy);
      rec.el.style.transform = `translate3d(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px, 0)`;
      if (!rec.el.classList.contains('on')) rec.el.classList.add('on');
    }
  }

  /* ------------------------------------------------------------ panel */
  isPanelOpen() {
    return this.panel.classList.contains('open') || this.menu.classList.contains('open');
  }
  toggleDetails() {
    this.panel.classList.contains('open') ? this.closePanel() : this.openDetails();
  }
  openDetails() {
    const c = this.currentChapter;
    if (!c?.details) return;
    this.closeMenu();
    this.panel.querySelector('.panel-kicker').textContent = c.en || '';
    this.panel.querySelector('.panel-title').textContent = c.nav;
    const body = this.panel.querySelector('.panel-body');
    body.innerHTML = c.details + (c.sources ? `<div class="sources"><h4>出典</h4><ul>${c.sources.map((s) => `<li>${s}</li>`).join('')}</ul></div>` : '');
    body.scrollTop = 0;
    this.panel.classList.add('open');
  }
  closePanel() {
    this.panel.classList.remove('open');
  }

  /* ------------------------------------------------------------ misc */
  toast(msg, ms = 4200) {
    this.toastEl.innerHTML = msg;
    this.toastEl.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }
  showHint(on) {
    this.hint.classList.toggle('on', on);
  }
  updateRotate() {
    const show = this.app.layout.portrait && this.app.quality.device.mobile && !this.rotateDismissed;
    this.rotate.classList.toggle('on', !!show);
  }
}
