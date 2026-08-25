// PWA 環境與裝置偵測。

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
