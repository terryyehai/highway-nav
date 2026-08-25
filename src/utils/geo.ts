// 地理計算工具：不依賴 turf，直接以等距圓柱投影做局部平面運算，
// 回傳線段索引 + 內插比例，供 mileageIndex 換算絕對里程。

const EARTH_RADIUS_M = 6371008.8;
const DEG = Math.PI / 180;

/** Haversine 距離 (meters) */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLng = (lng2 - lng1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export interface SnapResult {
  /** 最近線段起點在 coords 中的索引 */
  segmentIndex: number;
  /** 落在線段上的比例 0~1 */
  fraction: number;
  /** GPS 點到線的垂距 (meters) */
  distanceM: number;
  /** 吸附點座標 [lng, lat] */
  point: [number, number];
}

/**
 * 將 GPS 點吸附到 polyline（等距圓柱投影局部平面近似，台灣尺度誤差可忽略）。
 * coords: [lng, lat][]
 */
export function snapToPolyline(
  lat: number,
  lng: number,
  coords: Array<[number, number]>,
): SnapResult {
  const cosLat = Math.cos(lat * DEG);
  const px = lng * cosLat;
  const py = lat;

  let best: SnapResult = { segmentIndex: 0, fraction: 0, distanceM: Infinity, point: coords[0] };

  for (let i = 0; i < coords.length - 1; i++) {
    const [x1raw, y1] = coords[i];
    const [x2raw, y2] = coords[i + 1];
    const x1 = x1raw * cosLat;
    const x2 = x2raw * cosLat;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    // 度 → 公尺（緯度方向 1 度 ≈ 111.195km）
    const ex = (px - cx) * 111195;
    const ey = (py - cy) * 111195;
    const dM = Math.sqrt(ex * ex + ey * ey);
    if (dM < best.distanceM) {
      best = {
        segmentIndex: i,
        fraction: t,
        distanceM: dM,
        point: [cx / cosLat, cy],
      };
    }
  }
  return best;
}

/** 點是否落在 bbox + buffer(km) 內 */
export function inBbox(
  lat: number,
  lng: number,
  bbox: [number, number, number, number],
  bufferKm: number,
): boolean {
  const dDeg = bufferKm / 111.195;
  return (
    lng >= bbox[0] - dDeg &&
    lng <= bbox[2] + dDeg &&
    lat >= bbox[1] - dDeg &&
    lat <= bbox[3] + dDeg
  );
}

/** 依 segmentIndex + fraction 對 mileageIndex 內插出絕對里程 (km) */
export function interpolateMileage(
  mileageIndex: number[],
  segmentIndex: number,
  fraction: number,
): number {
  const m1 = mileageIndex[segmentIndex];
  const m2 = mileageIndex[Math.min(segmentIndex + 1, mileageIndex.length - 1)];
  return m1 + (m2 - m1) * fraction;
}

/** 線段方位角（度，0=北 順時針），用於 heading 輔助方向判定 */
export function segmentBearing(
  coords: Array<[number, number]>,
  segmentIndex: number,
): number {
  const [lng1, lat1] = coords[segmentIndex];
  const [lng2, lat2] = coords[Math.min(segmentIndex + 1, coords.length - 1)];
  const y = Math.sin((lng2 - lng1) * DEG) * Math.cos(lat2 * DEG);
  const x =
    Math.cos(lat1 * DEG) * Math.sin(lat2 * DEG) -
    Math.sin(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.cos((lng2 - lng1) * DEG);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

/** 兩方位角的最小夾角 (0~180) */
export function bearingDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
