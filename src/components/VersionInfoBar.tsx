// 底部隱藏資訊欄：預設收合為極細長條，點擊展開完整診斷面板（版本／定位狀態）。
// 與行駛畫面脫鉤，App 層級掛載一次即可涵蓋所有 phase。

import { useState } from 'react';
import type { TrackerDiagnostics } from '../hooks/useHighwayTracker';
import type { TrackerState } from '../types';

export function VersionInfoBar({
  diag,
  state,
}: {
  diag: TrackerDiagnostics;
  state: TrackerState;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {expanded && (
        <button
          aria-label="關閉診斷面板"
          className="fixed inset-0 z-40 cursor-default"
          onClick={() => setExpanded(false)}
        />
      )}
      <div className="fixed inset-x-0 bottom-0 z-50">
        {expanded && (
          <div className="border-t border-highway-green/20 bg-signboard/98 px-4 py-3 font-mono text-[11px] leading-relaxed text-highway-green/70 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-bold text-highway-green">診斷資訊</span>
              <button
                onClick={() => setExpanded(false)}
                className="px-1 text-highway-green/50"
                aria-label="關閉"
              >
                ✕
              </button>
            </div>
            <div>
              版本 {__BUILD_ID__} ／ 已等待 {diag.elapsedSec}s ／ 權限：{diag.permission}
            </div>
            <div>
              watchPosition {diag.wpCalls} 次／成功 {diag.fixCount} 次／錯誤 {diag.errorCount} 次／
              精度：{diag.accuracyMode === 'high' ? '高' : '低'}
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
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex h-5 w-full items-center justify-center gap-1 bg-highway-green text-[10px] text-white/45 active:text-white/70"
          aria-label="版本與定位狀態"
        >
          <span>{expanded ? '︿' : '﹀'}</span>
          <span>版本資訊</span>
        </button>
      </div>
    </>
  );
}
