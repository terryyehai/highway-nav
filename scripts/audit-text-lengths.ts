// 文字長度稽核：掃描實際圖資，抓出各類別顯示名稱最長的案例，以及去除後綴後仍殘留類型關鍵字
// 的命名（代表 facilityLabel.ts 的後綴表沒清乾淨，畫面會出現「標籤+名稱」重複字樣）。
// 純資料掃描不需啟動瀏覽器，供 build:topo 重新產生資料後快速覆核。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { facilityDisplayName } from '../src/utils/facilityLabel';
import type { Facility, FreewayTopo } from '../src/types';

const TOPO_PATH = fileURLToPath(new URL('../src/data/freeway-topo.json', import.meta.url));
const topo = JSON.parse(readFileSync(TOPO_PATH, 'utf-8')) as FreewayTopo;

/** AutoFitText 最小字級下，超過這個字數就已經被壓得很小，值得留意 */
const WARN_LEN: Record<Facility['type'], number> = {
  interchange: 6,
  rest_area: 6,
  junction: 6,
};

/** 名稱裡不管出現在哪個位置，只要殘留這些關鍵字，跟上方類型標籤放在一起就會讀起來重複 */
const CATEGORY_KEYWORDS = ['交流道', '系統', '轉接道', '服務區', '休息站'];

let warnings = 0;
let leftovers = 0;

const byType = new Map<Facility['type'], Array<{ raw: string; display: string }>>();
for (const f of topo.facilities) {
  const arr = byType.get(f.type) ?? [];
  arr.push({ raw: f.name, display: facilityDisplayName(f.name, f.type) });
  byType.set(f.type, arr);
}

for (const [type, rows] of byType) {
  rows.sort((a, b) => b.display.length - a.display.length);
  console.log(`\n[${type}] 顯示名稱最長 5 筆（共 ${rows.length} 筆）`);
  for (const r of rows.slice(0, 5)) {
    console.log(`  ${r.display}  (${r.display.length} 字，原始：${r.raw})`);
  }

  const tooLong = rows.filter((r) => r.display.length > WARN_LEN[type]);
  if (tooLong.length > 0) {
    warnings += tooLong.length;
    console.log(
      `  ⚠ ${tooLong.length} 筆超過 ${WARN_LEN[type]} 字：${tooLong.map((r) => r.display).join('、')}`,
    );
  }

  const stillHasKeyword = rows.filter((r) => CATEGORY_KEYWORDS.some((k) => r.display.includes(k)));
  if (stillHasKeyword.length > 0) {
    leftovers += stillHasKeyword.length;
    console.log(
      `  ⚠ 去除後綴後仍殘留類型關鍵字（後綴表可能需要擴充）：` +
        stillHasKeyword.map((r) => `${r.raw} → ${r.display}`).join('、'),
    );
  }
}

const longestRoute = [...topo.routes].sort((a, b) => b.name.length - a.name.length)[0];
console.log(`\n路線名稱最長：${longestRoute.name} (${longestRoute.name.length} 字，${longestRoute.id})`);
if (longestRoute.name.length > 8) {
  warnings += 1;
  console.log('  ⚠ 超過 8 字，頂列 AutoFitText 會明顯縮字，建議覆核');
}

console.log(`\n共 ${leftovers} 筆後綴殘留、${warnings} 項超過長度警戒值。`);
