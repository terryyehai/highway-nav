// DEV 專用：GPS 軌跡回放模擬器，實作 GeoProvider 介面。
// 以 ?sim=<fixtureName> 啟用；production bundle 由動態 import 隔離。

import type { GeoFix, GeoProvider } from '../types';

export interface TrackPoint {
  t: number; // ms offset
  lat: number;
  lng: number;
  speed?: number; // m/s
  heading?: number;
  accuracy?: number;
  dropout?: boolean; // true = 該時段不發 fix（模擬隧道）
}

export interface TrackFixture {
  name: string;
  description?: string;
  points: TrackPoint[];
}

type Listener = (fix: GeoFix) => void;

export class GeolocationSimulator implements GeoProvider {
  private fixture: TrackFixture;
  private listeners = new Map<number, Listener>();
  private nextId = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cursor = 0;
  private playbackMs = 0;
  rate = 1;
  paused = false;
  onProgress: ((index: number, total: number) => void) | null = null;

  constructor(fixture: TrackFixture) {
    this.fixture = fixture;
  }

  watchPosition(onFix: Listener): number {
    const id = this.nextId++;
    this.listeners.set(id, onFix);
    this.ensureRunning();
    return id;
  }

  clearWatch(watchId: number): void {
    this.listeners.delete(watchId);
  }

  seek(index: number): void {
    this.cursor = Math.max(0, Math.min(index, this.fixture.points.length - 1));
    this.playbackMs = this.fixture.points[this.cursor].t;
  }

  private ensureRunning(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.paused || this.listeners.size === 0) return;
      this.playbackMs += 250 * this.rate;
      // 發出所有已到時間的點
      while (
        this.cursor < this.fixture.points.length &&
        this.fixture.points[this.cursor].t <= this.playbackMs
      ) {
        const p = this.fixture.points[this.cursor];
        this.cursor++;
        if (!p.dropout) {
          const fix: GeoFix = {
            lat: p.lat,
            lng: p.lng,
            speed: p.speed ?? null,
            heading: p.heading ?? null,
            accuracy: p.accuracy ?? 10,
            timestamp: Date.now(),
          };
          for (const l of this.listeners.values()) l(fix);
        }
      }
      this.onProgress?.(this.cursor, this.fixture.points.length);
      if (this.cursor >= this.fixture.points.length) this.paused = true;
    }, 250);
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.listeners.clear();
  }
}

/** 內建 fixture 由 Vite glob 載入 tests/fixtures/*.track.json */
export async function loadFixture(name: string): Promise<TrackFixture | null> {
  const modules = import.meta.glob('../../tests/fixtures/*.track.json');
  for (const [path, load] of Object.entries(modules)) {
    if (path.endsWith(`/${name}.track.json`)) {
      const mod = (await load()) as { default: TrackFixture };
      return mod.default;
    }
  }
  return null;
}
