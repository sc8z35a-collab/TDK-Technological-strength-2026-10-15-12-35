// Scene-building helpers shared by several chapters.
import * as THREE from 'three';
import { materials, roundedBox } from '../core/kit.js';
import { canvasTexture } from '../core/textures.js';
import { mulberry32 } from '../core/math.js';

/** Shadow-casting spot light aimed at a target, tuned for small product scenes. */
export function spot(scene, { color = 0xfff1de, intensity = 60, pos = [-3, 6, 4], target = [0, 0, 0], angle = 0.5, penumbra = 0.7, decay = 1.3, distance = 0, shadow = false, shadowSize = 1024, bias = -0.0002, near = 0.5, far = 30 } = {}) {
  const s = new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay);
  s.position.set(...pos);
  s.target.position.set(...target);
  if (shadow) {
    s.castShadow = true;
    s.shadow.mapSize.set(shadowSize, shadowSize);
    s.shadow.camera.near = near;
    s.shadow.camera.far = far;
    s.shadow.bias = bias;
    s.shadow.normalBias = 0.02;
    s.shadow.radius = 5;
  }
  scene.add(s, s.target);
  return s;
}

/** Aged paper texture with optional vertical Japanese text block. */
export function paperTexture({ w = 768, h = 1024, seed = 3, draw, key } = {}) {
  return canvasTexture(w, h, (ctx, cw, ch) => {
    const rand = mulberry32(seed);
    const g = ctx.createLinearGradient(0, 0, cw, ch);
    g.addColorStop(0, '#e9dfc8');
    g.addColorStop(1, '#d9caa8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
    // fibres and foxing
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(120,90,50,${rand() * 0.05})`;
      ctx.fillRect(rand() * cw, rand() * ch, 1 + rand() * 2, 1 + rand() * 6);
    }
    for (let i = 0; i < 22; i++) {
      const x = rand() * cw, y = rand() * ch, r = 6 + rand() * 40;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(150,105,55,0.13)');
      rg.addColorStop(1, 'rgba(150,105,55,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // darkened edges
    const eg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    eg.addColorStop(0, 'rgba(90,60,30,0)');
    eg.addColorStop(1, 'rgba(90,60,30,0.28)');
    ctx.fillStyle = eg;
    ctx.fillRect(0, 0, cw, ch);
    if (draw) draw(ctx, cw, ch, rand);
  }, { srgb: true, key });
}

/** Draw a vertical (tategaki) line of text, top to bottom, starting at x,y. */
export function verticalText(ctx, text, x, y, size, gap = 1.08) {
  let yy = y;
  for (const ch of text) {
    const rotate = /[ー〜]/.test(ch);
    if (rotate) {
      ctx.save();
      ctx.translate(x, yy + size / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    } else ctx.fillText(ch, x, yy + size / 2);
    yy += size * gap;
  }
}

/** Large table top + floor fade for "museum desk" scenes. */
export function tableTop(scene, { w = 20, d = 7, y = 0, material } = {}) {
  const M = materials();
  const mat = material || M.walnut;
  const top = new THREE.Mesh(roundedBox(w, 0.18, d, 0.04, 3), mat);
  top.position.y = y - 0.09;
  top.receiveShadow = true;
  scene.add(top);
  return top;
}

/** Canvas texture for embossed lettering: white text on black, used as bump map. */
export function embossTexture(w, h, draw, key) {
  return canvasTexture(w, h, (ctx, cw, ch) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    draw(ctx, cw, ch);
  }, { key });
}
