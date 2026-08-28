// OFF_HIGHWAY 待命畫面：顯示離目前位置最近的國道/快速公路，及其雙向最近的交流道/服務區。
// 方向未定，兩個方向都要看，因此採「上下堆疊、各自滿版」而非左右分欄擠壓小字。

import type { NearestHighwayInfo, RouteGeometry, UpcomingFacility } from '../types';
import { HighwayBadge } from './HighwayBadge';
import { AutoFitText } from './AutoFitText';
import { routeColorScheme } from '../utils/routeColor';
import { FACILITY_TYPE_LABEL, facilityDisplayName } from '../utils/facilityLabel';

function LocationIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

function DirectionSection({
  label,
  facilities,
  routeId,
}: {
  label: string;
  facilities: UpcomingFacility[];
  routeId: string;
}) {
  const c = routeColorScheme(routeId);
  return (
    <div className={c.bg}>
      <div className={`px-6 py-4 text-3xl font-bold ${c.text} ${c.bgSoft}`}>{label}</div>
      {facilities.length === 0 ? (
        <div className={`px-6 py-6 text-2xl ${c.textSub}`}>無資料</div>
      ) : (
        <ul>
          {facilities.map((f, i) => (
            <li
              key={f.id}
              className={`flex items-center gap-4 px-6 py-5 ${i > 0 ? `border-t ${c.divider}` : ''}`}
            >
              <HighwayBadge routeId={routeId} size={54} />
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className={`shrink-0 text-base ${c.textSub}`}>{FACILITY_TYPE_LABEL[f.type]}</span>
                <AutoFitText
                  text={facilityDisplayName(f.name, f.type)}
                  className={`min-w-0 flex-1 font-bold ${c.text}`}
                  maxFontPx={36}
                  minFontPx={18}
                />
              </div>
              <span className={`shrink-0 font-mono text-4xl tabular-nums ${c.text}`}>
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
    <div className="flex w-full flex-1 flex-col">
      <div className="flex items-center justify-center gap-2 pb-6 text-2xl text-highway-green/60">
        <LocationIcon className="h-7 w-7" />
        <span>
          距離最近的{route?.name ?? info.routeId} {info.distanceKm.toFixed(1)} 公里
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <DirectionSection
          label={route?.displayLabels.inc ?? '遞增方向'}
          facilities={info.increasing}
          routeId={info.routeId}
        />
        <DirectionSection
          label={route?.displayLabels.dec ?? '遞減方向'}
          facilities={info.decreasing}
          routeId={info.routeId}
        />
      </div>
    </div>
  );
}
