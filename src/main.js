import './polyfills.js';
import { App } from './core/App.js';
import { CHAPTERS } from './content/chapters.js';
import { REGISTRY } from './chapters/index.js';
import { renderReader } from './ui/Reader.js';

function fail(msg) {
  document.getElementById('gl').style.display = 'none';
  renderReader(document.getElementById('ui'), CHAPTERS, `3D表示を開始できなかったため、テキスト版を表示しています。<br><small>${msg}</small>`);
}

function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch (e) {
    return false;
  }
}

if (/[?&]text\b/.test(location.search)) {
  document.getElementById('gl').style.display = 'none';
  renderReader(document.getElementById('ui'), CHAPTERS);
} else if (!hasWebGL2()) {
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
