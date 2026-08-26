// OFF_HIGHWAY 待命畫面：顯示離目前位置最近的國道，以及該國道雙向最近的交流道/服務區。

import type { NearestHighwayInfo, RouteGeometry, UpcomingFacility } from '../types';

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

function DirectionColumn({ label, facilities }: { label: string; facilities: UpcomingFacility[] }) {
  return (
    <div className="flex-1 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 text-sm font-bold text-emerald-300">{label}</div>
      {facilities.length === 0 ? (
        <div className="text-xs text-white/40">無資料</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {facilities.map((f) => (
            <li key={f.id} className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <span className="mr-1 text-[10px] text-white/40">{TYPE_LABEL[f.type]}</span>
                <span className="truncate text-sm font-medium text-white">{f.name}</span>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums text-white/60">
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
      <div className="mb-3 flex items-center justify-center gap-1.5 text-sm text-white/50">
        <LocationIcon />
        <span>
          距離最近的{route?.name ?? info.routeId} {info.distanceKm.toFixed(1)} 公里
        </span>
      </div>
      <div className="flex gap-3">
        <DirectionColumn label={route?.displayLabels.inc ?? '遞增方向'} facilities={info.increasing} />
        <DirectionColumn label={route?.displayLabels.dec ?? '遞減方向'} facilities={info.decreasing} />
      </div>
    </div>
  );
}
