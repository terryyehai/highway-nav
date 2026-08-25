// iOS PWA 安裝引導：Safari 無原生安裝橫幅，以 Bottom Sheet 指引「分享 → 加入主畫面」。

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { dismissIOSInstallPrompt, shouldShowIOSInstallPrompt } from '../utils/pwa';

export function IOSInstallPrompt() {
  const [visible, setVisible] = useState(shouldShowIOSInstallPrompt);

  const close = () => {
    dismissIOSInstallPrompt();
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-white/15 bg-neutral-900/95 p-6 pb-8 backdrop-blur-xl"
        >
          <div className="mb-3 text-lg font-bold text-white">安裝到主畫面</div>
          <ol className="space-y-2 text-sm text-white/80">
            <li>
              1. 點選 Safari 下方的分享按鈕{' '}
              <svg viewBox="0 0 24 24" className="inline h-5 w-5 fill-sky-400">
                <path d="M12 2 8 6h3v9h2V6h3l-4-4zM5 10v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10h-2v10H7V10H5z" />
              </svg>
            </li>
            <li>2. 選擇「加入主畫面」</li>
            <li>3. 從主畫面開啟，即可全螢幕離線使用</li>
          </ol>
          <button
            onClick={close}
            className="mt-4 w-full rounded-xl bg-white/10 py-3 font-bold text-white"
          >
            我知道了
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
