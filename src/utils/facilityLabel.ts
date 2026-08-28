// 設施類型標籤與顯示名稱：名稱資料本身已含類型後綴（如「西屯二交流道」），
// 與類型標籤並列顯示時會重複，因此顯示用名稱需去除後綴。
import type { FacilityType } from '../types';

export const FACILITY_TYPE_LABEL: Record<FacilityType, string> = {
  interchange: '交流道',
  rest_area: '服務區',
  junction: '系統交流道',
};

export function facilityDisplayName(name: string, type: FacilityType): string {
  const suffix = FACILITY_TYPE_LABEL[type];
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}
