// クリップボード操作
//
// iPad Safari の制約:
// - navigator.clipboard.write() はユーザー操作（タップ）の処理中に呼ぶ必要がある。
//   途中で await を挟むと「ユーザー操作外」と判断されて NotAllowedError になることがある。
// - そのため ClipboardItem はクリック処理の中で同期的に作り、時間のかかる中身は
//   Promise<Blob> として渡す（Safari はこの形式を推奨している）。
// - Safari が書き込める形式は text/plain, text/html, text/uri-list, image/png。
//
// ここでの「成功」はクリップボードへの書き込みが完了したことだけを意味する。
// 貼り付け先（note）がその内容をどう扱うかは別問題。

export function clipboardEnv() {
  const hasClipboard = !!(navigator.clipboard);
  const supports = (t) => {
    try {
      if (typeof ClipboardItem !== 'undefined' && typeof ClipboardItem.supports === 'function') {
        return ClipboardItem.supports(t);
      }
    } catch (_) {
      /* 判定不可 */
    }
    return null;
  };
  let execCopy = null;
  try {
    execCopy = document.queryCommandSupported ? document.queryCommandSupported('copy') : null;
  } catch (_) {
    execCopy = null;
  }
  const ua = navigator.userAgent;
  const iPadOS = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return {
    secureContext: window.isSecureContext,
    clipboard: hasClipboard,
    write: hasClipboard && typeof navigator.clipboard.write === 'function',
    writeText: hasClipboard && typeof navigator.clipboard.writeText === 'function',
    clipboardItem: typeof ClipboardItem !== 'undefined',
    supportsHtml: supports('text/html'),
    supportsPng: supports('image/png'),
    execCopy,
    iPadOS,
    ua,
  };
}

function describeError(e) {
  if (!e) return { name: 'UnknownError', message: '不明なエラー' };
  const name = e.name || 'Error';
  const hints = {
    NotAllowedError: 'ブラウザがコピーを許可しませんでした。ボタンを直接タップしたか、ページが前面にあるか確認してください。',
    SecurityError: 'セキュリティ上の理由で拒否されました。HTTPSで開いているか確認してください。',
    DataError: 'クリップボードに書き込めないデータ形式が含まれています。',
    NotSupportedError: 'このブラウザはこのデータ形式に対応していません。',
    TypeError: 'このブラウザはこのAPIの使い方に対応していない可能性があります。',
  };
  return { name, message: String(e.message || e), hint: hints[name] || '' };
}

const toBlob = (v, type) =>
  typeof v === 'string' ? new Blob([v], { type }) : Promise.resolve(v).then((s) => (s instanceof Blob ? s : new Blob([s], { type })));

/**
 * 任意の形式を1つの ClipboardItem として書き込む。
 * @param {Record<string, string|Blob|Promise<string|Blob>>} data 例: {'text/html': html, 'text/plain': text}
 * @returns {Promise<CopyResult>} 例外は投げず、結果オブジェクトで返す
 */
export function writeClipboard(data, method = 'clipboard.write') {
  return writeClipboardItems([data], method);
}

/**
 * 複数の ClipboardItem をまとめて書き込む（検証用）。
 * @param {Array<Record<string, string|Blob|Promise<string|Blob>>>} list
 */
export async function writeClipboardItems(list, method = 'clipboard.write') {
  const types = list.length > 1 ? list.map((d, i) => `[${i + 1}] ${Object.keys(d).join(' + ')}`) : Object.keys(list[0]);
  const t0 = performance.now();
  const base = { method, types, at: new Date().toISOString() };
  try {
    if (!window.isSecureContext) {
      const e = new Error('HTTPSではないため Clipboard API を使えません');
      e.name = 'SecurityError';
      throw e;
    }
    if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
      const e = new Error('navigator.clipboard.write または ClipboardItem がありません');
      e.name = 'NotSupportedError';
      throw e;
    }
    const items = list.map((data) => {
      const entries = {};
      for (const t of Object.keys(data)) entries[t] = toBlob(data[t], t);
      return new ClipboardItem(entries);
    });
    // ここまで await なし（ユーザー操作の扱いを保つため）
    await navigator.clipboard.write(items);
    return { ...base, ok: true, durationMs: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ...base, ok: false, error: describeError(e), durationMs: Math.round(performance.now() - t0) };
  }
}

