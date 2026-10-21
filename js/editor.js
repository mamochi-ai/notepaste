import { buildArticle, clipboardHtml, htmlToText, standaloneHtml } from './article.js';
import { copyRich, copyPlain, writeClipboard, selectElement } from './clipboard.js';
import { ImageStore, toPngBlob, formatBytes } from './images.js';
import { SAMPLE_MD, initTheme, toast, h, showCopyResult, storageGet, storageSet, download, dateStamp } from './common.js';

const DRAFT_KEY = 'nps-draft';
const SETTINGS_KEY = 'nps-settings-v2';
const MEMORY_WARN_BYTES = 40 * 1024 * 1024;
const SAMPLE_REF = 'img:sample';

const $ = (id) => document.getElementById(id);
const els = {
  md: $('md'),
  fileInput: $('fileInput'),
  previewTitle: $('previewTitle'),
  previewBody: $('previewBody'),
  imagesSection: $('imagesSection'),
  imageList: $('imageList'),
  imageSummary: $('imageSummary'),
  result: $('copyResult'),
  extractTitle: $('extractTitle'),
  noteHeadings: $('noteHeadings'),
  titleStep: $('titleStep'),
  titleText: $('titleText'),
  charCount: $('charCount'),
  saveState: $('saveState'),
  imageSteps: $('imageSteps'),
  stepCount: $('stepCount'),
  stepThumb: $('stepThumb'),
  stepLabel: $('stepLabel'),
  stepNote: $('stepNote'),
  stepCopy: $('stepCopy'),
  mTitle: $('mTitle'),
  mImage: $('mImage'),
};

const store = new ImageStore();
const settings = Object.assign({ extractTitle: true, noteHeadings: true }, storageGet(SETTINGS_KEY, {}));
let caret = null; // 入力欄で最後にタップ・入力した位置
let current = null; // 直近のプレビュー結果
let step = 0; // 次にコピーする画像（0始まり）
const copied = new Set(); // コピー済みの項目（'title' / 'body' / 'img:<番号>'）。記事が変わったらリセット

function opts(mode) {
  return { mode, extractTitle: settings.extractTitle, noteHeadings: settings.noteHeadings };
}

function render() {
  const md = els.md.value;
  current = buildArticle(md, store, opts('preview'));
  els.previewTitle.hidden = !current.title;
  els.previewTitle.textContent = current.title || '';
  // renderMarkdown の出力はエスケープ済み・許可タグのみなので innerHTML に入れてよい
  els.previewBody.innerHTML = current.html || '<p class="empty">ここにプレビューが表示されます。</p>';
  els.titleStep.hidden = els.mTitle.hidden = !current.title;
  els.titleText.textContent = current.title || '';
  els.charCount.textContent = `${md.length.toLocaleString()} 文字`;
  markCopied();
  renderImageList();
  renderSteps();
}

let renderTimer = 0;
let saveTimer = 0;
function onEdit() {
  copied.clear();
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 120);
  clearTimeout(saveTimer);
  els.saveState.textContent = '';
  saveTimer = setTimeout(() => {
    els.saveState.textContent = storageSet(DRAFT_KEY, els.md.value) ? '自動保存しました' : '自動保存できませんでした（プライベートブラウズ等）';
  }, 500);
}

function markCopied() {
  $('copyTitle').textContent = copied.has('title') ? '✓ コピー済み' : 'コピー';
  els.mTitle.textContent = copied.has('title') ? '✓ タイトル' : 'タイトル';
  for (const id of ['copyRich', 'mRich']) $(id).classList.toggle('is-done', copied.has('body'));
}

// ---------- 入力 ----------

function setArticle(text) {
  els.md.value = text;
  caret = null;
  step = 0;
  onEdit();
}

function onPasteFromClipboard() {
  if (!(navigator.clipboard && navigator.clipboard.readText)) {
    els.md.focus();
    toast('入力欄を長押しして「ペースト」を選んでください');
    return;
  }
  // Safari では「ペースト」の確認ボタンが表示される
  navigator.clipboard.readText().then(
    (text) => {
      if (!text.trim()) return toast('クリップボードに文字がありません');
      const v = els.md.value.trim();
      if (v && v !== SAMPLE_MD.trim() && !confirm('入力中の記事を、クリップボードの内容に置き換えますか？')) return;
      setArticle(text.replace(/\r\n?/g, '\n'));
      toast('貼り付けました');
    },
    () => {
      els.md.focus();
      toast('読み取れませんでした。入力欄を長押しして「ペースト」を選んでください');
    },
  );
}

async function onNewArticle() {
  const userImages = store.list().filter((it) => !it.builtin);
  if (els.md.value.trim() || userImages.length) {
    const msg = userImages.length ? '記事と、追加した画像をすべて消して新しく始めますか？' : '記事を消して新しく始めますか？';
    if (!confirm(msg)) return;
  }
  for (const it of userImages) await store.remove(it.id);
  setArticle('');
  els.result.hidden = true;
  els.md.focus();
}

// ---------- 画像 ----------

