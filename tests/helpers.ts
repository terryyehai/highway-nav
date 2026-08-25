// 測試共用：載入 topo/fixture，將軌跡回放進 trackerReducer。

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FreewayTopo, GeoFix, TrackerState } from '../src/types';
import {
  createTrackerContext,
  initialTrackerState,
  trackerReducer,
} from '../src/core/trackerReducer';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadTopo(): FreewayTopo {
  return JSON.parse(
    readFileSync(resolve(__dirname, '../src/data/freeway-topo.json'), 'utf-8'),
  ) as FreewayTopo;
}

export interface FixturePoint {
  t: number;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  dropout?: boolean;
}

export function loadFixture(name: string): { name: string; points: FixturePoint[] } {
  return JSON.parse(
    readFileSync(resolve(__dirname, `fixtures/${name}.track.json`), 'utf-8'),
  );
}

const BASE_TS = 1700000000000;

/** 將 fixture 回放進 reducer，回傳每步狀態（dropout 期間只發 TICK） */
export function replay(
  topo: FreewayTopo,
  points: FixturePoint[],
  initial?: TrackerState,
): TrackerState[] {
  const ctx = createTrackerContext(topo);
  let state = initial ?? initialTrackerState();
  const states: TrackerState[] = [];
  let virtualMs = 0;
  for (const p of points) {
    // 補齊事件間的 1s TICK（驅動 Dead Reckoning）
    while (virtualMs + 1000 <= p.t) {
      virtualMs += 1000;
      state = trackerReducer(ctx, state, { type: 'TICK', now: BASE_TS + virtualMs });
    }
    virtualMs = p.t;
    if (!p.dropout) {
      const fix: GeoFix = {
        lat: p.lat,
        lng: p.lng,
        speed: p.speed ?? null,
        heading: p.heading ?? null,
        accuracy: p.accuracy ?? 10,
        timestamp: BASE_TS + p.t,
      };
      state = trackerReducer(ctx, state, { type: 'FIX', fix });
    }
    states.push(state);
  }
  return states;
}
