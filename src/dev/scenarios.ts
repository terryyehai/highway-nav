// DEV 專用畫面情境目錄：涵蓋常見駕駛情境＋依實際圖資算出的極端文字長度案例，
// 供 ScenarioHarness 直接餵給 HighwayDashboard 渲染（跳過 GPS/reducer），
// 讓 Playwright 能在不同螢幕寬度下逐一截查有無文字重疊、溢出或被裁切。
import topoJson from '../data/freeway-topo.json';
import type {
  Facility,
  FreewayTopo,
  TrackerState,
  UpcomingCamera,
  UpcomingFacility,
} from '../types';
import type { GeoErrorKind } from '../hooks/useHighwayTracker';

const topo = topoJson as unknown as FreewayTopo;
export const scenarioRoutes = topo.routes;

function facility(predicate: (f: Facility) => boolean): Facility {
  const f = topo.facilities.find(predicate);
  if (!f) throw new Error('scenario fixture: facility not found');
  return f;
}

function upcoming(f: Facility, distanceKm: number, speedKmh = 90): UpcomingFacility {
  return {
    ...f,
    distanceKm,
    etaSeconds: speedKmh >= 5 ? Math.round((distanceKm / speedKmh) * 3600) : null,
  };
}

let camSeq = 0;
function camera(
  routeId: string,
  speedLimitKmh: number | null,
  distanceKm: number,
  speedKmh = 90,
): UpcomingCamera {
  camSeq += 1;
  return {
    id: `harness-cam-${camSeq}`,
    routeId,
    cameraType: 'fixed',
    mileage: 0,
    lat: 0,
    lng: 0,
    serves: 'BOTH',
    speedLimitKmh,
    distanceKm,
    etaSeconds: speedKmh >= 5 ? Math.round((distanceKm / speedKmh) * 3600) : null,
  };
}

function baseState(overrides: Partial<TrackerState>): TrackerState {
  return {
    phase: 'TRACKING',
    currentRouteId: null,
    currentMileage: 0,
    direction: 'UNKNOWN',
    speedKmh: 90,
    speedLimitKmh: null,
    upcomingFacilities: [],
    upcomingCameras: [],
    isDeadReckoning: false,
    isOffline: false,
    lastFix: null,
    announcements: [],
    announcedIds: [],
    cameraAnnouncedIds: [],
    dir: {
      status: 'LOCKED',
      candidate: 'INCREASING',
      streak: 5,
      accumulatedKm: 1,
      lastMileage: 0,
      reverseStreak: 0,
      reverseAccumKm: 0,
    },
    offMatchStreak: 0,
    manualTopoLock: null,
    dr: null,
    nearestHighway: null,
    ...overrides,
  };
}

export interface Scenario {
  key: string;
  description: string;
  geoError: GeoErrorKind;
  state: TrackerState;
}

// 各類型目前圖資中顯示名稱最長的案例（見 scripts/audit-text-lengths.ts）
const LONGEST_INTERCHANGE = facility((f) => f.name === '八里二,臺北港交流道'); // E61
const LONGEST_JUNCTION = facility((f) => f.name === '瑪東系統交流道'); // E62
const LONGEST_REST_AREA = facility((f) => f.name === '東草屯休息站'); // N6
const N1_INTERCHANGE_A = facility((f) => f.routeId === 'N1' && f.type === 'interchange');
const N1_INTERCHANGES = topo.facilities.filter((f) => f.routeId === 'N1' && f.type === 'interchange');
const E74_FACILITIES = topo.facilities
  .filter((f) => f.routeId === 'E74')
  .sort((a, b) => a.mileage - b.mileage);

