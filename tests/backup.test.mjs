// 実行: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBackup } from '../js/backup.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const wrap = (o) => JSON.stringify({ format: 'note-paste-studio-backup', version: 1, ...o });

test('正しいバックアップを読み込める', () => {
  const r = parseBackup(wrap({ articles: [{ id: 'abc', md: '# t', createdAt: 1, updatedAt: 2 }], images: [{ id: 'img1', name: '写真', width: 1, height: 1, dataUrl: PNG }] }));
  assert.equal(r.articles.length, 1);
  assert.equal(r.images.length, 1);
  assert.equal(r.images[0].blob.type, 'image/png');
  assert.ok(r.images[0].blob.size > 0);
  assert.equal(r.skipped, 0);
});

test('不正な項目は読み飛ばす', () => {
  const r = parseBackup(
    wrap({
      articles: [{ id: '../x', md: 'a' }, { id: 'ok', md: 1 }, { id: 'good', md: 'b' }],
      images: [{ id: 'i', dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }, { id: 'j', dataUrl: 'javascript:alert(1)' }],
    }),
  );
  assert.deepEqual(r.articles.map((a) => a.id), ['good']);
  assert.equal(r.images.length, 0);
  assert.equal(r.skipped, 4);
});

test('別のファイルは拒否する', () => {
  assert.throws(() => parseBackup('not json'), /JSON/);
  assert.throws(() => parseBackup('{"articles":[]}'), /バックアップファイルではありません/);
});
