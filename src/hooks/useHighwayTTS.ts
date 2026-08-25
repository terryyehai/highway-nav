// TTS 語音播報：iOS Safari 需 user gesture 解鎖，播報前加短暫靜音喚醒藍牙車機。

import { useCallback, useRef } from 'react';

export function useHighwayTTS() {
  const unlockedRef = useRef(false);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  /** 必須在 user gesture（開始導航按鈕）內呼叫一次 */
  const unlock = useCallback(() => {
    if (!supported || unlockedRef.current) return;
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    unlockedRef.current = true;
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported) return;
      // 0.5s 靜音前導：喚醒藍牙車機音訊通道，避免吃字
      const silence = new SpeechSynthesisUtterance(' ');
      silence.volume = 0;
      silence.rate = 0.5;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-TW';
      u.rate = 1.0;
      const zhVoice = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang === 'zh-TW' || v.lang.startsWith('zh'));
      if (zhVoice) u.voice = zhVoice;
      window.speechSynthesis.speak(silence);
      window.speechSynthesis.speak(u);
    },
    [supported],
  );

  return { supported, unlock, speak };
}
