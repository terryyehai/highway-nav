// 主儀表板：依 TrackerPhase 分支呈現，F 點視角、高對比、Zero-Touch。

import { AnimatePresence } from 'framer-motion';
import type { RouteGeometry, TrackerState } from '../types';
import type { GeoErrorKind, TrackerDiagnostics } from '../hooks/useHighwayTracker';
import { FacilityCard } from './FacilityCard';
import { TopoSwitch } from './TopoSwitch';
import { NearestHighwayPanel } from './NearestHighwayPanel';

function DiagPanel({ diag, state }: { diag: TrackerDiagnostics; state: TrackerState }) {
  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left font-mono text-[11px] leading-relaxed text-white/40">
      <div>版本 {__BUILD_ID__} ／ 已等待 {diag.elapsedSec}s ／ 權限：{diag.permission}</div>
      <div>
        watchPosition 呼叫 {diag.wpCalls} 次／成功 {diag.fixCount} 次／錯誤 {diag.errorCount} 次／精度：
        {diag.accuracyMode === 'high' ? '高' : '低'}
      </div>
      <div>
        phase={state.phase} ／ 連續失配 {state.offMatchStreak} 次／routeId=
        {state.currentRouteId ?? '無'}
      </div>
      {diag.lastError && (
        <div>
          最後錯誤：code={diag.lastError.code} {diag.lastError.message}
        </div>
      )}
    </div>
  );
}

function StatusScreen({
  title,
  detail,
  diag,
  state,
  children,
}: {
  title: string;
  detail?: string;
  diag?: TrackerDiagnostics;
  state?: TrackerState;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-3xl font-bold text-white">{title}</div>
      {detail && <div className="text-base text-white/60">{detail}</div>}
      {children}
      {diag && state && <DiagPanel diag={diag} state={state} />}
    </div>
  );
}

export function HighwayDashboard({
  state,
  geoError,
  routes,
  onTopoSwitch,
  diag,
}: {
  state: TrackerState;
  geoError: GeoErrorKind;
  routes: RouteGeometry[];
  onTopoSwitch: (toRouteId: string) => void;
  diag: TrackerDiagnostics;
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
      <StatusScreen
        title="無法取得定位權限"
        detail="請至瀏覽器設定開啟定位權限後重新載入"
        diag={diag}
        state={state}
      />
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
        diag={diag}
        state={state}
      />
    );
  }

  if (state.phase === 'SIGNAL_LOST') {
    return (
      <StatusScreen title="GPS 訊號遺失" detail="收訊恢復後將自動繼續" diag={diag} state={state} />
    );
  }

  if (state.phase === 'OFF_HIGHWAY') {
    return (
      <StatusScreen title="未在國道上" detail="進入國道後自動開始導航" diag={diag} state={state}>
        {state.nearestHighway && (
          <NearestHighwayPanel info={state.nearestHighway} routes={routes} />
        )}
      </StatusScreen>
    );
  }

  // TRACKING
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      {/* 頂列：路線 / 方向 / 里程 / 車速 */}
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-white">{route?.name ?? '—'}</span>
          {dirLabel ? (
            <span className="rounded-lg bg-emerald-500/25 px-2 py-0.5 text-lg font-bold text-emerald-300">
              {dirLabel}
            </span>
          ) : (
            <span className="rounded-lg bg-white/10 px-2 py-0.5 text-sm text-white/60">
              判定方向中
            </span>
          )}
          {state.isDeadReckoning && (
            <span className="rounded-lg bg-amber-500/25 px-2 py-0.5 text-sm font-bold text-amber-300">
              隧道推算中
            </span>
          )}
          {state.isOffline && (
            <span className="rounded-lg bg-red-500/25 px-2 py-0.5 text-sm text-red-300">
              離線
            </span>
          )}
        </div>
        <div className="text-right font-mono tabular-nums">
          <div className="text-xl font-bold text-white">
            {state.currentMileage.toFixed(1)}
            <span className="text-sm text-white/50">K</span>
          </div>
          <div className="text-sm text-white/60">{Math.round(state.speedKmh)} km/h</div>
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
