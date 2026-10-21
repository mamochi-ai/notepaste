import { buildArticle, clipboardHtml, htmlToText, IMAGE_MODES } from './article.js';
import { copyRich, copyPlain, legacyCopy, writeClipboard, writeClipboardItems, selectElement, clipboardEnv } from './clipboard.js';
import { ImageStore, toPngBlob } from './images.js';
import { SAMPLE_MD, initTheme, toast, h, showCopyResult, storageGet, storageSet, download, dateStamp, bytesOf } from './common.js';

const RECORDS_KEY = 'nps-records';
const $ = (id) => document.getElementById(id);
const store = new ImageStore();
const opt = { extractTitle: true, noteHeadings: true };

const NOTE_RESULTS = [
  ['', '選んでください'],
  ['all', '文章（装飾つき）も画像も貼れた'],
  ['decorated', '文章は装飾つきで貼れた（画像はなし）'],
  ['textonly', '文字は貼れたが、装飾が消えた'],
  ['imageonly', '画像だけ貼れた（文章はなし）'],
  ['fail', '何も貼り付けられなかった'],
];
// iPadOS 26 / Safari 26.5 での検証結果（2026-10-21、ユーザーによる記録）
const VERIFIED = {
  'html-dataurl': ['ng', 'iPad検証：noteに貼り付けできず'],
  'html-bloburl': ['ng', 'iPad検証：noteに貼り付けできず'],
  'html-https': ['ng', 'iPad検証：noteに貼り付けできず'],
  'html-none': ['ok', 'iPad検証：見出し・太字・リンクが残った'],
  png: ['ok', 'iPad検証：画像として貼れた'],
  legacy: ['ng', 'iPad検証：noteに貼り付けできず'],
  manual: ['ng', 'iPad検証：noteに貼り付けできず'],
};
const ELEMENTS = ['見出し', '太字', '箇条書き', '番号付きリスト', '画像', 'リンク', '引用'];

function build(mode) {
  return buildArticle(SAMPLE_MD, store, { mode, ...opt });
}

function articleCopy(mode) {
  const art = build(mode);
  const html = clipboardHtml(art.html);
  return { art, html, text: htmlToText(art.html), htmlBytes: bytesOf(html) };
}

