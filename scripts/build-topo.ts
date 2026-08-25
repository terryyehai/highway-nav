// 圖資產製腳本：由高公局開放資料 (tisvcloud.freeway.gov.tw，免金鑰) 產出 src/data/freeway-topo.json
// 用法：npm run build:topo
// 資料源：MOTC 交通資料標準 Section.xml（路段/里程）+ SectionShape.xml（WKT 線形）
// 品質報表輸出至 stdout；人工修正寫入 scripts/topo-overrides.json。

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SECTION_URL = 'https://tisvcloud.freeway.gov.tw/history/motc20/Section.xml';
const SHAPE_URL = 'https://tisvcloud.freeway.gov.tw/history/motc20/SectionShape.xml';
const OUT_PATH = resolve(__dirname, '../src/data/freeway-topo.json');
const OVERRIDES_PATH = resolve(__dirname, 'topo-overrides.json');

/** RoadID → 專案路線 id 與顯示標籤 */
const ROAD_MAP: Record<string, { id: string; name: string }> = {
  '000010': { id: 'N1', name: '國道1號' },
  '00001A': { id: 'N1H', name: '汐止五股高架/五楊高架' },
  '000020': { id: 'N2', name: '國道2號' },
  '000021': { id: 'N2A', name: '國道2甲' },
  '000030': { id: 'N3', name: '國道3號' },
  '000031': { id: 'N3A', name: '國道3甲' },
  '000040': { id: 'N4', name: '國道4號' },
  '000050': { id: 'N5', name: '國道5號' },
  '000060': { id: 'N6', name: '國道6號' },
  '000080': { id: 'N8', name: '國道8號' },
  '000100': { id: 'N10', name: '國道10號' },
};
const PAIRED: Record<string, string> = { N1: 'N1H', N1H: 'N1' };

interface RawSection {
  sectionId: string;
  roadId: string;
  direction: string; // S/N/E/W
  start: string;
  end: string;
  startKm: number;
  endKm: number;
}

function parseKm(s: string): number {
  const m = s.match(/(\d+)K\+(\d+)/);
  if (!m) throw new Error(`無法解析里程: ${s}`);
  return Number(m[1]) + Number(m[2]) / 1000;
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1] : '';
}

async function fetchText(url: string): Promise<string> {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('unreachable');
}

function parseSections(xml: string): RawSection[] {
  const out: RawSection[] = [];
  for (const m of xml.matchAll(/<Section>([\s\S]*?)<\/Section>/g)) {
    const b = m[1];
    const roadId = tag(b, 'RoadID');
    if (!ROAD_MAP[roadId]) continue;
    const mile = b.match(/<StartKM>([^<]*)<\/StartKM>[\s\S]*?<EndKM>([^<]*)<\/EndKM>/);
    if (!mile) continue;
    const rs = b.match(/<Start>([^<]*)<\/Start>[\s\S]*?<End>([^<]*)<\/End>/);
    if (!rs) continue;
    out.push({
      sectionId: tag(b, 'SectionID'),
      roadId,
      direction: tag(b, 'RoadDirection'),
      start: rs[1],
      end: rs[2],
      startKm: parseKm(mile[1]),
      endKm: parseKm(mile[2]),
    });
  }
  return out;
}

function parseShapes(xml: string): Map<string, Array<[number, number]>> {
  const map = new Map<string, Array<[number, number]>>();
  for (const m of xml.matchAll(/<SectionShape>([\s\S]*?)<\/SectionShape>/g)) {
    const b = m[1];
    const id = tag(b, 'SectionID');
    const wkt = b.match(/LINESTRING\s*\(([^)]*)\)/);
    if (!wkt) continue;
    const coords = wkt[1].split(',').map((p) => {
      const [lng, lat] = p.trim().split(/\s+/).map(Number);
      return [lng, lat] as [number, number];
    });
    map.set(id, coords);
  }
  return map;
}

