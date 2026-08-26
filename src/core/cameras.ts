// 前方測速照相/科技執法過濾、排序與 hysteresis 比較（結構仿 facilities.ts）。

import type { Direction, SpeedCamera, UpcomingCamera } from '../types';
import { etaSeconds, etaChanged } from './eta';

/** 剛通過照相機的顯示緩衝 (km) */
const PASSED_BUFFER_KM = 0.2;
/** 顯示筆數 */
export const UPCOMING_CAMERA_COUNT = 2;
/** Hysteresis：距離差小於此值視為未變 (km) */
const DISTANCE_HYSTERESIS_KM = 0.1;

/** 建置期/載入期：依 route 分組並按 mileage 排序 */
export function indexCameras(cameras: SpeedCamera[]): Map<string, SpeedCamera[]> {
  const map = new Map<string, SpeedCamera[]>();
  for (const c of cameras) {
    const arr = map.get(c.routeId) ?? [];
    arr.push(c);
    map.set(c.routeId, arr);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.mileage - b.mileage);
  return map;
}

/**
 * 取前方最近 N 個照相機。
 * - INCREASING 取 mileage > current + buffer；DECREASING 反向。
 * - serves 過濾單向照相機（不像 facilities 的 junction 例外，照相機一律依 serves 過濾）。
 */
export function upcomingCameras(
  sorted: SpeedCamera[] | undefined,
  currentMileage: number,
  direction: Direction,
  speedKmh: number,
  count: number = UPCOMING_CAMERA_COUNT,
): UpcomingCamera[] {
  if (!sorted || direction === 'UNKNOWN') return [];
  const result: UpcomingCamera[] = [];

  if (direction === 'INCREASING') {
    let lo = 0;
    let hi = sorted.length;
    const threshold = currentMileage + PASSED_BUFFER_KM;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].mileage <= threshold) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < sorted.length && result.length < count; i++) {
      const c = sorted[i];
      if (c.serves !== 'BOTH' && c.serves !== direction) continue;
      const distanceKm = c.mileage - currentMileage;
      result.push({ ...c, distanceKm, etaSeconds: etaSeconds(distanceKm, speedKmh) });
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
      const c = sorted[i];
      if (c.serves !== 'BOTH' && c.serves !== direction) continue;
      const distanceKm = currentMileage - c.mileage;
      result.push({ ...c, distanceKm, etaSeconds: etaSeconds(distanceKm, speedKmh) });
    }
  }
  return result;
}

/**
 * Hysteresis：新舊清單 id 相同、各距離差 <0.1km 且 ETA 變化 <30s → 視為未變（不觸發 setState）。
 */
export function cameraListChanged(prev: UpcomingCamera[], next: UpcomingCamera[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id) return true;
    if (Math.abs(prev[i].distanceKm - next[i].distanceKm) >= DISTANCE_HYSTERESIS_KM) return true;
    if (etaChanged(prev[i].etaSeconds, next[i].etaSeconds)) return true;
  }
  return false;
}
