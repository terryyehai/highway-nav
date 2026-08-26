// 單一設施卡片：徽章 + 名稱 / 距離 / ETA，仿公路告示牌列表列，高對比大字級，60-80cm 餘光可讀。

import { motion } from 'framer-motion';
import type { UpcomingFacility } from '../types';
import { CONGESTION_SPEED_KMH, formatEta } from '../core/eta';
import { HighwayBadge } from './HighwayBadge';

const TYPE_LABEL: Record<UpcomingFacility['type'], string> = {
  interchange: '交流道',
  rest_area: '服務區',
  junction: '系統',
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
  const isNearest = rank === 0;
  const congested = speedKmh >= 5 && speedKmh < CONGESTION_SPEED_KMH;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={`flex items-center gap-3 rounded-2xl border bg-white/50 p-4 ${
        isNearest ? 'border-highway-green' : 'border-signboard-line'
      }`}
    >
      <HighwayBadge routeId={facility.routeId} size={isNearest ? 44 : 32} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-highway-green/60">
          {TYPE_LABEL[facility.type]}
        </div>
        <div
          className={`truncate font-bold text-highway-green ${isNearest ? 'text-4xl' : 'text-2xl'}`}
        >
          {facility.name}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div
          className={`font-mono font-bold tabular-nums text-highway-green ${
            isNearest ? 'text-5xl' : 'text-3xl'
          }`}
        >
          {facility.distanceKm.toFixed(1)}
          <span className="ml-1 text-base font-normal text-highway-green/50">km</span>
        </div>
        <div className="mt-1 font-mono text-lg tabular-nums text-highway-green/60">
          {formatEta(facility.etaSeconds)}
          {congested && isNearest && (
            <span className="ml-2 rounded bg-shield-red/15 px-1.5 py-0.5 text-xs text-shield-red">
              塞車中
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
