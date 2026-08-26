// GPS 追蹤接線層：訂閱 geoProvider、驅動 trackerReducer、
// sessionStorage 無縫恢復、低速 GPS 降頻。演算法全在 core/，此處只做 React 接線。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FreewayTopo, GeoFix, GeoProvider, TrackerState } from '../types';
import {
  createTrackerContext,
  initialTrackerState,
  trackerReducer,
  type GeoEvent,
} from '../core/trackerReducer';

const SESSION_KEY = 'highway-nav-state-v1';
/** 低速降頻：連續 3 次時速 <5 → 改為每 30s 輪詢 */
const LOW_SPEED_KMH = 5;
const LOW_SPEED_STREAK = 3;
const LOW_POWER_POLL_MS = 30000;
/** 部分行動瀏覽器（尤其 iOS Safari）watchPosition 的 timeout 不可靠，需自行兜底偵測逾時 */
const FIRST_FIX_WATCHDOG_MS = 12000;

interface SavedState {
  routeId: string;
  direction: TrackerState['direction'];
  mileage: number;
  savedAt: number;
}

function loadSaved(): SavedState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedState;
    // 超過 10 分鐘的快取視為過期（可能已離開國道）
    if (Date.now() - saved.savedAt > 600000) return null;
    return saved;
  } catch {
    return null;
  }
}

export type GeoErrorKind = 'PERMISSION_DENIED' | 'UNAVAILABLE' | null;

export function useHighwayTracker(
  topo: FreewayTopo,
  geoProvider: GeoProvider,
  active: boolean,
) {
  const ctx = useMemo(() => createTrackerContext(topo), [topo]);
  const [state, setState] = useState<TrackerState>(() => {
    // Safari 背景釋放後 Reload：載入階段優先讀取快取，無縫恢復
    const saved = loadSaved();
    const init = initialTrackerState();
    return saved
      ? trackerReducer(createTrackerContext(topo), init, {
          type: 'RESTORE',
          saved: { routeId: saved.routeId, direction: saved.direction, mileage: saved.mileage },
        })
      : init;
  });
  const [geoError, setGeoError] = useState<GeoErrorKind>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lowSpeedStreakRef = useRef(0);
  const [lowPowerMode, setLowPowerMode] = useState(false);
  const [accuracyMode, setAccuracyMode] = useState<'high' | 'low'>('high');

  const dispatch = useCallback(
    (event: GeoEvent) => {
      setState((prev) => trackerReducer(ctx, prev, event)); // reducer 未變時回傳同參考，React 跳過 re-render
    },
    [ctx],
  );

  // GPS 訂閱（低速降頻：以重新訂閱週期實現輪詢；低精度 fallback 由獨立 watchdog effect 觸發）
  useEffect(() => {
    if (!active) return;
    let watchId: number | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const onFix = (fix: GeoFix) => {
      setGeoError(null);
      dispatch({ type: 'FIX', fix });
      // 低速偵測（僅在正常追蹤中計數；INIT/失配期間速度為 0 不得誤觸省電）
      if (stateRef.current.phase !== 'TRACKING') {
        lowSpeedStreakRef.current = 0;
        return;
      }
      const speed = stateRef.current.speedKmh;
      if (speed < LOW_SPEED_KMH) {
        lowSpeedStreakRef.current += 1;
        if (lowSpeedStreakRef.current >= LOW_SPEED_STREAK) setLowPowerMode(true);
      } else {
        lowSpeedStreakRef.current = 0;
        setLowPowerMode(false);
      }
    };
    const onError = (err: { code: number; message: string }) => {
      dispatch({ type: 'GEO_ERROR', code: err.code });
      setGeoError(err.code === 1 ? 'PERMISSION_DENIED' : 'UNAVAILABLE');
    };

    if (lowPowerMode) {
      // 省電模式：每 30s 短暫開啟 watch 取一筆
      const pollOnce = () => {
        const id = geoProvider.watchPosition(
          (fix) => {
            geoProvider.clearWatch(id);
            onFix(fix);
          },
          onError,
          { enableHighAccuracy: false, timeout: 15000 },
        );
      };
      pollOnce();
      pollTimer = setInterval(pollOnce, LOW_POWER_POLL_MS);
    } else {
      watchId = geoProvider.watchPosition(onFix, onError, {
        enableHighAccuracy: accuracyMode === 'high',
        maximumAge: 1000,
        timeout: 20000,
      });
    }
    return () => {
      if (watchId !== null) geoProvider.clearWatch(watchId);
      if (pollTimer !== null) clearInterval(pollTimer);
    };
  }, [active, geoProvider, dispatch, lowPowerMode, accuracyMode]);

  // 逾時兜底：與上方 GPS 訂閱邏輯完全分離的單純 1s 輪詢計時器。
  // 部分行動瀏覽器（尤其 iOS Safari）watchPosition 的 timeout 參數不可靠，
  // 不會在拿不到第一筆定位時觸發 onError；用獨立、結構單純的 setInterval
  // 直接比對經過時間，避免依附在複雜的訂閱/重訂閱邏輯裡而不易驗證正確性。
  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    let triggered = false;
    const id = setInterval(() => {
      if (triggered) return;
      if (stateRef.current.phase !== 'INIT' || stateRef.current.lastFix) return;
      if (Date.now() - startedAt < FIRST_FIX_WATCHDOG_MS) return;
      triggered = true;
      setGeoError((prev) => (prev === 'PERMISSION_DENIED' ? prev : 'UNAVAILABLE'));
      setAccuracyMode('low');
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  // 1s TICK：驅動 Dead Reckoning 與訊號遺失偵測
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => dispatch({ type: 'TICK', now: Date.now() }), 1000);
    return () => clearInterval(timer);
  }, [active, dispatch]);

  // 離線偵測
  useEffect(() => {
    const on = () => dispatch({ type: 'SET_OFFLINE', isOffline: false });
    const off = () => dispatch({ type: 'SET_OFFLINE', isOffline: true });
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    if (!navigator.onLine) off();
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [dispatch]);

  // 實時寫入 sessionStorage（Safari 背景釋放防護）
  useEffect(() => {
    if (state.phase !== 'TRACKING' || !state.currentRouteId) return;
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          routeId: state.currentRouteId,
          direction: state.direction,
          mileage: state.currentMileage,
          savedAt: Date.now(),
        } satisfies SavedState),
      );
    } catch {
      /* 私密瀏覽模式可能失敗，忽略 */
    }
  }, [state.currentRouteId, state.direction, state.currentMileage, state.phase]);

  const manualTopoSwitch = useCallback(
    (toRouteId: string) => dispatch({ type: 'MANUAL_TOPO_SWITCH', toRouteId }),
    [dispatch],
  );
  const consumeAnnouncements = useCallback(
    () => dispatch({ type: 'CONSUME_ANNOUNCEMENTS' }),
    [dispatch],
  );

  return { state, geoError, lowPowerMode, manualTopoSwitch, consumeAnnouncements };
}
