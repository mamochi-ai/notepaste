// テンプレート記法の描画。記法は docs/architecture.md を参照。

const ALT = /\[\[([^[\]]*)\]\]/g;
const PLACEHOLDER = /\{([A-Z]+)(?:\.([a-zA-Z]+))?(?:\^([^|{}]*)\|([^{}]*))?\}/g;

export function renderTemplate(src, state, rng) {
  let out = src.replace(ALT, (_, body) => rng.pick(body.split('|')));
  out = out.replace(PLACEHOLDER, (_, key, attr, male, female) =>
    resolve(key, attr, male, female, state, rng),
  );
  if (/[{}]|\[\[|\]\]/.test(out)) {
    throw new Error(`テンプレートを解決できません: ${src}`);
  }
  return out;
}

function resolve(key, attr, male, female, state, rng) {
  const ch = state.cast[key];
  if (ch) {
    if (male !== undefined) return ch.gender === 'm' ? male : female;
    return resolveCharacter(key, ch, attr, state, rng);
  }
  if (male !== undefined) throw new Error(`性別切り替えは人物にのみ使えます: ${key}`);
  switch (key) {
    case 'M': return field(state.motif, attr ?? 'name', 'モチーフ');
    case 'S': return field(state.place, attr ?? 'name', '舞台');
    case 'T': return need(state.time, '時間帯');
    case 'SEASON': return need(state.season, '季節');
    case 'W': return need(state.weather, '天候');
    default: throw new Error(`未知の変数: {${key}}`);
  }
}

function resolveCharacter(key, ch, attr, state, rng) {
  const isP = key === 'P';
  const first = state.person === 'first';
  const pronoun = ch.gender === 'm' ? '彼' : '彼女';
  switch (attr) {
    case undefined:
      if (isP) return first ? ch.I : ch.name;
      return refOf(key, state, rng);
    case 'pr':
      if (isP) return first ? ch.I : pronoun;
      // 三人称で主人公と同性のときは「彼女」「彼」が誰を指すか曖昧になるので、呼び名にする
      if (!first && state.sameGender) return refOf(key, state, rng);
      return pronoun;
    case 'ref':
      return refOf(key, state, rng);
    default:
      return field(ch, attr, `人物${key}`);
  }
}

function refOf(key, state, rng) {
  const tpl = state.roles[key]?.ref ?? `{${key}.name}`;
  return renderTemplate(tpl, state, rng);
}

function field(obj, attr, label) {
  const v = obj?.[attr];
  if (typeof v !== 'string') throw new Error(`${label}に項目 ${attr} がありません (${obj?.id})`);
  return v;
}

function need(v, label) {
  if (!v) throw new Error(`${label}が設定されていない物語で使われています`);
  return v;
}
