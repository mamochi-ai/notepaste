// 安全なMarkdown→HTML変換器（外部ライブラリ不使用）
//
// 方針:
// - 入力中のHTMLタグは一切通さず、すべてエスケープする（<br> のみ改行として解釈）
// - 生成するタグはホワイトリストのものだけ
// - リンクは http / https / mailto のみ、画像は img:ID / https / data:image のみ許可
// - 日本語の文章で使われる「**「強調」**です」のような書き方も太字として扱う
//
// DOMに依存しないので Node.js でもテストできる。

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

// 制御文字・空白を含むURLは難読化の可能性があるため拒否する
const BAD_URL_CHARS = /[\u0000-\u0020\u007f-\u009f]/;

export function sanitizeLinkUrl(url) {
  const u = String(url).trim();
  if (!u || BAD_URL_CHARS.test(u)) return null;
  if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
  return null;
}

export function sanitizeImageSrc(src) {
  const u = String(src).trim();
  if (!u || BAD_URL_CHARS.test(u)) return null;
  if (/^img:[a-z0-9_-]{1,40}$/i.test(u)) return u;
  if (/^https:\/\//i.test(u)) return u;
  if (/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(u)) return u;
  return null;
}

const RE = {
  fence: /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)\s*$/,
  heading: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/,
  hr: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
  quote: /^ {0,3}> ?/,
  list: /^( *)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/,
  tableSep: /^ *\|? *:?-+:? *(\| *:?-+:? *)*\|? *$/,
  soleImage: /^!\[(?:\\.|[^\\\]])*\]\([^)]*\)$/,
  link: /^\[((?:\\.|[^\\\[\]]|\[(?:\\.|[^\\\[\]])*\])*)\]\(\s*<?([^\s<>()]*(?:\([^\s<>()]*\)[^\s<>()]*)*)>?(?:\s+(?:"([^"]*)"|'([^']*)'))?\s*\)/,
  image: /^!\[((?:\\.|[^\\\]])*)\]\(\s*<?([^\s<>()]+)>?(?:\s+(?:"([^"]*)"|'([^']*)'))?\s*\)/,
  boldItalic: /^\*\*\*(\S(?:[\s\S]*?[^\s\\])?)\*\*\*/,
  bold: /^\*\*(\S(?:[\s\S]*?[^\s\\])?)\*\*/,
  boldU: /^__(\S(?:[\s\S]*?[^\s\\])?)__(?![A-Za-z0-9])/,
  italic: /^\*([^\s*](?:[\s\S]*?[^\s\\*])?)\*(?!\*)/,
  italicU: /^_([^\s_](?:[\s\S]*?[^\s\\_])?)_(?![A-Za-z0-9])/,
  strike: /^~~(\S(?:[\s\S]*?\S)?)~~/,
  autolink: /^https?:\/\/[^\s<>"'（）「」『』、。！？]+/,
  angleLink: /^<(https?:\/\/[^\s<>]+|mailto:[^\s<>]+)>/,
  br: /^<br\s*\/?>/i,
};

function unescapeMd(s) {
  return s.replace(/\\([!-/:-@[-`{-~])/g, '$1');
}

/**
 * Markdownを変換する。
 * @param {string} md
 * @param {object} [opts]
 * @param {(src:string, alt:string) => ({src:string,width?:number,height?:number}|{placeholder:string}|null)} [opts.resolveImage]
 *   サニタイズ済みの画像指定（img:ID / https / data）を、実際に出力する src に変換する。
 * @param {boolean} [opts.extractTitle] 先頭のH1を本文から外し、title として返す
 * @param {boolean} [opts.noteHeadings] noteの「大見出し(h2)/小見出し(h3)」に合わせて見出しを変換する
 * @returns {{html:string, title:string|null, blocks:Array<{type:'block'|'figure', html:string, imageRef?:string}>, imageRefs:string[], images:Array<{src:string, alt:string}>}}
 */
export function renderMarkdown(md, opts = {}) {
  return new Renderer(opts).render(md);
}

class Renderer {
  constructor(opts) {
    this.opts = opts;
    this.resolveImage = opts.resolveImage || defaultResolveImage;
    this.imageRefs = [];
    this.images = [];
    this.title = null;
    this.depth = 0;
  }

  render(md) {
    const lines = String(md || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((l) => l.replace(/^\t+/, (t) => '    '.repeat(t.length)));
    const blocks = this.parseBlocks(lines, true);
    return {
      html: blocks.map((b) => b.html).join('\n'),
      title: this.title,
      blocks,
      imageRefs: this.imageRefs,
      images: this.images,
    };
  }

  // 段落を中断して新しいブロックを始める行かどうか
  startsBlock(line) {
    return (
      RE.fence.test(line) ||
      RE.heading.test(line) ||
      RE.hr.test(line) ||
      RE.quote.test(line) ||
      RE.list.test(line)
    );
  }

  parseBlocks(lines, top = false) {
    // 引用の入れ子が深すぎる入力で再帰が暴走しないようにする
    this.depth++;
    if (this.depth > 20) {
      this.depth--;
      return [{ type: 'block', html: `<p>${this.inline(lines.join('\n'))}</p>` }];
    }
    const out = [];
    let i = 0;
    const n = lines.length;
    let first = true;

    while (i < n) {
      const line = lines[i];
      if (!line.trim()) {
        i++;
        continue;
      }

      let m;
      // コードブロック
      if ((m = line.match(RE.fence))) {
        const fence = m[1];
        const body = [];
        i++;
        const isClose = (l) => {
          const t = l.trim();
          return t.length >= fence.length && t === fence[0].repeat(t.length);
        };
        while (i < n && !isClose(lines[i])) {
          body.push(lines[i]);
          i++;
        }
        i++;
        out.push({ type: 'block', html: `<pre><code>${escapeHtml(body.join('\n'))}</code></pre>` });
        first = false;
        continue;
      }

      // 見出し
      if ((m = line.match(RE.heading))) {
        const level = m[1].length;
        const text = (m[2] || '').trim();
        i++;
        if (top && first && level === 1 && this.opts.extractTitle && this.title === null) {
          this.title = plainInline(text);
          first = false;
          continue;
        }
        out.push({ type: 'block', html: this.heading(level, text) });
        first = false;
        continue;
      }

      // 区切り線
      if (RE.hr.test(line)) {
        out.push({ type: 'block', html: '<hr>' });
        i++;
        first = false;
        continue;
      }

      // 引用
      if (RE.quote.test(line)) {
        const body = [];
        while (i < n) {
          const l = lines[i];
          if (RE.quote.test(l)) body.push(l.replace(RE.quote, ''));
          else if (l.trim() && !this.startsBlock(l) && body.length && body[body.length - 1].trim()) body.push(l);
          else break;
          i++;
        }
        const inner = this.parseBlocks(body).map((b) => b.html).join('\n');
        out.push({ type: 'block', html: `<blockquote>\n${inner}\n</blockquote>` });
        first = false;
        continue;
      }

      // リスト
      if (RE.list.test(line)) {
        const res = this.parseList(lines, i);
        i = res.next;
        out.push({ type: 'block', html: res.html });
        first = false;
        continue;
      }

      // 表
      if (line.includes('|') && i + 1 < n && RE.tableSep.test(lines[i + 1]) && lines[i + 1].includes('-')) {
        const rows = [line];
        i += 2;
        while (i < n && lines[i].trim() && lines[i].includes('|')) {
          rows.push(lines[i]);
          i++;
        }
        out.push({ type: 'block', html: this.table(rows) });
        first = false;
        continue;
      }

      // 段落
      const para = [];
      while (i < n && lines[i].trim() && !(para.length && this.startsBlock(lines[i]))) {
        para.push(lines[i]);
        i++;
      }
      // 画像だけの行は figure にする（画像の前後で分割コピーできるようにする）
      let buf = [];
      const flush = () => {
        if (buf.length) out.push({ type: 'block', html: `<p>${this.inline(joinParagraph(buf))}</p>` });
        buf = [];
      };
      for (const l of para) {
        const t = l.trim();
        if (RE.soleImage.test(t)) {
          const im = t.match(RE.image);
          if (im && im[0].length === t.length) {
            flush();
            out.push(this.figure(im));
            continue;
          }
        }
        buf.push(l);
      }
      flush();
      first = false;
    }
    this.depth--;
    return out;
  }

  heading(level, text) {
    let tag = level;
    if (this.opts.noteHeadings) {
      // noteの本文見出しは「大見出し」「小見出し」の2段階のみ（記事タイトルは別欄）
      if (level <= 2) tag = 2;
      else if (level === 3) tag = 3;
      else return `<p><strong>${this.inline(text)}</strong></p>`;
    }
    return `<h${tag}>${this.inline(text)}</h${tag}>`;
  }

  parseList(lines, start) {
    const items = [];
    let i = start;
    const n = lines.length;
    let prevBlank = false;
    while (i < n) {
      const l = lines[i];
      const m = l.match(RE.list);
      if (m && !RE.hr.test(l)) {
        items.push({
          indent: m[1].length,
          ordered: /\d/.test(m[2]),
          num: parseInt(m[2], 10),
          lines: [m[3] || ''],
        });
        prevBlank = false;
        i++;
        continue;
      }
      if (!l.trim()) {
        // 空行の後もリストが続くか（次の非空行がリスト項目か字下げ行か）
        let j = i + 1;
        while (j < n && !lines[j].trim()) j++;
        if (j < n && (RE.list.test(lines[j]) || /^ {2,}\S/.test(lines[j])) && !RE.hr.test(lines[j])) {
          prevBlank = true;
          i = j;
          continue;
        }
        break;
      }
      if (/^ {2,}\S/.test(l) || (!prevBlank && !this.startsBlock(l))) {
        items[items.length - 1].lines.push(l.trim());
        i++;
        continue;
      }
      break;
    }

    // 字下げ量から入れ子構造を組み立てる
    const root = { ordered: items[0].ordered, start: items[0].num, items: [], indent: items[0].indent };
    const stack = [root];
    for (const it of items) {
      let top = stack[stack.length - 1];
      if (it.indent >= top.indent + 2 && top.items.length) {
        const parent = top.items[top.items.length - 1];
        const sub = { ordered: it.ordered, start: it.num, items: [], indent: it.indent };
        parent.children.push(sub);
        stack.push(sub);
        top = sub;
      } else {
        while (stack.length > 1 && it.indent < top.indent) {
          stack.pop();
          top = stack[stack.length - 1];
        }
      }
      top.items.push({ lines: it.lines, children: [] });
    }
    return { html: this.listHtml(root), next: i };
  }

  listHtml(list) {
    const tag = list.ordered ? 'ol' : 'ul';
    const startAttr = list.ordered && list.start > 1 ? ` start="${list.start}"` : '';
    const lis = list.items.map((it) => {
      let text = it.lines.join('\n');
      text = text.replace(/^\[( |x|X)\][ \t]+/, (_, c) => (c === ' ' ? '☐ ' : '☑ '));
      const kids = it.children.map((c) => this.listHtml(c)).join('');
      return `<li>${this.inline(text)}${kids}</li>`;
    });
    return `<${tag}${startAttr}>${lis.join('')}</${tag}>`;
  }

  table(rows) {
    const split = (r) => {
      let s = r.trim();
      if (s.startsWith('|')) s = s.slice(1);
      if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
      // 古いSafariは正規表現の後読みに非対応なので、「\|」を一時的に置き換えて分割する
      return s.replace(/\\\|/g, '\u0000').split('|').map((c) => c.trim().replace(/\u0000/g, '|'));
    };
    const head = split(rows[0]);
    const body = rows.slice(1).map(split);
    const th = head.map((c) => `<th>${this.inline(c)}</th>`).join('');
    const trs = body.map((r) => `<tr>${head.map((_, k) => `<td>${this.inline(r[k] || '')}</td>`).join('')}</tr>`).join('');
    return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
  }

  figure(m) {
    const alt = unescapeMd(m[1]);
    const title = m[3] ?? m[4] ?? '';
    const r = this.image(alt, m[2]);
    if (r.placeholder) return { type: 'figure', html: `<p>${escapeHtml(r.placeholder)}</p>`, imageRef: r.ref };
    const cap = title ? `<figcaption>${escapeHtml(title)}</figcaption>` : '';
    return { type: 'figure', html: `<figure>${r.tag}${cap}</figure>`, imageRef: r.ref };
  }

  image(alt, rawSrc) {
    const safe = sanitizeImageSrc(rawSrc);
    if (!safe) return { placeholder: `［画像：${alt || '無題'}（許可されていない画像指定のため表示しません）］`, ref: null };
    this.imageRefs.push(safe);
    this.images.push({ src: safe, alt });
    const res = this.resolveImage(safe, alt);
    if (!res || res.placeholder || !res.src) {
      return { placeholder: (res && res.placeholder) || `［画像：${alt || safe}］`, ref: safe };
    }
    const size = res.width && res.height ? ` width="${res.width | 0}" height="${res.height | 0}"` : '';
    return { tag: `<img src="${escapeHtml(res.src)}" alt="${escapeHtml(alt)}"${size}>`, ref: safe };
  }

  inline(src) {
    let out = '';
    let i = 0;
    const s = src;
    const n = s.length;
    let text = '';
    const flushText = () => {
      if (text) out += escapeHtml(text);
      text = '';
    };

    while (i < n) {
      const ch = s[i];
      // 特殊文字でなければまとめて平文として扱う
      if (!'\\`*_~[!<\nh'.includes(ch)) {
        text += ch;
        i++;
        continue;
      }
      const rest = s.slice(i);
      const prev = i > 0 ? s[i - 1] : '';
      let m;

      if (ch === '\\' && /^\\[!-/:-@[-`{-~]/.test(rest)) {
        text += rest[1];
        i += 2;
        continue;
      }
      if (ch === '\\' && rest[1] === '\n') {
        flushText();
        out += '<br>';
        i += 2;
        continue;
      }
      if (ch === '\n') {
        flushText();
        out += '<br>';
        i++;
        continue;
      }
      if (ch === '`') {
        const run = rest.match(/^`+/)[0];
        const end = rest.indexOf(run, run.length);
        if (end > 0) {
          let code = rest.slice(run.length, end).replace(/\n/g, ' ');
          if (/^ .* $/.test(code)) code = code.slice(1, -1);
          flushText();
          out += `<code>${escapeHtml(code)}</code>`;
          i += end + run.length;
          continue;
        }
        text += run;
        i += run.length;
        continue;
      }
      if (ch === '!' && (m = rest.match(RE.image))) {
        const r = this.image(unescapeMd(m[1]), m[2]);
        flushText();
        out += r.placeholder ? escapeHtml(r.placeholder) : r.tag;
        i += m[0].length;
        continue;
      }
      if (ch === '[' && (m = rest.match(RE.link))) {
        const href = sanitizeLinkUrl(m[2]);
        const inner = this.inline(m[1]);
        flushText();
        out += href ? `<a href="${escapeHtml(href)}">${inner}</a>` : inner;
        i += m[0].length;
        continue;
      }
      if (ch === '<') {
        if ((m = rest.match(RE.br))) {
          flushText();
          out += '<br>';
          i += m[0].length;
          continue;
        }
        if ((m = rest.match(RE.angleLink))) {
          const href = sanitizeLinkUrl(m[1]);
          flushText();
          out += href ? `<a href="${escapeHtml(href)}">${escapeHtml(m[1])}</a>` : escapeHtml(m[0]);
          i += m[0].length;
          continue;
        }
      }
      if (ch === '*') {
        if ((m = rest.match(RE.boldItalic))) {
          flushText();
          out += `<strong><em>${this.inline(m[1])}</em></strong>`;
          i += m[0].length;
          continue;
        }
        if ((m = rest.match(RE.bold))) {
          flushText();
          out += `<strong>${this.inline(m[1])}</strong>`;
          i += m[0].length;
          continue;
        }
        if ((m = rest.match(RE.italic))) {
          flushText();
          out += `<em>${this.inline(m[1])}</em>`;
          i += m[0].length;
          continue;
        }
      }
      if (ch === '_' && !/[A-Za-z0-9]/.test(prev)) {
        if ((m = rest.match(RE.boldU))) {
          flushText();
          out += `<strong>${this.inline(m[1])}</strong>`;
          i += m[0].length;
          continue;
        }
        if ((m = rest.match(RE.italicU))) {
          flushText();
          out += `<em>${this.inline(m[1])}</em>`;
          i += m[0].length;
          continue;
        }
      }
      if (ch === '~' && (m = rest.match(RE.strike))) {
        flushText();
        out += `<s>${this.inline(m[1])}</s>`;
        i += m[0].length;
        continue;
      }
      if (ch === 'h' && !/[A-Za-z0-9/]/.test(prev) && (m = rest.match(RE.autolink))) {
        const url = m[0].replace(/[.,;:!?)\]]+$/, '');
        const href = sanitizeLinkUrl(url);
        if (href) {
          flushText();
          out += `<a href="${escapeHtml(href)}">${escapeHtml(url)}</a>`;
          i += url.length;
          continue;
        }
      }
      // 「**」が閉じていない場合などは記号をそのまま表示する
      const run = rest.match(/^([*_~])\1*/);
      if (run) {
        text += run[0];
        i += run[0].length;
        continue;
      }
      text += ch;
      i++;
    }
    flushText();
    return out;
  }
}

function joinParagraph(lines) {
  // 行末の「半角スペース2つ」も通常の改行も <br> として扱う（日本語記事では改行が意図的なことが多い）
  return lines.map((l) => l.trim()).join('\n');
}

function plainInline(text) {
  return unescapeMd(
    text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*\*|\*\*|__|~~|\*|`)/g, ''),
  ).trim();
}

function defaultResolveImage(src) {
  if (src.startsWith('img:')) return null;
  return { src };
}
