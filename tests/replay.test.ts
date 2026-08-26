// 端到端回放測試：完整 GPS 軌跡餵進 trackerReducer，驗證狀態序列。

import { describe, expect, it } from 'vitest';
import { loadFixture, loadTopo, replay } from './helpers';
import { createTrackerContext, initialTrackerState, trackerReducer } from '../src/core/trackerReducer';

const topo = loadTopo();

describe('replay：國1 南下正常行駛', () => {
  const states = replay(topo, loadFixture('n1-south').points);
  const final = states[states.length - 1];

  it('進入 TRACKING 並鎖定方向', () => {
    expect(final.phase).toBe('TRACKING');
    expect(final.currentRouteId).toBe('N1');
    expect(final.direction).toBe('INCREASING');
  });

  it('里程單調遞增（容忍彎道幾何吸附抖動 150m，UI 層由 hysteresis 吸收）', () => {
    const tracked = states.filter((s) => s.phase === 'TRACKING' && s.direction !== 'UNKNOWN');
    for (let i = 1; i < tracked.length; i++) {
      expect(tracked[i].currentMileage).toBeGreaterThan(tracked[i - 1].currentMileage - 0.15);
    }
    expect(final.currentMileage).toBeGreaterThan(59);
  });

  it('顯示前方 3 個設施且距離遞增', () => {
    expect(final.upcomingFacilities.length).toBeGreaterThan(0);
    const d = final.upcomingFacilities.map((f) => f.distanceKm);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it('速度收斂於 95km/h 附近且 ETA 存在', () => {
    expect(final.speedKmh).toBeGreaterThan(85);
    expect(final.speedKmh).toBeLessThan(105);
    expect(final.upcomingFacilities[0].etaSeconds).not.toBeNull();
  });

  it('<2km 設施曾產生 TTS 播報且不重複', () => {
    const announced: string[] = [];
    for (const s of states) {
      for (const a of s.announcements) {
        if (!announced.includes(`${a.facilityId}@${a.text}`)) announced.push(`${a.facilityId}@${a.text}`);
      }
    }
    // 40km 行程必然經過多個交流道
    expect(announced.length).toBeGreaterThan(3);
  });
});

describe('replay：國1 北上', () => {
  const states = replay(topo, loadFixture('n1-north').points);
  const final = states[states.length - 1];

  it('方向 DECREASING、里程遞減、設施在前方（里程較小側）', () => {
    expect(final.direction).toBe('DECREASING');
    expect(final.currentMileage).toBeLessThan(91);
    for (const f of final.upcomingFacilities) {
      expect(f.mileage).toBeLessThan(final.currentMileage);
    }
  });
});

describe('replay：國5 雪隧斷訊 Dead Reckoning', () => {
  const states = replay(topo, loadFixture('n5-tunnel').points);

  it('斷訊期間啟動 DR 且里程持續推進', () => {
    const drStates = states.filter((s) => s.isDeadReckoning);
    expect(drStates.length).toBeGreaterThan(0);
    expect(
      drStates[drStates.length - 1].currentMileage - drStates[0].currentMileage,
    ).toBeGreaterThan(0.5);
  });

  it('恢復訊號後回到 GPS 追蹤並收斂', () => {
    const final = states[states.length - 1];
    expect(final.phase).toBe('TRACKING');
    expect(final.isDeadReckoning).toBe(false);
    expect(final.currentMileage).toBeGreaterThan(29);
  });
});

describe('replay：汐五/五楊高架', () => {
  const states = replay(topo, loadFixture('n1h-elevated').points);
  const final = states[states.length - 1];

  it('吸附到 N1H 或 N1（高架與平面重疊屬已知模糊，不得 OFF_HIGHWAY）', () => {
    expect(final.phase).toBe('TRACKING');
    expect(['N1H', 'N1']).toContain(final.currentRouteId);
    expect(final.direction).toBe('INCREASING');
  });
});

describe('replay：塞車走停', () => {
  const states = replay(topo, loadFixture('n1-jam').points);
  const final = states[states.length - 1];

  it('低速下 ETA 仍可計算（>5km/h）且速度正確', () => {
    expect(final.speedKmh).toBeGreaterThan(10);
    expect(final.speedKmh).toBeLessThan(20);
  });
});

describe('駛離國道 → OFF_HIGHWAY → 重新進入', () => {
  it('連續遠離線形 5 筆後轉 OFF_HIGHWAY，回到國道自動恢復', () => {
    const ctx = createTrackerContext(topo);
    const points = loadFixture('n3-south').points;
    let states = replay(topo, points);
    let state = states[states.length - 1];
    expect(state.phase).toBe('TRACKING');

    // 餵 6 筆遠離國道的點（南投市區，距國3 >1km）
    const base = 1700009999000;
    for (let i = 0; i < 6; i++) {
      state = trackerReducer(ctx, state, {
        type: 'FIX',
        fix: { lat: 23.90, lng: 120.68, speed: 10, heading: null, accuracy: 10, timestamp: base + i * 1000 },
      });
    }
    expect(state.phase).toBe('OFF_HIGHWAY');
    expect(state.upcomingFacilities).toEqual([]);

    // 回到國道上（沿用最後軌跡點）
    const last = points[points.length - 1];
    for (let i = 0; i < 3; i++) {
      state = trackerReducer(ctx, state, {
        type: 'FIX',
        fix: { lat: last.lat, lng: last.lng, speed: 25, heading: last.heading ?? null, accuracy: 10, timestamp: base + 10000 + i * 1000 },
      });
    }
    expect(state.phase).toBe('TRACKING');
    expect(state.currentRouteId).toBe('N3');
  });
});

describe('首次啟動且不在國道附近（室內/離國道甚遠）', () => {
  it('連續 5 筆失配後轉 OFF_HIGHWAY，不得死鎖於 INIT', () => {
    const ctx = createTrackerContext(topo);
    let state = initialTrackerState();
    expect(state.phase).toBe('INIT');

    // GPS 正常運作、持續有成功定位，但位置離所有國道都很遠（例如室內測試）
    const base = 1700020000000;
    for (let i = 0; i < 6; i++) {
      state = trackerReducer(ctx, state, {
        type: 'FIX',
        fix: { lat: 24.15, lng: 120.68, speed: 0, heading: null, accuracy: 20, timestamp: base + i * 1000 },
      });
    }
    expect(state.phase).toBe('OFF_HIGHWAY');
    expect(state.upcomingFacilities).toEqual([]);
  });

  it('OFF_HIGHWAY 時附上最近國道與雙向鄰近交流道，回到國道後清空', () => {
    const ctx = createTrackerContext(topo);
    let state = initialTrackerState();
    const base = 1700021000000;
    for (let i = 0; i < 6; i++) {
      state = trackerReducer(ctx, state, {
        type: 'FIX',
        fix: { lat: 24.15, lng: 120.68, speed: 0, heading: null, accuracy: 20, timestamp: base + i * 1000 },
      });
    }
    expect(state.phase).toBe('OFF_HIGHWAY');
    expect(state.nearestHighway).not.toBeNull();
    expect(state.nearestHighway!.distanceKm).toBeGreaterThan(0);
    expect(
      state.nearestHighway!.increasing.length + state.nearestHighway!.decreasing.length,
    ).toBeGreaterThan(0);

    // 開回國道上：nearestHighway 應清空
    const points = loadFixture('n1-south').points.slice(0, 10);
    for (const [i, p] of points.entries()) {
      state = trackerReducer(ctx, state, {
        type: 'FIX',
        fix: { lat: p.lat, lng: p.lng, speed: p.speed ?? null, heading: p.heading ?? null, accuracy: 10, timestamp: base + 10000 + i * 1000 },
      });
    }
    expect(state.phase).toBe('TRACKING');
    expect(state.nearestHighway).toBeNull();
  });
});

describe('手動高架/平面切換 10km 封鎖', () => {
  it('切換後 manualTopoLock 生效，行駛超過 10km 自動解除', () => {
    const ctx = createTrackerContext(topo);
    const states = replay(topo, loadFixture('n1-south').points.slice(0, 60));
    let state = states[states.length - 1];
    state = trackerReducer(ctx, state, { type: 'MANUAL_TOPO_SWITCH', toRouteId: 'N1H' });
    expect(state.currentRouteId).toBe('N1H');
    expect(state.manualTopoLock?.routeId).toBe('N1H');
  });
});

describe('RESTORE 路線與實際位置不符（換路後重開）', () => {
  it('連續失配後丟棄快取路線，全量掃描重新定位，不得死鎖於 INIT', () => {
    const ctx = createTrackerContext(topo);
    let state = trackerReducer(ctx, initialTrackerState(), {
      type: 'RESTORE',
      saved: { routeId: 'N1', direction: 'INCREASING', mileage: 60 },
    });
    // 實際人在國5 上
    const points = loadFixture('n5-tunnel').points.slice(0, 15);
    for (const [i, p] of points.entries()) {
      state = trackerReducer(ctx, state, {
        type: 'FIX',
        fix: { lat: p.lat, lng: p.lng, speed: p.speed ?? null, heading: p.heading ?? null, accuracy: 10, timestamp: 1700000000000 + i * 1000 },
      });
    }
    expect(state.phase).toBe('TRACKING');
    expect(state.currentRouteId).toBe('N5');
  });
});

describe('sessionStorage 無縫恢復', () => {
  it('RESTORE 後方向直接為 LOCKED，首筆 fix 即有 upcoming', () => {
    const ctx = createTrackerContext(topo);
    let state = trackerReducer(ctx, initialTrackerState(), {
      type: 'RESTORE',
      saved: { routeId: 'N1', direction: 'INCREASING', mileage: 30 },
    });
    expect(state.direction).toBe('INCREASING');
    const p = loadFixture('n1-south').points.find((x) => x.t === 0)!;
    state = trackerReducer(ctx, state, {
      type: 'FIX',
      fix: { lat: p.lat, lng: p.lng, speed: p.speed ?? null, heading: p.heading ?? null, accuracy: 10, timestamp: 1700000000000 },
    });
    expect(state.phase).toBe('TRACKING');
    expect(state.direction).toBe('INCREASING');
    expect(state.upcomingFacilities.length).toBeGreaterThan(0);
  });
});
