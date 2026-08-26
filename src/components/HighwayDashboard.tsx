// 主儀表板：依 TrackerPhase 分支呈現。台灣公路指標風格（暖米白底／公路深綠字），F 點視角、Zero-Touch。

import { AnimatePresence } from 'framer-motion';
import type { RouteGeometry, TrackerState } from '../types';
import type { GeoErrorKind } from '../hooks/useHighwayTracker';
import { FacilityCard } from './FacilityCard';
import { TopoSwitch } from './TopoSwitch';
import { NearestHighwayPanel } from './NearestHighwayPanel';
import { HighwayBadge } from './HighwayBadge';
import { routeColorScheme } from '../utils/routeColor';

function StatusScreen({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="text-7xl font-bold text-highway-green">{title}</div>
      {detail && <div className="text-3xl text-highway-green/60">{detail}</div>}
      {children}
    </div>
  );
}

export function HighwayDashboard({
  state,
  geoError,
  routes,
  onTopoSwitch,
}: {
  state: TrackerState;
  geoError: GeoErrorKind;
  routes: RouteGeometry[];
  onTopoSwitch: (toRouteId: string) => void;
}) {
  const route = routes.find((r) => r.id === state.currentRouteId);
  const dirLabel =
    route && state.direction !== 'UNKNOWN'
      ? state.direction === 'INCREASING'
        ? route.displayLabels.inc
        : route.displayLabels.dec
      : null;

  if (geoError === 'PERMISSION_DENIED') {
    return (
      <StatusScreen title="無法取得定位權限" detail="請至瀏覽器設定開啟定位權限後重新載入" />
    );
  }

  if (state.phase === 'INIT') {
    return (
      <StatusScreen
        title="定位中…"
        detail={
          geoError === 'UNAVAILABLE'
            ? '室內或地下室不易收到衛星訊號，請移至戶外或靠近窗邊，行駛於國道上即可自動定位'
            : '等待 GPS 訊號'
        }
      />
    );
  }

  if (state.phase === 'SIGNAL_LOST') {
    return <StatusScreen title="GPS 訊號遺失" detail="收訊恢復後將自動繼續" />;
  }

  if (state.phase === 'OFF_HIGHWAY') {
    // 方向未定，雙向都要顯示：獨立版面（非 StatusScreen 置中留白容器），讓下方面板能真正滿版
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col items-center gap-3 px-6 pb-5 pt-10 text-center">
          <div className="text-7xl font-bold text-highway-green">未在國道上</div>
          <div className="text-3xl text-highway-green/60">進入國道後自動開始導航</div>
        </div>
        {state.nearestHighway ? (
          <NearestHighwayPanel info={state.nearestHighway} routes={routes} />
        ) : (
          <div className="flex flex-1" />
        )}
      </div>
    );
  }

  // TRACKING：僅呈現當前行進方向，滿版告示牌卡片，與 OFF_HIGHWAY 的雙向瀏覽版面刻意分開設計
  const headerColor = route ? routeColorScheme(route.id) : null;
  return (
    <div className="flex flex-1 flex-col gap-0.5">
      {/* 頂列：路線徽章 / 方向 / 里程 / 車速——與下方設施卡同色系，視覺上連成一整組告示牌 */}
      <div
        className={`flex items-center justify-between px-6 py-5 ${
          headerColor ? headerColor.bg : 'bg-highway-green'
        }`}
      >
        <div className="flex items-center gap-4">
          {route && <HighwayBadge routeId={route.id} size={88} />}
          <span className="text-5xl font-bold text-white">{route?.name ?? '—'}</span>
          {dirLabel ? (
            <span className="rounded-lg bg-white/20 px-4 py-1.5 text-3xl font-bold text-white">
              {dirLabel}
            </span>
          ) : (
            <span className="rounded-lg border border-white/30 px-4 py-1.5 text-xl text-white/70">
              判定方向中
            </span>
          )}
          {state.isDeadReckoning && (
            <span className="rounded-lg bg-black/25 px-4 py-1.5 text-xl font-bold text-white">
              隧道推算中
            </span>
          )}
          {state.isOffline && (
            <span className="rounded-lg bg-black/25 px-4 py-1.5 text-xl text-white">離線</span>
          )}
        </div>
        <div className="text-right font-mono tabular-nums">
          <div className="text-5xl font-bold text-white">
            {state.currentMileage.toFixed(1)}
            <span className="text-2xl text-white/60">K</span>
          </div>
          <div className="text-2xl text-white/70">{Math.round(state.speedKmh)} km/h</div>
        </div>
      </div>

      {/* 設施卡片：最近者最大（F 點視角），滿版無側邊留白，僅顯示當前方向 */}
      <div className="flex flex-1 flex-col gap-0.5">
        <AnimatePresence mode="popLayout">
          {state.upcomingFacilities.map((f, i) => (
            <FacilityCard key={f.id} facility={f} rank={i} speedKmh={state.speedKmh} />
          ))}
        </AnimatePresence>
        {state.upcomingFacilities.length === 0 && (
          <StatusScreen
            title={dirLabel ? '前方無設施資料' : '行駛中，判定方向…'}
            detail={dirLabel ? undefined : '行駛約 150 公尺後自動鎖定方向'}
          />
        )}
      </div>

      {/* 底列：高架/平面切換 */}
      {route?.pairedRouteId && (
        <div className="flex justify-center py-3">
          <TopoSwitch
            routes={routes}
            currentRouteId={route.id}
            lockedRouteId={state.manualTopoLock?.routeId ?? null}
            onSwitch={onTopoSwitch}
          />
        </div>
      )}
    </div>
  );
}
