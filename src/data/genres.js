// ジャンル。歩数とは無関係に選ばれる。骨格を持たないジャンルは自動選択の対象外になる。
export const genres = [
  { id: '日常', description: '身近な場所の、小さな出来事' },
  { id: '恋愛', description: '誰かとの距離が少しだけ変わる話' },
  { id: 'SF', description: '科学や未来の設定を通して描く人の話' },
  { id: 'ファンタジー', description: '架空の世界の旅や不思議' },
  { id: 'ホラー', description: '日常のすぐ隣にある怖さ' },
  // 拡張用（骨格を追加すると自動選択の対象になる）
  { id: 'コメディ', description: '笑える行き違い' },
  { id: '青春', description: '学生時代の一場面' },
  { id: 'ヒューマンドラマ', description: '人生の節目' },
];

export const themes = [
  { id: 'farewell', label: '別れ' },
  { id: 'inherit', label: '受け継ぐもの' },
  { id: 'courage', label: '小さな勇気' },
  { id: 'chance', label: 'めぐり合わせ' },
  { id: 'solitude', label: '孤独' },
  { id: 'time', label: '時間' },
  { id: 'journey', label: '旅立ち' },
  { id: 'promise', label: '約束' },
  { id: 'rift', label: '日常の裂け目' },
  { id: 'homeward', label: '帰り道' },
];

export const seasons = ['春', '夏', '秋', '冬'];

export const weathers = [
  { id: '晴れ' },
  { id: '曇り' },
  { id: '雨' },
  { id: '雪', seasons: ['冬'] },
];
