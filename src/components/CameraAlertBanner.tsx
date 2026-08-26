// 測速照相／科技執法警示橫幅：紅色仿路牌禁制色，與 FacilityCard 的綠/藍設施告示牌明顯區隔。

import { motion } from 'framer-motion';
import type { CameraType, UpcomingCamera } from '../types';
import { OVER_SPEED_TOLERANCE_KMH } from '../core/speedLimit';

const CAMERA_LABEL: Record<CameraType, string> = {
  fixed: '測速照相',
  section_avg_start: '區間科技執法起點',
  section_avg_end: '區間科技執法迄點',
};

function CameraIcon({ className = 'h-8 w-8' }: { className?: string }) {
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
      <path d="M4 8h2l1.5-2h9L18 8h2a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function CameraAlertBanner({
  camera,
  speedKmh,
  routeSpeedLimitKmh,
}: {
  camera: UpcomingCamera;
  speedKmh: number;
  routeSpeedLimitKmh: number | null;
}) {
  const limit = camera.speedLimitKmh ?? routeSpeedLimitKmh;
  const isSpeeding = limit !== null && speedKmh > limit + OVER_SPEED_TOLERANCE_KMH;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={`flex items-center gap-4 px-6 py-4 text-white ${
        isSpeeding ? 'animate-pulse bg-shield-red' : 'bg-shield-red/90'
      }`}
    >
      <CameraIcon />
      <div className="min-w-0 flex-1">
        <div className="text-2xl font-bold">{CAMERA_LABEL[camera.cameraType]}</div>
        {limit !== null && <div className="text-lg text-white/80">速限 {limit} km/h</div>}
      </div>
      {isSpeeding && (
        <span className="shrink-0 rounded bg-white/20 px-3 py-1 text-lg font-bold">請減速</span>
      )}
      <div className="shrink-0 text-right font-mono font-bold tabular-nums">
        <span className="text-4xl">{camera.distanceKm.toFixed(1)}</span>
        <span className="ml-1 text-xl font-normal text-white/80">km</span>
      </div>
    </motion.div>
  );
}
