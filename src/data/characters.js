// 登場人物。名前・姓は2文字以上（一般語との誤検出を避けるため）。
// feature は「目に見える特徴」の名詞句（「〜は昔のままだった」「〜が目に入った」に入る形）。
// age: young（10代後半〜20代） / adult（30〜50代） / old（60代以上）
const modern = ['modern', 'future'];
const fantasy = ['fantasy'];

export const characters = [
  { id: 'misaki', sei: '高橋', name: '美咲', gender: 'f', I: '私', age: 'young', worlds: modern, feature: '少し癖のある前髪' },
  { id: 'hina', sei: '佐伯', name: '陽菜', gender: 'f', I: '私', age: 'young', worlds: modern, feature: '右目の下の泣きぼくろ' },
  { id: 'chihiro', sei: '川村', name: '千尋', gender: 'f', I: '私', age: 'young', worlds: modern, feature: '耳にかけた短い髪' },
  { id: 'yuma', sei: '森本', name: '悠真', gender: 'm', I: '僕', age: 'young', worlds: modern, feature: '銀縁の眼鏡' },
  { id: 'minato', sei: '大野', name: '湊人', gender: 'm', I: '俺', age: 'young', worlds: modern, feature: '日に焼けた腕' },
  { id: 'sota', sei: '中原', name: '蒼太', gender: 'm', I: '僕', age: 'young', worlds: modern, feature: '寝癖の残った髪' },
  { id: 'yukiko', sei: '杉本', name: '由紀子', gender: 'f', I: '私', age: 'adult', worlds: modern, feature: '左頬のえくぼ' },
  { id: 'tomomi', sei: '吉川', name: '智美', gender: 'f', I: '私', age: 'adult', worlds: modern, feature: '細い銀の指輪' },
  { id: 'seiichi', sei: '石田', name: '誠一', gender: 'm', I: '僕', age: 'adult', worlds: modern, feature: '短く刈った髪' },
  { id: 'koji', sei: '藤井', name: '浩二', gender: 'm', I: '俺', age: 'adult', worlds: modern, feature: '大きな手' },
  { id: 'fumiko', sei: '宮下', name: '文子', gender: 'f', I: '私', age: 'old', worlds: modern, feature: '目尻の深い笑いじわ' },
  { id: 'kazue', sei: '野村', name: '和枝', gender: 'f', I: '私', age: 'old', worlds: modern, feature: '鼻の上の小さな老眼鏡' },
  { id: 'kiyoshi', sei: '岡田', name: '清志', gender: 'm', I: '私', age: 'old', worlds: modern, feature: '白いものの混じった太い眉' },
  { id: 'genzo', sei: '坂本', name: '源三', gender: 'm', I: '俺', age: 'old', worlds: modern, feature: '節くれだった指' },
  { id: 'rio', sei: null, name: 'リオ', gender: 'm', I: '僕', age: 'young', worlds: fantasy, feature: '鳶色の巻き毛' },
  { id: 'eruna', sei: null, name: 'エルナ', gender: 'f', I: '私', age: 'young', worlds: fantasy, feature: 'そばかすの散った頬' },
  { id: 'kai', sei: null, name: 'カイ', gender: 'm', I: '俺', age: 'young', worlds: fantasy, feature: '額の古い傷' },
  { id: 'sena', sei: null, name: 'セナ', gender: 'f', I: '私', age: 'adult', worlds: fantasy, feature: '裾のすり切れた灰色のマント' },
  { id: 'yohan', sei: null, name: 'ヨハン', gender: 'm', I: '私', age: 'old', worlds: fantasy, feature: '胸まで伸びた白い髭' },
  { id: 'berta', sei: null, name: 'ベルタ', gender: 'f', I: '私', age: 'old', worlds: fantasy, feature: '銀の髪留め' },
];