export const SCENARIOS: Scenario[] = [
  {
    key: 'off_highway_both_directions',
    description: 'OFF_HIGHWAY：雙向皆有鄰近設施資料',
    geoError: null,
    state: baseState({
      phase: 'OFF_HIGHWAY',
      currentRouteId: null,
      nearestHighway: {
        routeId: 'E74',
        distanceKm: 0.2,
        increasing: E74_FACILITIES.slice(0, 3).map((f, i) => upcoming(f, 10 + i, 0)),
        decreasing: E74_FACILITIES.slice(3, 6).map((f, i) => upcoming(f, 8 + i, 0)),
      },
    }),
  },
  {
    key: 'off_highway_worst_case_names',
    description: 'OFF_HIGHWAY：兩個方向都塞進目前圖資最長的設施名稱',
    geoError: null,
    state: baseState({
      phase: 'OFF_HIGHWAY',
      nearestHighway: {
        routeId: 'E61',
        distanceKm: 0.3,
        increasing: [upcoming(LONGEST_INTERCHANGE, 12.3, 0), upcoming(LONGEST_JUNCTION, 24.6, 0)],
        decreasing: [upcoming(LONGEST_REST_AREA, 8.9, 0)],
      },
    }),
  },
  {
    key: 'off_highway_one_side_empty',
    description: 'OFF_HIGHWAY：單一方向無資料（無資料文案 + 另一側正常清單並存）',
    geoError: null,
    state: baseState({
      phase: 'OFF_HIGHWAY',
      nearestHighway: {
        routeId: 'N1',
        distanceKm: 1.1,
        increasing: N1_INTERCHANGES.slice(0, 3).map((f, i) => upcoming(f, 5 + i * 3, 0)),
        decreasing: [],
      },
    }),
  },
  {
    key: 'tracking_direction_pending',
    description: 'TRACKING：剛上國道、方向判定中（無方向徽章）',
    geoError: null,
    state: baseState({
      phase: 'TRACKING',
      currentRouteId: 'N1',
      currentMileage: 20,
      direction: 'UNKNOWN',
      upcomingFacilities: N1_INTERCHANGES.slice(0, 3).map((f, i) => upcoming(f, 0.5 + i * 2)),
    }),
  },
  {
    key: 'tracking_normal',
    description: 'TRACKING：一般行駛，一般長度名稱',
    geoError: null,
    state: baseState({
      currentRouteId: 'N1',
      currentMileage: 20,
      direction: 'INCREASING',
      upcomingFacilities: N1_INTERCHANGES.slice(0, 3).map((f, i) => upcoming(f, 0.5 + i * 3)),
    }),
  },
  {
    key: 'tracking_worst_case_names',
    description: 'TRACKING：三張卡片同時是三種類型目前最長的顯示名稱',
    geoError: null,
    state: baseState({
      currentRouteId: 'E61',
      currentMileage: 0,
      direction: 'INCREASING',
      upcomingFacilities: [
        upcoming(LONGEST_INTERCHANGE, 0.4),
        upcoming({ ...LONGEST_JUNCTION, routeId: 'E61' }, 3.2),
        upcoming({ ...LONGEST_REST_AREA, routeId: 'E61' }, 9.8),
      ],
    }),
  },
  {
    key: 'tracking_triple_badge_long_route_name',
    description: 'TRACKING：方向＋隧道推算中＋離線三個徽章同時出現，且路線名稱是目前最長的 N1H',
    geoError: null,
    state: baseState({
      currentRouteId: 'N1H',
      currentMileage: 15,
      direction: 'INCREASING',
      isDeadReckoning: true,
      isOffline: true,
      upcomingFacilities: N1_INTERCHANGES.slice(0, 2).map((f, i) => upcoming({ ...f, routeId: 'N1H' }, 1 + i * 4)),
    }),
  },
  {
    key: 'tracking_paired_topo_switch',
    description: 'TRACKING：顯示高架/平面切換按鈕，且路線名稱較長',
    geoError: null,
    state: baseState({
      currentRouteId: 'N1H',
      currentMileage: 15,
      direction: 'DECREASING',
      upcomingFacilities: N1_INTERCHANGES.slice(0, 3).map((f, i) => upcoming({ ...f, routeId: 'N1H' }, 2 + i * 5)),
    }),
  },
  {
    key: 'tracking_over_speed',
    description: 'TRACKING：超速警示（車速紅色脈動 + 速限標誌）',
    geoError: null,
    state: baseState({
      currentRouteId: 'N1',
      currentMileage: 20,
      direction: 'INCREASING',
      speedKmh: 118,
      speedLimitKmh: 100,
      upcomingFacilities: N1_INTERCHANGES.slice(0, 3).map((f, i) => upcoming(f, 1 + i * 3, 118)),
    }),
  },
  {
    key: 'tracking_congested',
    description: 'TRACKING：塞車中標籤（最近設施 ETA 旁）',
    geoError: null,
    state: baseState({
      currentRouteId: 'N1',
      currentMileage: 20,
      direction: 'INCREASING',
      speedKmh: 12,
      upcomingFacilities: N1_INTERCHANGES.slice(0, 3).map((f, i) => upcoming(f, 0.3 + i * 1.5, 12)),
    }),
  },
  {
    key: 'tracking_cameras_stack',
    description: 'TRACKING：三則測速照相同時出現，速限位數不同（個位/十位/百位）+ 一則超速請減速',
    geoError: null,
    state: baseState({
      currentRouteId: 'N1',
      currentMileage: 20,
      direction: 'INCREASING',
      speedKmh: 110,
      speedLimitKmh: 100,
      upcomingCameras: [
        camera('N1', 5, 0.3, 110),
        camera('N1', 50, 1.8, 110),
        camera('N1', 100, 4.2, 110),
      ],
      upcomingFacilities: N1_INTERCHANGES.slice(0, 2).map((f, i) => upcoming(f, 5 + i * 3, 110)),
    }),
  },
  {
    key: 'tracking_loop_route',
    description: 'TRACKING：環狀公路（正向/逆向標籤），驗證非南北/東西文字也不會撐爆版面',
    geoError: null,
    state: baseState({
      currentRouteId: 'E74',
      currentMileage: 10,
      direction: 'INCREASING',
      upcomingFacilities: E74_FACILITIES.slice(3, 6).map((f, i) => upcoming(f, 1 + i * 2)),
    }),
  },
  {
    key: 'tracking_zero_facilities',
    description: 'TRACKING：方向已判定但前方無設施資料',
    geoError: null,
    state: baseState({
      currentRouteId: 'N1',
      currentMileage: 20,
      direction: 'INCREASING',
      upcomingFacilities: [],
    }),
  },
  {
    key: 'tracking_far_distance_digits',
    description: 'TRACKING：距離拉到 3 位數，檢查等寬數字大字級是否撐爆版面',
    geoError: null,
    state: baseState({
      currentRouteId: 'N1',
      currentMileage: 0,
      direction: 'INCREASING',
      speedKmh: 90,
      upcomingFacilities: [
        upcoming(N1_INTERCHANGE_A, 128.4),
        ...N1_INTERCHANGES.slice(1, 3).map((f, i) => upcoming(f, 140 + i * 5)),
      ],
    }),
  },
];
