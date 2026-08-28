// 單一設施卡片：滿版告示牌樣式，依路線類型上色（國道綠／快速公路藍），大字級 F 點視角。

import { motion } from 'framer-motion';
import type { UpcomingFacility } from '../types';
import { CONGESTION_SPEED_KMH, formatEta } from '../core/eta';
import { HighwayBadge } from './HighwayBadge';
import { AutoFitText } from './AutoFitText';
import { routeColorScheme } from '../utils/routeColor';
import { facilityTypeLabel, facilityDisplayName } from '../utils/facilityLabel';

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
      <div className="min-w-[4.5rem] flex-1">
        <div className={`text-xl font-bold ${c.textSub}`}>
          {facilityTypeLabel(facility.name, facility.type)}
        </div>
        <AutoFitText
          text={facilityDisplayName(facility.name, facility.type)}
          className={`font-bold ${c.text}`}
          maxFontPx={isNearest ? 96 : 60}
        />
      </div>
      {/* 名稱優先保留最小可讀寬度（above），數字這邊改為可壓縮：
          名稱與里程數同時撐爆版面時，寧可讓數字縮小也不要讓交流道名稱被擠到消失 */}
      <div className="min-w-0 shrink text-right">
        <AutoFitText
          maxFontPx={isNearest ? 128 : 84}
          minFontPx={isNearest ? 40 : 32}
          className={`font-mono font-bold tabular-nums ${c.text}`}
        >
          {facility.distanceKm.toFixed(1)}
          <span className={`ml-1 text-[0.3em] font-normal ${c.textSub}`}>km</span>
        </AutoFitText>
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
