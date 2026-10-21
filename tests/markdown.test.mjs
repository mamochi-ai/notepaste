// 実行: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../js/markdown.js';

const md = (s, o) => renderMarkdown(s, o).html;

test('見出し・段落・太字・斜体', () => {
  assert.equal(md('# 大\n\n## 中\n\n### 小'), '<h1>大</h1>\n<h2>中</h2>\n<h3>小</h3>');
  assert.equal(md('これは**太字**と*斜体*です'), '<p>これは<strong>太字</strong>と<em>斜体</em>です</p>');
  assert.equal(md('**「括弧つき」**の太字'), '<p><strong>「括弧つき」</strong>の太字</p>');
  assert.equal(md('***両方***'), '<p><strong><em>両方</em></strong></p>');
  assert.equal(md('1行目\n2行目'), '<p>1行目<br>2行目</p>');
  assert.equal(md('閉じない**記号'), '<p>閉じない**記号</p>');
  assert.equal(md('snake_case_name'), '<p>snake_case_name</p>');
});

test('リスト（入れ子・番号・空行あり）', () => {
  assert.equal(md('- a\n- b\n  - c\n- d'), '<ul><li>a</li><li>b<ul><li>c</li></ul></li><li>d</li></ul>');
  assert.equal(md('1. 一\n2. 二'), '<ol><li>一</li><li>二</li></ol>');
  assert.equal(md('3. 三\n4. 四'), '<ol start="3"><li>三</li><li>四</li></ol>');
  assert.equal(md('- a\n\n- b'), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(md('* 星\n+ 足す'), '<ul><li>星</li><li>足す</li></ul>');
  assert.equal(md('- [x] 済\n- [ ] 未'), '<ul><li>☑ 済</li><li>☐ 未</li></ul>');
});

test('引用・リンク・区切り線・コード', () => {
  assert.equal(md('> 引用\n> 続き'), '<blockquote>\n<p>引用<br>続き</p>\n</blockquote>');
  assert.equal(md('[公式](https://example.com/a?b=1&c=2)'), '<p><a href="https://example.com/a?b=1&amp;c=2">公式</a></p>');
  assert.equal(md('---'), '<hr>');
  assert.equal(md('`<b>`'), '<p><code>&lt;b&gt;</code></p>');
  assert.equal(md('```js\nif (a < b) {}\n```'), '<pre><code>if (a &lt; b) {}</code></pre>');
  assert.equal(md('見て https://example.com。'), '<p>見て <a href="https://example.com">https://example.com</a>。</p>');
});

test('画像：単独行は figure、img:ID は resolveImage で解決', () => {
  const r = renderMarkdown('前\n\n![猫](img:abc123)\n\n後', {
    resolveImage: (src) => (src === 'img:abc123' ? { src: 'blob:x', width: 10, height: 20 } : null),
  });
  assert.equal(r.html, '<p>前</p>\n<figure><img src="blob:x" alt="猫" width="10" height="20"></figure>\n<p>後</p>');
  assert.deepEqual(r.blocks.map((b) => b.type), ['block', 'figure', 'block']);
  assert.deepEqual(r.imageRefs, ['img:abc123']);
  assert.match(md('![猫](img:nope)'), /［画像：猫］/);
});

test('タイトル分離と note 見出し変換', () => {
  const r = renderMarkdown('# タイトル\n\n本文\n\n## 大\n\n### 小\n\n#### 細', { extractTitle: true, noteHeadings: true });
  assert.equal(r.title, 'タイトル');
  assert.equal(r.html, '<p>本文</p>\n<h2>大</h2>\n<h3>小</h3>\n<p><strong>細</strong></p>');
  // 先頭以外の H1 は大見出しへ
  assert.equal(md('本文\n\n# 途中', { extractTitle: true, noteHeadings: true }), '<p>本文</p>\n<h2>途中</h2>');
});

test('表', () => {
  assert.equal(md('| a | b |\n|---|---|\n| 1 | 2 |'), '<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
});

test('XSS：HTMLはすべてエスケープされ、危険なURLは無効化される', () => {
  const cases = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '[x](javascript:alert(1))',
    '[x](JaVaScRiPt:alert(1))',
    '[x](java\tscript:alert(1))',
    '[x](data:text/html,<script>alert(1)</script>)',
    '![x](javascript:alert(1))',
    '![" onerror="alert(1)](https://example.com/a.png)',
    '![x](https://example.com/a.png" onerror="alert(1))',
    '<a href="javascript:alert(1)">x</a>',
    '<iframe src="https://example.com"></iframe>',
    '**<svg onload=alert(1)>**',
    '> <script>alert(1)</script>',
    '- <img src=x onerror=alert(1)>',
    '| <script> | b |\n|---|---|\n| c | d |',
    '`</code><script>alert(1)</script>`',
    '[<img src=x onerror=alert(1)>](https://example.com)',
  ];
  for (const c of cases) {
    const out = md(c);
    assert.doesNotMatch(out, /<(script|iframe|svg|object|embed)/i, c);
    // タグの属性（引用符の中の値を除く）に on〜= が無いこと
    for (const [, , attrs] of out.matchAll(/<([a-z0-9]+)([^>]*)>/gi)) {
      assert.doesNotMatch(attrs.replace(/"[^"]*"/g, '""'), /\son\w+\s*=/i, `${c} => ${out}`);
      assert.doesNotMatch(attrs.replace(/"[^"]*"/g, '""'), /\s(?!(href|src|alt|width|height|start)=)[a-z-]+=/i, `${c} => ${out}`);
    }
    assert.doesNotMatch(out, /href="(?!https?:|mailto:)/i, c);
    assert.doesNotMatch(out, /src="(?!https:|blob:|data:image)/i, c);
    // 生成された全タグが許可リスト内であること
    for (const [, tag] of out.matchAll(/<\/?([a-z0-9]+)/gi)) {
      assert.ok(
        ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 's', 'code', 'pre', 'a', 'img', 'figure', 'figcaption', 'ul', 'ol', 'li', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'].includes(tag.toLowerCase()),
        `${c} => ${out}`,
      );
    }
  }
});

test('深い入れ子や長い入力でも停止する', () => {
  const deep = '>'.repeat(500) + ' x';
  assert.ok(md(deep).length > 0);
  const long = '**a'.repeat(5000);
  assert.ok(md(long).length > 0);
});
