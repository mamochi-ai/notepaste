// 実行: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unwrapMarkdownFence } from '../js/prompts.js';

test('```markdown の囲みを外す', () => {
  assert.equal(unwrapMarkdownFence('```markdown\n# 題\n\n本文\n```'), '# 題\n\n本文');
  assert.equal(unwrapMarkdownFence('以下が記事です。\n\n```markdown\n# 題\n```\n\nいかがでしょうか？'), '# 題');
  assert.equal(unwrapMarkdownFence('```md\r\n## 見出し\r\n```'), '## 見出し');
  assert.equal(unwrapMarkdownFence('```\n# 題\n```'), '# 題');
});

test('記事の中のコードブロックは残す', () => {
  const inner = '# 題\n\n```js\nconsole.log(1)\n```\n\n終わり';
  assert.equal(unwrapMarkdownFence('````markdown\n' + inner + '\n````'), inner);
  assert.equal(unwrapMarkdownFence('```markdown\n' + inner + '\n```'), inner);
});

test('囲まれていない記事はそのまま', () => {
  const md = '# 題\n\n```js\nx\n```\n\n本文';
  assert.equal(unwrapMarkdownFence(md), md);
  assert.equal(unwrapMarkdownFence('```js\nx\n```'), '```js\nx\n```');
  assert.equal(unwrapMarkdownFence('```\nx\n```\n\n続き'), '```\nx\n```\n\n続き');
  assert.equal(unwrapMarkdownFence('```markdown\na\n```\n```markdown\nb\n```'), '```markdown\na\n```\n```markdown\nb\n```');
  assert.equal(unwrapMarkdownFence('本文だけ'), '本文だけ');
});
