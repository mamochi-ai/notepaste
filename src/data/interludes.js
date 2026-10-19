// 共通の情景文。骨格の「情景差し込み枠」に、季節・時間帯・天候・屋内外の条件が合うものだけが入る。
// 条件を書かない項目は、どの季節・天候でも矛盾しない文にする。
const out = ['outdoor'];
const ind = ['indoor'];
// 道路・通りを描く文は street タグの場所だけに入る（団地の外廊下などには入らない）
const street = ['outdoor', 'street'];

export const interludes = [
  // 現代・屋外
  { id: 'o-night-tv', when: { world: 'modern', placeTags: out, time: '夜' }, t: 'どこかの家の窓から、テレビの笑い声がかすかに漏れていた。' },
  { id: 'o-night-train', when: { world: 'modern', placeTags: out, time: '夜' }, t: '遠くで、電車が線路の継ぎ目を渡っていく音がした。' },
  { id: 'o-night-star', when: { world: 'modern', placeTags: out, time: '夜', weather: '晴れ' }, t: '見上げると、電線の隙間に小さな星がいくつか光っていた。' },
  { id: 'o-night-insect', when: { world: 'modern', placeTags: out, time: '夜', season: '夏', weather: ['晴れ', '曇り'] }, t: '湿った夜気の底で、虫の声が途切れなく続いていた。' },
  { id: 'o-eve-sky', when: { world: 'modern', placeTags: out, time: '夕方', weather: '晴れ' }, t: '西の空が、熟れた果物のような色に染まっていた。' },
  { id: 'o-eve-supper', when: { world: 'modern', placeTags: out, time: '夕方' }, t: 'どこかの家から、夕飯の支度をする匂いが漂ってきた。' },
  { id: 'o-eve-bike', when: { world: 'modern', placeTags: street, time: '夕方' }, t: '家路を急ぐ自転車が、短くベルを鳴らして追い越していった。' },
  { id: 'o-eve-cicada', when: { world: 'modern', placeTags: out, time: '夕方', season: '夏', weather: ['晴れ', '曇り'] }, t: '昼の熱がまだ地面に残っていて、どこかで蝉が一匹だけ鳴いていた。' },
  { id: 'o-morning-shutter', when: { world: 'modern', placeTags: street, time: '朝' }, t: '通りの向こうで、商店のシャッターが音を立てて上がっていった。' },
  { id: 'o-morning-kids', when: { world: 'modern', placeTags: out, time: '朝' }, t: 'ランドセルを背負った子どもたちが、笑いながら目の前を駆けていった。' },
  { id: 'o-morning-cold', when: { world: 'modern', placeTags: out, time: '朝', season: ['春', '秋', '冬'] }, t: '朝の空気はまだ冷たく、遠くで電車の走る音が聞こえた。' },
  { id: 'o-morning-sun', when: { world: 'modern', placeTags: out, time: '朝', season: '夏', weather: '晴れ' }, t: '朝だというのに、日差しはもう肌を刺すように強かった。' },
  { id: 'o-spring', when: { world: 'modern', placeTags: out, season: '春', weather: ['晴れ', '曇り'] }, t: 'どこかで散り残った桜の花びらが、足もとを転がっていった。' },
  { id: 'o-autumn', when: { world: 'modern', placeTags: street, season: '秋', weather: ['晴れ', '曇り'] }, t: '乾いた風が、落ち葉を一枚、道の端へ運んでいった。' },
  { id: 'o-winter', when: { world: 'modern', placeTags: out, season: '冬' }, t: '吐く息が白く浮かんでは、すぐに消えていった。' },
  { id: 'o-rain', when: { world: 'modern', placeTags: out, weather: '雨' }, t: '細かな雨が、街の音をひとつずつ吸い込んでいくようだった。' },
  { id: 'o-rain-signal', when: { world: 'modern', placeTags: street, weather: '雨' }, t: '濡れた路面に、信号の色がにじんで揺れていた。' },
  { id: 'o-snow', when: { world: 'modern', placeTags: out, weather: '雪' }, t: '音もなく降る雪が、街の輪郭をやわらかくぼかしていた。' },
  { id: 'o-cloud', when: { world: 'modern', placeTags: out, weather: '曇り', time: ['朝', '夕方'] }, t: '空は一面の薄い雲に覆われ、光は白くぼんやりとしていた。' },

  // 現代・屋内
  { id: 'i-eve-sun', when: { world: 'modern', placeTags: ind, time: '夕方', weather: '晴れ' }, t: '西日が床に長い四角を描き、その中で細かな埃が光っていた。' },
  { id: 'i-night', when: { world: 'modern', placeTags: ind, time: '夜' }, t: '窓の外はすっかり暗く、ガラスに室内の明かりが映り込んでいた。' },
  { id: 'i-rain', when: { world: 'modern', placeTags: ind, weather: '雨' }, t: '窓ガラスを、雨粒が斜めに伝い落ちていた。' },
  { id: 'i-snow', when: { world: 'modern', placeTags: ind, weather: '雪' }, t: '窓の外では、いつの間にか雪が降り始めていた。' },
  { id: 'i-clock', when: { world: 'modern', placeTags: ind }, t: '壁の時計の秒針が、やけに大きな音を立てていた。' },
  { id: 'i-cough', when: { world: 'modern', placeTags: ind }, t: '誰かが小さく咳払いをして、それきり、また静かになった。' },
  { id: 'i-spring', when: { world: 'modern', placeTags: ind, season: '春', weather: ['晴れ', '曇り'] }, t: '開いた窓から、どこかの花の匂いがかすかに流れ込んできた。' },
  { id: 'i-summer', when: { world: 'modern', placeTags: ind, season: '夏' }, t: '古い冷房が、ときどき思い出したように低くうなった。' },
  { id: 'i-autumn', when: { world: 'modern', placeTags: ind, season: '秋', time: ['朝', '夕方'] }, t: '窓の外の街路樹が、少しずつ色を変え始めていた。' },
  { id: 'i-winter', when: { world: 'modern', placeTags: ind, season: '冬' }, t: '暖房の効きが悪く、指先がいつまでも冷たかった。' },

  // 未来の施設
  { id: 'f-air', when: { world: 'future' }, t: '空調の吐き出す乾いた風が、首筋をかすめていった。' },
  { id: 'f-corridor', when: { world: 'future' }, t: '誰もいない通路の照明が、規則正しい間隔で床を照らしていた。' },
  { id: 'f-pump', when: { world: 'future' }, t: '壁の向こうで、ポンプが一定のリズムで何かを送り出していた。' },
  { id: 'f-lamp', when: { world: 'future' }, t: '計器のランプが、暗い室内で小さく瞬いていた。' },

  // 架空の世界・屋外
  { id: 'g-sky', when: { world: 'fantasy', place: ['saltdesert', 'snowfield'] }, t: '見上げた空は、王都で見るよりもずっと広かった。' },
  { id: 'g-far', when: { world: 'fantasy' }, t: '鳥の声も、人の声も、ここではひどく遠かった。' },
  { id: 'g-same', when: { world: 'fantasy' }, t: 'どこまで歩いても、景色はほとんど変わらなかった。' },
  { id: 'g-cold', when: { world: 'fantasy', place: ['mistforest', 'snowfield'] }, t: '冷えた空気が、胸の奥まで澄みわたっていくようだった。' },
  { id: 'g-heat', when: { world: 'fantasy', place: 'saltdesert' }, t: '照り返しの熱が、靴底を通してじわじわと伝わってきた。' },
];
