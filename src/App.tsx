// 根元件：啟動流程（開始導航 gesture → TTS 解鎖 + GPS + WakeLock）→ 儀表板。
// 含 OLED 防烙印 pixel shifting 與 DEV 模擬器載入。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FreewayTopo, GeoFix, GeoProvider } from './types';
import topoJson from './data/freeway-topo.json';
import { useHighwayTracker } from './hooks/useHighwayTracker';
import { useWakeLock } from './hooks/useWakeLock';
import { useHighwayTTS } from './hooks/useHighwayTTS';
import { HighwayDashboard } from './components/HighwayDashboard';
import { IOSInstallPrompt } from './components/IOSInstallPrompt';
import { RecorderPanel, useTrackRecorder } from './dev/TrackRecorder';

const topo = topoJson as unknown as FreewayTopo;

/** 瀏覽器原生 geolocation 轉 GeoProvider 介面 */
const nativeGeoProvider: GeoProvider = {
  watchPosition(onFix, onError, options) {
    return navigator.geolocation.watchPosition(
      (pos) => {
        const fix: GeoFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed,
          heading:
            pos.coords.heading !== null && !Number.isNaN(pos.coords.heading)
              ? pos.coords.heading
              : null,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        onFix(fix);
      },
      (err) => onError({ code: err.code, message: err.message }),
      options,
    );
  },
  clearWatch(id) {
    navigator.geolocation.clearWatch(id);
  },
};

export default function App() {
  const [started, setStarted] = useState(false);
  const [geoProvider, setGeoProvider] = useState<GeoProvider>(nativeGeoProvider);
  const [SimPanel, setSimPanel] = useState<React.ReactNode>(null);
  const tts = useHighwayTTS();
  const wakeLock = useWakeLock();

  // DEV 模擬器：?sim=<fixture>（動態 import，不進 production bundle）
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const simName = new URLSearchParams(location.search).get('sim');
    if (!simName) return;
    void (async () => {
      const { GeolocationSimulator, loadFixture } = await import('./dev/GeolocationSimulator');
      const { SimulatorPanel } = await import('./dev/SimulatorPanel');
      const fixture = await loadFixture(simName);
      if (!fixture) {
        console.error(`找不到 fixture: ${simName}`);
        return;
      }
      const sim = new GeolocationSimulator(fixture);
      setGeoProvider(sim);
      setSimPanel(<SimulatorPanel sim={sim} />);
    })();
  }, []);

  // 實路軌跡錄製（?rec=1）：實機錄下 GPS 供回灌成 regression fixture
  const recorder = useTrackRecorder();
  const recEnabled = useMemo(
    () => new URLSearchParams(location.search).get('rec') === '1',
    [],
  );
  const trackedProvider = useMemo<GeoProvider>(() => {
    if (!recEnabled) return geoProvider;
    return {
      watchPosition: (onFix, onError, options) =>
        geoProvider.watchPosition(
          (fix) => {
            recorder.onFix(fix);
            onFix(fix);
          },
          onError,
          options,
        ),
      clearWatch: (id) => geoProvider.clearWatch(id),
    };
  }, [geoProvider, recEnabled, recorder.onFix]);

  const { state, geoError, lowPowerMode, manualTopoSwitch, consumeAnnouncements } =
    useHighwayTracker(topo, trackedProvider, started);

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__trackerState = { state, geoError, lowPowerMode };
  }

  // TTS 消費播報佇列
  useEffect(() => {
    if (state.announcements.length === 0) return;
    for (const a of state.announcements) tts.speak(a.text);
    consumeAnnouncements();
  }, [state.announcements, tts, consumeAnnouncements]);

  // 低速省電：釋放 WakeLock；恢復行駛重新取得
  useEffect(() => {
    if (!started) return;
    wakeLock.setEnabled(!lowPowerMode);
  }, [started, lowPowerMode, wakeLock]);

  // OLED 防烙印：每 5 分鐘隨機偏移 1~3px
  const shiftRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!started) return;
    const timer = setInterval(() => {
      const dx = (Math.random() * 4 - 2) | 0;
      const dy = (Math.random() * 4 - 2) | 0;
      if (shiftRef.current) {
        shiftRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
      }
    }, 300000);
    return () => clearInterval(timer);
  }, [started]);

  const start = useCallback(() => {
    tts.unlock(); // iOS TTS 需在 user gesture 內解鎖
    setStarted(true);
    wakeLock.setEnabled(true);
  }, [tts, wakeLock]);

  const routes = useMemo(() => topo.routes, []);

  if (!started) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-neutral-950 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">台灣國道即時導航</h1>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/50">
            自動顯示前方交流道與服務區的距離與抵達時間。
            行駛中請專注路況，本程式僅供輔助參考。
          </p>
        </div>
        <button
          onClick={start}
          className="rounded-3xl bg-emerald-500 px-16 py-6 text-3xl font-bold text-black shadow-lg shadow-emerald-500/25 active:scale-95"
        >
          開始導航
        </button>
        {!wakeLock.supported && (
          <p className="text-xs text-amber-400/80">
            此瀏覽器不支援螢幕長亮，請手動關閉自動鎖定
          </p>
        )}
        <IOSInstallPrompt />
      </div>
    );
  }

  return (
    <div ref={shiftRef} className="flex min-h-dvh flex-col bg-neutral-950">
      <HighwayDashboard
        state={state}
        geoError={geoError}
        routes={routes}
        onTopoSwitch={manualTopoSwitch}
      />
      {SimPanel}
      {recEnabled && <RecorderPanel rec={recorder} />}
    </div>
  );
}
