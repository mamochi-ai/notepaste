// 品質レポートと人間評価シートを reports/ に出力する: npm run report
import { mkdirSync, writeFileSync } from 'node:fs';
import { checkStory, metrics, similarity } from '../src/engine/analyze.js';
import { DATA } from '../src/data/index.js';
import { buildCorpus } from './corpus.js';

const OUT = new URL('../reports/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const corpus = buildCorpus().map((c) => ({ ...c, m: metrics(c.story), check: checkStory(c.story, DATA) }));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');

// テンポ帯ごとの平均
const bands = ['slow', 'mid', 'fast'].map((band) => {
  const xs = corpus.filter((c) => c.story.meta.tempo.band === band);
  const avg = (k) => mean(xs.map((c) => c.m[k]));
  return { band, label: xs[0]?.story.meta.tempo.label ?? band, n: xs.length, avg };
});

// 同じシードで歩数だけ変えた対
const C = corpus.filter((c) => c.group === 'C');
const pairs = C.filter((c) => c.steps === 1000).map((slow) => [slow, C.find((f) => f.steps === 15000 && f.seed === slow.seed)]);

// 類似度
const sims = { same: [], cross: [] };
for (let i = 0; i < corpus.length; i++) {
  for (let j = i + 1; j < corpus.length; j++) {
    const a = corpus[i].story;
    const b = corpus[j].story;
    if (a.meta.seed === b.meta.seed) continue;
    (a.meta.skeleton === b.meta.skeleton ? sims.same : sims.cross).push(similarity(a.body, b.body));
  }
}
const stat = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  return `最小 ${fmt(s[0], 3)} / 中央値 ${fmt(s[Math.floor(s.length / 2)], 3)} / 最大 ${fmt(s.at(-1), 3)}（${s.length}組）`;
};

const genreCount = {};
for (const c of corpus.filter((x) => !x.genre)) genreCount[c.story.meta.genre] = (genreCount[c.story.meta.genre] ?? 0) + 1;

const errorCount = corpus.filter((c) => c.check.errors.length).length;
const warnCount = corpus.filter((c) => c.check.warnings.length).length;
const lens = corpus.map((c) => c.story.charCount);

const report = `# 品質レポート

\`npm run report\` で再生成できます。生成数：**${corpus.length}編**（A: 異なる歩数×3シード、B: 同じ歩数5,000歩×10シード、C: ジャンル指定×同じシードで1,000歩と15,000歩）

## 概要

| 項目 | 結果 |
|---|---|
| 文字数 | 最小 ${Math.min(...lens)} / 平均 ${fmt(mean(lens), 0)} / 最大 ${Math.max(...lens)}（範囲 1,000〜1,400） |
| 自動検査エラーのある物語 | ${errorCount}編 |
| 警告のある物語 | ${warnCount}編 |
| ジャンル分布（自動選択 ${corpus.filter((x) => !x.genre).length}編） | ${Object.entries(genreCount).map(([g, n]) => `${g} ${n}`).join(' / ')} |
| 類似度：同じ骨格どうし | ${stat(sims.same)} |
| 類似度：異なる骨格どうし | ${stat(sims.cross)} |

類似度は5文字単位の Jaccard 係数です（0 = 共通部分なし、1 = 同一）。
同じ骨格どうしの類似度が高いのは、試作データが1ジャンル1骨格であるための既知の限界です（docs/analysis.md）。

## 歩数による文章の違い

### テンポ帯ごとの平均

| テンポ | 編数 | 平均文長（字） | 1,000字あたり段落数 | 会話の比率 | 描写文の比率 | 場面数 |
|---|---|---|---|---|---|---|
${bands.map((b) => `| ${b.label} | ${b.n} | ${fmt(b.avg('avgSentenceLength'))} | ${fmt(b.avg('paragraphsPer1000'))} | ${fmt(b.avg('dialogueRatio'), 2)} | ${fmt(b.avg('descriptiveRatio'), 2)} | ${fmt(b.avg('beats'))} |`).join('\n')}

### 同じシード・同じ物語で歩数だけを変えた対（1,000歩 → 15,000歩）

| シード | ジャンル | 文字数 | 平均文長 | 段落数 | 描写文の比率 |
|---|---|---|---|---|---|
${pairs.map(([s, f]) => `| ${s.seed} | ${s.story.meta.genre} | ${s.m.chars} → ${f.m.chars} | ${s.m.avgSentenceLength} → ${f.m.avgSentenceLength} | ${s.m.paragraphs} → ${f.m.paragraphs} | ${s.m.descriptiveRatio} → ${f.m.descriptiveRatio} |`).join('\n')}

## 全物語の一覧

| ID | 歩数 | テンポ | ジャンル | 骨格 | 人称 | 結末 | 文字数 | 平均文長 | 段落 | 検査 |
|---|---|---|---|---|---|---|---|---|---|---|
${corpus.map((c) => {
  const m = c.story.meta;
  const result = c.check.errors.length ? `✕ ${c.check.errors.join('; ')}` : c.check.warnings.length ? `△ ${c.check.warnings.join('; ')}` : '○';
  return `| ${c.id} | ${c.steps} | ${m.tempo.label} | ${m.genre} | ${m.skeleton} | ${m.person} | ${m.ending} | ${c.m.chars} | ${c.m.avgSentenceLength} | ${c.m.paragraphs} | ${result} |`;
}).join('\n')}
`;

