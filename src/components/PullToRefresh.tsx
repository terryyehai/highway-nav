// 下拉強制刷新：standalone PWA 沒有瀏覽器下拉刷新手勢，
// 也作為使用者手動逃生口——立即檢查新版 SW 並套用，不必等 30 分鐘輪詢或關閉分頁。

import { useEffect, useRef, useState } from 'react';

const TRIGGER_DISTANCE = 80;
const MAX_PULL = 120;

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      // 只有捲到最頂端才進入下拉刷新手勢，避免吃掉一般滾動
      if (el.scrollTop > 0 || refreshing) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }
      // 阻止畫面被瀏覽器原生下拉刷新/彈跳吃掉，改由本元件接管視覺回饋
      e.preventDefault();
      setPull(Math.min(delta * 0.5, MAX_PULL));
    };

    const onTouchEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      if (pull >= TRIGGER_DISTANCE) {
        doRefresh();
      } else {
        setPull(0);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pull, refreshing]);

  const doRefresh = async () => {
    setRefreshing(true);
    setPull(TRIGGER_DISTANCE);
    try {
      const check = (window as unknown as { __checkForUpdate?: () => Promise<void> })
        .__checkForUpdate;
      if (check) await check();
    } finally {
      // 無論是否真的有新版，強制整頁重載以跳脫任何殘留的舊快取狀態
      location.reload();
    }
  };

  return (
    <div ref={containerRef} className="relative flex min-h-dvh flex-col overflow-y-auto">
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-center overflow-hidden text-sm font-bold text-highway-green/70 transition-[height] duration-150"
        style={{ height: pull }}
      >
        {refreshing ? '更新中…' : pull >= TRIGGER_DISTANCE ? '放開以刷新' : '下拉刷新'}
      </div>
      <div
        style={{ transform: `translateY(${pull}px)`, transition: startY.current ? 'none' : 'transform 150ms' }}
      >
        {children}
      </div>
    </div>
  );
}
