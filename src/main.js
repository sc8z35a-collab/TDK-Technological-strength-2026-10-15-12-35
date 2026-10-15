import './polyfills.js';
import { App } from './core/App.js';
import { CHAPTERS } from './content/chapters.js';
import { REGISTRY } from './chapters/index.js';

function fail(msg) {
  const ui = document.getElementById('ui');
  ui.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;pointer-events:auto"><div><p style="font-family:serif;font-size:20px;margin:0 0 8px">3D表示を開始できませんでした</p><p style="font-size:13px;color:#9a9ea6;margin:0">${msg}</p></div></div>`;
}

function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch (e) {
    return false;
  }
}

if (!hasWebGL2()) {
  fail('お使いのブラウザはWebGL 2に対応していません。最新のChrome・Safari・Edgeでお試しください。');
} else {
  const app = new App({
    canvas: document.getElementById('gl'),
    ui: document.getElementById('ui'),
    chapters: /[?&]lab\b/.test(location.search) ? [...CHAPTERS, { id: 'lab', nav: 'LAB', en: 'LAB', steps: [{ title: 'Parts lab' }] }] : CHAPTERS,
    registry: REGISTRY,
  });
  window.__atlas = app;
  app.init().catch((e) => {
    console.error(e);
    fail(String(e && e.message ? e.message : e));
  });
}