const METHODS = [
  {
    id: 'html-dataurl',
    title: '① HTML＋data URL画像',
    desc: '画像をHTMLの中に文字データ（data URL）として直接書き込みます。外部への通信なしで画像を運べる唯一のHTML方式ですが、貼り付け先が data URL を取り除く場合があります。',
    run() {
      const c = articleCopy('dataurl');
      return copyRich(c.html, c.text).then((r) => [r, { stats: c.art.stats, imageMode: IMAGE_MODES.dataurl.short, htmlBytes: c.htmlBytes }]);
    },
  },
  {
    id: 'html-bloburl',
    title: '② HTML＋Blob URL画像',
    desc: 'このページの中でだけ有効な一時的なURLです。比較用で、note側では画像を読み込めない見込みです。',
    run() {
      const c = articleCopy('bloburl');
      return copyRich(c.html, c.text).then((r) => [r, { stats: c.art.stats, imageMode: IMAGE_MODES.bloburl.short, htmlBytes: c.htmlBytes }]);
    },
  },
  {
    id: 'html-https',
    title: '③ HTML＋公開HTTPS画像URL',
    desc: 'このサイトに置いたテスト画像の公開URLを使います。貼り付け先が外部画像を読み込む、または自動で取り込む仕様なら表示されます。',
    run() {
      const c = articleCopy('https');
      const notes = location.protocol === 'https:' ? [] : ['このページはHTTPSで開かれていないため、画像URLも公開HTTPS URLではありません。GitHub Pagesで開いて検証してください。'];
      return copyRich(c.html, c.text).then((r) => [r, { stats: c.art.stats, imageMode: IMAGE_MODES.https.short, htmlBytes: c.htmlBytes, notes }]);
    },
  },
  {
    id: 'html-none',
    title: '④ HTMLのみ（画像は目印）',
    desc: '画像を含めず、画像の位置に「［画像1：…］」という目印を入れます。文章の装飾だけを確認したいとき、または画像を後からnoteで挿入するときに使います。',
    run() {
      const c = articleCopy('none');
      return copyRich(c.html, c.text).then((r) => [r, { stats: c.art.stats, imageMode: IMAGE_MODES.none.short, htmlBytes: c.htmlBytes }]);
    },
  },
  {
    id: 'png',
    title: '⑤ 画像そのもの（image/png）',
    desc: 'テスト画像のデータをPNG形式でクリップボードに入れます。文章は含みません。noteの本文に貼り付けて、画像として取り込まれるか確認します。',
    run() {
      const item = store.get('sample');
      if (!item) return Promise.resolve([notReady(), {}]);
      return writeClipboard({ 'image/png': toPngBlob(item.blob) }, 'clipboard.write（image/png）').then((r) => [r, { label: 'テスト画像（PNG）' }]);
    },
  },
  {
    id: 'legacy',
    title: '⑥ 旧方式 execCommand（data URL）',
    desc: "Clipboard APIを使わず、古い document.execCommand('copy') でHTMLを設定します。Clipboard APIが失敗する環境の代替手段として検証します。",
    run() {
      const c = articleCopy('dataurl');
      const r = legacyCopy(c.html, c.text);
      return Promise.resolve([r, { stats: c.art.stats, imageMode: IMAGE_MODES.dataurl.short, htmlBytes: c.htmlBytes }]);
    },
  },
  {
    id: 'manual',
    title: '⑦ 手動選択コピー',
    desc: 'プレビューの本文を選択状態にします。選択範囲をタップし、メニューの「コピー」で手動コピーしてください。Safari自身がコピー内容を作るため、①〜⑥と結果が異なることがあります。',
    button: '本文を選択',
    manual: true,
    run() {
      selectElement($('previewBody'));
      $('previewBody').scrollIntoView({ block: 'center', behavior: 'smooth' });
      toast('選択しました。選択範囲をタップして「コピー」を選んでください');
      return null;
    },
  },
  {
    id: 'html-png-one',
    title: '⑧ 文章＋画像を同時に（1アイテム）',
    desc: '1つのクリップボード項目に、画像なしの文章（text/html・text/plain）と画像データ（image/png）を同時に入れます。noteが両方を読むか、どちらか片方だけを読むかを確認します。',
    run() {
      const item = store.get('sample');
      const c = articleCopy('none');
      if (!item) return Promise.resolve([notReady(), {}]);
      return writeClipboard({ 'text/html': c.html, 'text/plain': c.text, 'image/png': toPngBlob(item.blob) }, 'clipboard.write（HTML＋PNG・1アイテム）').then((r) => [
        r,
        { stats: c.art.stats, imageMode: '目印＋PNG同時', htmlBytes: c.htmlBytes, notes: ['ブラウザがこの組み合わせを受け付けない場合は「失敗」になります。'] },
      ]);
    },
  },
  {
    id: 'html-png-multi',
    title: '⑨ 文章と画像を別アイテムで同時に',
    desc: '文章（text/html・text/plain）の項目と、画像（image/png）の項目を、1回の書き込みで2つ入れます。対応していないブラウザでは失敗します。',
    run() {
      const item = store.get('sample');
      const c = articleCopy('none');
      if (!item) return Promise.resolve([notReady(), {}]);
      return writeClipboardItems([{ 'text/html': c.html, 'text/plain': c.text }, { 'image/png': toPngBlob(item.blob) }], 'clipboard.write（2アイテム）').then((r) => [
        r,
        { stats: c.art.stats, imageMode: '目印＋PNG別アイテム', htmlBytes: c.htmlBytes },
      ]);
    },
  },
];

function notReady() {
  return { ok: false, method: 'clipboard.write', types: [], at: new Date().toISOString(), error: { name: 'NotReady', message: 'テスト画像の読み込みが終わっていません。少し待ってからもう一度押してください' } };
}

// ---------- 記録 ----------

function loadRecords() {
  const r = storageGet(RECORDS_KEY, []);
  return Array.isArray(r) ? r : [];
}

