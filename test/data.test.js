// データの静的検査。生成の乱数に頼らず、全組み合わせを機械的に確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/engine/rng.js';
import { renderTemplate } from '../src/engine/template.js';
import { matches } from '../src/engine/conditions.js';
import { generateStory } from '../src/engine/generator.js';
import { DATA } from '../src/data/index.js';

// 本文データに直接書いてはいけない語（人称・性別は変数で解決する）
const FORBIDDEN = /彼女|彼(?!方)|私|僕|俺/;

function allLines(skeleton) {
  const out = [];
  const push = (where, line) => {
    if (line === '¶') return;
    const obj = typeof line === 'string' ? { t: line } : line;
    for (const key of ['t', 'fast', 'slow']) if (obj[key]) out.push({ where, text: obj[key] });
  };
  for (const beat of skeleton.beats) {
    for (const v of beat.variants ?? []) v.lines.forEach((l) => push(`${beat.id}/${v.id}`, l));
  }
  for (const e of skeleton.endings) e.lines.forEach((l) => push(`ending/${e.id}`, l));
  skeleton.titles.forEach((t) => out.push({ where: 'title', text: t }));
  return out;
}

function placesFor(skeleton) {
  return DATA.places.filter((p) => p.world === skeleton.world && skeleton.placeTags.every((t) => p.tags.includes(t)));
}

function motifsFor(skeleton) {
  return DATA.motifs.filter((m) => m.tags.includes(skeleton.motifTag));
}

// 役割の制約を満たす人物の組を、性別の組み合わせごとに1組ずつ選ぶ
function castsFor(skeleton) {
  const chars = DATA.characters.filter((c) => c.worlds.includes(skeleton.world));
  const casts = [];
  for (const gp of ['m', 'f']) {
    for (const gb of ['m', 'f']) {
      const P = chars.find((c) => c.gender === gp && (!skeleton.roles.P.age || skeleton.roles.P.age.includes(c.age)));
      const roleB = skeleton.roles.B;
      const B = chars.find(
        (c) => c.gender === gb && c.id !== P?.id &&
          (!roleB.age || roleB.age.includes(c.age)) && (!roleB.sameAgeAs || c.age === P?.age),
      );
      if (P && B) casts.push({ P, B });
    }
  }
  return casts;
}

for (const skeleton of DATA.skeletons) {
  test(`[${skeleton.id}] 本文データに人称代名詞を直接書いていない`, () => {
    for (const { where, text } of allLines(skeleton)) {
      assert.ok(!FORBIDDEN.test(text), `${where}: ${text}`);
    }
  });

  test(`[${skeleton.id}] すべての文が、すべての舞台・モチーフ・人称・性別の組み合わせで描画できる`, () => {
    const places = placesFor(skeleton);
    const motifs = motifsFor(skeleton);
    const casts = castsFor(skeleton);
    assert.ok(places.length >= 2, '舞台が2つ以上ある');
    assert.ok(motifs.length >= 2, 'モチーフが2つ以上ある');
    assert.equal(casts.length, 4, '性別の4通りの組み合わせすべてに人物がいる');
    const rng = createRng('lint');
    for (const place of places) {
      for (const motif of motifs) {
        for (const person of skeleton.persons) {
          for (const cast of casts) {
            const state = {
              person, cast, motif, place, roles: skeleton.roles,
              sameGender: cast.P.gender === cast.B.gender,
              time: skeleton.times ? skeleton.times.find((t) => !place.times || place.times.includes(t)) : null,
              season: skeleton.seasonal ? '冬' : null,
              weather: skeleton.seasonal ? '雪' : null,
              flags: {},
            };
            for (const { where, text } of allLines(skeleton)) {
              assert.doesNotThrow(() => renderTemplate(text, state, rng), `${where} @${place.id}/${motif.id}: ${text}`);
            }
          }
        }
      }
    }
  });

  test(`[${skeleton.id}] 参照されるフラグはどこかで立てられている`, () => {
    const set = new Set();
    const used = [];
    const collectWhen = (when, where) => when?.flags && Object.keys(when.flags).forEach((f) => used.push([f, where]));
    for (const beat of skeleton.beats) {
      collectWhen(beat.when, beat.id);
      for (const v of beat.variants ?? []) {
        Object.keys(v.sets ?? {}).forEach((f) => set.add(f));
        collectWhen(v.when, `${beat.id}/${v.id}`);
        v.lines.forEach((l) => typeof l === 'object' && collectWhen(l.when, `${beat.id}/${v.id}`));
      }
    }
    for (const e of skeleton.endings) {
      collectWhen(e.when, `ending/${e.id}`);
      e.lines.forEach((l) => typeof l === 'object' && collectWhen(l.when, `ending/${e.id}`));
    }
    for (const [f, where] of used) assert.ok(set.has(f), `${where} が未定義のフラグ ${f} を参照`);
  });

  test(`[${skeleton.id}] 分岐のどの組み合わせでも、選べる結末が必ずある`, () => {
    const base = generateStory({ steps: 0, seed: 'paths', genre: skeleton.genres[0] }).state;
    // 分岐の全経路（テンポ専用場面の有無も含む）を列挙する
    let paths = [{}];
    for (const beat of skeleton.beats) {
      if (!beat.variants) continue;
      const next = [];
      for (const flags of paths) {
        if (beat.tempo) next.push({ ...flags });
        for (const v of beat.variants) next.push({ ...flags, ...(v.sets ?? {}) });
      }
      paths = next;
    }
    for (const themeId of skeleton.themes) {
      for (const flags of paths) {
        const state = { ...base, skeleton, theme: DATA.themes.find((t) => t.id === themeId), flags };
        const ok = skeleton.endings.some((e) => matches(e.when, state));
        assert.ok(ok, `テーマ ${themeId}, フラグ ${JSON.stringify(flags)} に合う結末がない`);
      }
    }
  });

  test(`[${skeleton.id}] 参照するテーマ・ジャンルが定義されている`, () => {
    for (const t of skeleton.themes) assert.ok(DATA.themes.some((x) => x.id === t), t);
    for (const g of skeleton.genres) assert.ok(DATA.genres.some((x) => x.id === g), g);
  });
}

test('情景文に人称代名詞を直接書いていない', () => {
  for (const it of DATA.interludes) assert.ok(!FORBIDDEN.test(it.t), it.id);
  for (const p of DATA.places) for (const v of Object.values(p)) if (typeof v === 'string') assert.ok(!FORBIDDEN.test(v), p.id);
  for (const m of DATA.motifs) for (const v of Object.values(m)) if (typeof v === 'string') assert.ok(!FORBIDDEN.test(v), m.id);
});

test('人物の名前・姓は2文字以上で重複しない', () => {
  const names = new Set();
  for (const c of DATA.characters) {
    assert.ok([...c.name].length >= 2, c.id);
    if (c.sei) assert.ok([...c.sei].length >= 2, c.id);
    assert.ok(!names.has(c.name), c.name);
    names.add(c.name);
  }
});

test('ID が重複していない', () => {
  for (const key of ['characters', 'places', 'motifs', 'interludes', 'skeletons']) {
    const ids = DATA[key].map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, key);
  }
});
