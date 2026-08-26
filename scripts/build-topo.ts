// 圖資產製腳本：由高公局開放資料 (tisvcloud.freeway.gov.tw，免金鑰) 產出 src/data/freeway-topo.json
// 用法：npm run build:topo
// 資料源：
//   國道 — MOTC 交通資料標準 Section.xml（路段/里程）+ SectionShape.xml（WKT 線形）
//   快速公路 — 公路總局開放資料「快速公路交流道里程及通往地名」(JSON) +
//              「省道公路路線圖資」KMZ（motc.gov.tw uploaddowndoc，需瀏覽器 UA 否則 WAF 403/503）
// 品質報表輸出至 stdout；人工修正寫入 scripts/topo-overrides.json。

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import type { RouteGeometry, Serves, SpeedCamera } from '../src/types';
import { nearestPosition } from '../src/core/mapMatching';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SECTION_URL = 'https://tisvcloud.freeway.gov.tw/history/motc20/Section.xml';
const SHAPE_URL = 'https://tisvcloud.freeway.gov.tw/history/motc20/SectionShape.xml';
// 公路總局「快速公路交流道里程及通往地名」與「省道公路路線圖資」(data.gov.tw dataset 159945 / 105020)
const EXPWY_INTERCHANGE_URL =
  'https://www.motc.gov.tw/uploaddowndoc?file=datagov/1521771689845723136.json&filedisplay=expressway-interchanges.json&flag=doc';
const EXPWY_ROUTE_ZIP_URL =
  'https://www.motc.gov.tw/uploaddowndoc?file=datagov/1476384691685691392.zip&filedisplay=route.zip&flag=doc';
// motc.gov.tw 對無瀏覽器特徵的請求會回 403/503，需帶正常瀏覽器 UA + Referer
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Referer: 'https://data.gov.tw/',
};
const OUT_PATH = resolve(__dirname, '../src/data/freeway-topo.json');
const OVERRIDES_PATH = resolve(__dirname, 'topo-overrides.json');

// 測速照相：data.gov.tw 資料集僅含座標，用 metadata API 動態取得目前下載連結（避免寫死含日期的檔名）
const DATA_GOV_METADATA_URL = (datasetId: string) => `https://data.gov.tw/api/v2/rest/dataset/${datasetId}`;
const CAMERA_HIGHWAY_DATASET_ID = '13940'; // 警政署「國道公路固定式測速照相地點」
const CAMERA_NATIONWIDE_DATASET_ID = '7320'; // 警政署「測速執法設置點」（全國性，補快速公路涵蓋）
/** 照相機座標吸附到路網的門檻 (m)：比 GPS 追蹤用的 60m 寬鬆，容忍地址/座標誤差 */
const CAMERA_SNAP_THRESHOLD_M = 150;
/** 兩資料源合併去重的里程差門檻 (km)：13940（國道權威資料源）優先，7320 僅補未涵蓋者 */
const CAMERA_DEDUPE_KM = 0.15;

/** KMZ 檔名代碼 → 專案路線 id 與顯示名稱（16 條快速公路，涵蓋 data.gov.tw 159945 交流道資料集全部路線） */
const EXPWY_ROAD_MAP: Record<string, { roadNum: string; id: string; name: string }> = {
  P0610: { roadNum: '台61', id: 'E61', name: '台61線' },
  P0620: { roadNum: '台62', id: 'E62', name: '台62線' },
  P0621: { roadNum: '台62甲', id: 'E62A', name: '台62甲線' },
  P0640: { roadNum: '台64', id: 'E64', name: '台64線' },
  P0650: { roadNum: '台65', id: 'E65', name: '台65線' },
  P0660: { roadNum: '台66', id: 'E66', name: '台66線' },
  P0680: { roadNum: '台68', id: 'E68', name: '台68線' },
  P0720: { roadNum: '台72', id: 'E72', name: '台72線' },
  P0740: { roadNum: '台74', id: 'E74', name: '台74線' },
  P0741: { roadNum: '台74甲', id: 'E74A', name: '台74甲線' },
  P0760: { roadNum: '台76', id: 'E76', name: '台76線' },
  P0780: { roadNum: '台78', id: 'E78', name: '台78線' },
  P0820: { roadNum: '台82', id: 'E82', name: '台82線' },
  P0840: { roadNum: '台84', id: 'E84', name: '台84線' },
  P0860: { roadNum: '台86', id: 'E86', name: '台86線' },
  P0880: { roadNum: '台88', id: 'E88', name: '台88線' },
};

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
  speedLimit: number | null; // km/h，資料源缺值時為 null
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

