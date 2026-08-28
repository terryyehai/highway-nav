// 設施類型標籤與顯示名稱：名稱資料本身常含類型後綴（如「西屯二交流道」「楊梅休息站」），
// 與類型標籤並列顯示時會重複或不符（同為 junction 的資料裡混雜「OO系統交流道」「OO系統」
// 「OO轉接道」等不同後綴；rest_area 也混雜「服務區」「休息站」兩種官方分類，並非同義詞），
// 因此標籤與顯示名稱都需以「實際比對到的後綴」為準，而非整個類型固定套用同一個詞。
import type { FacilityType } from '../types';

/** 找不到已知後綴時的預設標籤（如「古坑(北)」「中壢轉接一」等自訂命名） */
export const FACILITY_TYPE_LABEL: Record<FacilityType, string> = {
  interchange: '交流道',
  rest_area: '服務區',
  junction: '系統交流道',
};

/** 依長度由長到短排序，避免「系統交流道」被短的「系統」搶先比對到只剩半截 */
const TYPE_NAME_SUFFIXES: Record<FacilityType, string[]> = {
  interchange: ['交流道'],
  rest_area: ['服務區', '休息站'],
  junction: ['系統交流道', '轉接道', '系統'],
};

function matchedSuffix(name: string, type: FacilityType): string | null {
  return TYPE_NAME_SUFFIXES[type].find((suffix) => name.endsWith(suffix)) ?? null;
}

/** 顯示用類型標籤：優先採用名稱實際的後綴，找不到才退回該類型的預設詞 */
export function facilityTypeLabel(name: string, type: FacilityType): string {
  return matchedSuffix(name, type) ?? FACILITY_TYPE_LABEL[type];
}

/** 顯示用名稱：去除與類型標籤重複的後綴 */
export function facilityDisplayName(name: string, type: FacilityType): string {
  const suffix = matchedSuffix(name, type);
  return suffix ? name.slice(0, -suffix.length) : name;
}
