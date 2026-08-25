// DEV 專用：模擬器控制浮動面板（倍速/暫停/seek）。

import { useEffect, useState } from 'react';
import type { GeolocationSimulator } from './GeolocationSimulator';

export function SimulatorPanel({ sim }: { sim: GeolocationSimulator }) {
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(1);
  const [rate, setRate] = useState(sim.rate);
  const [paused, setPaused] = useState(sim.paused);

  useEffect(() => {
    sim.onProgress = (i, t) => {
      setProgress(i);
      setTotal(t);
    };
    return () => {
      sim.onProgress = null;
    };
  }, [sim]);

  const setSimRate = (r: number) => {
    sim.rate = r;
    setRate(r);
  };
  const togglePause = () => {
    sim.paused = !sim.paused;
    setPaused(sim.paused);
  };

  return (
    <div className="fixed bottom-2 left-2 right-2 z-50 rounded-xl bg-black/70 p-3 text-xs text-white backdrop-blur-md border border-white/20">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-amber-400">SIM</span>
        <button
          onClick={togglePause}
          className="rounded bg-white/15 px-3 py-1 font-bold"
        >
          {paused ? '▶' : '⏸'}
        </button>
        {[1, 4, 16].map((r) => (
          <button
            key={r}
            onClick={() => setSimRate(r)}
            className={`rounded px-2 py-1 ${rate === r ? 'bg-amber-500 text-black' : 'bg-white/15'}`}
          >
            ×{r}
          </button>
        ))}
        <span className="ml-auto font-mono">
          {progress}/{total}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={total - 1}
        value={progress}
        onChange={(e) => sim.seek(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
