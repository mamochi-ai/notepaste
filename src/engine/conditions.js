// when 条件の評価。配列は「いずれかに一致」、flags は「すべて一致」。

export function matches(when, state) {
  if (!when) return true;
  for (const [key, expected] of Object.entries(when)) {
    if (!matchKey(key, expected, state)) return false;
  }
  return true;
}

function matchKey(key, expected, state) {
  switch (key) {
    case 'flags':
      return Object.entries(expected).every(([f, v]) => (state.flags[f] ?? false) === v);
    case 'placeTags':
      return expected.every((tag) => state.placeTags.includes(tag));
    case 'motifTags':
      return expected.every((tag) => state.motif?.tags.includes(tag));
    case 'sameGender':
      return state.sameGender === expected;
    default: {
      const actual = valueOf(key, state);
      return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
    }
  }
}

function valueOf(key, state) {
  switch (key) {
    case 'genre': return state.genre.id;
    case 'theme': return state.theme.id;
    case 'world': return state.world;
    case 'season': return state.season;
    case 'time': return state.time;
    case 'weather': return state.weather;
    case 'person': return state.person;
    case 'band': return state.tempo.band;
    case 'place': return state.place.id;
    case 'motif': return state.motif?.id;
    default:
      throw new Error(`未知の条件キー: ${key}`);
  }
}
