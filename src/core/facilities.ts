// 前方設施過濾、排序與 Hysteresis 比較。

import type { Direction, Facility, UpcomingFacility } from '../types';
import { etaSeconds, etaChanged } from './eta';

/** 剛通過設施的顯示緩衝 (km) */
const PASSED_BUFFER_KM = 0.2;
/** 顯示筆數 */
export const UPCOMING_COUNT = 3;
/** Hysteresis：距離差小於此值視為未變 (km) */
const DISTANCE_HYSTERESIS_KM = 0.1;

/** 建置期/載入期：依 route 分組並按 mileage 排序 */
export function indexFacilities(facilities: Facility[]): Map<string, Facility[]> {
  const map = new Map<string, Facility[]>();
  for (const f of facilities) {
    const arr = map.get(f.routeId) ?? [];
    arr.push(f);
    map.set(f.routeId, arr);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.mileage - b.mileage);
  return map;
}

/**
 * 取前方最近 N 個設施。
 * - INCREASING 取 mileage > current + buffer；DECREASING 反向。
 * - serves 過濾單向出口；junction（系統交流道）永遠顯示。
 */
export function upcomingFacilities(
  sorted: Facility[] | undefined,
  currentMileage: number,
  direction: Direction,
  speedKmh: number,
  count: number = UPCOMING_COUNT,
): UpcomingFacility[] {
  if (!sorted || direction === 'UNKNOWN') return [];
  const result: UpcomingFacility[] = [];

  if (direction === 'INCREASING') {
    // 二分搜尋插入點
    let lo = 0;
    let hi = sorted.length;
    const threshold = currentMileage + PASSED_BUFFER_KM;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].mileage <= threshold) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < sorted.length && result.length < count; i++) {
      const f = sorted[i];
      if (f.type !== 'junction' && f.serves !== 'BOTH' && f.serves !== direction) continue;
      const distanceKm = f.mileage - currentMileage;
      result.push({ ...f, distanceKm, etaSeconds: etaSeconds(distanceKm, speedKmh) });
    }
  } else {
    let lo = 0;
    let hi = sorted.length;
    const threshold = currentMileage - PASSED_BUFFER_KM;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].mileage < threshold) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo - 1; i >= 0 && result.length < count; i--) {
      const f = sorted[i];
      if (f.type !== 'junction' && f.serves !== 'BOTH' && f.serves !== direction) continue;
      const distanceKm = currentMileage - f.mileage;
      result.push({ ...f, distanceKm, etaSeconds: etaSeconds(distanceKm, speedKmh) });
    }
  }
  return result;
}

/**
 * Hysteresis：新舊清單 id 相同、各距離差 <0.1km 且 ETA 變化 <30s → 視為未變（不觸發 setState）。
 */
export function listMeaningfullyChanged(
  prev: UpcomingFacility[],
  next: UpcomingFacility[],
): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id) return true;
    if (Math.abs(prev[i].distanceKm - next[i].distanceKm) >= DISTANCE_HYSTERESIS_KM) return true;
    if (etaChanged(prev[i].etaSeconds, next[i].etaSeconds)) return true;
  }
  return false;
}
