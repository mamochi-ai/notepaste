import { generateStory } from '../engine/generator.js';
import { tempoFromSteps } from '../engine/tempo.js';
import { checkStory, metrics } from '../engine/analyze.js';
import { DATA } from '../data/index.js';

const $ = (id) => document.getElementById(id);
const els = {
  form: $('controls'), steps: $('steps'), genre: $('genre'), seed: $('seed'),
  regenerate: $('regenerate'), save: $('save'), tempo: $('tempo'),
  story: $('story'), title: $('title'), stats: $('stats'), body: $('body'),
  settings: $('settings'), settingsBody: $('settings-body'), error: $('error'),
};

let current = null;

for (const g of DATA.genres.filter((g) => DATA.skeletons.some((s) => s.genres.includes(g.id)))) {
  els.genre.append(new Option(g.id, g.id));
}

// URL（?steps=&seed=&genre=）から再現できるようにする
const params = new URLSearchParams(location.search);
if (params.has('steps')) els.steps.value = params.get('steps');
if (params.has('genre')) els.genre.value = params.get('genre');
if (params.has('seed')) els.seed.value = params.get('seed');

const randomSeed = () => Math.random().toString(36).slice(2, 10);

function showTempo() {
  const t = tempoFromSteps(els.steps.value);
  els.tempo.textContent = `テンポ：${t.label}（t = ${t.t.toFixed(2)}）`;
}

function run(seed) {
  els.error.hidden = true;
  const steps = Math.max(0, Math.floor(Number(els.steps.value) || 0));
  const genre = els.genre.value || null;
  try {
    current = generateStory({ steps, seed, genre });
  } catch (e) {
    els.error.textContent = `生成に失敗しました：${e.message}`;
    els.error.hidden = false;
    return;
  }
  els.seed.value = seed;
  history.replaceState(null, '', `?${new URLSearchParams({ steps, seed, ...(genre ? { genre } : {}) })}`);
  render(current);
}

function render(story) {
  const m = story.meta;
  els.title.textContent = story.title;
  // ゆっくり読んで1分あたり400字として概算する
  const minutes = Math.max(1, Math.round(story.charCount / 400));
  els.stats.textContent = `${story.charCount}字 ／ 約${minutes}分 ／ ${m.genre} ／ テンポ：${m.tempo.label}`;
  els.body.replaceChildren(
    ...story.paragraphs.map((p) => {
      const el = document.createElement('p');
      el.textContent = p;
      if (!/^[「『]/.test(p)) el.className = 'narration';
      return el;
    }),
  );
  els.settingsBody.replaceChildren(settingsTable(story));
  els.story.hidden = false;
  els.settings.hidden = false;
  els.regenerate.disabled = false;
  els.save.disabled = false;
}

function settingsTable(story) {
  const m = story.meta;
  const check = checkStory(story, DATA);
  const mt = metrics(story);
  const person = (c) => `${c.name}（${c.gender}・${c.age}・一人称「${c.I}」・${c.feature}）`;
  const rows = [
    ['歩数', `${m.steps}歩 → テンポ ${m.tempo.label}（t=${m.tempo.t}${m.tempo.band === 'mid' ? `、${m.tempo.lean === 'fast' ? '動き' : '内省'}寄り` : ''}）`],
    ['シード', m.seed],
    ['ジャンル', m.genre],
    ['テーマ', m.theme],
    ['骨格', m.skeleton],
    ['舞台', [m.place, m.time, m.season, m.weather].filter(Boolean).join(' ／ ')],
    ['人称', m.person],
    ['主人公 P', person(m.cast.P)],
    ['相手 B', person(m.cast.B)],
    ['モチーフ', m.motif],
    ['場面', m.beats.map((b) => `${b.beat}：${b.variant ?? (b.interlude ? `情景 ${b.interlude.join(', ')}` : `（省略：${b.skipped}）`)}`).join('\n')],
    ['分岐フラグ', JSON.stringify(m.flags)],
    ['結末', m.ending],
    ['文章の指標', `${mt.sentences}文 ／ 平均文長 ${mt.avgSentenceLength}字 ／ 段落 ${mt.paragraphs} ／ 会話 ${Math.round(mt.dialogueRatio * 100)}% ／ 描写文 ${Math.round(mt.descriptiveRatio * 100)}%`],
  ];
  const table = document.createElement('table');
  for (const [k, v] of rows) {
    const tr = table.insertRow();
    const th = document.createElement('th');
    th.textContent = k;
    const td = tr.insertCell();
    td.style.whiteSpace = 'pre-line';
    td.textContent = v;
    tr.prepend(th);
  }
  const tr = table.insertRow();
  const th = document.createElement('th');
  th.textContent = '自動検査';
  tr.append(th);
  const td = tr.insertCell();
  if (!check.errors.length && !check.warnings.length) {
    td.innerHTML = '<span class="ok">問題なし</span>';
  } else {
    for (const [cls, list] of [['ng', check.errors], ['warn', check.warnings]]) {
      for (const msg of list) {
        const d = document.createElement('div');
        d.className = cls;
        d.textContent = msg;
        td.append(d);
      }
    }
  }
  return table;
}

function save() {
  if (!current) return;
  const m = current.meta;
  const footer = [
    '',
    '――――',
    `歩数: ${m.steps} / テンポ: ${m.tempo.label} / ジャンル: ${m.genre} / テーマ: ${m.theme}`,
    `シード: ${m.seed} / 骨格: ${m.skeleton} / 結末: ${m.ending} / ${current.charCount}字`,
  ].join('\n');
  const blob = new Blob([`${current.text}${footer}\n`], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  // 日本語のファイル名は一部のブラウザで無視されるため ASCII にする（題名は本文の先頭にある）
  a.download = `novel_${m.steps}steps_${m.seed}.txt`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  run(els.seed.value.trim() || randomSeed());
});
els.regenerate.addEventListener('click', () => run(randomSeed()));
els.save.addEventListener('click', save);
els.steps.addEventListener('input', showTempo);
showTempo();
if (params.has('seed')) run(els.seed.value);
