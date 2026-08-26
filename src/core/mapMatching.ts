// Map Matching：GPS 點 → (路線, 絕對里程)
// 有 currentRouteId 時只比對當前路線與其高架/平面對象線；UNKNOWN 時 bbox 過濾後全掃。

import type { RouteGeometry } from '../types';
import { snapToPolyline, inBbox, interpolateMileage, segmentBearing } from '../utils/geo';

/** 吸附閾值 (m)：國道雙向含路肩約 40m，留 GPS 誤差餘裕 */
export const SNAP_THRESHOLD_M = 60;
/** off-highway 恢復時的較嚴格閾值 */
export const REENTRY_THRESHOLD_M = 40;
/** UNKNOWN 掃描時的 bbox buffer (km) */
export const BBOX_BUFFER_KM = 20;

export interface MatchResult {
  routeId: string;
  mileage: number;
  distanceM: number;
  segmentBearing: number;
}

/**
 * 對單一路線做吸附；超出 threshold 回傳 null。
 * accuracy 差時放寬閾值（accuracy*2 + threshold）。
 */
export function matchRoute(
  route: RouteGeometry,
  lat: number,
  lng: number,
  accuracy: number,
  thresholdM: number = SNAP_THRESHOLD_M,
): MatchResult | null {
  if (!inBbox(lat, lng, route.bbox, 1)) return null;
  const snap = snapToPolyline(lat, lng, route.coords);
  const effective = accuracy > 30 ? thresholdM + accuracy * 2 : thresholdM;
  if (snap.distanceM > effective) return null;
  return {
    routeId: route.id,
    mileage: interpolateMileage(route.mileageIndex, snap.segmentIndex, snap.fraction),
    distanceM: snap.distanceM,
    segmentBearing: segmentBearing(route.coords, snap.segmentIndex),
  };
}

/**
 * 全域匹配：
 * - currentRouteId 存在 → 只比對該線與 pairedRouteId（高架/平面）。
 *   兩者皆命中時：有 manualLock 優先鎖定線；否則取距離較近者。
 * - 否則 → bbox+buffer 過濾後全掃，取垂距最小者。
 */
export function matchPosition(
  routes: RouteGeometry[],
  lat: number,
  lng: number,
  accuracy: number,
  currentRouteId: string | null,
  manualLockRouteId: string | null,
  thresholdM: number = SNAP_THRESHOLD_M,
): MatchResult | null {
  if (currentRouteId) {
    const current = routes.find((r) => r.id === currentRouteId);
    if (current) {
      const candidates: MatchResult[] = [];
      const cur = matchRoute(current, lat, lng, accuracy, thresholdM);
      if (cur) candidates.push(cur);
      if (current.pairedRouteId && !manualLockRouteId) {
        const paired = routes.find((r) => r.id === current.pairedRouteId);
        if (paired) {
          const p = matchRoute(paired, lat, lng, accuracy, thresholdM);
          if (p) candidates.push(p);
        }
      }
      if (candidates.length > 0) {
        // 優先序：手動鎖定線 → 目前線（黏滯，高架/平面幾何重疊時防抖動；
        // 真正分岔後目前線會超出閾值而自然換線）→ 最近者
        if (manualLockRouteId) {
          const locked = candidates.find((c) => c.routeId === manualLockRouteId);
          if (locked) return locked;
        }
        const onCurrent = candidates.find((c) => c.routeId === currentRouteId);
        if (onCurrent) return onCurrent;
        return candidates.reduce((a, b) => (a.distanceM <= b.distanceM ? a : b));
      }
      return null; // 目前線與對象線都吸不到 → 交給 off-highway streak 判定
    }
  }

  // 全量掃描：高架線與平面主線垂直重疊、水平距離近乎為零 → 模糊時優先平面主線
  // （駕駛多在主線；誤判可由 trigger zone 或手動 TopoSwitch 修正）
  let best: MatchResult | null = null;
  let bestElevated = false;
  for (const route of routes) {
    if (!inBbox(lat, lng, route.bbox, BBOX_BUFFER_KM)) continue;
    const m = matchRoute(route, lat, lng, accuracy, thresholdM);
    if (!m) continue;
    const elevated = route.isElevated === true;
    if (
      !best ||
      (bestElevated && !elevated && m.distanceM < best.distanceM + 25) ||
      (bestElevated === elevated && m.distanceM < best.distanceM) ||
      (!bestElevated && elevated && m.distanceM < best.distanceM - 25)
    ) {
      best = m;
      bestElevated = elevated;
    }
  }
  return best;
}

/**
 * 不設吸附門檻的全域最近點搜尋：用於 OFF_HIGHWAY 待命時找「目前離哪條國道最近」，
 * 與 matchPosition 的「是否算在國道上」判定完全無關，純粹取全台距離最小者。
 */
export function nearestPosition(
  routes: RouteGeometry[],
  lat: number,
  lng: number,
): MatchResult | null {
  let best: MatchResult | null = null;
  for (const route of routes) {
    // 待命模式候選路線少，直接放寬 bbox buffer 確保全台都能找到最近者
    if (!inBbox(lat, lng, route.bbox, 300)) continue;
    const snap = snapToPolyline(lat, lng, route.coords);
    if (!best || snap.distanceM < best.distanceM) {
      best = {
        routeId: route.id,
        mileage: interpolateMileage(route.mileageIndex, snap.segmentIndex, snap.fraction),
        distanceM: snap.distanceM,
        segmentBearing: segmentBearing(route.coords, snap.segmentIndex),
      };
    }
  }
  return best;
}
