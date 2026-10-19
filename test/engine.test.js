import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/engine/rng.js';
import { tempoFromSteps } from '../src/engine/tempo.js';
import { renderTemplate } from '../src/engine/template.js';
import { generateStory } from '../src/engine/generator.js';
import { splitSentences } from '../src/engine/analyze.js';
import { DATA } from '../src/data/index.js';

const ch = (id) => DATA.characters.find((c) => c.id === id);

function stubState(overrides = {}) {
  return {
    person: 'third',
    cast: { P: ch('misaki'), B: ch('yuma') },
    roles: { P: {}, B: { ref: '{B.sei}さん' } },
    sameGender: false,
    motif: DATA.motifs[0],
    place: DATA.places[0],
    time: '夜',
    season: '冬',
    weather: '雪',
    flags: {},
    ...overrides,
  };
}

test('乱数はシードで再現できる', () => {
  const a = createRng('x');
  const b = createRng('x');
  assert.deepEqual([a.next(), a.next()], [b.next(), b.next()]);
  assert.notEqual(createRng('x').next(), createRng('y').next());
});

test('同じ入力からは同じ物語が生成される', () => {
  const a = generateStory({ steps: 4321, seed: 'same' });
  const b = generateStory({ steps: 4321, seed: 'same' });
  assert.equal(a.text, b.text);
});

test('テンポは歩数に対して単調に増え、0〜1に収まる', () => {
  let prev = -1;
  for (const s of [0, 500, 1000, 3000, 6000, 10000, 20000, 50000]) {
    const { t } = tempoFromSteps(s);
    assert.ok(t >= prev && t >= 0 && t <= 1);
    prev = t;
  }
  assert.equal(tempoFromSteps(-5).t, 0);
  assert.equal(tempoFromSteps('abc').t, 0);
  assert.equal(tempoFromSteps(1000).band, 'slow');
  assert.equal(tempoFromSteps(5000).band, 'mid');
  assert.equal(tempoFromSteps(15000).band, 'fast');
});

test('人称によって主人公の呼び方が変わる', () => {
  const rng = createRng(1);
  assert.equal(renderTemplate('{P}は{P.pr}の手を見た。', stubState({ person: 'first' }), rng), '私は私の手を見た。');
  assert.equal(renderTemplate('{P}は{P.pr}の手を見た。', stubState(), rng), '美咲は彼女の手を見た。');
  assert.equal(renderTemplate('{B}と{B.pr}', stubState(), rng), '森本さんと彼');
});

test('三人称で同性の二人のとき、相手は代名詞でなく呼び名になる', () => {
  const state = stubState({ cast: { P: ch('misaki'), B: ch('hina') }, sameGender: true });
  assert.equal(renderTemplate('{P.pr}と{B.pr}', state, createRng(1)), '彼女と佐伯さん');
});

test('性別による語の切り替え', () => {
  assert.equal(renderTemplate('{P.name}{P^くん|ちゃん}', stubState(), createRng(1)), '美咲ちゃん');
  assert.equal(renderTemplate('{B^おじさん|おばさん}', stubState(), createRng(1)), 'おじさん');
});

test('未知の変数や項目はエラーになる', () => {
  assert.throws(() => renderTemplate('{X}', stubState(), createRng(1)));
  assert.throws(() => renderTemplate('{S.nothing}', stubState(), createRng(1)));
});

test('文の分割は括弧の中で区切らない', () => {
  const s = splitSentences('「ありがとう。助かった」と言った。それから歩いた。\n「はい」\n「え」「うん」');
  assert.deepEqual(s, ['「ありがとう。助かった」と言った。', 'それから歩いた。', '「はい」', '「え」', '「うん」']);
});
