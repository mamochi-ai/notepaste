// 品質検証用の物語セット。テストとレポートで同じものを使う。
import { generateStory } from '../src/engine/generator.js';

export const GENRES = ['日常', '恋愛', 'SF', 'ファンタジー', 'ホラー'];

export function buildCorpus() {
  const items = [];
  const add = (group, steps, seed, genre = null) =>
    items.push({ id: `${group}-${items.length + 1}`, group, steps, seed, genre, story: generateStory({ steps, seed, genre }) });

  // A: 異なる歩数 × 3シード（ジャンル自動）
  for (const steps of [0, 1500, 3000, 5000, 8000, 12000, 20000]) {
    for (const seed of ['A1', 'A2', 'A3']) add('A', steps, `${seed}-${steps}`);
  }
  // B: 同じ歩数・異なるシード（ジャンル自動）
  for (let i = 1; i <= 10; i++) add('B', 5000, `B${i}`);
  // C: ジャンル指定 × 同じシードで歩数だけ変える（テンポの差を比較するための対）
  for (const genre of GENRES) {
    for (const seed of ['C1', 'C2']) {
      for (const steps of [1000, 15000]) add('C', steps, `${seed}-${genre}`, genre);
    }
  }
  return items;
}
