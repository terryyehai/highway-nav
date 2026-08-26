// 高架/平面手動切換：GPS 垂直誤判時的實體防呆；切換後 10km 內封鎖自動判定。

import type { RouteGeometry } from '../types';

export function TopoSwitch({
  routes,
  currentRouteId,
  lockedRouteId,
  onSwitch,
}: {
  routes: RouteGeometry[];
  currentRouteId: string;
  lockedRouteId: string | null;
  onSwitch: (toRouteId: string) => void;
}) {
  const current = routes.find((r) => r.id === currentRouteId);
  if (!current?.pairedRouteId) return null;
  const paired = routes.find((r) => r.id === current.pairedRouteId);
  if (!paired) return null;

  const isElevated = currentRouteId.endsWith('H');

  return (
    <button
      onClick={() => onSwitch(paired.id)}
      className="flex items-center gap-2 rounded-xl border border-highway-green bg-white/50 px-4 py-3 text-lg font-bold text-highway-green active:bg-white/80"
    >
      <span>{isElevated ? '高架' : '平面'}</span>
      <span className="text-highway-green/40">⇄</span>
      <span className="text-highway-green/50">{isElevated ? '平面' : '高架'}</span>
      {lockedRouteId && (
        <span className="ml-1 rounded bg-shield-red/15 px-1.5 py-0.5 text-xs text-shield-red">
          手動鎖定
        </span>
      )}
    </button>
  );
}
