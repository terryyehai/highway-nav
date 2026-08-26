// OFF_HIGHWAY 待命畫面：顯示離目前位置最近的國道/快速公路，及其雙向最近的交流道/服務區。
// 仿公路告示牌列表：徽章 + 地名，項目間水平分割線。

import type { NearestHighwayInfo, RouteGeometry, UpcomingFacility } from '../types';
import { HighwayBadge } from './HighwayBadge';

const TYPE_LABEL: Record<UpcomingFacility['type'], string> = {
  interchange: '交流道',
  rest_area: '服務區',
  junction: '系統',
};

function LocationIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

function DirectionColumn({
  label,
  facilities,
  routeId,
}: {
  label: string;
  facilities: UpcomingFacility[];
  routeId: string;
}) {
  return (
    <div className="flex-1 rounded-xl border border-signboard-line bg-white/50">
      <div className="border-b border-signboard-line px-3 py-2 text-sm font-bold text-highway-green">
        {label}
      </div>
      {facilities.length === 0 ? (
        <div className="px-3 py-3 text-xs text-highway-green/40">無資料</div>
      ) : (
        <ul>
          {facilities.map((f, i) => (
            <li
              key={f.id}
              className={`flex items-center gap-2 px-3 py-2.5 ${
                i > 0 ? 'border-t border-signboard-line' : ''
              }`}
            >
              <HighwayBadge routeId={routeId} size={22} />
              <div className="min-w-0 flex-1">
                <span className="mr-1 text-[10px] text-highway-green/40">
                  {TYPE_LABEL[f.type]}
                </span>
                <span className="truncate text-sm font-bold text-highway-green">{f.name}</span>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums text-highway-green/60">
                {f.distanceKm.toFixed(1)} km
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NearestHighwayPanel({
  info,
  routes,
}: {
  info: NearestHighwayInfo;
  routes: RouteGeometry[];
}) {
  const route = routes.find((r) => r.id === info.routeId);
  return (
    <div className="mt-6 w-full max-w-sm text-left">
      <div className="mb-3 flex items-center justify-center gap-1.5 text-sm text-highway-green/60">
        <LocationIcon />
        <span>
          距離最近的{route?.name ?? info.routeId} {info.distanceKm.toFixed(1)} 公里
        </span>
      </div>
      <div className="flex gap-3">
        <DirectionColumn
          label={route?.displayLabels.inc ?? '遞增方向'}
          facilities={info.increasing}
          routeId={info.routeId}
        />
        <DirectionColumn
          label={route?.displayLabels.dec ?? '遞減方向'}
          facilities={info.decreasing}
          routeId={info.routeId}
        />
      </div>
    </div>
  );
}
