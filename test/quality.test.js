// 品質検証：異なる歩数・同じ歩数で合計51編を生成し、自動で判断できる項目を検査する。
// 文学的な品質は scripts/report.js が出力する人間評価シートで確認する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkStory, metrics, similarity } from '../src/engine/analyze.js';
import { generateStory, LENGTH } from '../src/engine/generator.js';
import { DATA } from '../src/data/index.js';
import { buildCorpus, GENRES } from '../scripts/corpus.js';

const corpus = buildCorpus();
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

test('20編以上を生成している', () => {
  assert.ok(corpus.length >= 20, `${corpus.length}編`);
});

test('文字数がすべて範囲内', () => {
  for (const { id, story } of corpus) {
    assert.ok(story.charCount >= LENGTH.min && story.charCount <= LENGTH.max, `${id}: ${story.charCount}字`);
  }
});

test('自動検査でエラーがない（重複・人物矛盾・接続・結末整合）', () => {
  const problems = [];
  for (const { id, story } of corpus) {
    const { errors } = checkStory(story, DATA);
    if (errors.length) problems.push(`${id}: ${errors.join(' / ')}`);
  }
  assert.deepEqual(problems, []);
});

test('警告は全体の1割未満', () => {
  const warned = corpus.filter(({ story }) => checkStory(story, DATA).warnings.length > 0);
  assert.ok(warned.length < corpus.length * 0.1, warned.map((w) => w.id).join(', '));
});

test('物語どうしが完全に同じにならない', () => {
  const texts = new Set(corpus.map(({ story }) => story.body));
  assert.equal(texts.size, corpus.length);
});

test('同じ歩数・異なるシードの物語どうしの類似度', () => {
  const group = corpus.filter((c) => c.group === 'B');
  const same = [];
  const cross = [];
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i].story;
      const b = group[j].story;
      (a.meta.skeleton === b.meta.skeleton ? same : cross).push(similarity(a.body, b.body));
    }
  }
  const median = (xs) => xs.slice().sort((x, y) => x - y)[Math.floor(xs.length / 2)];
  // 異なる骨格どうしはほぼ重ならない
  for (const s of cross) assert.ok(s < 0.1, `異なる骨格の類似度 ${s}`);
  // 同じ骨格どうしは筋が共通なので重なる。試作データ（1ジャンル1骨格）の既知の限界であり、
  // 中央値だけを上限で抑える。最大値はレポートで確認する（docs/analysis.md 参照）。
  if (same.length) assert.ok(median(same) < 0.4, `同じ骨格の類似度の中央値 ${median(same)}`);
});

test('ジャンルが偏らない（自動選択）', () => {
  const auto = corpus.filter((c) => !c.genre);
  const counts = {};
  for (const { story } of auto) counts[story.meta.genre] = (counts[story.meta.genre] ?? 0) + 1;
  assert.ok(Object.keys(counts).length >= 4, JSON.stringify(counts));
  for (const n of Object.values(counts)) assert.ok(n <= auto.length * 0.4, JSON.stringify(counts));
});

test('全ジャンルが生成できる', () => {
  const genres = new Set(corpus.map((c) => c.story.meta.genre));
  for (const g of GENRES) assert.ok(genres.has(g), g);
});

test('歩数によって文章のリズムと描写の密度が変わる（同じシードの対で比較）', () => {
  const pairs = [];
  const C = corpus.filter((c) => c.group === 'C');
  for (const slow of C.filter((c) => c.steps === 1000)) {
    const fast = C.find((c) => c.steps === 15000 && c.seed === slow.seed);
    pairs.push([metrics(slow.story), metrics(fast.story)]);
  }
  const s = (k) => mean(pairs.map(([a]) => a[k]));
  const f = (k) => mean(pairs.map(([, b]) => b[k]));
  // 歩数が少ない日：文が長く、描写が多く、段落が長い
  assert.ok(s('avgSentenceLength') > f('avgSentenceLength'), `平均文長 ${s('avgSentenceLength')} vs ${f('avgSentenceLength')}`);
  assert.ok(s('descriptiveRatio') > f('descriptiveRatio'), `描写比率 ${s('descriptiveRatio')} vs ${f('descriptiveRatio')}`);
  assert.ok(f('paragraphsPer1000') > s('paragraphsPer1000'), `段落密度 ${s('paragraphsPer1000')} vs ${f('paragraphsPer1000')}`);
  // 同じシードなら、歩数が違っても同じ物語（骨格・人物・舞台）になる
  for (const slow of C.filter((c) => c.steps === 1000)) {
    const fast = C.find((c) => c.steps === 15000 && c.seed === slow.seed);
    assert.equal(slow.story.meta.skeleton, fast.story.meta.skeleton);
    assert.deepEqual(slow.story.meta.cast, fast.story.meta.cast);
    assert.equal(slow.story.meta.place, fast.story.meta.place);
  }
});

test('歩数が少なくても多くても、すべてのジャンルが選ばれうる（歩数に優劣をつけない）', () => {
  for (const steps of [0, 30000]) {
    const genres = new Set();
    for (let i = 0; i < 60; i++) genres.add(generateStory({ steps, seed: `fair-${i}` }).meta.genre);
    for (const g of GENRES) assert.ok(genres.has(g), `${steps}歩で ${g} が出ない`);
  }
});
