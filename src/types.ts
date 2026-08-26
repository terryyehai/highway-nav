// 台灣國道即時導航 — 共用型別定義

/**
 * 行進方向以「里程遞增/遞減」抽象表達。
 * 台灣國道里程 0K 多在北端/西端：遞增 = 南下/東行，遞減 = 北上/西行。
 * UI 顯示標籤由 RouteGeometry.displayLabels 查表，勿在邏輯層寫死南北。
 */
export type Direction = 'INCREASING' | 'DECREASING' | 'UNKNOWN';

export type FacilityType = 'interchange' | 'rest_area' | 'junction';

/** 設施服務的方向（單向出口/單邊服務區） */
export type Serves = 'BOTH' | 'INCREASING' | 'DECREASING';

export interface Facility {
  id: string;
  routeId: string;
  name: string;
  type: FacilityType;
  mileage: number; // 國道絕對里程 (km)
  lat: number;
  lng: number;
  serves: Serves;
}

/** 依官方里程區間劃分的速限路段（來源：tisvcloud Section.xml <SpeedLimit>，km/h） */
export interface SpeedLimitSegment {
  fromKm: number;
  toKm: number;
  limit: number;
}

export type CameraType = 'fixed' | 'section_avg_start' | 'section_avg_end';

export interface SpeedCamera {
  id: string;
  routeId: string;
  cameraType: CameraType;
  mileage: number; // 國道絕對里程 (km)
  lat: number;
  lng: number;
  serves: Serves;
  speedLimitKmh: number | null;
  /** section_avg_start/end 時指向配對的另一端 id（供未來串接區間執法用，目前資料為空） */
  sectionPartnerId?: string;
}

export interface UpcomingCamera extends SpeedCamera {
  distanceKm: number;
  /** 預估抵達秒數；null = 速度過低無法估算 */
  etaSeconds: number | null;
}

export interface RouteGeometry {
  id: string;            // 'N1' | 'N1H' | 'N2' ...
  name: string;          // 國道1號
  displayLabels: { inc: string; dec: string }; // e.g. { inc: '南下', dec: '北上' }
  bbox: [number, number, number, number];      // [minLng, minLat, maxLng, maxLat]
  coords: Array<[number, number]>;             // [lng, lat]，依里程遞增排序
  mileageIndex: number[];                      // 與 coords 一一對應的官方里程 (km)
  /** 高架/平面對應線 id（存在時 map matching 需同時比對） */
  pairedRouteId?: string;
  /** 高架線：全掃描模糊時優先吸附平面主線（手動 TopoSwitch 可修正） */
  isElevated?: boolean;
  /** 依里程遞增排序；僅國道有此資料（快速公路資料源無速限欄位） */
  speedLimits?: SpeedLimitSegment[];
}

export interface TriggerZone {
  lat: number;
  lng: number;
  radius: number; // meters
}

export interface TopologyTransition {
  id: string;
  name: string;
  fromRouteId: string;
  toRouteId: string;
  direction: Direction;
  triggerZone: TriggerZone;
  mileageOnFrom: number;
}

export interface FreewayTopo {
  version: string;
  generatedAt: string;
  routes: RouteGeometry[];
  facilities: Facility[];
  transitions: TopologyTransition[];
  cameras: SpeedCamera[];
}

export interface UpcomingFacility extends Facility {
  distanceKm: number;
  /** 預估抵達秒數；null = 速度過低無法估算 */
  etaSeconds: number | null;
}

/** OFF_HIGHWAY 待命時：離目前位置最近的國道座標點，供顯示雙向鄰近交流道參考 */
export interface NearestHighwayInfo {
  routeId: string;
  /** 目前位置到該國道最近點的直線距離 (km) */
  distanceKm: number;
  /** 沿該國道往里程遞增方向最近的設施 */
  increasing: UpcomingFacility[];
  /** 沿該國道往里程遞減方向最近的設施 */
  decreasing: UpcomingFacility[];
}

/** 由 GeoProvider 抽象出的定位事件（與 GeolocationPosition 解耦，方便測試） */
export interface GeoFix {
  lat: number;
  lng: number;
  /** m/s，null 表示裝置未提供 */
  speed: number | null;
  /** 度，null 表示無效 */
  heading: number | null;
  accuracy: number; // meters
  timestamp: number; // ms epoch
}

export type TrackerPhase =
  | 'INIT'          // 尚未取得任何有效定位
  | 'TRACKING'      // 在國道上正常追蹤
  | 'OFF_HIGHWAY'   // 不在國道上（待命）
  | 'SIGNAL_LOST';  // Dead Reckoning 超時，GPS 訊號遺失

export interface Announcement {
  facilityId: string;
  text: string;
}

export interface TrackerState {
  phase: TrackerPhase;
  currentRouteId: string | null;
  currentMileage: number;
  direction: Direction;
  /** 指數移動平均後的時速 */
  speedKmh: number;
  /** 目前里程所在路段之官方速限 (km/h)；無資料（快速公路）或不在國道上為 null */
  speedLimitKmh: number | null;
  upcomingFacilities: UpcomingFacility[];
  upcomingCameras: UpcomingCamera[];
  isDeadReckoning: boolean;
  isOffline: boolean;
  lastFix: GeoFix | null;
  /** 待 UI 消費的 TTS 播報（消費後以 consumeAnnouncements 清空） */
  announcements: Announcement[];
  /** 已播報過且仍在 upcoming 清單內的設施 id */
  announcedIds: string[];
  /** 已播報過且仍在 upcomingCameras 清單內的照相機 id */
  cameraAnnouncedIds: string[];
  /** 方向判定內部狀態 */
  dir: DirectionJudgeState;
  /** off-highway 判定：連續超出吸附閾值的次數 */
  offMatchStreak: number;
  /** 手動高架/平面切換鎖：至該里程前封鎖自動 trigger zone */
  manualTopoLock: { routeId: string; sinceMileage: number } | null;
  /** Dead Reckoning 內部狀態 */
  dr: DeadReckoningState | null;
  /** OFF_HIGHWAY 時：離目前位置最近的國道與雙向鄰近交流道；其餘 phase 為 null */
  nearestHighway: NearestHighwayInfo | null;
}

export interface DirectionJudgeState {
  status: 'UNKNOWN' | 'CANDIDATE' | 'LOCKED';
  candidate: Direction;
  streak: number;        // 連續同號 Δmileage 筆數
  accumulatedKm: number; // 累積位移
  lastMileage: number | null;
  /** LOCKED 後偵測反向的計數 */
  reverseStreak: number;
  reverseAccumKm: number;
}

export interface DeadReckoningState {
  startedAt: number;      // ms epoch
  lastTickAt: number;
  estimatedMileage: number;
  speedKmh: number;       // 推進速度（隨時間衰減）
}

/** 與 navigator.geolocation 對齊的注入介面（模擬器/測試共用） */
export interface GeoProvider {
  watchPosition(
    onFix: (fix: GeoFix) => void,
    onError: (err: { code: number; message: string }) => void,
    options?: { enableHighAccuracy?: boolean; maximumAge?: number; timeout?: number },
  ): number;
  clearWatch(watchId: number): void;
}
