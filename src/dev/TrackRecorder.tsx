// 實路軌跡錄製：?rec=1 啟用。實車行駛時錄下 GPS 序列，
// 匯出 .track.json 可直接放入 tests/fixtures/ 回灌成 regression 測試。

import { useCallback, useRef, useState } from 'react';
import type { GeoFix } from '../types';

interface RecPoint {
  t: number;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  accuracy: number;
}

export function useTrackRecorder() {
  const pointsRef = useRef<RecPoint[]>([]);
  const startTsRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [count, setCount] = useState(0);

  // onFix 必須恆定 identity：避免 geoProvider wrapper 重建導致 GPS watch 重訂閱
  const onFix = useCallback((fix: GeoFix) => {
    if (!recordingRef.current) return;
    if (startTsRef.current === null) startTsRef.current = fix.timestamp;
    pointsRef.current.push({
      t: fix.timestamp - startTsRef.current,
      lat: fix.lat,
      lng: fix.lng,
      speed: fix.speed,
      heading: fix.heading,
      accuracy: fix.accuracy,
    });
    setCount(pointsRef.current.length);
  }, []);

  const start = useCallback(() => {
    recordingRef.current = true;
    pointsRef.current = [];
    startTsRef.current = null;
    setCount(0);
    setRecording(true);
  }, []);

  const stop = useCallback(() => {
    recordingRef.current = false;
    setRecording(false);
  }, []);

  const download = useCallback(() => {
    const name = `recorded-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
    const fixture = {
      name,
      description: `實路錄製 ${new Date().toLocaleString('zh-TW')}`,
      points: pointsRef.current,
    };
    const blob = new Blob([JSON.stringify(fixture)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.track.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return { recording, count, onFix, start, stop, download };
}

export function RecorderPanel({
  rec,
}: {
  rec: ReturnType<typeof useTrackRecorder>;
}) {
  return (
    <div className="fixed right-2 top-2 z-50 flex items-center gap-2 rounded-xl border border-white/20 bg-black/70 p-2 text-xs text-white backdrop-blur-md">
      {rec.recording ? (
        <>
          <span className="flex items-center gap-1 text-red-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            REC {rec.count}
          </span>
          <button onClick={rec.stop} className="rounded bg-white/15 px-2 py-1 font-bold">
            停止
          </button>
        </>
      ) : (
        <>
          <button onClick={rec.start} className="rounded bg-red-500/80 px-2 py-1 font-bold">
            ● 錄製
          </button>
          {rec.count > 0 && (
            <button onClick={rec.download} className="rounded bg-white/15 px-2 py-1 font-bold">
              下載 {rec.count} 點
            </button>
          )}
        </>
      )}
    </div>
  );
}