function insertAtCaret(snippet) {
  const ta = els.md;
  const v = ta.value;
  const pos = caret == null ? v.length : Math.min(caret, v.length);
  const before = v.slice(0, pos);
  const after = v.slice(pos);
  const pre = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const post = after === '' ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const ins = pre + snippet + post;
  ta.value = before + ins + after;
  caret = pos + ins.length;
  try {
    ta.setSelectionRange(caret, caret);
  } catch (_) {
    /* 非表示時など */
  }
  onEdit();
}

function imageRefMd(item) {
  return `![${item.name.replace(/[\[\]\\]/g, '')}](img:${item.id})`;
}

async function addFiles(files) {
  let added = 0;
  for (const f of files) {
    try {
      insertAtCaret(imageRefMd(await store.addFile(f)));
      added++;
    } catch (e) {
      toast(`${f.name || '画像'}：${e.message}`);
    }
  }
  if (added) toast(`${added}枚の画像を入れました`);
  if (store.persistError) els.imageSummary.title = `端末への保存に失敗：${store.persistError.message}`;
}

function renderImageList() {
  const used = new Set((current?.imageRefs || []).filter((r) => r.startsWith('img:')).map((r) => r.slice(4)));
  // テスト画像はサンプル記事で使っているときだけ表示する
  const items = store.list().filter((it) => !it.builtin || used.has(it.id));
  const total = store.totalBytes();
  els.imagesSection.hidden = items.length === 0;
  els.imageSummary.textContent = `${items.length}枚・${formatBytes(total)}${total > MEMORY_WARN_BYTES ? '（多めです。不要な画像は削除してください）' : ''}`;
  els.imageList.replaceChildren(
    ...items.map((it) =>
      h(
        'li',
        { class: `image-item${used.has(it.id) ? ' used' : ''}` },
        h('img', { src: it.url, alt: '', width: 72, height: 72, loading: 'lazy' }),
        h(
          'div',
          { class: 'image-info' },
          h('strong', {}, it.name),
          h('span', { class: 'muted' }, `${it.width}×${it.height}・${formatBytes(it.size)}${used.has(it.id) ? '' : '・記事で未使用'}`),
        ),
        h(
          'div',
          { class: 'image-actions' },
          h('button', { type: 'button', class: 'btn small', onclick: () => insertAtCaret(imageRefMd(it)) }, 'カーソル位置に挿入'),
          it.builtin
            ? null
            : h(
                'button',
                {
                  type: 'button',
                  class: 'btn small danger',
                  onclick: () => {
                    const msg = used.has(it.id) ? 'この画像は記事中で使われています。削除しますか？' : 'この画像を削除しますか？';
                    if (confirm(msg)) store.remove(it.id);
                  },
                },
                '削除',
              ),
        ),
      ),
    ),
  );
}

// ---------- コピー ----------

