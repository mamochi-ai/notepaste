// CSS / JS の読み込みURLに付けているバージョン（?v=...）を一括で更新する。
// GitHub Pages はファイルを約10分キャッシュさせるため、公開のたびに実行して
// HTML と CSS / JS の新旧が混ざらないようにする。  実行: npm run bump
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const v = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
const files = ['index.html', 'test.html', ...readdirSync('js').map((f) => `js/${f}`)];
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  const t = s.replace(/\?v=[0-9a-z]+/g, `?v=${v}`);
  if (t !== s) writeFileSync(f, t);
}
console.log(`version: ${v}`);
