import { chromium } from 'playwright-core';
import path from 'node:path';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { CameraRig } from '../src/core/CameraRig.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unitRig = new CameraRig(new THREE.PerspectiveCamera());
for (let i = 0; i < 22; i++) unitRig.zoomBy(1.5);
assert.equal(unitRig.zoomTarget, 15, 'camera rig enforces the exact 15× maximum');
unitRig.setZoom(0);
assert.equal(unitRig.zoomTarget, 1, 'camera rig enforces the 1× minimum');
const browser = await chromium.launch({
  executablePath: process.env.CHROME || (existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : '/usr/bin/chromium'),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: 800, height: 450 }, hasTouch: true });
await context.addInitScript(() => localStorage.setItem('tdk-atlas-quality', 'low'));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_FILE_NOT_FOUND/.test(m.text())) errors.push(m.text()); });
await page.goto('file://' + path.join(root, 'docs/index.html'));
await page.waitForFunction(() => window.__atlas?.started, null, { timeout: 90000 });
await page.waitForTimeout(1800);

const state = () => page.evaluate(() => ({
  g: window.__atlas.g,
  zoom: window.__atlas.current.rig.zoom,
  zoomTarget: window.__atlas.current.rig.zoomTarget,
  yaw: window.__atlas.current.rig.yaw.target,
  fx: !!document.querySelector('.cinematic-fx canvas'),
  autoplay: !!document.querySelector('.rail-play'),
}));
assert.equal((await state()).g, 0);
assert.equal((await state()).fx, true, 'cinematic canvas exists');
assert.equal((await state()).autoplay, false, 'autoplay navigation is removed');
assert.equal(await page.locator('.cap-cta').count(), 0, 'scene CTA cannot bypass arrow navigation');

console.log('stage: navigation guards');
// Tap, wheel, keyboard and touch swipes must never advance the phase.
await page.mouse.click(400, 250);
await page.waitForTimeout(100);
assert.equal((await state()).g, 0, 'canvas tap does not navigate');
for (const key of ['ArrowDown', 'ArrowRight', 'PageDown', 'Space', 'Enter', 'End']) {
  await page.keyboard.press(key);
  assert.equal((await state()).g, 0, `${key} does not navigate`);
}
const cdp = await context.newCDPSession(page);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 700, y: 420, id: 1 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 700, y: 180, id: 1 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(200);
assert.equal((await state()).g, 0, 'touch swipe does not navigate');

console.log('stage: zoom limits');
// Real registered controls zoom and reset without changing the phase. Events
// are applied atomically so the software GPU never has to render a close-up.
const zoomResult = await page.evaluate(() => {
  const canvas = document.querySelector('#gl');
  const start = window.__atlas.current.rig.zoomTarget;
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -480, bubbles: true, cancelable: true }));
  const wheel = window.__atlas.current.rig.zoomTarget;
  document.querySelector('.zoom-in').click();
  const button = window.__atlas.current.rig.zoomTarget;
  document.querySelector('.view-reset').click();
  const reset = window.__atlas.current.rig.zoomTarget;
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 600, bubbles: true, cancelable: true }));
  return { start, wheel, button, reset, minimum: window.__atlas.current.rig.zoomTarget, g: window.__atlas.g };
});
assert.ok(zoomResult.wheel > zoomResult.start, 'wheel zooms the model');
assert.ok(zoomResult.button > zoomResult.wheel, 'zoom-in button works');
assert.equal(zoomResult.reset, 1, 'reset restores the 1× target');
assert.equal(zoomResult.minimum, 1, 'zoom cannot go below 1×');
assert.equal(zoomResult.g, 0, 'zoom controls never navigate');

console.log('stage: 360 orbit');
// Registered pointer handlers accept a drag beyond a full turn and preserve it.
const orbit = await page.evaluate(() => {
  const canvas = document.querySelector('#gl');
  canvas.setPointerCapture = () => {};
  canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, pointerType: 'mouse', button: 0, clientX: 100, clientY: 400, bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 77, pointerType: 'mouse', clientX: 1300, clientY: 400, bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 77, pointerType: 'mouse', clientX: 1300, clientY: 400, bubbles: true }));
  const held = window.__atlas.current.rig.yaw.target;
  document.querySelector('.view-reset').click();
  return { held, reset: window.__atlas.current.rig.yaw.target };
});
assert.ok(Math.abs(orbit.held) > Math.PI * 2, 'orbit supports more than 360°');
assert.equal(orbit.reset, 0, 'view reset clears orbit');

console.log('stage: animation and arrows');
// Animation is live, and only the bottom arrow buttons navigate.
const frames = await page.evaluate(() => {
  const fx = window.__atlas.overlay.fx;
  const hash = () => {
    const c = fx.canvas, data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let value = 0;
    for (let i = 0; i < data.length; i += 401) value = (value * 31 + data[i]) >>> 0;
    return value;
  };
  fx.update(1 / 60, 1, { x: 0, y: 0 });
  const a = hash();
  fx.update(1 / 60, 2, { x: 0.2, y: 0.1 });
  return { a, b: hash() };
});
assert.notEqual(frames.a, frames.b, 'cinematic animation is rendering');
const arrows = await page.evaluate(() => {
  document.querySelector('.rail-next').click();
  const next = window.__atlas.g;
  const phaseFx = !!document.querySelector('.cinematic-fx.phase');
  document.querySelector('.rail-prev').click();
  return { next, prev: window.__atlas.g, phaseFx };
});
assert.equal(arrows.next, 1, 'NEXT advances exactly one phase');
assert.equal(arrows.phaseFx, true, 'phase transition FX triggers');
assert.equal(arrows.prev, 0, 'PREV returns exactly one phase');

await page.goto('file://' + path.join(root, 'docs/index.html'));
await page.waitForFunction(() => window.__atlas?.started, null, { timeout: 90000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/tdk-desktop.png' });
await page.setViewportSize({ width: 812, height: 375 });
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/tdk-mobile-landscape.png' });
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(400);
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no portrait horizontal overflow');
assert.deepEqual(errors, [], 'no browser runtime errors');
console.log('PASS: arrow-only navigation, tap/swipe/wheel/key guards, 360° persistent orbit, 1–15× zoom, live cinematic FX, responsive layout, zero runtime errors');
await browser.close();
