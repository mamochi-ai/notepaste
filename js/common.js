// 両画面で共通のUI部品

export const SAMPLE_MD = `# iPadだけでAI開発を始めてみた

PCを持っていなくても、**iPadとAIだけ**で小さなWebツールを作れるのか試してみました。結論から言うと、*思っていたよりずっと簡単*でした。

## はじめに

この記事は、noteへの貼り付けテスト用のサンプルです。見出し・太字・箇条書き・画像がそのまま残るかを確認します。

### 用意したもの

- iPad（Safari）
- ChatGPT または Claude
- GitHub アカウント（無料）

### 作業の流れ

1. AIに作りたいものを説明する
2. できたコードを GitHub に置く
3. **GitHub Pages** で公開する

![テスト画像](img:sample)

画像の後に続く文章です。この段落が、画像の下に正しく表示されているかを確認してください。

## やってみた感想

> 「できるかどうか」より「何を作りたいか」のほうが大事だと感じました。

詳しい手順は [GitHub Pages の公式ドキュメント](https://docs.github.com/ja/pages) を参考にしました。
`;

const THEME_KEY = 'nps-theme';
const THEME_LABEL = { auto: '自動', light: 'ライト', dark: 'ダーク' };

export function storageGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch (_) {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

export function initTheme() {
  const btn = document.getElementById('themeToggle');
  const apply = (mode) => {
    if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
    if (btn) {
      btn.querySelector('span').textContent = THEME_LABEL[mode];
      btn.setAttribute('aria-label', `表示テーマ：${THEME_LABEL[mode]}（タップで切り替え）`);
    }
  };
  let mode = storageGet(THEME_KEY, 'auto');
  apply(mode);
  btn?.addEventListener('click', () => {
    mode = mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto';
    storageSet(THEME_KEY, mode);
    apply(mode);
  });
}

let toastTimer = 0;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/** 小さなDOM生成ヘルパー（文字列は必ず textContent で入れる） */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function bytesOf(str) {
  return new Blob([str]).size;
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * コピー結果を表示する。クリップボードへの書き込み結果と、note貼り付け結果（未確認）を分けて示す。
 * @param {HTMLElement} box
 * @param {object} r copy結果
 * @param {object} [info] {label, imageMode, stats, htmlBytes, textBytes, notes:string[]}
 */
export function showCopyResult(box, r, info = {}) {
  box.replaceChildren();
  box.hidden = false;
  box.className = `result ${r.ok ? 'is-ok' : 'is-ng'}`;
  box.append(
    h(
      'div',
      { class: 'result-head' },
      h('span', { class: 'result-icon', 'aria-hidden': 'true' }, r.ok ? '✓' : '!'),
      h('strong', {}, r.ok ? 'クリップボードへの書き込み：成功' : 'クリップボードへの書き込み：失敗'),
      h('span', { class: 'result-time' }, fmtTime(r.at)),
    ),
  );
  if (r.ok && info.compact) {
    box.firstChild.querySelector('strong').textContent = 'コピーしました';
    box.append(h('p', { class: 'result-note' }, info.message || ''));
    return;
  }
  box.append(
    h(
      'p',
      { class: 'result-note' },
      r.ok
        ? 'noteへの貼り付け結果：未確認です。noteの編集画面で貼り付け、見出し・太字・画像が残るか確認してください。'
        : info.failHint || '下の「うまくいかない場合」の方法（全選択して手動コピー・プレーンテキスト・HTML保存）を試してください。',
    ),
  );
  const dl = h('dl', { class: 'result-meta' });
  const row = (k, v) => v != null && v !== '' && dl.append(h('dt', {}, k), h('dd', {}, String(v)));
  row('内容', info.label);
  row('方式', r.method);
  row('形式', (r.types || []).join(' + '));
  if (info.stats) {
    const s = info.stats;
    const parts = [`${s.images}枚`];
    if (s.embedded) parts.push(`埋め込み ${s.embedded}`);
    if (s.placeholders) parts.push(`目印に置換 ${s.placeholders}`);
    if (s.missing) parts.push(`見つからない ${s.missing}`);
    row('画像', `${parts.join(' / ')}（${info.imageMode || ''}）`);
  }
  if (info.htmlBytes) row('HTMLサイズ', `${(info.htmlBytes / 1024).toFixed(1)} KB`);
  if (r.durationMs != null) row('所要時間', `${r.durationMs} ms`);
  box.append(dl);

  const attempts = r.attempts && r.attempts.length > 1 ? r.attempts : r.ok ? [] : [r];
  for (const a of attempts) {
    const item = h('div', { class: `attempt ${a.ok ? 'ok' : 'ng'}` }, h('strong', {}, `${a.method}：${a.ok ? '成功' : '失敗'}`));
    if (a.error) {
      item.append(h('code', {}, `${a.error.name}: ${a.error.message}`));
      if (a.error.hint) item.append(h('span', {}, a.error.hint));
    }
    box.append(item);
  }
  for (const n of info.notes || []) box.append(h('p', { class: 'result-warn' }, n));
}

export function download(filename, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function dateStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
