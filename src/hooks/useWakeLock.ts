// 螢幕長亮控制：切回前景自動重新取得；低速時由呼叫端 setEnabled(false) 釋放省電。

import { useCallback, useEffect, useRef, useState } from 'react';

export function useWakeLock() {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const enabledRef = useRef(false);
  const [isActive, setIsActive] = useState(false);
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  const acquire = useCallback(async () => {
    if (!supported || !enabledRef.current || document.visibilityState !== 'visible') return;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      sentinelRef.current = sentinel;
      setIsActive(true);
      sentinel.addEventListener('release', () => setIsActive(false));
    } catch {
      setIsActive(false); // 低電量模式等原因會被拒，不視為錯誤
    }
  }, [supported]);

  const setEnabled = useCallback(
    (enabled: boolean) => {
      enabledRef.current = enabled;
      if (enabled) {
        void acquire();
      } else {
        void sentinelRef.current?.release();
        sentinelRef.current = null;
        setIsActive(false);
      }
    },
    [acquire],
  );

  useEffect(() => {
    // Wake Lock 在切換 APP/休眠後強制失效 → 回前景重新取得
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinelRef.current?.release();
    };
  }, [acquire]);

  return { supported, isActive, setEnabled };
}
