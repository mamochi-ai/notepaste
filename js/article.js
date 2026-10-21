// 記事の組み立て：Markdown + 画像の扱い方（モード）から、コピー用HTML・プレーンテキストを作る

import { renderMarkdown, escapeHtml } from './markdown.js?v=202610211208';

export const IMAGE_MODES = {
  none: { label: '画像なし（位置の目印のみ）', short: '画像なし（目印）' },
  dataurl: { label: 'data URL埋め込み', short: 'data URL' },
  bloburl: { label: 'Blob URL（比較用）', short: 'Blob URL' },
  https: { label: '公開HTTPS URL', short: 'HTTPS URL' },
};

/** 画像の位置の目印。番号は記事中の画像の出現順（1から） */
export function imageMarker(n, label) {
  return `［画像${n}：${label}］`;
}

/**
 * @param {string} md
 * @param {import('./images.js').ImageStore} store
 * @param {{mode:'preview'|'dataurl'|'bloburl'|'https'|'none', extractTitle?:boolean, noteHeadings?:boolean}} opt
 */
export function buildArticle(md, store, opt) {
  const stats = { images: 0, embedded: 0, placeholders: 0, pending: 0, missing: 0 };
  const resolveImage = (src, alt) => {
    stats.images++;
    const label = alt || '画像';
    if (opt.mode === 'none') {
      stats.placeholders++;
      return { placeholder: imageMarker(stats.images, label) };
    }
    if (!src.startsWith('img:')) {
      stats.embedded++;
      return { src };
    }
    const item = store.fromRef(src);
    if (!item) {
      stats.missing++;
      return { placeholder: `［画像が見つかりません：${src}］` };
    }
    const size = { width: item.width, height: item.height };
    switch (opt.mode) {
      case 'preview':
      case 'bloburl':
        stats.embedded++;
        return { src: item.url, ...size };
      case 'dataurl':
        if (!item.dataUrl) {
          stats.pending++;
          return { placeholder: `［画像を準備中：${label}］` };
        }
        stats.embedded++;
        return { src: item.dataUrl, ...size };
      case 'https':
        if (item.publicUrl) {
          stats.embedded++;
          return { src: item.publicUrl, ...size };
        }
        stats.placeholders++;
        return { placeholder: imageMarker(stats.images, `${label}（公開URLがないため省略）`) };
      default:
        return null;
    }
  };

  const r = renderMarkdown(md, {
    resolveImage,
    extractTitle: !!opt.extractTitle,
    noteHeadings: !!opt.noteHeadings,
  });
  return { ...r, stats };
}

/** クリップボードに載せる text/html。文字化け防止に meta charset を付ける */
export function clipboardHtml(bodyHtml) {
  return `<meta charset="utf-8">${bodyHtml}`;
}

/** 生成済みHTMLから読みやすいプレーンテキストを作る（DOMParserは不活性なので安全） */
export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out = [];
  const walk = (node, ctx) => {
    let s = '';
    for (const c of node.childNodes) {
      if (c.nodeType === 3) {
        s += c.nodeValue;
        continue;
      }
      if (c.nodeType !== 1) continue;
      const tag = c.tagName.toLowerCase();
      if (tag === 'br') s += '\n';
      else if (tag === 'img') s += `［画像：${c.getAttribute('alt') || ''}］`;
      else if (tag === 'a') {
        const href = c.getAttribute('href') || '';
        const t = walk(c, ctx);
        s += href && href !== t ? `${t}（${href}）` : t;
      } else if (tag === 'ul' || tag === 'ol') {
        s += '\n' + listText(c, ctx.depth + 1);
      } else s += walk(c, ctx);
    }
    return s;
  };
  const listText = (list, depth) => {
    const ordered = list.tagName === 'OL';
    let n = parseInt(list.getAttribute('start') || '1', 10);
    const lines = [];
    for (const li of list.children) {
      const mark = ordered ? `${n++}. ` : '・';
      lines.push('　'.repeat(depth - 1) + mark + walk(li, { depth }).replace(/^\n+|\n+$/g, ''));
    }
    return lines.join('\n');
  };
  for (const el of doc.body.children) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'ul' || tag === 'ol') out.push(listText(el, 1));
    else if (tag === 'hr') out.push('――――――');
    else if (tag === 'blockquote') {
      out.push(
        htmlToText(el.innerHTML)
          .trim()
          .split('\n')
          .map((l) => '> ' + l)
          .join('\n'),
      );
    } else if (tag === 'table') {
      out.push([...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim()).join(' | ')).join('\n'));
    } else if (tag === 'figure') {
      const img = el.querySelector('img');
      out.push(`［画像：${img ? img.getAttribute('alt') || '' : ''}］`);
    } else if (tag === 'pre') out.push(el.textContent);
    else out.push(walk(el, { depth: 0 }));
  }
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** ダウンロード用の単体HTMLファイル */
export function standaloneHtml(title, bodyHtml) {
  const t = escapeHtml(title || '記事');
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<style>
body{margin:0;background:#fff;color:#222;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;line-height:1.9;font-size:17px}
main{max-width:640px;margin:0 auto;padding:40px 20px 80px}
h1{font-size:1.7em;line-height:1.4}h2{font-size:1.35em;line-height:1.5;margin-top:2.2em}h3{font-size:1.15em;margin-top:1.8em}
img{max-width:100%;height:auto}figure{margin:1.6em 0}blockquote{margin:1.4em 0;padding:.2em 1em;border-left:3px solid #ccc;color:#555}
pre{background:#f5f5f5;padding:12px;overflow:auto}a{color:#1a5a8a}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:4px 8px}
</style>
</head>
<body>
<main>
${title ? `<h1>${t}</h1>\n` : ''}${bodyHtml}
</main>
</body>
</html>
`;
}
