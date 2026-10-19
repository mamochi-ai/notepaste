// 歩数 → テンポ。歩数は物語の内容ではなく、文章のリズム・描写密度・展開の速度だけを変える。

export const BANDS = [
  { id: 'slow', label: 'ゆったり', max: 0.4 },
  { id: 'mid', label: 'ふつう', max: 0.7 },
  { id: 'fast', label: 'きびきび', max: Infinity },
];

export function tempoFromSteps(steps) {
  const s = Math.max(0, Number(steps) || 0);
  const t = Math.min(1, Math.log10(s / 1000 + 1) / Math.log10(21));
  const band = BANDS.find((b) => t < b.max) ?? BANDS[BANDS.length - 1];
  return {
    steps: s,
    t,
    band: band.id,
    label: band.label,
    // 描写文を最初に入れる確率
    detailRate: 0.95 - 0.75 * t,
    // 情景文を入れる確率
    interludeRate: 0.9 - 0.8 * t,
    // 段落あたりの最大文数
    maxSentences: Math.round(6 - 4 * t),
    // 短い版・長い版を使う確率
    fastAltRate: clamp01((t - 0.3) / 0.7),
    slowAltRate: clamp01((0.7 - t) / 0.7),
  };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