function uaShort() {
  const ua = navigator.userAgent;
  const env = clipboardEnv();
  const os = env.iPadOS ? 'iPadOS' : /iPhone/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : 'その他';
  const osVer = (ua.match(/OS (\d+[_.]\d+)/) || [])[1];
  const br = /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /EdgiOS|Edg\//.test(ua) ? 'Edge' : /Safari\//.test(ua) ? 'Safari' : 'ブラウザ不明';
  const ver = (ua.match(/Version\/([\d.]+)/) || [])[1];
  return `${os}${osVer && os !== 'macOS' ? ' ' + osVer.replace('_', '.') : ''} / ${br}${ver && br === 'Safari' ? ' ' + ver : ''}`;
}

function renderRecords() {
  const recs = loadRecords();
  $('recordsEmpty').hidden = recs.length > 0;
  $('recordRows').replaceChildren(
    ...recs
      .slice()
      .reverse()
      .map((r) =>
        h(
          'tr',
          {},
          h('td', {}, new Date(r.at).toLocaleString('ja-JP')),
          h('td', {}, r.methodTitle),
          h('td', { class: r.copy === '成功' ? 'ok' : r.copy === '失敗' ? 'ng' : '' }, r.copy),
          h('td', {}, r.noteResultLabel),
          h('td', {}, (r.kept || []).join('、') || '—'),
          h('td', { class: 'memo' }, r.memo || ''),
          h('td', { class: 'muted' }, r.env),
          h(
            'td',
            {},
            h(
              'button',
              {
                type: 'button',
                class: 'btn small danger',
                'aria-label': 'この記録を削除',
                onclick: () => {
                  storageSet(RECORDS_KEY, loadRecords().filter((x) => x.id !== r.id));
                  renderRecords();
                },
              },
              '削除',
            ),
          ),
        ),
      ),
  );
}

function recordsText() {
  return loadRecords()
    .map(
      (r) =>
        `■ ${new Date(r.at).toLocaleString('ja-JP')}｜${r.methodTitle}\n` +
        `  コピー：${r.copy}${r.copyError ? `（${r.copyError}）` : ''}\n` +
        `  noteでの結果：${r.noteResultLabel}\n` +
        `  残った要素：${(r.kept || []).join('、') || '—'}\n` +
        (r.memo ? `  メモ：${r.memo}\n` : '') +
        `  設定：H1をタイトルに分離=${r.options?.extractTitle ? 'する' : 'しない'}、note見出し変換=${r.options?.noteHeadings ? 'する' : 'しない'}\n` +
        `  環境：${r.env}`,
    )
    .join('\n\n');
}

// ---------- 方式カード ----------

function methodCard(m) {
  let last = null;
  const resultBox = h('div', { class: 'result', hidden: true, 'aria-live': 'polite' });
  const select = h('select', { 'aria-label': 'noteでの結果' }, ...NOTE_RESULTS.map(([v, l]) => h('option', { value: v }, l)));
  const checks = ELEMENTS.map((name) => {
    const input = h('input', { type: 'checkbox', value: name });
    return { name, input, label: h('label', { class: 'chip' }, input, name) };
  });
  const memo = h('textarea', { rows: 2, placeholder: '気づいたこと（例：画像だけ消えた、見出しが太字になった）', 'aria-label': 'メモ' });

  const runBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn-primary',
      onclick: () => {
        // run() の中で同期的に clipboard.write まで到達させる
        const p = m.run();
        if (!p) {
          last = { ok: null, manual: true };
          return;
        }
        p.then(([r, info]) => {
          last = r;
          showCopyResult(resultBox, r, { failHint: 'この端末（ブラウザ）では、この方式でコピーできませんでした。エラー内容を確認してください。', ...info });
        });
      },
    },
    m.button || 'コピー',
  );

  const save = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      onclick: () => {
        const noteResult = select.value;
        const recs = loadRecords();
        recs.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          at: new Date().toISOString(),
          method: m.id,
          methodTitle: m.title,
          copy: m.manual ? '手動' : last == null ? '未実行' : last.ok ? '成功' : '失敗',
          copyError: last && last.error ? `${last.error.name}: ${last.error.message}` : '',
          noteResult,
          noteResultLabel: noteResult ? NOTE_RESULTS.find(([v]) => v === noteResult)[1] : '未確認',
          kept: checks.filter((c) => c.input.checked).map((c) => c.name),
          memo: memo.value.trim(),
          options: { ...opt },
          env: uaShort(),
          ua: navigator.userAgent,
        });
        if (!storageSet(RECORDS_KEY, recs)) {
          toast('記録を保存できませんでした（プライベートブラウズ等）');
          return;
        }
        renderRecords();
        memo.value = '';
        select.value = '';
        for (const c of checks) c.input.checked = false;
        toast('記録しました');
      },
    },
    '記録する',
  );

  return h(
    'article',
    { class: 'method' },
    h('h3', {}, m.title),
    VERIFIED[m.id] ? h('span', { class: `verified ${VERIFIED[m.id][0]}` }, VERIFIED[m.id][1]) : h('span', { class: 'verified' }, '未検証'),
    h('p', { class: 'hint' }, m.desc),
    runBtn,
    resultBox,
    h(
      'fieldset',
      { class: 'record' },
      h('legend', {}, 'noteに貼り付けた結果'),
      select,
      h('div', { class: 'chips', role: 'group', 'aria-label': '残った要素' }, h('span', { class: 'muted' }, '残った要素：'), ...checks.map((c) => c.label)),
      memo,
      save,
    ),
  );
}

