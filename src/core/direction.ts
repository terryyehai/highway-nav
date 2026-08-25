// 方向判定狀態機：UNKNOWN → CANDIDATE → LOCKED，含反轉防抖。

import type { Direction, DirectionJudgeState } from '../types';
import { bearingDiff } from '../utils/geo';

/** 單筆 Δmileage 的雜訊門檻 (km) */
const MIN_DELTA_KM = 0.03;
/** LOCKED 所需連續筆數與累積位移 */
const LOCK_STREAK = 3;
const LOCK_ACCUM_KM = 0.15;
/** LOCKED 後反轉改判所需 */
const REVERSE_STREAK = 5;
const REVERSE_ACCUM_KM = 0.3;
/** heading 可信的最低時速 */
const HEADING_MIN_SPEED_KMH = 10;

export function initialDirectionState(): DirectionJudgeState {
  return {
    status: 'UNKNOWN',
    candidate: 'UNKNOWN',
    streak: 0,
    accumulatedKm: 0,
    lastMileage: null,
    reverseStreak: 0,
    reverseAccumKm: 0,
  };
}

/**
 * 換路線後保留舊方向為 CANDIDATE 起點（高架/平面切換方向不變）。
 */
export function carryOverDirectionState(prevDirection: Direction): DirectionJudgeState {
  const s = initialDirectionState();
  if (prevDirection !== 'UNKNOWN') {
    s.status = 'CANDIDATE';
    s.candidate = prevDirection;
  }
  return s;
}

export interface DirectionInput {
  mileage: number;
  /** GPS heading（度），無效時 null */
  heading: number | null;
  speedKmh: number;
  /** 吸附線段的方位角（里程遞增方向） */
  segmentBearing: number;
}

export function judgeDirection(
  state: DirectionJudgeState,
  input: DirectionInput,
): DirectionJudgeState {
  const s: DirectionJudgeState = { ...state };

  // heading 有效且速度足夠 → 直接推導本筆方向（加速判定）
  let headingDir: Direction = 'UNKNOWN';
  if (input.heading !== null && input.speedKmh > HEADING_MIN_SPEED_KMH) {
    const diff = bearingDiff(input.heading, input.segmentBearing);
    headingDir = diff < 90 ? 'INCREASING' : 'DECREASING';
  }

  if (s.lastMileage === null) {
    s.lastMileage = input.mileage;
    // 首筆即有可信 heading → 直接進 CANDIDATE
    if (s.status === 'UNKNOWN' && headingDir !== 'UNKNOWN') {
      s.status = 'CANDIDATE';
      s.candidate = headingDir;
    }
    return s;
  }

  const delta = input.mileage - s.lastMileage;
  s.lastMileage = input.mileage;
  if (Math.abs(delta) < MIN_DELTA_KM) return s; // 雜訊，忽略

  const obsDir: Direction = delta > 0 ? 'INCREASING' : 'DECREASING';
  // heading 與里程趨勢矛盾時，信里程趨勢但不累積（可能匝道彎繞）
  const consistent = headingDir === 'UNKNOWN' || headingDir === obsDir;

  if (s.status === 'LOCKED') {
    if (obsDir === s.candidate) {
      s.reverseStreak = 0;
      s.reverseAccumKm = 0;
    } else {
      s.reverseStreak += 1;
      s.reverseAccumKm += Math.abs(delta);
      if (s.reverseStreak >= REVERSE_STREAK && s.reverseAccumKm >= REVERSE_ACCUM_KM) {
        // 改判：先降級為反向 CANDIDATE
        s.status = 'CANDIDATE';
        s.candidate = obsDir;
        s.streak = 1;
        s.accumulatedKm = Math.abs(delta);
        s.reverseStreak = 0;
        s.reverseAccumKm = 0;
      }
    }
    return s;
  }

  // UNKNOWN / CANDIDATE
  if (s.candidate === obsDir && consistent) {
    s.streak += 1;
    s.accumulatedKm += Math.abs(delta);
  } else if (consistent) {
    s.status = 'CANDIDATE';
    s.candidate = obsDir;
    s.streak = 1;
    s.accumulatedKm = Math.abs(delta);
  }
  if (s.streak >= LOCK_STREAK && s.accumulatedKm >= LOCK_ACCUM_KM) {
    s.status = 'LOCKED';
  }
  return s;
}

export function effectiveDirection(s: DirectionJudgeState): Direction {
  return s.status === 'LOCKED' ? s.candidate : 'UNKNOWN';
}
