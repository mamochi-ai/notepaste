// 物語の組み立て。骨格の場面を順に処理し、状態（人物・舞台・時間・フラグ）を保ちながら本文を作る。

import { createRng } from './rng.js';
import { tempoFromSteps } from './tempo.js';
import { renderTemplate } from './template.js';
import { matches } from './conditions.js';
import { assembleParagraphs, countChars, formatBody } from './assemble.js';
import { DATA } from '../data/index.js';

export const LENGTH = { min: 1000, max: 1400 };

export function generateStory({ steps = 0, seed = 'seed', genre = null, data = DATA } = {}) {
  // 判断ごとに独立した乱数を使う。同じシードなら歩数を変えても骨格・人物・分岐が揃い、テンポだけを比較できる。
  const R = (label) => createRng(`${seed}|${label}`);
  const tempo = tempoFromSteps(steps);
  // 「ふつう」の日は、物語ごとに動き（fast）か内省（slow）のどちらかの場面へ寄せる
  const lean = tempo.band === 'mid' ? R('lean').pick(['fast', 'slow']) : tempo.band;
  const wantsBeat = (kind) => lean === kind;
  const state = buildState({ data, genre, tempo, R });
  const { skeleton } = state;

  const units = [];
  const trace = [];
  const usedInterludes = new Set();

  skeleton.beats.forEach((beat, beatIndex) => {
    if (beat.tempo && !wantsBeat(beat.tempo)) {
      return trace.push({ beat: beat.id, skipped: beat.tempo === 'fast' ? '動きの場面（テンポ速）' : '内省の場面（テンポ遅）' });
    }
    if (!matches(beat.when, state)) return trace.push({ beat: beat.id, skipped: '条件外' });

    if (beat.interlude) {
      const picked = pickInterludes(beat, state, data, usedInterludes, R(`interlude:${beat.id}`));
      picked.forEach((it, i) => {
        units.push({
          beat: beat.id, beatIndex, kind: 'interlude', id: it.id,
          text: renderTemplate(it.t, state, R(`text:${it.id}`)),
          // 2件目は文字数調整用の予備
          include: i === 0 && R(`include:${beat.id}`).chance(tempo.interludeRate),
          breakBefore: false,
        });
      });
      return trace.push({ beat: beat.id, interlude: picked.map((p) => p.id) });
    }

    const variant = chooseVariant(beat.variants, state, R(`beat:${beat.id}`), beat.id);
    Object.assign(state.flags, variant.sets ?? {});
    units.push(...expandLines(variant.lines, state, beat.id, beatIndex, tempo, R));
    trace.push({ beat: beat.id, variant: variant.id, sets: variant.sets });
  });

  const ending = chooseVariant(skeleton.endings, state, R('ending'), 'ending');
  units.push(...expandLines(ending.lines, state, 'ending', skeleton.beats.length, tempo, R));
  trace.push({ beat: 'ending', variant: ending.id });

  fitLength(units, R('fit'));

  const included = units.filter((u) => u.include);
  const paragraphs = assembleParagraphs(included, tempo.maxSentences);
  const body = formatBody(paragraphs);
  const title = renderTemplate(R('title').pick(skeleton.titles), state, R('title-text'));

  return {
    title,
    body,
    text: `${title}\n\n${body}\n`,
    charCount: countChars(body),
    paragraphs,
    units: included,
    allUnits: units,
    ending,
    state,
    meta: describe(state, seed, trace, ending, lean),
  };
}

function buildState({ data, genre, tempo, R }) {
  const genres = data.genres.filter((g) => data.skeletons.some((s) => s.genres.includes(g.id)));
  const genreObj = genre ? genres.find((g) => g.id === genre) : R('genre').pick(genres);
  if (!genreObj) throw new Error(`ジャンル ${genre} の骨格がありません`);

  const skeleton = R('skeleton').pick(data.skeletons.filter((s) => s.genres.includes(genreObj.id)));
  const theme = data.themes.find((t) => t.id === R('theme').pick(skeleton.themes));

  const places = data.places.filter(
    (p) => p.world === skeleton.world && skeleton.placeTags.every((t) => p.tags.includes(t)),
  );
  const place = R('place').pick(places);

  let time = null;
  if (skeleton.times) {
    const times = skeleton.times.filter((t) => !place.times || place.times.includes(t));
    time = R('time').pick(times);
  }

  let season = null;
  let weather = null;
  if (skeleton.seasonal) {
    season = R('season').pick(data.seasons);
    const weathers = data.weathers.filter(
      (w) => (!w.seasons || w.seasons.includes(season)) && (!skeleton.weathers || skeleton.weathers.includes(w.id)),
    );
    weather = R('weather').pick(weathers).id;
  }

  const state = {
    genre: genreObj,
    theme,
    skeleton,
    world: skeleton.world,
    place,
    placeTags: place.tags,
    time,
    season,
    weather,
    person: R('person').pick(skeleton.persons),
    roles: skeleton.roles,
    cast: {},
    motif: null,
    tempo,
    flags: {},
  };

  state.cast = chooseCast(skeleton, data.characters, R('cast'));
  state.sameGender = state.cast.P && state.cast.B ? state.cast.P.gender === state.cast.B.gender : false;

  const motifs = data.motifs.filter((m) => m.tags.includes(skeleton.motifTag) && matches(m.when, state));
  state.motif = R('motif').pick(motifs);
  return state;
}