/**
 * 旧方式：document.execCommand('copy') と copy イベントで HTML とテキストを設定する。
 * 非推奨APIだが Safari を含む多くのブラウザでまだ動作する。必ずタップ処理の中で同期的に呼ぶこと。
 */
export function legacyCopy(html, text) {
  const at = new Date().toISOString();
  const base = { method: "execCommand('copy')", types: html ? ['text/html', 'text/plain'] : ['text/plain'], at };
  let handled = false;
  const onCopy = (e) => {
    try {
      if (html) e.clipboardData.setData('text/html', html);
      e.clipboardData.setData('text/plain', text);
      e.preventDefault();
      handled = true;
    } catch (_) {
      handled = false;
    }
  };
  // Safari は選択範囲が空だと copy イベントを発生させないことがあるため、一時的な要素を選択する
  const holder = document.createElement('div');
  holder.textContent = text.slice(0, 200) || ' ';
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre;user-select:text;-webkit-user-select:text;';
  document.body.appendChild(holder);
  const sel = window.getSelection();
  const saved = [];
  for (let i = 0; i < sel.rangeCount; i++) saved.push(sel.getRangeAt(i));
  const range = document.createRange();
  range.selectNodeContents(holder);
  sel.removeAllRanges();
  sel.addRange(range);
  document.addEventListener('copy', onCopy, true);
  let ok = false;
  let error = null;
  try {
    ok = document.execCommand('copy');
  } catch (e) {
    error = describeError(e);
  } finally {
    document.removeEventListener('copy', onCopy, true);
    sel.removeAllRanges();
    for (const r of saved) sel.addRange(r);
    holder.remove();
  }
  if (ok && handled) return { ...base, ok: true };
  return {
    ...base,
    ok: false,
    error: error || {
      name: ok ? 'CopyEventNotHandled' : 'ExecCommandFailed',
      message: ok ? 'copyイベントでデータを設定できませんでした' : "execCommand('copy') が false を返しました",
      hint: 'ボタンを直接タップした直後でないと失敗することがあります。',
    },
  };
}

/**
 * 装飾付きコピー：Clipboard API を試し、失敗したら execCommand 方式を試す。
 * html / text は文字列（同期）で渡すこと。
 */
export async function copyRich(html, text) {
  // Clipboard API が無い場合は、ユーザー操作中に旧方式を即座に試す
  if (!(navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined')) {
    const legacy = legacyCopy(html, text);
    return { ...legacy, attempts: [{ method: 'clipboard.write', ok: false, error: { name: 'NotSupportedError', message: 'Clipboard API（write / ClipboardItem）がありません' } }, legacy] };
  }
  const first = await writeClipboard({ 'text/html': html, 'text/plain': text });
  if (first.ok) return { ...first, attempts: [first] };
  // await の後なのでユーザー操作扱いが切れている可能性がある（失敗しても正直に表示する）
  const legacy = legacyCopy(html, text);
  return { ...legacy, attempts: [first, legacy] };
}

export async function copyPlain(text) {
  const at = new Date().toISOString();
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: 'clipboard.writeText', types: ['text/plain'], at };
    } catch (e) {
      const legacy = legacyCopy('', text);
      return { ...legacy, attempts: [{ ok: false, method: 'clipboard.writeText', error: describeError(e) }, legacy] };
    }
  }
  return legacyCopy('', text);
}

/** 要素の中身を選択状態にする（手動コピー用） */
export function selectElement(el) {
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
}