/** motc.gov.tw 對缺瀏覽器特徵的請求會擋（403/503），需帶 BROWSER_HEADERS */
async function fetchBinary(url: string): Promise<Buffer> {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('unreachable');
}

async function fetchJsonWithHeaders<T>(url: string): Promise<T> {
  const buf = await fetchBinary(url);
  return JSON.parse(buf.toString('utf-8')) as T;
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
    const speedLimitRaw = tag(b, 'SpeedLimit');
    out.push({
      sectionId: tag(b, 'SectionID'),
      roadId,
      direction: tag(b, 'RoadDirection'),
      start: rs[1],
      end: rs[2],
      startKm: parseKm(mile[1]),
      endKm: parseKm(mile[2]),
      speedLimit: speedLimitRaw && Number.isFinite(Number(speedLimitRaw)) ? Number(speedLimitRaw) : null,
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

interface RouteSegment {
  startKm: number;
  endKm: number;
  coords: Array<[number, number]>;
}

/** 解析單一路線 KML（doc.kml）：每個 Placemark 為一段養護路段，含樁號範圍與線形 */
function parseKmlSegments(kml: string): RouteSegment[] {
  const segments: RouteSegment[] = [];
  for (const m of kml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
    const block = m[1];
    const range = block.match(/樁號範圍：<\/td><td>(\d+)K\+(\d+)至(\d+)K\+(\d+)/);
    const coordsBlock = block.match(/<coordinates>([\s\S]*?)<\/coordinates>/);
    if (!range || !coordsBlock) continue;
    const coords = coordsBlock[1]
      .trim()
      .split(/\s+/)
      .map((triplet) => {
        const [lng, lat] = triplet.split(',').map(Number);
        return [lng, lat] as [number, number];
      })
      .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
    if (coords.length < 2) continue;
    segments.push({
      startKm: Number(range[1]) + Number(range[2]) / 1000,
      endKm: Number(range[3]) + Number(range[4]) / 1000,
      coords,
    });
  }
  segments.sort((a, b) => a.startKm - b.startKm);
  return segments;
}

/** 依序組裝路段線形為單一路線，抽稀並建立 mileageIndex（與國道管線共用同一套內插邏輯） */
function assembleRoute(
  segments: RouteSegment[],
  routeLabel: string,
  warnings: Warning[],
): { coords: Array<[number, number]>; mileageIndex: number[] } | null {
  const coords: Array<[number, number]> = [];
  const mileageIndex: number[] = [];
  for (const seg of segments) {
    const geo = simplify(seg.coords, 15);
    const cum: number[] = [0];
    for (let i = 1; i < geo.length; i++) cum.push(cum[i - 1] + distM(geo[i - 1], geo[i]));
    const total = cum[cum.length - 1] || 1;
    const geomKm = total / 1000;
    const officialKm = Math.abs(seg.endKm - seg.startKm);
    if (officialKm > 0.3 && Math.abs(geomKm - officialKm) / officialKm > 0.05) {
      warnings.push({
        route: routeLabel,
        msg: `${seg.startKm}K→${seg.endKm}K 幾何 ${geomKm.toFixed(2)}km vs 官方 ${officialKm.toFixed(2)}km 差異 >5%`,
      });
    }
    for (let i = 0; i < geo.length; i++) {
      if (coords.length > 0 && i === 0 && distM(coords[coords.length - 1], geo[0]) < 50) continue;
      coords.push([Number(geo[i][0].toFixed(5)), Number(geo[i][1].toFixed(5))]);
      mileageIndex.push(
        Number((seg.startKm + (seg.endKm - seg.startKm) * (cum[i] / total)).toFixed(3)),
      );
    }
  }
  if (coords.length < 2) return null;
  for (let i = 1; i < mileageIndex.length; i++) {
    if (mileageIndex[i] < mileageIndex[i - 1] - 0.001) {
      warnings.push({
        route: routeLabel,
        msg: `mileageIndex 於第 ${i} 點非單調（${mileageIndex[i - 1]} → ${mileageIndex[i]}）`,
      });
      break;
    }
  }
  return { coords, mileageIndex };
}

/**
 * 快速公路資料無方向代碼（僅「順向」單一線形），依線形整體走向推斷南下/北上或東行/西行：
 * 緯度跨度（換算公里）≥ 經度跨度 → 南北向路線，否則東西向。
 */
function inferDisplayLabels(coords: Array<[number, number]>): { inc: string; dec: string } {
  const first = coords[0];
  const last = coords[coords.length - 1];
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const lngSpanKm = (Math.max(...lngs) - Math.min(...lngs)) * 101; // 台灣緯度下經度 1 度約 101km
  const latSpanKm = (Math.max(...lats) - Math.min(...lats)) * 111;
  if (latSpanKm >= lngSpanKm) {
    return first[1] > last[1] ? { inc: '南下', dec: '北上' } : { inc: '北上', dec: '南下' };
  }
  return first[0] < last[0] ? { inc: '東行', dec: '西行' } : { inc: '西行', dec: '東行' };
}

/** 依「南（東）向/北（西）向出口預告地名」是否存在，換算為 INCREASING/DECREASING/BOTH */
function expresswayServes(
  labels: { inc: string; dec: string },
  hasSE: boolean,
  hasNW: boolean,
): string {
  const seIsIncreasing = labels.inc === '南下' || labels.inc === '東行';
  if (hasSE && hasNW) return 'BOTH';
  if (hasSE) return seIsIncreasing ? 'INCREASING' : 'DECREASING';
  if (hasNW) return seIsIncreasing ? 'DECREASING' : 'INCREASING';
  return 'BOTH'; // 兩側皆無資料，無法判斷時預設不過濾
}

interface RawCameraRow {
  lat: number;
  lng: number;
  direct: string;
  speedLimit: number | null;
}

/** 簡單 CSV 解析：政府開放資料欄位皆不含逗號，split 已足夠（與本腳本對其他政府資料格式的假設一致） */
function parseCsvRows(text: string): string[][] {
  return text
    .replace(/^﻿/, '') // 去 UTF-8 BOM
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(','));
}

/** data.gov.tw 資料集 metadata API：動態取得目前的下載連結，避免寫死含日期的檔名 */
async function fetchDatasetDownloadUrl(datasetId: string): Promise<string> {
  const meta = await fetchJsonWithHeaders<{
    result: { distribution: Array<{ resourceDownloadUrl: string }> };
  }>(DATA_GOV_METADATA_URL(datasetId));
  const url = meta.result?.distribution?.[0]?.resourceDownloadUrl;
  if (!url) throw new Error(`dataset ${datasetId} 找不到 resourceDownloadUrl`);
  return url;
}

function rowsFromCsv(csv: string, latCol: string, lngCol: string, dirCol: string, limitCol: string): RawCameraRow[] {
  const rows = parseCsvRows(csv);
  const header = rows[0];
  const latI = header.indexOf(latCol);
  const lngI = header.indexOf(lngCol);
  const dirI = header.indexOf(dirCol);
  const limitI = header.indexOf(limitCol);
  return rows
    .slice(1)
    .filter((r) => r.length >= header.length)
    .map((r) => {
      const limitRaw = r[limitI];
      return {
        lat: Number(r[latI]),
        lng: Number(r[lngI]),
        direct: r[dirI] ?? '',
        speedLimit: limitRaw && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : null,
      };
    })
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

/** dataset 13940（國道專用）：ZIP 內單一 CSV */
async function fetchHighwayCameraRows(): Promise<RawCameraRow[]> {
  const zipUrl = await fetchDatasetDownloadUrl(CAMERA_HIGHWAY_DATASET_ID);
  const buf = await fetchBinary(zipUrl);
  const zip = await JSZip.loadAsync(buf);
  const entryName = Object.keys(zip.files).find((n) => n.endsWith('.csv'));
  if (!entryName) throw new Error('國道測速照相 ZIP 內找不到 CSV（資料源格式可能已變更）');
  const csv = await zip.file(entryName)!.async('string');
  return rowsFromCsv(csv, '座標緯度', '座標經度', '拍攝方向', '速限');
}

/** dataset 7320（全國性）：直接 CSV，補快速公路涵蓋（國道部分與 13940 重複，靠去重排除） */
async function fetchNationwideCameraRows(): Promise<RawCameraRow[]> {
  const csvUrl = await fetchDatasetDownloadUrl(CAMERA_NATIONWIDE_DATASET_ID);
  const csv = (await fetchBinary(csvUrl)).toString('utf-8');
  return rowsFromCsv(csv, 'Latitude', 'Longitude', 'direct', 'limit');
}

/**
 * 依「拍攝方向」文字（如「北往南」「南北雙向」）與路線 displayLabels 比對決定 serves；
 * 含「雙向」或無法判斷 → BOTH（與既有 expresswayServes 同樣「無法判斷時預設不過濾」的保守精神）。
 */
function cameraServesFromDirect(direct: string, labels: { inc: string; dec: string }): Serves {
  if (!direct || direct.includes('雙向')) return 'BOTH';
  const m = direct.match(/[東西南北]往([東西南北])/);
  if (!m) return 'BOTH';
  const to = m[1];
  if (labels.inc.includes(to)) return 'INCREASING';
  if (labels.dec.includes(to)) return 'DECREASING';
  return 'BOTH';
}

/**
 * 座標無路線/里程資訊，改用既有 map matching 的 nearestPosition() 吸附到路網（比解析中文地址文字可靠）。
 * seen：跨兩資料源共用的已收錄清單，供去重（同路線里程差 <CAMERA_DEDUPE_KM 視為重複）。
 */
function buildCameras(
  rows: RawCameraRow[],
  routesTyped: RouteGeometry[],
  seen: Array<{ routeId: string; mileage: number }>,
): SpeedCamera[] {
  const out: SpeedCamera[] = [];
  for (const row of rows) {
    const match = nearestPosition(routesTyped, row.lat, row.lng);
    if (!match || match.distanceM > CAMERA_SNAP_THRESHOLD_M) continue;
    if (seen.some((s) => s.routeId === match.routeId && Math.abs(s.mileage - match.mileage) < CAMERA_DEDUPE_KM)) {
      continue;
    }
    const route = routesTyped.find((r) => r.id === match.routeId)!;
    seen.push({ routeId: match.routeId, mileage: match.mileage });
    out.push({
      id: `CAM-${match.routeId}-${match.mileage.toFixed(3)}`,
      routeId: match.routeId,
      cameraType: 'fixed',
      mileage: Number(match.mileage.toFixed(3)),
      lat: row.lat,
      lng: row.lng,
      serves: cameraServesFromDirect(row.direct, route.displayLabels),
      speedLimitKmh: row.speedLimit,
    });
  }
  return out;
}

interface ExpwyInterchangeRow {
  公路編號: string;
  樁號: string;
  編碼樁號: string;
  交流道名稱: string;
  '南（東）向出口預告地名': string | null;
  '北（西）向出口預告地名': string | null;
  'WGS84-N': number; // 經度（欄名誤植，實為 lng）
  'WGS84-E': number; // 緯度（欄名誤植，實為 lat）
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

    // --- 速限路段：相鄰同值合併，減少 JSON 體積 ---
    const speedLimits: Array<{ fromKm: number; toKm: number; limit: number }> = [];
    for (const sec of inc) {
      if (sec.speedLimit === null) {
        warnings.push({ route: meta.id, msg: `路段 ${sec.start}→${sec.end} 缺速限資料` });
        continue;
      }
      const last = speedLimits[speedLimits.length - 1];
      if (last && last.limit === sec.speedLimit && Math.abs(last.toKm - sec.startKm) < 0.01) {
        last.toKm = sec.endKm;
      } else {
        speedLimits.push({ fromKm: sec.startKm, toKm: sec.endKm, limit: sec.speedLimit });
      }
    }

    routes.push({
      id: meta.id,
      name: meta.name,
      displayLabels: incDir === 'S' ? { inc: '南下', dec: '北上' } : { inc: '東行', dec: '西行' },
      bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      coords,
      mileageIndex,
      ...(PAIRED[meta.id] ? { pairedRouteId: PAIRED[meta.id] } : {}),
      ...(meta.id.endsWith('H') ? { isElevated: true } : {}),
      ...(speedLimits.length > 0 ? { speedLimits } : {}),
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

  // ================= 快速公路 =================
  console.log('\n下載公路總局快速公路資料...');
  const [expwyInterchanges, expwyRouteZipBuf] = await Promise.all([
    fetchJsonWithHeaders<ExpwyInterchangeRow[]>(EXPWY_INTERCHANGE_URL),
    fetchBinary(EXPWY_ROUTE_ZIP_URL),
  ]);
  console.log(`快速公路交流道 ${expwyInterchanges.length} 筆`);

  const outerZip = await JSZip.loadAsync(expwyRouteZipBuf);
  const kmzZipEntryName = Object.keys(outerZip.files).find(
    (n) => n.endsWith('.zip') && n.includes('KMZ'),
  );
  if (!kmzZipEntryName) {
    warnings.push({ route: 'EXPWY', msg: '省道路線 ZIP 內找不到 KMZ 壓縮檔（資料源檔名可能已變更）' });
  } else {
    const kmzZipBuf = await outerZip.file(kmzZipEntryName)!.async('nodebuffer');
    const kmzZip = await JSZip.loadAsync(kmzZipBuf);
    const kmzEntries = Object.keys(kmzZip.files);

    for (const [code, meta] of Object.entries(EXPWY_ROAD_MAP)) {
      const entryName = kmzEntries.find((n) => n.endsWith(`${code}.kmz`));
      if (!entryName) {
        warnings.push({ route: meta.id, msg: `KMZ 壓縮檔內找不到 ${code}` });
        continue;
      }
      const innerKmzBuf = await kmzZip.file(entryName)!.async('nodebuffer');
      const innerKmz = await JSZip.loadAsync(innerKmzBuf);
      const kmlFile = innerKmz.file('doc.kml');
      if (!kmlFile) {
        warnings.push({ route: meta.id, msg: `${code}.kmz 內找不到 doc.kml` });
        continue;
      }
      const kml = await kmlFile.async('string');
      const segments = parseKmlSegments(kml);
      if (segments.length === 0) {
        warnings.push({ route: meta.id, msg: '路段組裝失敗（無有效 Placemark），路線略過' });
        continue;
      }
      const assembled = assembleRoute(segments, meta.id, warnings);
      if (!assembled) {
        warnings.push({ route: meta.id, msg: '線形組裝失敗，路線略過' });
        continue;
      }
      const { coords, mileageIndex } = assembled;
      const displayLabels = inferDisplayLabels(coords);
      const lngs = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      routes.push({
        id: meta.id,
        name: meta.name,
        displayLabels,
        bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
        coords,
        mileageIndex,
      });

      const rows = expwyInterchanges.filter((r) => r['公路編號'] === meta.roadNum);
      for (const row of rows) {
        const name = row['交流道名稱'];
        if (!name) continue;
        const mileage = Number(row['樁號']);
        if (!Number.isFinite(mileage)) continue;
        const hasSE = !!row['南（東）向出口預告地名'];
        const hasNW = !!row['北（西）向出口預告地名'];
        const type = /系統/.test(name) ? 'junction' : 'interchange';
        facilities.push({
          id: `${meta.id}-${row['編碼樁號']}-${name}`,
          routeId: meta.id,
          name,
          type,
          mileage: Number(mileage.toFixed(3)),
          lat: row['WGS84-E'],
          lng: row['WGS84-N'],
          serves: expresswayServes(displayLabels, hasSE, hasNW),
        });
      }
    }
  }

  // ================= 測速照相／科技執法（固定式） =================
  // 區間平均速率科技執法查無結構化開放資料源，暫不產製；架構已支援（SpeedCamera.cameraType），
  // 資料留空，之後可透過 topo-overrides.json 的 extraCameras 手動補上。
  console.log('\n下載測速照相地點開放資料...');
  const routesTyped = routes as unknown as RouteGeometry[];
  const seenCameraSpots: Array<{ routeId: string; mileage: number }> = [];
  let cameras: SpeedCamera[] = [];
  try {
    const rows = await fetchHighwayCameraRows();
    const matched = buildCameras(rows, routesTyped, seenCameraSpots);
    cameras = cameras.concat(matched);
    console.log(`國道測速照相（dataset ${CAMERA_HIGHWAY_DATASET_ID}）：${rows.length} 筆，落在路網內 ${matched.length} 筆`);
  } catch (e) {
    warnings.push({ route: 'CAMERA', msg: `國道測速照相資料下載/解析失敗，此次略過：${(e as Error).message}` });
  }
  try {
    const rows = await fetchNationwideCameraRows();
    const matched = buildCameras(rows, routesTyped, seenCameraSpots);
    cameras = cameras.concat(matched);
    console.log(`全國測速執法設置點（dataset ${CAMERA_NATIONWIDE_DATASET_ID}）：${rows.length} 筆，補上路網內 ${matched.length} 筆（含快速公路、扣除與國道重複者）`);
  } catch (e) {
    warnings.push({ route: 'CAMERA', msg: `全國測速執法資料下載/解析失敗，此次略過：${(e as Error).message}` });
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
  let overrides: any = {
    removeFacilityIds: [],
    facilityPatches: [],
    extraTransitions: [],
    removeTransitionIds: [],
    removeCameraIds: [],
    extraCameras: [],
  };
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
  const finalCameras = (cameras as any[])
    .filter((c) => !overrides.removeCameraIds.includes(c.id))
    .concat(overrides.extraCameras);

  const topo = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    routes,
    facilities: finalFacilities,
    transitions: finalTransitions,
    cameras: finalCameras,
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(topo));

  // --- 品質報表 ---
  console.log('\n=== 品質報表 ===');
  for (const r of routes as any[]) {
    const fc = finalFacilities.filter((f: any) => f.routeId === r.id);
    const slInfo = r.speedLimits ? `、速限路段 ${r.speedLimits.length}` : '';
    console.log(
      `${r.id.padEnd(4)} ${r.name}：節點 ${r.coords.length}、里程 ${r.mileageIndex[0]}–${r.mileageIndex[r.mileageIndex.length - 1]}km、設施 ${fc.length}（單向 ${fc.filter((f: any) => f.serves !== 'BOTH').length}）${slInfo}`,
    );
  }
  console.log(`transitions：${finalTransitions.length}`);
  const cameraBreakdown = (routes as any[])
    .map((r) => `${r.id} ${finalCameras.filter((c: any) => c.routeId === r.id).length}`)
    .filter((s) => !s.endsWith(' 0'))
    .join('、');
  console.log(`測速照相：${finalCameras.length}${cameraBreakdown ? `（${cameraBreakdown}）` : ''}`);
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