// 人間評価用：全編ではなく、比較しやすい代表を選ぶ
const forHumans = [
  ...corpus.filter((c) => c.group === 'A' && c.seed.startsWith('A1')),
  ...corpus.filter((c) => c.group === 'C' && c.seed.startsWith('C1')),
];

const RUBRIC = [
  ['自然さ', '日本語として引っかかる箇所がないか'],
  ['つながり', '文と文、場面と場面が自然につながっているか'],
  ['人物', '人物の言動・呼び方・関係に違和感がないか'],
  ['結末', '展開から見て結末に納得できるか'],
  ['余韻', '読後に何か残るか'],
  ['テンポ', '歩数（テンポ）に合った読み心地か'],
];

const human = `# 人間評価シート

自動検査では判断できない文学的な品質を評価するためのシートです。
各項目を **1（悪い）〜5（良い）** で評価し、気になった箇所はメモ欄に文を引用してください。
同じ内容を表計算ソフトで扱う場合は \`human-eval.csv\` を使ってください。

## 評価項目

${RUBRIC.map(([k, d]) => `- **${k}**：${d}`).join('\n')}

C グループは「同じシード・同じ物語で歩数だけを変えた対」です。並べて読み、テンポの違いが感じられるかを確認してください。

---

${forHumans.map((c) => {
  const m = c.story.meta;
  return `## ${c.id}　${c.story.title}

- 歩数 ${c.steps}（${m.tempo.label}）／ ${m.genre} ／ テーマ「${m.theme}」／ ${m.person} ／ ${c.m.chars}字
- 舞台：${m.place}${m.time ? `（${m.time}）` : ''}${m.season ? `、${m.season}・${m.weather}` : ''}
- 人物：P ${m.cast.P.name}（${m.cast.P.gender}）、B ${m.cast.B.name}（${m.cast.B.gender}）／ モチーフ：${m.motif}

${c.story.body.split('\n').join('\n\n')}

| ${RUBRIC.map(([k]) => k).join(' | ')} | メモ |
|${RUBRIC.map(() => '---').join('|')}|---|
| ${RUBRIC.map(() => ' ').join(' | ')} |  |
`;
}).join('\n---\n\n')}`;

const csv = [
  ['id', 'steps', 'tempo', 'genre', 'title', ...RUBRIC.map(([k]) => k), 'memo'].join(','),
  ...forHumans.map((c) => [c.id, c.steps, c.story.meta.tempo.label, c.story.meta.genre, c.story.title, ...RUBRIC.map(() => ''), ''].join(',')),
].join('\n');

writeFileSync(new URL('quality-report.md', OUT), report);
writeFileSync(new URL('human-eval.md', OUT), human);
writeFileSync(new URL('human-eval.csv', OUT), `﻿${csv}\n`);
console.log(`reports/ に出力しました（${corpus.length}編、エラー ${errorCount}編、警告 ${warnCount}編）`);