function showFailure(r, label) {
  showCopyResult(els.result, r, { label });
  els.result.closest('.copy-panel').querySelector('details.fallback').open = true;
  els.result.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function onCopyTitle() {
  if (!current?.title) return;
  copyPlain(current.title).then((r) => {
    if (!r.ok) return showFailure(r, 'タイトル');
    copied.add('title');
    markCopied();
    els.result.hidden = true;
    toast('タイトルをコピーしました。noteのタイトル欄に貼り付けてください');
  });
}

function onCopyRich() {
  const art = buildArticle(els.md.value, store, opts('none'));
  if (!art.html) {
    toast('記事が空です');
    return;
  }
  const html = clipboardHtml(art.html);
  const text = htmlToText(art.html);
  // ここまで同期処理。copyRich の中で即座に clipboard.write を呼ぶ（Safariのタップ操作の制約）
  copyRich(html, text).then((r) => {
    if (!r.ok) return showFailure(r, '本文');
    copied.add('body');
    markCopied();
    const n = art.stats.images;
    showCopyResult(els.result, r, {
      compact: true,
      message: n
        ? `本文をコピーしました。noteの本文欄に貼り付けたら、続けて画像${n}枚を目印の位置に貼り付けてください。`
        : '本文をコピーしました。noteの本文欄に貼り付けてください。',
    });
    toast('本文をコピーしました');
  });
}

function onCopyPlain() {
  const art = buildArticle(els.md.value, store, opts('none'));
  const text = (art.title ? art.title + '\n\n' : '') + htmlToText(art.html);
  copyPlain(text).then((r) => (r.ok ? toast('装飾なしの文章をコピーしました') : showFailure(r, '装飾なしの文章')));
}

async function onDownloadHtml() {
  await store.whenDataUrlsReady();
  const art = buildArticle(els.md.value, store, opts('dataurl'));
  download(`note-article-${dateStamp()}.html`, standaloneHtml(art.title, art.html), 'text/html');
  toast('HTMLファイルを保存しました');
}

function onSelectAll() {
  selectElement(els.previewBody);
  els.previewBody.scrollIntoView({ block: 'start', behavior: 'smooth' });
  toast('選択しました。選択範囲をタップして「コピー」を選んでください');
}

// ---------- 画像を順番に貼る ----------

function imageSteps() {
  return (current?.images || []).map((im, i) => ({ n: i + 1, alt: im.alt || '画像', item: store.fromRef(im.src) }));
}

function renderSteps() {
  const steps = imageSteps();
  els.imageSteps.hidden = els.mImage.hidden = steps.length === 0;
  if (!steps.length) return;
  step = Math.min(Math.max(step, 0), steps.length - 1);
  const s = steps[step];
  const done = copied.has(`img:${s.n}`);
  els.stepCount.textContent = `${step + 1} / ${steps.length}`;
  els.stepLabel.textContent = `画像${s.n}：${s.alt}`;
  els.stepThumb.hidden = !s.item;
  if (s.item) els.stepThumb.src = s.item.url;
  els.stepCopy.disabled = els.mImage.disabled = !s.item;
  els.stepCopy.textContent = s.item ? `${done ? '✓ ' : ''}画像${s.n}をコピー` : 'コピーできない画像です';
  els.mImage.textContent = `${done ? '✓ ' : ''}画像${s.n}`;
  const allDone = steps.every((x) => copied.has(`img:${x.n}`));
  els.stepNote.textContent = !s.item ? '外部URLの画像です。noteで直接挿入してください' : allDone ? 'すべての画像をコピーしました' : done ? 'コピー済み' : '';
  $('stepPrev').disabled = step === 0;
  $('stepNext').disabled = step === steps.length - 1;
}

function onStepCopy() {
  const steps = imageSteps();
  const s = steps[step];
  if (!s || !s.item) return;
  const index = step;
  // 同期的に clipboard.write まで到達させる（Safariのタップ操作の制約）
  writeClipboard({ 'image/png': toPngBlob(s.item.blob) }, 'clipboard.write（image/png）').then((r) => {
    if (!r.ok) return showFailure(r, `画像${s.n}`);
    copied.add(`img:${s.n}`);
    if (index < steps.length - 1) step = index + 1;
    els.result.hidden = true;
    toast(`画像${s.n}をコピーしました。「［画像${s.n}：…］」の位置に貼り付けてください`);
    renderSteps();
  });
}

// ---------- 初期化 ----------

function bindSettings() {
  els.extractTitle.checked = settings.extractTitle;
  els.noteHeadings.checked = settings.noteHeadings;
  const save = () => {
    settings.extractTitle = els.extractTitle.checked;
    settings.noteHeadings = els.noteHeadings.checked;
    storageSet(SETTINGS_KEY, settings);
    copied.clear();
    render();
  };
  els.extractTitle.addEventListener('change', save);
  els.noteHeadings.addEventListener('change', save);
}

function bindHelp() {
  const btn = $('helpToggle');
  const help = $('help');
  const set = (open) => {
    help.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => set(help.hidden));
  // 初回だけ使い方を開いておく
  if (!storageGet('nps-help-seen', false)) {
    set(true);
    storageSet('nps-help-seen', true);
  }
}

async function main() {
  initTheme();
  bindSettings();
  bindHelp();
  els.md.value = storageGet(DRAFT_KEY, null) ?? SAMPLE_MD;
  render();

  const trackCaret = () => (caret = els.md.selectionEnd);
  for (const ev of ['keyup', 'click', 'select', 'input', 'blur']) els.md.addEventListener(ev, trackCaret);
  els.md.addEventListener('input', onEdit);

  els.fileInput.addEventListener('change', async () => {
    const files = [...els.fileInput.files];
    els.fileInput.value = '';
    await addFiles(files);
  });
  $('pasteFromClipboard').addEventListener('click', onPasteFromClipboard);
  $('newArticle').addEventListener('click', onNewArticle);
  $('copyTitle').addEventListener('click', onCopyTitle);
  $('copyRich').addEventListener('click', onCopyRich);
  $('copyPlain').addEventListener('click', onCopyPlain);
  $('downloadHtml').addEventListener('click', onDownloadHtml);
  $('selectAll').addEventListener('click', onSelectAll);
  els.stepCopy.addEventListener('click', onStepCopy);
  els.mTitle.addEventListener('click', onCopyTitle);
  $('mRich').addEventListener('click', onCopyRich);
  els.mImage.addEventListener('click', onStepCopy);
  $('stepPrev').addEventListener('click', () => {
    step--;
    renderSteps();
  });
  $('stepNext').addEventListener('click', () => {
    step++;
    renderSteps();
  });
  $('stepReset').addEventListener('click', () => {
    step = 0;
    for (const k of [...copied]) if (k.startsWith('img:')) copied.delete(k);
    renderSteps();
  });

  store.onChange(render);
  await store.init();
  // サンプル記事のテスト画像は、記事で使っているときだけ読み込む
  if (els.md.value.includes(`(${SAMPLE_REF})`)) {
    try {
      await store.addBuiltin('sample', 'assets/test-image.png', 'テスト画像');
    } catch (e) {
      toast(e.message);
    }
  }
}

main();
