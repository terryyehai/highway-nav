// 依目前里程查詢官方速限路段（RouteGeometry.speedLimits 依 fromKm 遞增排序）。

import type { RouteGeometry } from '../types';

/** 超過速限多少才視為超速（避免 GPS/EMA 平滑誤差誤報），供 reducer 與 UI 共用同一門檻 */
export const OVER_SPEED_TOLERANCE_KMH = 5;

/**
 * 二分搜尋含 mileage 的路段；里程落在資料範圍外時夾附至最近端（沿線首尾銜接處常見些微誤差）。
 */
export function getSpeedLimitAtMileage(
  route: RouteGeometry | undefined,
  mileage: number,
): number | null {
  const segs = route?.speedLimits;
  if (!segs || segs.length === 0) return null;

  let lo = 0;
  let hi = segs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segs[mid];
    if (mileage < seg.fromKm) hi = mid - 1;
    else if (mileage > seg.toKm) lo = mid + 1;
    else return seg.limit;
  }
  // 落於相鄰路段之間的極小縫隙：取最接近者
  const candidate = segs[Math.min(lo, segs.length - 1)];
  const prevCandidate = segs[Math.max(hi, 0)];
  const distToCandidate = Math.min(Math.abs(mileage - candidate.fromKm), Math.abs(mileage - candidate.toKm));
  const distToPrev = Math.min(Math.abs(mileage - prevCandidate.fromKm), Math.abs(mileage - prevCandidate.toKm));
  return distToCandidate <= distToPrev ? candidate.limit : prevCandidate.limit;
}
