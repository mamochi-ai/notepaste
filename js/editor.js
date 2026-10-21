import { buildArticle, clipboardHtml, htmlToText, standaloneHtml, IMAGE_MODES } from './article.js';
import { copyRich, copyPlain, writeClipboard, selectElement } from './clipboard.js';
import { ImageStore, toPngBlob, formatBytes } from './images.js';
import { SAMPLE_MD, initTheme, toast, h, showCopyResult, storageGet, storageSet, download, dateStamp, bytesOf } from './common.js';

const DRAFT_KEY = 'nps-draft';
const SETTINGS_KEY = 'nps-settings';
const MEMORY_WARN_BYTES = 40 * 1024 * 1024;

const $ = (id) => document.getElementById(id);
const els = {
  md: $('md'),
  fileInput: $('fileInput'),
  previewTitle: $('previewTitle'),
  previewBody: $('previewBody'),
  imageList: $('imageList'),
  imageSummary: $('imageSummary'),
  segments: $('segments'),
  result: $('copyResult'),
  imageMode: $('imageMode'),
  extractTitle: $('extractTitle'),
  noteHeadings: $('noteHeadings'),
  copyTitle: $('copyTitle'),
  charCount: $('charCount'),
  saveState: $('saveState'),
};

const store = new ImageStore();
const settings = Object.assign({ imageMode: 'dataurl', extractTitle: true, noteHeadings: true }, storageGet(SETTINGS_KEY, {}));
let caret = null; // 入力欄で最後にタップ・入力した位置
let current = null; // 直近のプレビュー結果

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
  els.copyTitle.hidden = !current.title;
  els.charCount.textContent = `${md.length.toLocaleString()} 文字`;
  renderSegments();
  renderImageList();
}

let renderTimer = 0;
let saveTimer = 0;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 120);
  clearTimeout(saveTimer);
  els.saveState.textContent = '';
  saveTimer = setTimeout(() => {
    els.saveState.textContent = storageSet(DRAFT_KEY, els.md.value) ? 'この端末に自動保存しました' : '自動保存できませんでした（プライベートブラウズ等）';
  }, 500);
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
  scheduleRender();
}

function imageRefMd(item) {
  const alt = item.name.replace(/[\[\]\\]/g, '');
  return `![${alt}](img:${item.id})`;
}

async function addFiles(files) {
  let added = 0;
  for (const f of files) {
    try {
      const item = await store.addFile(f);
      insertAtCaret(imageRefMd(item));
      added++;
    } catch (e) {
      toast(`${f.name || '画像'}：${e.message}`);
    }
  }
  if (added) toast(`${added}枚の画像を追加しました`);
  if (store.persistError) els.imageSummary.title = `端末への保存に失敗：${store.persistError.message}`;
}

