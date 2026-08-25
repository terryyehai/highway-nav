// 速度平滑與 ETA 計算。

/** 指數移動平均係數（約等效近 6 筆平均） */
const EMA_ALPHA = 0.3;
/** 低於此速度不顯示 ETA */
export const ETA_MIN_SPEED_KMH = 5;
/** 塞車 badge 門檻 */
export const CONGESTION_SPEED_KMH = 20;

/**
 * 更新平滑時速。
 * gpsSpeedMs：GPS 提供的 m/s（可能 null / 0）；
 * fallbackKmh：由里程差/時間差推算的時速（gpsSpeed 不可用時採用）。
 */
export function smoothSpeed(
  prevKmh: number,
  gpsSpeedMs: number | null,
  fallbackKmh: number | null,
): number {
  let raw: number | null = null;
  if (gpsSpeedMs !== null && gpsSpeedMs >= 0) raw = gpsSpeedMs * 3.6;
  else if (fallbackKmh !== null && fallbackKmh >= 0) raw = fallbackKmh;
  if (raw === null) return prevKmh;
  // 不合理的瞬時值（>200km/h）視為雜訊
  if (raw > 200) return prevKmh;
  return EMA_ALPHA * raw + (1 - EMA_ALPHA) * prevKmh;
}

/** 由里程差推算時速（GPS speed 欄位不可靠時的 fallback） */
export function speedFromMileage(
  deltaMileageKm: number,
  deltaTimeMs: number,
): number | null {
  if (deltaTimeMs <= 0) return null;
  return Math.abs(deltaMileageKm) / (deltaTimeMs / 3600000);
}

/** ETA 秒數；速度過低回傳 null（UI 顯示 --:--） */
export function etaSeconds(distanceKm: number, speedKmh: number): number | null {
  if (speedKmh < ETA_MIN_SPEED_KMH) return null;
  return Math.round((distanceKm / speedKmh) * 3600);
}

/** ETA 顯示節流：變化 < 30 秒不更新 */
export function etaChanged(prev: number | null, next: number | null): boolean {
  if (prev === null || next === null) return prev !== next;
  return Math.abs(prev - next) >= 30;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}時${m % 60}分`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