function chooseCast(skeleton, characters, rng) {
  const cast = {};
  for (const [key, role] of Object.entries(skeleton.roles)) {
    const taken = Object.values(cast);
    const candidates = characters.filter(
      (c) =>
        c.worlds.includes(skeleton.world) &&
        (!role.age || role.age.includes(c.age)) &&
        (!role.sameAgeAs || c.age === cast[role.sameAgeAs].age) &&
        // 同じ名・同じ姓の人物が同時に出ると読者が混乱する
        taken.every((t) => t.id !== c.id && t.name !== c.name && (!c.sei || t.sei !== c.sei)),
    );
    cast[key] = rng.pick(candidates);
  }
  return cast;
}

function chooseVariant(variants, state, rng, label) {
  const candidates = variants.filter((v) => matches(v.when, state));
  if (!candidates.length) throw new Error(`場面 ${label} に条件を満たす変種がありません`);
  return rng.pick(candidates);
}

function expandLines(lines, state, beatId, beatIndex, tempo, R) {
  const units = [];
  const textRng = R(`text:${beatId}`);
  const altRng = R(`alt:${beatId}`);
  const detailRng = R(`detail:${beatId}`);
  let breakNext = true;
  for (const line of lines) {
    if (line === '¶') {
      breakNext = true;
      continue;
    }
    const obj = typeof line === 'string' ? { t: line } : line;
    if (!matches(obj.when, state)) continue;
    let src = obj.t;
    let alt = null;
    if (obj.fast && altRng.chance(tempo.fastAltRate)) [src, alt] = [obj.fast, 'fast'];
    else if (obj.slow && altRng.chance(tempo.slowAltRate)) [src, alt] = [obj.slow, 'slow'];
    units.push({
      beat: beatId,
      beatIndex,
      kind: obj.detail ? 'detail' : 'core',
      alt,
      text: renderTemplate(src, state, textRng),
      include: obj.detail ? detailRng.chance(tempo.detailRate) : true,
      breakBefore: breakNext,
    });
    breakNext = false;
  }
  return units;
}

function pickInterludes(beat, state, data, used, rng) {
  const tags = beat.interlude.tags ?? state.placeTags;
  const view = { ...state, placeTags: tags };
  const candidates = rng.shuffle(data.interludes.filter((it) => !used.has(it.id) && matches(it.when, view)));
  const picked = candidates.slice(0, (beat.interlude.count ?? 1) + 1);
  picked.forEach((p) => used.add(p.id));
  return picked;
}

// 描写文・情景文を足し引きして文字数を範囲内に収める。必須文には触れない。
function fitLength(units, rng) {
  const total = () => countChars(units.filter((u) => u.include).map((u) => u.text).join(''));
  let len = total();
  const order = (kinds) => kinds.flatMap((k) => rng.shuffle(units.filter((u) => u.kind === k)));

  if (len > LENGTH.max) {
    for (const u of order(['interlude', 'detail'])) {
      if (len <= LENGTH.max) break;
      if (!u.include) continue;
      const n = countChars(u.text);
      if (len - n < LENGTH.min) continue;
      u.include = false;
      len -= n;
    }
  }
  if (len < LENGTH.min) {
    for (const u of order(['detail', 'interlude'])) {
      if (len >= LENGTH.min) break;
      if (u.include) continue;
      const n = countChars(u.text);
      if (len + n > LENGTH.max) continue;
      u.include = true;
      len += n;
    }
  }
}

function describe(state, seed, trace, ending, lean) {
  const person = (c) => c && { name: `${c.sei ?? ''}${c.name}`, gender: c.gender === 'm' ? '男性' : '女性', age: c.age, I: c.I, feature: c.feature };
  return {
    seed: String(seed),
    steps: state.tempo.steps,
    tempo: { t: Number(state.tempo.t.toFixed(3)), band: state.tempo.band, label: state.tempo.label, lean },
    genre: state.genre.id,
    theme: state.theme.label,
    skeleton: state.skeleton.id,
    place: state.place.name,
    time: state.time,
    season: state.season,
    weather: state.weather,
    person: state.person === 'first' ? '一人称' : '三人称',
    cast: Object.fromEntries(Object.entries(state.cast).map(([k, c]) => [k, person(c)])),
    motif: state.motif.name,
    flags: { ...state.flags },
    ending: ending.id,
    beats: trace,
  };
}
