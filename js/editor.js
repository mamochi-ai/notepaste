import { buildArticle, clipboardHtml, htmlToText, standaloneHtml } from './article.js?v=202610211233';
import { copyRich, copyPlain, writeClipboard, selectElement } from './clipboard.js?v=202610211233';
import { ImageStore, toPngBlob, formatBytes } from './images.js?v=202610211233';
import { ArticleStore, articleTitle, imageIdsOf } from './articles.js?v=202610211233';
import { SAMPLE_MD, initTheme, toast, h, showCopyResult, storageGet, storageSet, download, dateStamp } from './common.js?v=202610211233';

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
  tableAsList: $('tableAsList'),
  toc: $('toc'),
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
const articles = new ArticleStore(SAMPLE_MD);
const settings = Object.assign({ extractTitle: true, noteHeadings: true, tableAsList: true, toc: 'marker' }, storageGet(SETTINGS_KEY, {}));
let caret = null; // 入力欄で最後にタップ・入力した位置
let current = null; // 直近のプレビュー結果
let step = 0; // 次にコピーする画像（0始まり）
const copied = new Set(); // コピー済みの項目（'title' / 'body' / 'img:<番号>'）。記事が変わったらリセット

function opts(mode) {
  return { mode, extractTitle: settings.extractTitle, noteHeadings: settings.noteHeadings, tableAsList: settings.tableAsList, toc: settings.toc };
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
  saveTimer = setTimeout(saveNow, 500);
}

function saveNow() {
  clearTimeout(saveTimer);
  const ok = articles.update(els.md.value);
  els.saveState.textContent = ok ? '自動保存しました' : '保存できませんでした（プライベートブラウズ、または容量不足）';
}

function markCopied() {
  $('copyTitle').textContent = copied.has('title') ? '✓ コピー済み' : 'コピー';
  els.mTitle.textContent = copied.has('title') ? '✓ タイトル' : 'タイトル';
  for (const id of ['copyRich', 'mRich']) $(id).classList.toggle('is-done', copied.has('body'));
}

// ---------- 入力 ----------

function showArticle(a) {
  els.md.value = a.md;
  caret = null;
  step = 0;
  copied.clear();
  els.result.hidden = true;
  els.saveState.textContent = '';
  render();
  ensureSampleImage();
}

// サンプル記事のテスト画像は、記事で使っているときだけ読み込む
async function ensureSampleImage() {
  if (!els.md.value.includes(`(${SAMPLE_REF})`) || store.get('sample')) return;
  try {
    await store.addBuiltin('sample', 'assets/test-image.png', 'テスト画像');
  } catch (e) {
    toast(e.message);
  }
}

function openArticle(id) {
  saveNow();
  const a = articles.open(id);
  if (a) showArticle(a);
}

function createArticle(md = '') {
  saveNow();
  showArticle(articles.create(md));
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
      const md = text.replace(/\r\n?/g, '\n');
      const v = els.md.value.trim();
      // 今の記事が空（またはサンプルのまま）なら置き換え、そうでなければ新しい記事として追加する
      if (!v || v === SAMPLE_MD.trim()) {
        els.md.value = md;
        caret = null;
        step = 0;
        onEdit();
        toast('貼り付けました');
      } else {
        createArticle(md);
        toast('新しい記事として追加しました（前の記事は「記事一覧」にあります）');
      }
    },
    () => {
      els.md.focus();
      toast('読み取れませんでした。入力欄を長押しして「ペースト」を選んでください');
    },
  );
}

function onNewArticle() {
  if (els.md.value.trim()) createArticle('');
  closeArticleList();
  els.md.focus();
}

// ---------- 記事一覧 ----------

const dialog = $('articlesDialog');

function fmtDate(t) {
  const d = new Date(t);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? `今日 ${d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function renderArticleList() {
  const list = articles.sorted();
  $('articleCount').textContent = `${list.length}件`;
  $('articleList').replaceChildren(
    ...list.map((a) => {
      const isCur = a.id === articles.currentId;
      const imgs = imageIdsOf(a.md).size;
      return h(
        'li',
        { class: `article-item${isCur ? ' is-current' : ''}` },
        h(
          'button',
          {
            type: 'button',
            class: 'article-open',
            onclick: () => {
              if (!isCur) openArticle(a.id);
              closeArticleList();
            },
          },
          h('strong', { class: 'ellipsis' }, articleTitle(a.md)),
          h('span', { class: 'muted' }, `${fmtDate(a.updatedAt)} 更新・${a.md.length.toLocaleString()}文字${imgs ? `・画像${imgs}枚` : ''}${isCur ? '・編集中' : ''}`),
        ),
        h('button', { type: 'button', class: 'btn small danger', 'aria-label': `「${articleTitle(a.md)}」を削除`, onclick: () => deleteArticle(a.id) }, '削除'),
      );
    }),
  );
}

async function deleteArticle(id) {
  const a = articles.list.find((x) => x.id === id);
  if (!a || !confirm(`「${articleTitle(a.md)}」を削除しますか？\nこの記事だけで使っている画像も削除されます。元に戻せません。`)) return;
  saveNow();
  const wasCurrent = id === articles.currentId;
  articles.remove(id);
  // どの記事からも使われなくなった画像を消す
  const used = articles.usedImageIds();
  for (const it of store.list()) if (!it.builtin && !used.has(it.id)) await store.remove(it.id);
  if (wasCurrent) showArticle(articles.current);
  renderArticleList();
  toast('削除しました');
}

function openArticleList() {
  saveNow();
  renderArticleList();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeArticleList() {
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else dialog.removeAttribute('open');
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
  // この記事で使っている画像と、どの記事でも使っていない画像だけを表示する（テスト画像は使っているときだけ）
  const usedAnywhere = articles.usedImageIds();
  const items = store.list().filter((it) => used.has(it.id) || (!it.builtin && !usedAnywhere.has(it.id)));
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
  els.tableAsList.checked = settings.tableAsList;
  els.toc.value = ['none', 'marker', 'list'].includes(settings.toc) ? settings.toc : 'marker';
  const save = () => {
    settings.extractTitle = els.extractTitle.checked;
    settings.noteHeadings = els.noteHeadings.checked;
    settings.tableAsList = els.tableAsList.checked;
    settings.toc = els.toc.value;
    $('tocHint').hidden = settings.toc !== 'marker';
    storageSet(SETTINGS_KEY, settings);
    copied.clear();
    render();
  };
  for (const el of [els.extractTitle, els.noteHeadings, els.tableAsList, els.toc]) el.addEventListener('change', save);
  $('tocHint').hidden = settings.toc !== 'marker';
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
  els.md.value = articles.current.md;
  render();
  if (!articles.lastSaveOk) els.saveState.textContent = '保存できない環境です（プライベートブラウズ等）';

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
  $('openArticles').addEventListener('click', openArticleList);
  $('closeArticles').addEventListener('click', closeArticleList);
  $('newFromList').addEventListener('click', onNewArticle);
  // 背景をタップしたら閉じる
  dialog.addEventListener('click', (e) => e.target === dialog && closeArticleList());
  // 別のアプリに切り替えるときは、待たずに保存する
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveNow());
  window.addEventListener('pagehide', saveNow);
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
  await ensureSampleImage();
}

main();
