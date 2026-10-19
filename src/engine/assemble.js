// 段落組みと文字数カウント。

export function countChars(text) {
  return [...text.replace(/[\s　]/g, '')].length;
}

export function isDialogue(text) {
  return text.startsWith('「') || text.startsWith('『');
}

// units: 本文に入る文の列。テンポに応じて段落あたりの文数を変える。
export function assembleParagraphs(units, maxSentences) {
  const paragraphs = [];
  let current = [];
  const flush = () => {
    if (current.length) paragraphs.push(current);
    current = [];
  };
  for (const u of units) {
    if (u.breakBefore) flush();
    if (isDialogue(u.text)) {
      flush();
      paragraphs.push([u.text]);
      continue;
    }
    current.push(u.text);
    if (current.length >= maxSentences) flush();
  }
  flush();
  return paragraphs.map((p) => p.join(''));
}

export function formatBody(paragraphs) {
  return paragraphs.map((p) => (isDialogue(p) ? p : `　${p}`)).join('\n');
}
