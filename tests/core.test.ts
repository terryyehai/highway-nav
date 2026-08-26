// 核心演算法單元測試：geo / direction / eta / facilities / deadReckoning。

import { describe, expect, it } from 'vitest';
import { haversineM, interpolateMileage, snapToPolyline } from '../src/utils/geo';
import {
  effectiveDirection,
  initialDirectionState,
  judgeDirection,
} from '../src/core/direction';
import { etaSeconds, formatEta, smoothSpeed, speedFromMileage } from '../src/core/eta';
import {
  indexFacilities,
  listMeaningfullyChanged,
  upcomingFacilities,
} from '../src/core/facilities';
import { startDeadReckoning, tickDeadReckoning } from '../src/core/deadReckoning';
import { getSpeedLimitAtMileage } from '../src/core/speedLimit';
import type { Facility, RouteGeometry } from '../src/types';

describe('geo', () => {
  it('haversine 台北-高雄約 300km', () => {
    const d = haversineM(25.033, 121.565, 22.627, 120.301);
    expect(d).toBeGreaterThan(290000);
    expect(d).toBeLessThan(310000);
  });

  it('snap 到直線中點', () => {
    const line: Array<[number, number]> = [
      [121.0, 24.0],
      [121.0, 24.1],
    ];
    const r = snapToPolyline(24.05, 121.001, line);
    expect(r.segmentIndex).toBe(0);
    expect(r.fraction).toBeCloseTo(0.5, 1);
    expect(r.distanceM).toBeGreaterThan(80);
    expect(r.distanceM).toBeLessThan(120);
  });

  it('mileage 內插', () => {
    expect(interpolateMileage([10, 12], 0, 0.5)).toBeCloseTo(11);
  });
});

describe('direction 狀態機', () => {
  const seg = 180; // 線形往南（里程遞增方向朝南）
  it('連續 3 筆遞增且累積 >150m 後 LOCKED', () => {
    let s = initialDirectionState();
    for (const m of [10.0, 10.06, 10.12, 10.18]) {
      s = judgeDirection(s, { mileage: m, heading: null, speedKmh: 90, segmentBearing: seg });
    }
    expect(s.status).toBe('LOCKED');
    expect(effectiveDirection(s)).toBe('INCREASING');
  });

  it('雜訊 (<30m) 不影響判定', () => {
    let s = initialDirectionState();
    for (const m of [10.0, 10.01, 10.005, 10.02]) {
      s = judgeDirection(s, { mileage: m, heading: null, speedKmh: 90, segmentBearing: seg });
    }
    expect(s.status).not.toBe('LOCKED');
  });

  it('LOCKED 後單筆反向不改判，連續 5 筆且累積 >300m 才降級改判', () => {
    let s = initialDirectionState();
    for (const m of [10.0, 10.06, 10.12, 10.18]) {
      s = judgeDirection(s, { mileage: m, heading: null, speedKmh: 90, segmentBearing: seg });
    }
    // 單筆反向
    s = judgeDirection(s, { mileage: 10.1, heading: null, speedKmh: 90, segmentBearing: seg });
    expect(effectiveDirection(s)).toBe('INCREASING');
    // 連續反向（迴轉）
    for (const m of [10.02, 9.94, 9.86, 9.78, 9.7]) {
      s = judgeDirection(s, { mileage: m, heading: null, speedKmh: 90, segmentBearing: seg });
    }
    expect(s.status).toBe('CANDIDATE');
    expect(s.candidate).toBe('DECREASING');
  });

  it('heading 有效時首筆即進 CANDIDATE', () => {
    let s = initialDirectionState();
    s = judgeDirection(s, { mileage: 10, heading: 178, speedKmh: 90, segmentBearing: seg });
    expect(s.status).toBe('CANDIDATE');
    expect(s.candidate).toBe('INCREASING');
  });
});

describe('eta', () => {
  it('EMA 平滑', () => {
    expect(smoothSpeed(100, 25, null)).toBeCloseTo(0.3 * 90 + 0.7 * 100);
  });
  it('GPS speed null 時採里程差 fallback', () => {
    expect(smoothSpeed(0, null, 90)).toBeCloseTo(27);
    expect(speedFromMileage(0.025, 1000)).toBeCloseTo(90);
  });
  it('低速不給 ETA', () => {
    expect(etaSeconds(5, 3)).toBeNull();
    expect(formatEta(null)).toBe('--:--');
  });
  it('正常 ETA', () => {
    expect(etaSeconds(10, 100)).toBe(360);
    expect(formatEta(360)).toBe('6:00');
  });
});

