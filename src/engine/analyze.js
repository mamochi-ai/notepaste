// 自動検査。UI・テスト・レポートで共通に使う。
// errors は物語として成立しない問題、warnings は人間が確認すべき兆候。

import { countChars } from './assemble.js';
import { matches } from './conditions.js';
import { LENGTH } from './generator.js';

const OPEN = '「『';
const CLOSE = '」』';

// 括弧の中では区切らず、「……」と言った。のような文は1文として扱う。
export function splitSentences(body) {
  const out = [];
  for (const para of body.split('\n')) {
    const p = para.replace(/^　/, '');
    let depth = 0;
    let cur = '';
    for (let i = 0; i < p.length; i++) {
      const ch = p[i];
      cur += ch;
      if (OPEN.includes(ch)) depth++;
      else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
      const next = p[i + 1];
      const endsHere =
        depth === 0 &&
        (('。！？'.includes(ch) && !'。！？」』'.includes(next ?? '')) ||
          (CLOSE.includes(ch) && (next === undefined || OPEN.includes(next))));
      if (endsHere) {
        out.push(cur);
        cur = '';
      }
    }
    if (cur.trim()) out.push(cur);
  }
  return out;
}

export function stripQuotes(text) {
  let depth = 0;
  let out = '';
  for (const ch of text) {
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out;
}

export function metrics(story) {
  const sentences = splitSentences(story.body);
  const total = story.charCount;
  const quoted = total - countChars(stripQuotes(story.body));
  const descriptive = story.units
    .filter((u) => u.kind !== 'core')
    .reduce((n, u) => n + countChars(u.text), 0);
  return {
    chars: total,
    sentences: sentences.length,
    avgSentenceLength: round(total / sentences.length),
    paragraphs: story.paragraphs.length,
    paragraphsPer1000: round((story.paragraphs.length / total) * 1000),
    dialogueRatio: round(quoted / total),
    descriptiveRatio: round(descriptive / total),
    beats: story.meta.beats.filter((b) => !b.skipped).length,
  };
}

export function checkStory(story, data) {
  const errors = [];
  const warnings = [];
  const { body, state } = story;
  const sentences = splitSentences(body);

  // 文字数
  if (story.charCount < LENGTH.min || story.charCount > LENGTH.max) {
    errors.push(`文字数が範囲外: ${story.charCount}字`);
  }

  // 不自然な接続
  if (/[{}]|\[\[|\]\]|undefined|null|NaN/.test(story.text)) errors.push('未解決の変数が残っている');
  const punct = body.match(/。。|、、|、。|。、|「」|『』|^[、。]/m);
  if (punct) errors.push(`句読点の異常: 「${punct[0]}」`);
  for (const para of body.split('\n')) {
    for (const [o, c] of [['「', '」'], ['『', '』']]) {
      if (para.split(o).length !== para.split(c).length) errors.push(`括弧の対応が崩れている: ${para.slice(0, 20)}…`);
    }
  }
  // 「にじむ」「できる」などの誤検出を避け、誤りがほぼ確実な組み合わせだけを見る
  const doubled = body.match(/(がが|をを)/);
  if (doubled) warnings.push(`助詞の重複の疑い: 「${doubled[0]}」`);
  let run = 1;
  for (let i = 1; i < sentences.length; i++) {
    const tail = (s) => stripQuotes(s).replace(/[。！？」』]+$/, '').slice(-2);
    const a = tail(sentences[i - 1]);
    run = a && a === tail(sentences[i]) ? run + 1 : 1;
    if (run === 5) warnings.push(`同じ文末「${a}」が5文続く: ${sentences[i].slice(0, 15)}…`);
  }
  const connective = /^(しかし|けれど|けれども|でも|それでも|そして|だが)/;
  for (let i = 1; i < sentences.length; i++) {
    const a = sentences[i - 1].match(connective)?.[0];
    if (a && a === sentences[i].match(connective)?.[0]) warnings.push(`同じ接続詞「${a}」が連続`);
  }

  // 文章の重複（同一物語内）
  const seen = new Set();
  for (const s of sentences) {
    const key = s.replace(/[\s　]/g, '');
    if (countChars(key) >= 6 && seen.has(key)) errors.push(`同じ文が繰り返されている: ${key.slice(0, 20)}`);
    seen.add(key);
  }

  // 登場人物の設定矛盾
  const castIds = new Set(Object.values(state.cast).map((c) => c.id));
  for (const c of data.characters) {
    if (castIds.has(c.id)) continue;
    for (const n of [c.name, c.sei]) {
      if (n && countChars(n) >= 2 && body.includes(n)) errors.push(`登場しない人物の名前が混入: ${n}`);
    }
  }
  const P = state.cast.P;
  if (state.person === 'first') {
    const narration = stripQuotes(body);
    if (narration.includes(P.name)) errors.push('一人称なのに地の文に主人公の名前がある');
    if (P.sei && narration.includes(`${P.sei}さん`)) errors.push('一人称なのに地の文で主人公を姓で呼んでいる');
  }
  for (const [key, role] of Object.entries(state.roles)) {
    if (!role.introducedAt) continue;
    const ch = state.cast[key];
    const introIndex = state.skeleton.beats.findIndex((b) => b.id === role.introducedAt);
    const first = story.units.find((u) => u.text.includes(ch.name) || (ch.sei && u.text.includes(ch.sei)));
    if (first && first.beatIndex < introIndex) errors.push(`${key}が名乗る前に名前で呼ばれている（場面 ${first.beat}）`);
  }

  // 展開と結末の整合性
  if (!matches(story.ending.when, state)) errors.push(`結末 ${story.ending.id} の条件がフラグと一致しない`);
  const motifName = state.motif.name;
  const firstAt = body.indexOf(motifName) / body.length;
  const lastAt = body.lastIndexOf(motifName) / body.length;
  if (firstAt < 0) errors.push('モチーフが一度も登場しない');
  else {
    if (firstAt > 0.5) errors.push(`モチーフの提示が遅い（${Math.round(firstAt * 100)}%地点）`);
    if (lastAt < 0.55) errors.push(`モチーフが後半で回収されていない（最後は${Math.round(lastAt * 100)}%地点）`);
  }

  return { errors, warnings };
}

// 物語間の類似度（5文字シングルの Jaccard 係数）
export function similarity(a, b, n = 5) {
  const grams = (s) => {
    const t = s.replace(/[\s　]/g, '');
    const set = new Set();
    for (let i = 0; i + n <= t.length; i++) set.add(t.slice(i, i + n));
    return set;
  };
  const A = grams(a);
  const B = grams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return round(inter / (A.size + B.size - inter), 3);
}

function round(x, d = 2) {
  const k = 10 ** d;
  return Math.round(x * k) / k;
}
