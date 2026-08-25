// Dead Reckoning：長隧道斷訊時依最後車速推進里程。

import type { DeadReckoningState, Direction } from '../types';

/** 斷訊多久後啟動 DR (ms) */
export const DR_TRIGGER_MS = 5000;
/** DR 最長持續 (ms)，超過視為訊號遺失 */
export const DR_MAX_MS = 180000;
/** 每 30 秒速度衰減 5% */
const DECAY_INTERVAL_MS = 30000;
const DECAY_FACTOR = 0.95;
/** 恢復訊號時，估計 vs 實際差距在此範圍內視為收斂成功 (km) */
export const DR_CONVERGE_KM = 1.0;

export function startDeadReckoning(
  now: number,
  currentMileage: number,
  speedKmh: number,
): DeadReckoningState {
  return { startedAt: now, lastTickAt: now, estimatedMileage: currentMileage, speedKmh };
}

/**
 * 依 timestamp 差推進（iOS 背景凍結後恢復也能正確累計，勿用 tick 計數）。
 * 回傳 null 表示 DR 超時。
 */
export function tickDeadReckoning(
  state: DeadReckoningState,
  now: number,
  direction: Direction,
): DeadReckoningState | null {
  if (now - state.startedAt > DR_MAX_MS) return null;
  const dtMs = now - state.lastTickAt;
  if (dtMs <= 0) return state;

  // 速度衰減：依經過的衰減週期數
  const prevPeriods = Math.floor((state.lastTickAt - state.startedAt) / DECAY_INTERVAL_MS);
  const nowPeriods = Math.floor((now - state.startedAt) / DECAY_INTERVAL_MS);
  let speed = state.speedKmh * Math.pow(DECAY_FACTOR, nowPeriods - prevPeriods);

  const sign = direction === 'INCREASING' ? 1 : direction === 'DECREASING' ? -1 : 0;
  const advanceKm = sign * speed * (dtMs / 3600000);

  return {
    ...state,
    lastTickAt: now,
    speedKmh: speed,
    estimatedMileage: state.estimatedMileage + advanceKm,
  };
}
