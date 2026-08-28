// PWA 環境與裝置偵測，以及 Service Worker 自動更新註冊。

import { registerSW } from 'virtual:pwa-register';

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/** 註冊 SW 並每 30 分鐘檢查新版；新版就緒後自動套用（skipWaiting + clientsClaim），
 *  下次開啟 App 即可拿到最新部署，不需使用者手動觸發 */
export function registerAutoUpdatingServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => void registration.update(), UPDATE_CHECK_INTERVAL_MS);
    },
  });
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ 偽裝為 Mac，需加測 touch
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const IOS_PROMPT_DISMISSED_KEY = 'ios-install-prompt-dismissed';

export function shouldShowIOSInstallPrompt(): boolean {
  return isIOS() && !isStandalone() && localStorage.getItem(IOS_PROMPT_DISMISSED_KEY) !== '1';
}

export function dismissIOSInstallPrompt(): void {
  localStorage.setItem(IOS_PROMPT_DISMISSED_KEY, '1');
}
