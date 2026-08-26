// 追蹤狀態中樞：純函式 reducer，零 React 依賴，全部可單元測試。
// (context, state, event) => state；TTS 播報決策以 announcements[] 事件輸出。

import type {
  Facility,
  FreewayTopo,
  GeoFix,
  TrackerState,
  UpcomingFacility,
} from '../types';
import { matchPosition, REENTRY_THRESHOLD_M } from './mapMatching';
import {
  carryOverDirectionState,
  effectiveDirection,
  initialDirectionState,
  judgeDirection,
} from './direction';
import { smoothSpeed, speedFromMileage } from './eta';
import { indexFacilities, listMeaningfullyChanged, upcomingFacilities } from './facilities';
import {
  DR_TRIGGER_MS,
  startDeadReckoning,
  tickDeadReckoning,
} from './deadReckoning';
import { haversineM } from '../utils/geo';

/** off-highway 判定所需連續失配筆數 */
const OFF_HIGHWAY_STREAK = 5;
/** TTS 播報距離門檻 (km) */
const TTS_ANNOUNCE_KM = 2.0;
/** 手動高架/平面切換後封鎖自動判定的里程 (km) */
const MANUAL_LOCK_KM = 10;
/** DR 恢復收斂門檻 (km) */
const DR_CONVERGE_KM = 1.0;

export type GeoEvent =
  | { type: 'FIX'; fix: GeoFix }
  | { type: 'TICK'; now: number }
  | { type: 'MANUAL_TOPO_SWITCH'; toRouteId: string }
  | { type: 'GEO_ERROR'; code: number }
  | { type: 'SET_OFFLINE'; isOffline: boolean }
  | { type: 'CONSUME_ANNOUNCEMENTS' }
  | {
      type: 'RESTORE';
      saved: { routeId: string; direction: TrackerState['direction']; mileage: number };
    };

export interface TrackerContext {
  topo: FreewayTopo;
  /** indexFacilities(topo.facilities) 的快取，由 createTrackerContext 建立 */
  facilityIndex: Map<string, Facility[]>;
}

export function createTrackerContext(topo: FreewayTopo): TrackerContext {
  return { topo, facilityIndex: indexFacilities(topo.facilities) };
}

export function initialTrackerState(): TrackerState {
  return {
    phase: 'INIT',
    currentRouteId: null,
    currentMileage: 0,
    direction: 'UNKNOWN',
    speedKmh: 0,
    upcomingFacilities: [],
    isDeadReckoning: false,
    isOffline: false,
    lastFix: null,
    announcements: [],
    announcedIds: [],
    dir: initialDirectionState(),
    offMatchStreak: 0,
    manualTopoLock: null,
    dr: null,
  };
}

const TYPE_SPOKEN: Record<Facility['type'], string> = {
  interchange: '交流道',
  rest_area: '服務區',
  junction: '系統交流道',
};

function buildAnnouncementText(f: UpcomingFacility): string {
  const km = f.distanceKm.toFixed(1);
  // 設施名稱多已含「交流道/服務區」字樣，避免重複
  const suffix = f.name.includes(TYPE_SPOKEN[f.type]) ? '' : TYPE_SPOKEN[f.type];
  return `前方 ${km} 公里，${f.name}${suffix}`;
}

/** 重算 upcoming + 播報，含 hysteresis */
function recomputeUpcoming(ctx: TrackerContext, state: TrackerState): TrackerState {
  if (!state.currentRouteId || state.direction === 'UNKNOWN') {
    if (state.upcomingFacilities.length === 0) return state;
    return { ...state, upcomingFacilities: [], announcedIds: [] };
  }
  const next = upcomingFacilities(
    ctx.facilityIndex.get(state.currentRouteId),
    state.currentMileage,
    state.direction,
    state.speedKmh,
  );
  if (!listMeaningfullyChanged(state.upcomingFacilities, next)) return state;

  // 已播報清單只保留仍在 upcoming 內的 id（離開清單即重置，之後再接近可重播）
  const nextIds = new Set(next.map((f) => f.id));
  const announcedIds = state.announcedIds.filter((id) => nextIds.has(id));

  // 最近設施 <2km 且未播報過 → 產生播報
  const announcements = [...state.announcements];
  const nearest = next[0];
  if (nearest && nearest.distanceKm < TTS_ANNOUNCE_KM && !announcedIds.includes(nearest.id)) {
    announcements.push({ facilityId: nearest.id, text: buildAnnouncementText(nearest) });
    announcedIds.push(nearest.id);
  }

  return { ...state, upcomingFacilities: next, announcedIds, announcements };
}