describe('facilities', () => {
  const make = (id: string, mileage: number, serves = 'BOTH', type = 'interchange'): Facility =>
    ({ id, routeId: 'X', name: id, type, mileage, lat: 0, lng: 0, serves }) as Facility;
  const sorted = [
    make('a', 10),
    make('b', 15, 'INCREASING'),
    make('c', 20, 'DECREASING'),
    make('d', 25, 'BOTH', 'junction'),
    make('e', 30),
    make('f', 35),
  ];
  const idx = indexFacilities(sorted);

  it('INCREASING 依方向過濾單向設施並取前 3', () => {
    const r = upcomingFacilities(idx.get('X'), 12, 'INCREASING', 100);
    expect(r.map((f) => f.id)).toEqual(['b', 'd', 'e']); // c 只服務 DECREASING
    expect(r[0].distanceKm).toBeCloseTo(3);
  });

  it('DECREASING 反向', () => {
    const r = upcomingFacilities(idx.get('X'), 28, 'DECREASING', 100);
    expect(r.map((f) => f.id)).toEqual(['d', 'c', 'a']); // b 只服務 INCREASING
  });

  it('剛過站 0.2km 緩衝', () => {
    const r = upcomingFacilities(idx.get('X'), 14.9, 'INCREASING', 100);
    expect(r[0].id).toBe('d'); // b(15) 在 0.2km 緩衝內視為已過
  });

  it('hysteresis：距離差 <0.1km 視為未變', () => {
    const a = upcomingFacilities(idx.get('X'), 12, 'INCREASING', 100);
    const b = upcomingFacilities(idx.get('X'), 12.05, 'INCREASING', 100);
    expect(listMeaningfullyChanged(a, b)).toBe(false);
    const c = upcomingFacilities(idx.get('X'), 12.5, 'INCREASING', 100);
    expect(listMeaningfullyChanged(a, c)).toBe(true);
  });
});

describe('deadReckoning', () => {
  it('依車速推進里程、速度隨時間衰減', () => {
    const t0 = 1700000000000;
    let dr = startDeadReckoning(t0, 100, 90);
    dr = tickDeadReckoning(dr, t0 + 10000, 'INCREASING')!;
    expect(dr.estimatedMileage).toBeCloseTo(100 + 90 * (10 / 3600), 2);
    dr = tickDeadReckoning(dr, t0 + 40000, 'INCREASING')!;
    expect(dr.speedKmh).toBeCloseTo(90 * 0.95, 1);
  });

  it('DECREASING 里程遞減', () => {
    const t0 = 1700000000000;
    let dr = startDeadReckoning(t0, 100, 90);
    dr = tickDeadReckoning(dr, t0 + 10000, 'DECREASING')!;
    expect(dr.estimatedMileage).toBeLessThan(100);
  });

  it('超過 180s 回傳 null（訊號遺失）', () => {
    const t0 = 1700000000000;
    const dr = startDeadReckoning(t0, 100, 90);
    expect(tickDeadReckoning(dr, t0 + 181000, 'INCREASING')).toBeNull();
  });
});

describe('speedLimit', () => {
  const route = {
    speedLimits: [
      { fromKm: 0, toKm: 10, limit: 110 },
      { fromKm: 10, toKm: 20, limit: 90 },
      { fromKm: 20, toKm: 30, limit: 100 },
    ],
  } as RouteGeometry;

  it('落在路段內回傳該路段速限', () => {
    expect(getSpeedLimitAtMileage(route, 5)).toBe(110);
    expect(getSpeedLimitAtMileage(route, 15)).toBe(90);
    expect(getSpeedLimitAtMileage(route, 25)).toBe(100);
  });

  it('落在路段邊界回傳其中一段之速限（交界點兩段皆合理）', () => {
    expect([90, 110]).toContain(getSpeedLimitAtMileage(route, 10));
    expect([90, 100]).toContain(getSpeedLimitAtMileage(route, 20));
  });

  it('超出資料範圍夾附至最近端', () => {
    expect(getSpeedLimitAtMileage(route, -5)).toBe(110);
    expect(getSpeedLimitAtMileage(route, 35)).toBe(100);
  });

  it('路線無速限資料（快速公路）回傳 null', () => {
    expect(getSpeedLimitAtMileage({} as RouteGeometry, 5)).toBeNull();
    expect(getSpeedLimitAtMileage(undefined, 5)).toBeNull();
  });
});