// ---------- 環境 ----------

function renderEnv() {
  const e = clipboardEnv();
  const yn = (v) => (v === true ? 'あり' : v === false ? 'なし' : '判定できません');
  const rows = [
    ['安全な接続（HTTPS）', yn(e.secureContext), e.secureContext ? '' : 'Clipboard APIはHTTPSでのみ使えます'],
    ['navigator.clipboard.write', yn(e.write), ''],
    ['ClipboardItem', yn(e.clipboardItem), ''],
    ['text/html の書き込み', yn(e.supportsHtml), e.supportsHtml === null ? 'ClipboardItem.supports() がないため事前判定できません。実際にコピーして確認してください' : ''],
    ['image/png の書き込み', yn(e.supportsPng), e.supportsPng === null ? '同上' : ''],
    ["execCommand('copy')", yn(e.execCopy), '旧方式（代替手段）'],
    ['端末', uaShort(), ''],
  ];
  $('envList').replaceChildren(...rows.flatMap(([k, v, note]) => [h('dt', {}, k), h('dd', {}, h('span', { class: v === 'なし' ? 'ng' : v === 'あり' ? 'ok' : '' }, v), note ? h('small', {}, note) : null)]));
}

// ---------- 貼り付けテスト ----------

function srcKind(src) {
  if (!src) return '（なし）';
  const m = src.match(/^([a-z][a-z0-9+.-]*):/i);
  return m ? m[1].toLowerCase() : '相対パス';
}

function countElements(root) {
  const q = (sel) => root.querySelectorAll(sel).length;
  const imgs = [...root.querySelectorAll('img')];
  const kinds = {};
  for (const i of imgs) {
    const k = srcKind(i.getAttribute('src'));
    kinds[k] = (kinds[k] || 0) + 1;
  }
  return {
    見出し: q('h1,h2,h3,h4,h5,h6'),
    太字: q('strong,b'),
    斜体: q('em,i'),
    リスト項目: q('li'),
    引用: q('blockquote'),
    リンク: q('a[href]'),
    画像: imgs.length,
    imgKinds: kinds,
  };
}

function sanitizePasteArea(area) {
  area.querySelectorAll('script,iframe,object,embed,link,meta,style,form,input,button,textarea,select,base').forEach((n) => n.remove());
  area.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const name = a.name.toLowerCase();
      if (name.startsWith('on') || name === 'contenteditable' || name === 'srcdoc') el.removeAttribute(a.name);
      if ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action') && /^\s*(javascript|vbscript):/i.test(a.value)) el.removeAttribute(a.name);
    }
  });
}

