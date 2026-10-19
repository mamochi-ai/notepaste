// 舞台。骨格は placeTags で舞台を絞り込み、舞台固有の項目を {S.項目} で参照する。
// 項目の文法的な形（名詞句／動詞句）は同じタグの舞台どうしで揃える。
export const places = [
  // 日常：店（骨格 shop_last_day）
  {
    id: 'cafe', world: 'modern', tags: ['shop', 'indoor'], times: ['夕方', '夜'],
    name: '商店街の外れの喫茶店', kind: '喫茶店', short: '店',
    smell: '焙煎した豆の香り', sound: '柱時計の振り子の音', object: 'カウンターの奥の古いサイフォン',
    light: '琥珀色のランプ',
    childVisit: 'カウンターの端でクリームソーダを一杯だけ頼んで、宿題を広げていた',
  },
  {
    id: 'bookshop', world: 'modern', tags: ['shop', 'indoor'], times: ['夕方', '夜'],
    name: '坂の途中の古本屋', kind: '古本屋', short: '店',
    smell: '乾いた紙の匂い', sound: '古い換気扇の回る音', object: '天井近くまで積まれた本の山',
    light: '黄ばんだ裸電球',
    childVisit: '百円の棚から漫画を一冊選ぶのに、一時間もかけていた',
  },
  {
    id: 'clockshop', world: 'modern', tags: ['shop', 'indoor'], times: ['夕方', '夜'],
    name: '駅裏の小さな時計店', kind: '時計店', short: '店',
    smell: '機械油の匂い', sound: 'いくつもの秒針が刻む音', object: '壁一面に掛けられた振り子時計',
    light: '作業台の白いスタンド',
    childVisit: 'ショーケースの腕時計を一つずつ眺めては、その名前を尋ねていた',
  },

  // 恋愛：毎週・毎朝通う場所（骨格 lost_item）
  {
    id: 'busstop', world: 'modern', tags: ['waiting', 'outdoor', 'street'], times: ['朝'],
    name: '坂の下のバス停', short: 'バス停', routine: '毎朝、七時二十分のバスを待つ',
    object: '塗装のはげたベンチ', nextTime: '翌朝', later: '一週間後の朝', sound: '坂を下ってくる車の音',
  },
  {
    id: 'library', world: 'modern', tags: ['waiting', 'indoor'], times: ['夕方'],
    name: '駅前の市立図書館', short: '図書館', routine: '土曜日の午後を過ごす',
    object: '窓際の閲覧席', nextTime: '次の土曜日', later: '三週間後の土曜日', sound: 'ページをめくるかすかな音',
  },
  {
    id: 'laundry', world: 'modern', tags: ['waiting', 'indoor'], times: ['夜'],
    name: 'アパートの近くのコインランドリー', short: 'ランドリー', routine: '日曜の夜に洗濯物を回す',
    object: '壁際の丸椅子', nextTime: '次の日曜日', later: '三週間後の日曜日', sound: '乾燥機の低いうなり',
  },

  // SF：ひとりで当直する施設（骨格 future_message）
  {
    id: 'moonbase', world: 'future', tags: ['station', 'indoor'],
    name: '静かの海の観測基地', short: '基地', home: '地球',
    view: '黒い空に浮かぶ青い地球', sound: '空調の低いうなり', ship: '補給船',
  },
  {
    id: 'seabase', world: 'future', tags: ['station', 'indoor'],
    name: '水深三千メートルの海底研究所', short: '研究所', home: '地上',
    view: '観測窓の向こうの、光の届かない闇', sound: '船体のきしむ低い音', ship: '補給潜水艇',
  },
  {
    id: 'marsbase', world: 'future', tags: ['station', 'indoor'],
    name: '火星の赤い砂漠に立つ観測所', short: '観測所', home: '地球',
    view: '赤茶けた地平線の上で小さく光る地球', sound: '砂嵐が外壁を叩く音', ship: '輸送船',
  },

  // ファンタジー：旅の行き先（骨格 unmapped_place）
  {
    id: 'mistforest', world: 'fantasy', tags: ['wild', 'outdoor'],
    name: '王都の北に広がる霧の森', short: '森',
    journey: '霧は昼になっても晴れず、木々の幹だけが白い闇の中に現れては消えた',
    danger: '霧の奥から、低いうなり声が聞こえた',
    hidden: '霧がふいに途切れた先に、鏡のように静まり返った湖が広がっていた',
    sound: '葉から落ちるしずくの音', ground: '湿った苔',
  },
  {
    id: 'saltdesert', world: 'fantasy', tags: ['wild', 'outdoor'],
    name: '東の果ての白い塩の砂漠', short: '砂漠',
    journey: '見渡すかぎり白い大地が続き、照り返しのまぶしさに、目を開けているのもつらいほどだった',
    danger: '地平線の向こうから、塩まじりの砂嵐が迫ってきた',
    hidden: '白い大地の真ん中に、塩の結晶でできた古い塔が、ぽつんと立っていた',
    sound: '乾いた風の音', ground: '固い塩の地面',
  },
  {
    id: 'snowfield', world: 'fantasy', tags: ['wild', 'outdoor'],
    name: '北の山脈のふもとの雪原', short: '雪原',
    journey: '足跡ひとつない雪の上を、二人は黙々と歩き続けた',
    danger: '足もとの雪が、鈍い音を立ててひび割れた',
    hidden: '雪原の窪みに、湯気を立てる小さな泉が湧いていた',
    sound: '雪を踏むかすかな音', ground: '踏み固められた雪',
  },

  // ホラー：夜の帰り道（骨格 extra_count）
  {
    id: 'slope', world: 'modern', tags: ['nightroad', 'outdoor', 'street'], times: ['夜'],
    name: '駅から家へ続く長い坂道', short: '坂道', thing: '街灯', counter: '本',
    usual: '二十三', extra: '二十四', home: '坂の上の家', ground: 'アスファルト', sound: '自分の足音',
  },
  {
    id: 'riverside', world: 'modern', tags: ['nightroad', 'outdoor', 'street'], times: ['夜'],
    name: '川沿いの遊歩道', short: '遊歩道', thing: '街灯', counter: '本',
    usual: '十七', extra: '十八', home: '川向こうのアパート', ground: '石畳', sound: '川の流れる音',
  },
  {
    id: 'corridor', world: 'modern', tags: ['nightroad', 'outdoor'], times: ['夜'],
    name: '古い団地の外廊下', short: '外廊下', thing: '部屋のドア', counter: '枚',
    usual: '十二', extra: '十三', home: '廊下の突き当たりの部屋', ground: 'コンクリート', sound: '遠くを走る車の音',
  },
];
