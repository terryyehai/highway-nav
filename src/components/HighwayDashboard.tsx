// 主儀表板：依 TrackerPhase 分支呈現。台灣公路指標風格（暖米白底／公路深綠字），F 點視角、Zero-Touch。

import { AnimatePresence } from 'framer-motion';
import type { RouteGeometry, TrackerState } from '../types';
import type { GeoErrorKind } from '../hooks/useHighwayTracker';
import { FacilityCard } from './FacilityCard';
import { TopoSwitch } from './TopoSwitch';
import { NearestHighwayPanel } from './NearestHighwayPanel';
import { HighwayBadge } from './HighwayBadge';

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
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-3xl font-bold text-highway-green">{title}</div>
      {detail && <div className="text-base text-highway-green/60">{detail}</div>}
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
    return (
      <StatusScreen title="未在國道上" detail="進入國道後自動開始導航">
        {state.nearestHighway && (
          <NearestHighwayPanel info={state.nearestHighway} routes={routes} />
        )}
      </StatusScreen>
    );
  }

  // TRACKING
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      {/* 頂列：路線徽章 / 方向 / 里程 / 車速 */}
      <div className="flex items-center justify-between rounded-2xl border border-signboard-line bg-white/50 px-4 py-3">
        <div className="flex items-center gap-3">
          {route && <HighwayBadge routeId={route.id} size={40} />}
          <span className="text-2xl font-bold text-highway-green">{route?.name ?? '—'}</span>
          {dirLabel ? (
            <span className="rounded-lg bg-highway-green px-2 py-0.5 text-lg font-bold text-white">
              {dirLabel}
            </span>
          ) : (
            <span className="rounded-lg border border-signboard-line px-2 py-0.5 text-sm text-highway-green/60">
              判定方向中
            </span>
          )}
          {state.isDeadReckoning && (
            <span className="rounded-lg bg-shield-red/15 px-2 py-0.5 text-sm font-bold text-shield-red">
              隧道推算中
            </span>
          )}
          {state.isOffline && (
            <span className="rounded-lg bg-shield-red/15 px-2 py-0.5 text-sm text-shield-red">
              離線
            </span>
          )}
        </div>
        <div className="text-right font-mono tabular-nums">
          <div className="text-xl font-bold text-highway-green">
            {state.currentMileage.toFixed(1)}
            <span className="text-sm text-highway-green/50">K</span>
          </div>
          <div className="text-sm text-highway-green/60">{Math.round(state.speedKmh)} km/h</div>
        </div>
      </div>

      {/* 設施卡片：最近者最大（F 點視角） */}
      <div className="flex flex-1 flex-col gap-3">
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
        <div className="flex justify-center pb-1">
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
