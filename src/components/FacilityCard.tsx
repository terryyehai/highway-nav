// 單一設施卡片：滿版告示牌樣式，依路線類型上色（國道綠／快速公路藍），大字級 F 點視角。

import { motion } from 'framer-motion';
import type { UpcomingFacility } from '../types';
import { CONGESTION_SPEED_KMH, formatEta } from '../core/eta';
import { HighwayBadge } from './HighwayBadge';
import { AutoFitText } from './AutoFitText';
import { routeColorScheme } from '../utils/routeColor';
import { FACILITY_TYPE_LABEL, facilityDisplayName } from '../utils/facilityLabel';

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
  const c = routeColorScheme(facility.routeId);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={`flex items-center gap-6 ${c.bg} ${isNearest ? 'py-10' : 'py-7'} px-6`}
    >
      <HighwayBadge routeId={facility.routeId} size={isNearest ? 120 : 76} />
      <div className="min-w-0 flex-1">
        <div className={`text-xl font-bold ${c.textSub}`}>{FACILITY_TYPE_LABEL[facility.type]}</div>
        <AutoFitText
          text={facilityDisplayName(facility.name, facility.type)}
          className={`font-bold ${c.text}`}
          maxFontPx={isNearest ? 96 : 60}
        />
      </div>
      <div className="shrink-0 text-right">
        <div
          className={`font-mono font-bold tabular-nums ${c.text} ${
            isNearest ? 'text-9xl' : 'text-7xl'
          }`}
        >
          {facility.distanceKm.toFixed(1)}
          <span className={`ml-1 text-3xl font-normal ${c.textSub}`}>km</span>
        </div>
        <div className={`mt-1 font-mono text-4xl tabular-nums ${c.textSub}`}>
          {formatEta(facility.etaSeconds)}
          {congested && isNearest && (
            <span className="ml-2 rounded bg-white/20 px-3 py-1 text-xl text-white">
              塞車中
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
