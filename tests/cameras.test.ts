// 測速照相/科技執法核心邏輯單元測試（結構仿 core.test.ts 內的 facilities describe），
// 另含 trackerReducer 整合測試（播報、超速警語），用手造最小 topo 驗證，不依賴真實圖資座標。

import { describe, expect, it } from 'vitest';
import { cameraListChanged, indexCameras, upcomingCameras } from '../src/core/cameras';
import { createTrackerContext, initialTrackerState, trackerReducer } from '../src/core/trackerReducer';
import type { FreewayTopo, GeoFix, SpeedCamera } from '../src/types';

describe('cameras', () => {
  const make = (id: string, mileage: number, serves = 'BOTH', speedLimitKmh: number | null = 100): SpeedCamera =>
    ({ id, routeId: 'X', cameraType: 'fixed', mileage, lat: 0, lng: 0, serves, speedLimitKmh }) as SpeedCamera;
  const sorted = [
    make('a', 10),
    make('b', 15, 'INCREASING'),
    make('c', 20, 'DECREASING'),
    make('d', 25),
  ];
  const idx = indexCameras(sorted);

  it('INCREASING 依方向過濾單向照相機並取前 2', () => {
    const r = upcomingCameras(idx.get('X'), 12, 'INCREASING', 100);
    expect(r.map((c) => c.id)).toEqual(['b', 'd']); // c 只服務 DECREASING
    expect(r[0].distanceKm).toBeCloseTo(3);
  });

  it('DECREASING 反向', () => {
    const r = upcomingCameras(idx.get('X'), 22, 'DECREASING', 100);
    expect(r.map((c) => c.id)).toEqual(['c', 'a']); // b 只服務 INCREASING
  });

  it('剛過站 0.2km 緩衝', () => {
    const r = upcomingCameras(idx.get('X'), 14.9, 'INCREASING', 100);
    expect(r[0].id).toBe('d'); // b(15) 在 0.2km 緩衝內視為已過
  });

  it('hysteresis：距離差 <0.1km 視為未變', () => {
    const a = upcomingCameras(idx.get('X'), 12, 'INCREASING', 100);
    const b = upcomingCameras(idx.get('X'), 12.05, 'INCREASING', 100);
    expect(cameraListChanged(a, b)).toBe(false);
    const c = upcomingCameras(idx.get('X'), 12.5, 'INCREASING', 100);
    expect(cameraListChanged(a, c)).toBe(true);
  });
});

describe('trackerReducer：照相機播報', () => {
  function makeTopo(camera: SpeedCamera): FreewayTopo {
    return {
      version: 'test',
      generatedAt: '',
      routes: [
        {
          id: 'X',
          name: 'X線',
          displayLabels: { inc: '南下', dec: '北上' },
          bbox: [0, 0, 0, 1],
          coords: [
            [0, 0],
            [0, 1],
          ],
          mileageIndex: [0, 100],
        },
      ],
      facilities: [],
      transitions: [],
      cameras: [camera],
    };
  }

  function fixAt(mileage: number, speedKmh: number): GeoFix {
    // coords 為 [0,0]→[0,1] 對應 mileageIndex [0,100]，緯度與里程線性對應
    return {
      lat: mileage / 100,
      lng: 0,
      speed: speedKmh / 3.6,
      heading: 0,
      accuracy: 5,
      timestamp: Date.now(),
    };
  }

  it('進入 1km 內只播報一次，文字含「測速照相」', () => {
    const camera: SpeedCamera = {
      id: 'CAM-X-10.000',
      routeId: 'X',
      cameraType: 'fixed',
      mileage: 10,
      lat: 0.1,
      lng: 0,
      serves: 'BOTH',
      speedLimitKmh: 100,
    };
    const ctx = createTrackerContext(makeTopo(camera));
    let state = initialTrackerState();
    // 建立方向與路線鎖定：先餵幾筆遞增里程讓方向判定 LOCKED
    for (const m of [5, 5.06, 5.12, 5.18]) {
      state = trackerReducer(ctx, state, { type: 'FIX', fix: fixAt(m, 90) });
    }
    expect(state.direction).toBe('INCREASING');
    // 前方清單不受播報距離限制（仿 facilities），但距離尚遠（~4.8km）不觸發播報
    expect(state.upcomingCameras.map((c) => c.id)).toEqual([camera.id]);
    expect(state.announcements.filter((a) => a.facilityId === camera.id).length).toBe(0);

    state = trackerReducer(ctx, state, { type: 'FIX', fix: fixAt(9.5, 90) }); // 0.5km，進入播報範圍
    const announced = state.announcements.filter((a) => a.facilityId === camera.id);
    expect(announced.length).toBe(1);
    expect(announced[0].text).toContain('測速照相');
    expect(announced[0].text).not.toContain('超速');

    state = trackerReducer(ctx, state, { type: 'CONSUME_ANNOUNCEMENTS' });
    state = trackerReducer(ctx, state, { type: 'FIX', fix: fixAt(9.4, 90) }); // 仍在範圍內，不重播
    expect(state.announcements.length).toBe(0);
  });

  it('車速超過速限＋容忍值時，播報文字含超速警語', () => {
    const camera: SpeedCamera = {
      id: 'CAM-X-10.000',
      routeId: 'X',
      cameraType: 'fixed',
      mileage: 10,
      lat: 0.1,
      lng: 0,
      serves: 'BOTH',
      speedLimitKmh: 90,
    };
    const ctx = createTrackerContext(makeTopo(camera));
    let state = initialTrackerState();
    // 多跑幾筆讓 EMA 平滑速度收斂到 110 附近（單筆 EMA_ALPHA=0.3，需約 10 筆才收斂超過 95 門檻）
    let m = 5;
    for (let i = 0; i < 10; i++) {
      state = trackerReducer(ctx, state, { type: 'FIX', fix: fixAt(m, 110) });
      m += 0.06;
    }
    state = trackerReducer(ctx, state, { type: 'FIX', fix: fixAt(9.5, 110) }); // 速限90+容忍5=95，110超速
    const announced = state.announcements.filter((a) => a.facilityId === camera.id);
    expect(announced.length).toBe(1);
    expect(announced[0].text).toContain('超速');
  });
});
