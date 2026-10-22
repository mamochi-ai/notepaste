// AIへの依頼文（このツールでnoteに貼り付けやすいMarkdownで書いてもらうためのもの）

const FORMAT_RULES = `・記事タイトルは「# 」、大見出しは「## 」、小見出しは「### 」で始めてください
・強調したい部分は **太字** にしてください
・箇条書きは「- 」、手順は「1. 」を使ってください
・全体を \`\`\`markdown のコードブロックに入れてください（記事の中にコードブロックがある場合は、外側を \`\`\`\`markdown にしてください）`;

export const PROMPTS = [
  {
    id: 'write',
    title: '新しく記事を書いてもらう',
    desc: 'AIに記事を頼むときに、依頼の最後に付け足してください。',
    text: `出力はnoteに投稿するためのMarkdown形式でお願いします。
${FORMAT_RULES}`,
  },
  {
    id: 'convert',
    title: '以前の記事をMarkdownに変換してもらう',
    desc: 'コピーしてAIに貼り付け、最後の行の下に変換したい記事を貼り付けてください。',
    text: `次の記事を、文章の内容は一切変えずに、Markdown形式に変換してください。
・「■」「【】」などで書かれている見出しも、見出しとして変換してください
${FORMAT_RULES}

【記事】
`,
  },
];

/**
 * AIの回答が ```markdown のコードブロックで囲まれていたら、中身だけを取り出す。
 * - 「markdown / md」と書かれたブロックが1つだけあれば、その中身（前後の説明文は捨てる）
 * - 全体が言語指定なしの1つのブロックなら、その中身
 * どちらでもなければ、そのまま返す。
 */
export function unwrapMarkdownFence(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const open = /^ {0,3}(`{3,}|~{3,})\s*([A-Za-z]*)\s*$/;
  const opens = [];
  lines.forEach((l, i) => {
    const m = l.match(open);
    if (m && /^(markdown|md)$/i.test(m[2])) opens.push({ i, fence: m[1] });
  });
  let start = -1;
  let fence = '';
  if (opens.length === 1) {
    start = opens[0].i;
    fence = opens[0].fence;
  } else if (opens.length === 0) {
    const first = lines.findIndex((l) => l.trim());
    const m = first >= 0 ? lines[first].match(open) : null;
    if (!m || m[2]) return text;
    start = first;
    fence = m[1];
  } else return text;
  // 閉じの行は、同じ記号で同じ長さ以上の、最後の行（中に短いコードブロックがあっても外側を閉じる）
  let end = -1;
  for (let i = lines.length - 1; i > start; i--) {
    const t = lines[i].trim();
    if (t.length >= fence.length && t === fence[0].repeat(t.length)) {
      end = i;
      break;
    }
  }
  if (end < 0) return text;
  // 言語指定なしの場合は、ブロックの後ろに文章が続くなら囲みとはみなさない
  if (!opens.length && lines.slice(end + 1).some((l) => l.trim())) return text;
  return lines.slice(start + 1, end).join('\n');
}