function infoBlock(title, obj) {
  const dl = h('dl', { class: 'result-meta' });
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'imgKinds') continue;
    dl.append(h('dt', {}, k), h('dd', {}, String(v)));
  }
  if (obj.imgKinds && Object.keys(obj.imgKinds).length) {
    dl.append(h('dt', {}, '画像のURL種別'), h('dd', {}, Object.entries(obj.imgKinds).map(([k, n]) => `${k}: ${n}`).join(' / ')));
  }
  return h('div', { class: 'info-block' }, h('h4', {}, title), dl);
}

function bindPasteArea() {
  const area = $('pasteArea');
  const info = $('pasteInfo');
  area.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    const types = cd ? [...cd.types] : [];
    const html = cd ? cd.getData('text/html') : '';
    const files = cd ? [...cd.files].map((f) => f.type || '不明') : [];
    // DOMParser の文書はスクリプトも画像読み込みも実行しない（解析専用）
    const parsed = html ? countElements(new DOMParser().parseFromString(html, 'text/html')) : null;
    // 貼り付け自体はブラウザ標準の動作に任せる（ブラウザが行う変換も含めて確認するため）
    setTimeout(() => {
      sanitizePasteArea(area);
      const imgs = [...area.querySelectorAll('img')];
      const finish = () => {
        const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0).length;
        const after = countElements(area);
        after['表示できた画像'] = `${loaded} / ${imgs.length}`;
        info.replaceChildren(
          infoBlock('クリップボードの中身', {
            データの種類: types.join(', ') || '（取得できません）',
            'text/html の長さ': html ? `${html.length.toLocaleString()} 文字` : 'なし',
            ファイル: files.join(', ') || 'なし',
            ...(parsed || {}),
          }),
          infoBlock('貼り付け後にこの領域に残った要素', after),
          h('p', { class: 'result-warn' }, 'この結果はこのページでのものです。noteでの結果は、noteで貼り付けて確認・記録してください。'),
        );
      };
      if (!imgs.length) return finish();
      // 画像の読み込みを最大2秒待つ
      Promise.race([Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => {
                i.addEventListener('load', r, { once: true });
                i.addEventListener('error', r, { once: true });
              })))), new Promise((r) => setTimeout(r, 2000))]).then(finish);
    }, 60);
  });
  area.addEventListener('drop', () => setTimeout(() => sanitizePasteArea(area), 60));
  $('clearPaste').addEventListener('click', () => {
    area.replaceChildren();
    info.replaceChildren(h('p', { class: 'muted' }, '貼り付けると、クリップボードに入っていたデータの種類と、残った要素を表示します。'));
  });
}

// ---------- 初期化 ----------

function renderSample() {
  const art = build('preview');
  $('previewTitle').hidden = !art.title;
  $('previewTitle').textContent = art.title || '';
  $('previewBody').innerHTML = art.html; // エスケープ済み・許可タグのみ
  $('copyTitle').hidden = !art.title;
}

async function main() {
  initTheme();
  renderEnv();
  $('sampleSource').textContent = SAMPLE_MD;
  for (const key of ['extractTitle', 'noteHeadings']) {
    $(key).addEventListener('change', () => {
      opt[key] = $(key).checked;
      renderSample();
    });
  }
  $('copyTitle').addEventListener('click', () => {
    const t = build('none').title;
    if (t) copyPlain(t).then((r) => toast(r.ok ? 'タイトルをコピーしました' : `コピー失敗：${r.error?.message || ''}`));
  });
  $('methods').replaceChildren(...METHODS.map(methodCard));
  bindPasteArea();
  renderRecords();
  $('copyRecords').addEventListener('click', () => {
    const t = recordsText();
    if (!t) return toast('記録がありません');
    copyPlain(t).then((r) => toast(r.ok ? '記録をコピーしました' : 'コピーできませんでした'));
  });
  $('downloadRecords').addEventListener('click', () => {
    download(`note-paste-records-${dateStamp()}.json`, JSON.stringify(loadRecords(), null, 2), 'application/json');
  });
  $('clearRecords').addEventListener('click', () => {
    if (confirm('すべての記録を削除しますか？')) {
      storageSet(RECORDS_KEY, []);
      renderRecords();
    }
  });

  store.onChange(renderSample);
  renderSample();
  try {
    await store.addBuiltin('sample', 'assets/test-image.png', 'テスト画像');
  } catch (e) {
    toast(e.message);
  }
}

main();