/** 手動鎖是否仍有效；行駛超過 10km 自動解除 */
function activeManualLock(state: TrackerState): string | null {
  if (!state.manualTopoLock) return null;
  if (Math.abs(state.currentMileage - state.manualTopoLock.sinceMileage) > MANUAL_LOCK_KM) {
    return null;
  }
  return state.manualTopoLock.routeId;
}

/** 進入 trigger zone → 預先切換 currentRouteId（手動鎖有效時封鎖） */
function applyTriggerZones(ctx: TrackerContext, state: TrackerState, fix: GeoFix): TrackerState {
  if (!state.currentRouteId || activeManualLock(state)) return state;
  for (const t of ctx.topo.transitions) {
    if (t.fromRouteId !== state.currentRouteId) continue;
    if (t.direction !== 'UNKNOWN' && t.direction !== state.direction) continue;
    const d = haversineM(fix.lat, fix.lng, t.triggerZone.lat, t.triggerZone.lng);
    if (d <= t.triggerZone.radius) {
      return {
        ...state,
        currentRouteId: t.toRouteId,
        dir: carryOverDirectionState(state.direction),
      };
    }
  }
  return state;
}

function handleFix(ctx: TrackerContext, prev: TrackerState, fix: GeoFix): TrackerState {
  let state: TrackerState = { ...prev, lastFix: fix };

  // DR 進行中收到 fix → 結束 DR；收斂判定在 match 之後
  const wasDeadReckoning = state.isDeadReckoning;
  const drEstimate = state.dr?.estimatedMileage ?? null;
  state.isDeadReckoning = false;
  state.dr = null;

  const threshold = state.phase === 'OFF_HIGHWAY' ? REENTRY_THRESHOLD_M : undefined;
  const match = matchPosition(
    ctx.topo.routes,
    fix.lat,
    fix.lng,
    fix.accuracy,
    state.phase === 'OFF_HIGHWAY' ? null : state.currentRouteId,
    activeManualLock(state),
    threshold,
  );

  if (!match) {
    // 失配：累計 streak，達標才轉 OFF_HIGHWAY（單筆超標常為 GPS 反射）
    const streak = state.offMatchStreak + 1;
    if (streak >= OFF_HIGHWAY_STREAK) {
      if (state.phase === 'INIT' && state.currentRouteId) {
        // RESTORE 的路線與實際位置不符（換了路/離開國道後重開）：
        // 丟棄快取路線，之後的 fix 改走全量掃描，避免 INIT 死鎖
        return {
          ...state,
          currentRouteId: null,
          direction: 'UNKNOWN',
          dir: initialDirectionState(),
          offMatchStreak: 0,
        };
      }
      if (state.phase === 'TRACKING' || (state.phase === 'INIT' && !state.currentRouteId)) {
        // 首次啟動且持續收不到任何國道匹配（不在國道附近）：GPS 本身正常，
        // 只是位置不在國道範圍內，轉 OFF_HIGHWAY 讓 UI 呈現「未在國道上」
        // 而非讓 phase 永遠停在 INIT 死鎖
        return {
          ...state,
          phase: 'OFF_HIGHWAY',
          offMatchStreak: 0,
          upcomingFacilities: [],
          announcedIds: [],
          // 保留 currentRouteId/direction 供快速恢復參考（UI 顯示待命）
        };
      }
    }
    return { ...state, offMatchStreak: streak };
  }

  state.offMatchStreak = 0;

  // 路線切換（含 off-highway 恢復、高架/平面切換、DR 恢復到不同線）
  const routeChanged = match.routeId !== state.currentRouteId;
  if (routeChanged || state.phase === 'OFF_HIGHWAY' || state.phase === 'SIGNAL_LOST') {
    state.dir = carryOverDirectionState(state.direction);
  }
  // INIT → TRACKING 且路線與 RESTORE 快取一致：保留已恢復的 LOCKED 方向（無縫恢復）
  state.currentRouteId = match.routeId;
  state.phase = 'TRACKING';

  // DR 恢復收斂：差距過大 → 方向重判（保留為 CANDIDATE）
  if (wasDeadReckoning && drEstimate !== null && !routeChanged) {
    if (Math.abs(match.mileage - drEstimate) >= DR_CONVERGE_KM) {
      state.dir = carryOverDirectionState(state.direction);
    }
  }

  // 速度：GPS speed 優先，null 時用里程差 fallback
  const dtMs = prev.lastFix ? fix.timestamp - prev.lastFix.timestamp : 0;
  const fallback =
    prev.lastFix && prev.phase === 'TRACKING' && !routeChanged && !wasDeadReckoning
      ? speedFromMileage(match.mileage - prev.currentMileage, dtMs)
      : null;
  state.speedKmh = smoothSpeed(state.speedKmh, fix.speed, fallback);

  // 方向判定
  state.dir = judgeDirection(state.dir, {
    mileage: match.mileage,
    heading: fix.heading,
    speedKmh: state.speedKmh,
    segmentBearing: match.segmentBearing,
  });
  state.direction = effectiveDirection(state.dir);
  state.currentMileage = match.mileage;

  // trigger zone 預切換（高架/平面）
  state = applyTriggerZones(ctx, state, fix);

  return recomputeUpcoming(ctx, state);
}

