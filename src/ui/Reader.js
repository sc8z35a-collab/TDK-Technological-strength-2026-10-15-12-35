// Text edition: every chapter's captions, figures, details and sources on one
// scrolling page. Used when WebGL 2 is unavailable, on errors, and via ?text.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function statText(s) {
  if (s.text !== undefined) return s.text;
  const v = s.value;
  if (s.fmt === 'oku' && v >= 10000) return `${Math.floor(v / 10000)}兆${(v % 10000).toLocaleString('ja-JP')}`;
  if (s.unit === '年') return String(v);
  return v.toLocaleString('ja-JP', { minimumFractionDigits: s.decimals || 0, maximumFractionDigits: s.decimals || 0 });
}

export function renderReader(root, chapters, notice = '') {
  document.documentElement.classList.add('reader-mode');
  const toc = chapters
    .map((c, i) => `<li><a href="#r-${i}"><span>${String(i).padStart(2, '0')}</span>${esc(c.nav)}</a></li>`)
    .join('');
  const body = chapters
    .map((c, i) => {
      const steps = c.steps
        .map((st) => {
          const stats = (st.stats || [])
            .map((s) => `<div class="r-stat"><b>${s.prefix ? `<small>${esc(s.prefix)}</small>` : ''}${esc(statText(s))}${s.unit ? `<small>${esc(s.unit)}</small>` : ''}</b><span>${esc(s.label)}</span></div>`)
            .join('');
          return `<section class="r-step">
            <h3>${esc(st.title).replace(/\n/g, '<br>')}</h3>
            ${st.lead ? `<p class="r-lead">${st.lead}</p>` : ''}
            ${stats ? `<div class="r-stats">${stats}</div>` : ''}
            ${st.note ? `<p class="r-note">${st.note}</p>` : ''}
          </section>`;
        })
        .join('');
      const sources = c.sources ? `<div class="r-sources"><h4>出典</h4><ul>${c.sources.map((s) => `<li>${s}</li>`).join('')}</ul></div>` : '';
      return `<article class="r-chapter" id="r-${i}">
        <header><span class="r-num">${String(i).padStart(2, '0')}</span><div><p class="r-en">${esc(c.en || '')}</p><h2>${esc(c.nav)}</h2></div></header>
        ${steps}
        ${c.details ? `<details class="r-details"><summary>詳しく見る</summary><div class="panel-body">${c.details}</div></details>` : ''}
        ${sources}
      </article>`;
    })
    .join('');
  root.innerHTML = `<div class="reader">
    <header class="r-top">
      <p class="r-kicker">TDK TECHNOLOGY ATLAS — 2026.10.15</p>
      <h1>TDKの技術力と世界シェア<br><small>テキスト版</small></h1>
      ${notice ? `<p class="r-notice">${notice}</p>` : ''}
      <p class="r-disclaimer">本サイトは2026年10月15日時点の公開情報をもとに個人が作成した<b>非公式の学習用コンテンツ</b>です。TDK株式会社とは関係ありません。世界シェアは特に断りがない限りTDK自身の推定値です。</p>
      ${notice ? '' : `<p><a class="r-back" href="./">3D版にもどる</a></p>`}
      <nav class="r-toc"><ol>${toc}</ol></nav>
    </header>
    ${body}
    <footer class="r-foot">TDK Technology Atlas 2026 — 非公式の学習用コンテンツ</footer>
  </div>`;
}
