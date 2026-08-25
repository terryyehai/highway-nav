// 單一設施卡片：名稱 / 距離 / ETA，高對比大字級，60-80cm 餘光可讀。

import { motion } from 'framer-motion';
import type { UpcomingFacility } from '../types';
import { CONGESTION_SPEED_KMH, formatEta } from '../core/eta';

const TYPE_META: Record<UpcomingFacility['type'], { label: string; color: string }> = {
  interchange: { label: '交流道', color: 'text-emerald-300' },
  rest_area: { label: '服務區', color: 'text-sky-300' },
  junction: { label: '系統', color: 'text-amber-300' },
};

export function FacilityCard({
  facility,
  rank,
  speedKmh,
}: {
  facility: UpcomingFacility;
  rank: number;
  speedKmh: number;
}) {
  const meta = TYPE_META[facility.type];
  const isNearest = rank === 0;
  const congested = speedKmh >= 5 && speedKmh < CONGESTION_SPEED_KMH;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={`rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl ${
        isNearest ? 'ring-1 ring-emerald-400/40' : ''
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-xs font-medium ${meta.color}`}>{meta.label}</div>
          <div
            className={`truncate font-bold text-white ${isNearest ? 'text-4xl' : 'text-2xl'}`}
          >
            {facility.name}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={`font-mono font-bold tabular-nums text-white ${
              isNearest ? 'text-5xl' : 'text-3xl'
            }`}
          >
            {facility.distanceKm.toFixed(1)}
            <span className="ml-1 text-base font-normal text-white/60">km</span>
          </div>
          <div className="mt-1 font-mono text-lg tabular-nums text-white/70">
            {formatEta(facility.etaSeconds)}
            {congested && isNearest && (
              <span className="ml-2 rounded bg-red-500/30 px-1.5 py-0.5 text-xs text-red-300">
                塞車中
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