/** Douglas-Peucker 抽稀（容差 meters，等距圓柱近似） */
function simplify(coords: Array<[number, number]>, toleranceM: number): Array<[number, number]> {
  if (coords.length <= 2) return coords;
  const cosLat = Math.cos((coords[0][1] * Math.PI) / 180);
  const toM = (c: [number, number]): [number, number] => [c[0] * cosLat * 111195, c[1] * 111195];
  const pts = coords.map(toM);
  const keep = new Array(coords.length).fill(false);
  keep[0] = keep[coords.length - 1] = true;
  const stack: Array<[number, number]> = [[0, coords.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    if (b - a < 2) continue;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let maxD = 0;
    let maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dx * (ay - pts[i][1]) - (ax - pts[i][0]) * dy) / len;
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > toleranceM && maxI > 0) {
      keep[maxI] = true;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

function distM(a: [number, number], b: [number, number]): number {
  const cosLat = Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * cosLat * 111195, (b[1] - a[1]) * 111195);
}

interface Warning {
  route: string;
  msg: string;
}

async function main() {
  console.log('下載高公局開放資料...');
  const [sectionXml, shapeXml] = await Promise.all([fetchText(SECTION_URL), fetchText(SHAPE_URL)]);
  const sections = parseSections(sectionXml);
  const shapes = parseShapes(shapeXml);
  console.log(`路段 ${sections.length} 筆、線形 ${shapes.size} 筆`);

  const warnings: Warning[] = [];
  const routes: unknown[] = [];
  const facilities: unknown[] = [];

  for (const [roadId, meta] of Object.entries(ROAD_MAP)) {
    const all = sections.filter((s) => s.roadId === roadId);
    if (all.length === 0) {
      warnings.push({ route: meta.id, msg: '資料源無此路線' });
      continue;
    }
    // 里程遞增方向 = S 或 E
    const incDir = all.some((s) => s.direction === 'S') ? 'S' : 'E';
    const decDir = incDir === 'S' ? 'N' : 'W';
    const inc = all
      .filter((s) => s.direction === incDir)
      .sort((a, b) => a.startKm - b.startKm);
    const dec = all.filter((s) => s.direction === decDir);

    // --- 線形與 mileageIndex ---
    const coords: Array<[number, number]> = [];
    const mileageIndex: number[] = [];
    for (const sec of inc) {
      let geo = shapes.get(sec.sectionId);
      if (!geo || geo.length < 2) {
        warnings.push({ route: meta.id, msg: `路段 ${sec.sectionId}(${sec.start}→${sec.end}) 缺線形` });
        continue;
      }
      geo = simplify(geo, 15);
      // 節點里程：段內依累積幾何長度線性內插 StartKM→EndKM
      const cum: number[] = [0];
      for (let i = 1; i < geo.length; i++) cum.push(cum[i - 1] + distM(geo[i - 1], geo[i]));
      const total = cum[cum.length - 1] || 1;
      const geomKm = total / 1000;
      const officialKm = Math.abs(sec.endKm - sec.startKm);
      if (officialKm > 0.3 && Math.abs(geomKm - officialKm) / officialKm > 0.05) {
        warnings.push({
          route: meta.id,
          msg: `${sec.start}→${sec.end} 幾何 ${geomKm.toFixed(2)}km vs 官方 ${officialKm.toFixed(2)}km 差異 >5%`,
        });
      }
      for (let i = 0; i < geo.length; i++) {
        // 相鄰路段共用邊界點，跳過重複首點
        if (coords.length > 0 && i === 0 && distM(coords[coords.length - 1], geo[0]) < 50) continue;
        coords.push([Number(geo[i][0].toFixed(5)), Number(geo[i][1].toFixed(5))]);
        mileageIndex.push(
          Number((sec.startKm + (sec.endKm - sec.startKm) * (cum[i] / total)).toFixed(3)),
        );
      }
    }
    if (coords.length < 2) {
      warnings.push({ route: meta.id, msg: '線形組裝失敗，路線略過' });
      continue;
    }
    // mileageIndex 單調性檢查
    for (let i = 1; i < mileageIndex.length; i++) {
      if (mileageIndex[i] < mileageIndex[i - 1] - 0.001) {
        warnings.push({ route: meta.id, msg: `mileageIndex 於第 ${i} 點非單調（${mileageIndex[i - 1]} → ${mileageIndex[i]}）` });
        break;
      }
    }
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    routes.push({
      id: meta.id,
      name: meta.name,
      displayLabels: incDir === 'S' ? { inc: '南下', dec: '北上' } : { inc: '東行', dec: '西行' },
      bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      coords,
      mileageIndex,
      ...(PAIRED[meta.id] ? { pairedRouteId: PAIRED[meta.id] } : {}),
      ...(meta.id.endsWith('H') ? { isElevated: true } : {}),
    });

    // --- 設施：路段邊界即設施；比對雙向邊界差異 → serves ---
    const incNames = new Map<string, number>(); // name → mileage
    for (const sec of inc) {
      incNames.set(sec.start, sec.startKm);
      incNames.set(sec.end, sec.endKm);
    }
    const decNames = new Set<string>();
    for (const sec of dec) {
      decNames.add(sec.start);
      decNames.add(sec.end);
    }
    const decOnly = new Map<string, number>();
    for (const sec of dec) {
      if (!incNames.has(sec.start)) decOnly.set(sec.start, sec.startKm);
      if (!incNames.has(sec.end)) decOnly.set(sec.end, sec.endKm);
    }

    const addFacility = (name: string, mileage: number, serves: string) => {
      if (/端$/.test(name)) return; // 起訖端點非設施
      const type = /服務區|休息站/.test(name)
        ? 'rest_area'
        : /系統|轉接/.test(name)
          ? 'junction'
          : 'interchange';
      // 座標：取線形上對應里程的點
      let bestI = 0;
      for (let i = 0; i < mileageIndex.length; i++) {
        if (Math.abs(mileageIndex[i] - mileage) < Math.abs(mileageIndex[bestI] - mileage)) bestI = i;
      }
      facilities.push({
        id: `${meta.id}-${name}`,
        routeId: meta.id,
        name,
        type,
        mileage: Number(mileage.toFixed(3)),
        lat: coords[bestI][1],
        lng: coords[bestI][0],
        serves,
      });
    };

    for (const [name, mileage] of incNames) {
      addFacility(name, mileage, decNames.has(name) ? 'BOTH' : 'INCREASING');
    }
    for (const [name, mileage] of decOnly) {
      addFacility(name, mileage, 'DECREASING');
    }
  }

  // --- 高架/平面 trigger zones ---
  // 自動生成（--auto-transitions）預設停用：轉接道座標水平緊貼主線，
  // 主線駕駛必誤觸（QA 矩陣情境一）。正式 zone 需含匝道分岔幾何，由 overrides 人工定義。
  const transitions: unknown[] = [];
  const autoTransitions = process.argv.includes('--auto-transitions');
  const n1h = autoTransitions
    ? (facilities.filter((f: any) => f.routeId === 'N1H' && /轉接/.test(f.name)) as any[])
    : [];
  for (const f of n1h) {
    for (const dir of ['INCREASING', 'DECREASING'] as const) {
      transitions.push({
        id: `T-${f.name}-${dir}`,
        name: f.name,
        fromRouteId: 'N1',
        toRouteId: 'N1H',
        direction: dir,
        triggerZone: { lat: f.lat, lng: f.lng, radius: 300 },
        mileageOnFrom: f.mileage,
      });
    }
  }

  // --- 套用人工修正 ---
  let overrides: any = { removeFacilityIds: [], facilityPatches: [], extraTransitions: [], removeTransitionIds: [] };
  if (existsSync(OVERRIDES_PATH)) {
    overrides = { ...overrides, ...JSON.parse(readFileSync(OVERRIDES_PATH, 'utf-8')) };
  }
  const finalFacilities = (facilities as any[])
    .filter((f) => !overrides.removeFacilityIds.includes(f.id))
    .map((f) => {
      const patch = overrides.facilityPatches.find((p: any) => p.id === f.id);
      return patch ? { ...f, ...patch } : f;
    });
  const finalTransitions = (transitions as any[])
    .filter((t) => !overrides.removeTransitionIds.includes(t.id))
    .concat(overrides.extraTransitions);

  const topo = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    routes,
    facilities: finalFacilities,
    transitions: finalTransitions,
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(topo));

  // --- 品質報表 ---
  console.log('\n=== 品質報表 ===');
  for (const r of routes as any[]) {
    const fc = finalFacilities.filter((f: any) => f.routeId === r.id);
    console.log(
      `${r.id.padEnd(4)} ${r.name}：節點 ${r.coords.length}、里程 ${r.mileageIndex[0]}–${r.mileageIndex[r.mileageIndex.length - 1]}km、設施 ${fc.length}（單向 ${fc.filter((f: any) => f.serves !== 'BOTH').length}）`,
    );
  }
  console.log(`transitions：${finalTransitions.length}`);
  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length})：`);
    for (const w of warnings) console.log(`  [${w.route}] ${w.msg}`);
  } else {
    console.log('\n無警告');
  }
  const size = JSON.stringify(topo).length;
  console.log(`\n輸出 ${OUT_PATH}（${(size / 1024).toFixed(0)} KB）`);
}

main().catch((e) => {
  console.error('產製失敗：', e);
  process.exit(1);
});