function handleTick(ctx: TrackerContext, state: TrackerState, now: number): TrackerState {
  if (state.phase !== 'TRACKING' || !state.lastFix) return state;
  const silentMs = now - state.lastFix.timestamp;
  if (silentMs < DR_TRIGGER_MS) return state;
  if (state.direction === 'UNKNOWN') return state; // 方向未定無從推進

  let dr = state.dr ?? startDeadReckoning(state.lastFix.timestamp, state.currentMileage, state.speedKmh);
  const next = tickDeadReckoning(dr, now, state.direction);
  if (next === null) {
    // DR 超時 → 訊號遺失
    return {
      ...state,
      phase: 'SIGNAL_LOST',
      isDeadReckoning: false,
      dr: null,
    };
  }
  const advanced: TrackerState = {
    ...state,
    isDeadReckoning: true,
    dr: next,
    currentMileage: next.estimatedMileage,
    speedKmh: next.speedKmh,
  };
  return recomputeUpcoming(ctx, advanced);
}

export function trackerReducer(
  ctx: TrackerContext,
  state: TrackerState,
  event: GeoEvent,
): TrackerState {
  switch (event.type) {
    case 'FIX':
      return handleFix(ctx, state, event.fix);
    case 'TICK':
      return handleTick(ctx, state, event.now);
    case 'MANUAL_TOPO_SWITCH': {
      return recomputeUpcoming(ctx, {
        ...state,
        currentRouteId: event.toRouteId,
        manualTopoLock: { routeId: event.toRouteId, sinceMileage: state.currentMileage },
        dir: carryOverDirectionState(state.direction),
      });
    }
    case 'GEO_ERROR':
      // code 1 = PERMISSION_DENIED；其餘交由 UI 依 phase + lastFix 呈現
      return event.code === 1 ? { ...initialTrackerState(), phase: 'INIT' } : state;
    case 'SET_OFFLINE':
      return { ...state, isOffline: event.isOffline };
    case 'CONSUME_ANNOUNCEMENTS':
      return state.announcements.length === 0 ? state : { ...state, announcements: [] };
    case 'RESTORE':
      // Safari 背景釋放後的無縫恢復：背景前已鎖定的方向直接恢復為 LOCKED
      return {
        ...state,
        currentRouteId: event.saved.routeId,
        currentMileage: event.saved.mileage,
        direction: event.saved.direction,
        dir:
          event.saved.direction === 'UNKNOWN'
            ? initialDirectionState()
            : {
                ...initialDirectionState(),
                status: 'LOCKED',
                candidate: event.saved.direction,
              },
      };
    default:
      return state;
  }
}