function renderImageList() {
  const used = new Set((current?.imageRefs || []).filter((r) => r.startsWith('img:')).map((r) => r.slice(4)));
  const items = store.list();
  const total = store.totalBytes();
  els.imageSummary.textContent = items.length ? `${items.length}枚・${formatBytes(total)}${total > MEMORY_WARN_BYTES ? '（多めです。不要な画像は削除を）' : ''}` : 'まだありません';
  els.imageList.replaceChildren(
    ...items.map((it) =>
      h(
        'li',
        { class: `image-item${used.has(it.id) ? ' used' : ''}` },
        h('img', { src: it.url, alt: '', width: 72, height: 72, loading: 'lazy' }),
        h(
          'div',
          { class: 'image-info' },
          h('strong', {}, it.name + (it.builtin ? '（テスト用）' : '')),
          h('code', {}, `img:${it.id}`),
          h('span', { class: 'muted' }, `${it.width}×${it.height}・${formatBytes(it.size)}${used.has(it.id) ? '・記事で使用中' : ''}`),
        ),
        h(
          'div',
          { class: 'image-actions' },
          h('button', { type: 'button', class: 'btn small', onclick: () => insertAtCaret(imageRefMd(it)) }, '挿入'),
          h('button', { type: 'button', class: 'btn small', onclick: () => copyImage(it, `画像「${it.name}」`) }, 'コピー'),
          it.builtin
            ? null
            : h(
                'button',
                {
                  type: 'button',
                  class: 'btn small danger',
                  onclick: () => {
                    const msg = used.has(it.id) ? 'この画像は記事中で使われています。削除しますか？（記事中の指定は残ります）' : 'この画像を削除しますか？';
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

function copyImage(item, label) {
  // toPngBlob は非同期だが、Promise のまま ClipboardItem に渡す（タップ操作の扱いを保つ）
  writeClipboard({ 'image/png': toPngBlob(item.blob) }, 'clipboard.write（image/png）').then((r) => {
    showCopyResult(els.result, r, {
      label,
      notes: ['画像そのもの（バイナリ）をコピーしました。noteの本文で貼り付けると画像として取り込まれるかを確認してください。'],
    });
    els.result.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function modeNotes(mode, art) {
  const notes = [];
  if (mode === 'bloburl' && art.stats.embedded) notes.push('Blob URLはこのページの中でだけ有効です。note側では画像が表示されない見込みです（比較用）。');
  if (mode === 'https' && art.stats.placeholders) notes.push('追加した画像には公開URLがないため、目印の文字に置き換えました。');
  if (mode === 'none' && art.stats.images) notes.push('画像は「［ここに画像：…］」の目印になっています。noteで目印の位置に画像を挿入してください。');
  if (art.stats.pending) notes.push('一部の画像の準備が終わっていなかったため、目印に置き換えました。数秒後にもう一度コピーしてください。');
  if (art.stats.missing) notes.push('記事中に、見つからない画像の指定があります。');
  return notes;
}

function onCopyRich() {
  const mode = settings.imageMode;
  const art = buildArticle(els.md.value, store, opts(mode));
  if (!art.html) {
    toast('記事が空です');
    return;
  }
  const html = clipboardHtml(art.html);
  const text = htmlToText(art.html);
  const htmlBytes = bytesOf(html);
  const notes = modeNotes(mode, art);
  if (htmlBytes > 3 * 1024 * 1024) notes.push('HTMLが3MBを超えています。貼り付け先で処理が重くなったり拒否されたりする可能性があります。');
  // ここまで同期処理。copyRich の中で即座に clipboard.write を呼ぶ
  copyRich(html, text).then((r) => {
    showCopyResult(els.result, r, { label: '記事本文（装飾付き）', imageMode: IMAGE_MODES[mode].short, stats: art.stats, htmlBytes, notes });
    if (!r.ok) els.result.parentElement.querySelector('details.fallback').open = true;
  });
}

function onCopyTitle() {
  if (!current?.title) return;
  copyPlain(current.title).then((r) => showCopyResult(els.result, r, { label: 'タイトル', notes: ['noteの「記事タイトル」欄に貼り付けてください。'] }));
}

function onCopyPlain() {
  const art = buildArticle(els.md.value, store, opts('none'));
  const text = (art.title ? art.title + '\n\n' : '') + htmlToText(art.html);
  copyPlain(text).then((r) => showCopyResult(els.result, r, { label: 'プレーンテキスト（装飾なし）' }));
}

async function onDownloadHtml() {
  await store.whenDataUrlsReady();
  const art = buildArticle(els.md.value, store, opts('dataurl'));
  download(`note-article-${dateStamp()}.html`, standaloneHtml(art.title, art.html), 'text/html');
  toast('HTMLファイルを保存しました（画像はファイル内に埋め込まれています）');
}

function onSelectAll() {
  selectElement(els.previewBody);
  els.previewBody.scrollIntoView({ block: 'start', behavior: 'smooth' });
  toast('選択しました。選択範囲をタップして「コピー」を選んでください');
}

// ---------- 分割コピー ----------

function groupSegments(blocks) {
  const segs = [];
  for (const b of blocks) {
    if (b.type === 'figure') segs.push({ type: 'image', ref: b.imageRef, blocks: [b] });
    else if (segs.length && segs[segs.length - 1].type === 'text') segs[segs.length - 1].blocks.push(b);
    else segs.push({ type: 'text', blocks: [b] });
  }
  return segs;
}

function segmentLabel(seg) {
  const tmp = document.createElement('div');
  tmp.innerHTML = seg.blocks.map((b) => b.html).join('');
  const t = (tmp.querySelector('h1,h2,h3')?.textContent || tmp.textContent || '').trim();
  return t.length > 36 ? t.slice(0, 36) + '…' : t || '（空）';
}

function renderSegments() {
  const segs = groupSegments(current.blocks);
  els.segments.replaceChildren(
    ...segs.map((seg, idx) => {
      if (seg.type === 'text') {
        return h(
          'li',
          { class: 'segment' },
          h('div', { class: 'segment-info' }, h('span', { class: 'segment-kind' }, `文章 ${idx + 1}`), h('span', {}, segmentLabel(seg))),
          h('button', { type: 'button', class: 'btn', onclick: () => copySegment(idx) }, 'コピー'),
        );
      }
      const item = store.fromRef(seg.ref);
      return h(
        'li',
        { class: 'segment is-image' },
        h(
          'div',
          { class: 'segment-info' },
          h('span', { class: 'segment-kind' }, `画像 ${idx + 1}`),
          item ? h('img', { src: item.url, alt: '', width: 56, height: 56 }) : h('span', { class: 'muted' }, seg.ref ? '外部画像または見つからない画像のため、コピーできません' : '許可されていない画像指定'),
        ),
        h('button', { type: 'button', class: 'btn', disabled: !item, onclick: () => item && copyImage(item, `画像 ${idx + 1}`) }, '画像をコピー'),
      );
    }),
  );
}

function copySegment(idx) {
  const art = buildArticle(els.md.value, store, opts('none'));
  const seg = groupSegments(art.blocks)[idx];
  if (!seg) return;
  const bodyHtml = seg.blocks.map((b) => b.html).join('\n');
  copyRich(clipboardHtml(bodyHtml), htmlToText(bodyHtml)).then((r) => {
    showCopyResult(els.result, r, { label: `分割コピー：文章 ${idx + 1}` });
    els.result.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

// ---------- 初期化 ----------

function bindSettings() {
  els.imageMode.value = IMAGE_MODES[settings.imageMode] ? settings.imageMode : 'dataurl';
  settings.imageMode = els.imageMode.value;
  els.extractTitle.checked = settings.extractTitle;
  els.noteHeadings.checked = settings.noteHeadings;
  const save = () => {
    settings.imageMode = els.imageMode.value;
    settings.extractTitle = els.extractTitle.checked;
    settings.noteHeadings = els.noteHeadings.checked;
    storageSet(SETTINGS_KEY, settings);
    render();
  };
  for (const el of [els.imageMode, els.extractTitle, els.noteHeadings]) el.addEventListener('change', save);
}

async function main() {
  initTheme();
  bindSettings();
  els.md.value = storageGet(DRAFT_KEY, null) ?? SAMPLE_MD;
  render();

  const trackCaret = () => (caret = els.md.selectionEnd);
  for (const ev of ['keyup', 'click', 'select', 'input', 'blur']) els.md.addEventListener(ev, trackCaret);
  els.md.addEventListener('input', scheduleRender);

  els.fileInput.addEventListener('change', async () => {
    const files = [...els.fileInput.files];
    els.fileInput.value = '';
    await addFiles(files);
  });
  $('loadSample').addEventListener('click', () => {
    if (els.md.value.trim() && els.md.value !== SAMPLE_MD && !confirm('入力中の内容をサンプル記事に置き換えますか？')) return;
    els.md.value = SAMPLE_MD;
    caret = null;
    scheduleRender();
  });
  $('clearText').addEventListener('click', () => {
    if (!els.md.value || confirm('入力欄を空にしますか？（追加した画像は残ります）')) {
      els.md.value = '';
      caret = 0;
      scheduleRender();
      els.md.focus();
    }
  });
  $('copyRich').addEventListener('click', onCopyRich);
  els.copyTitle.addEventListener('click', onCopyTitle);
  $('copyPlain').addEventListener('click', onCopyPlain);
  $('downloadHtml').addEventListener('click', onDownloadHtml);
  $('selectAll').addEventListener('click', onSelectAll);

  store.onChange(render);
  await store.init();
  try {
    await store.addBuiltin('sample', 'assets/test-image.png', 'テスト画像');
  } catch (e) {
    toast(e.message);
  }
}

main();
