// Playwright 版面稽核設定：只跑 chromium（手機瀏覽器多為 WebKit/Blink 系，但這裡驗證的是
// CSS flex/自適應字級邏輯，跨引擎差異風險低，不需要 3 套瀏覽器都跑）。
// ?harness=<key> 只在 import.meta.env.DEV 生效，因此必須跑 `vite dev`，不能用 build+preview。
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // 所有 worker 共用同一個 vite dev server，開太多平行 worker 反而讓 dev server 忙不過來、
  // 拖慢每個 navigation 導致逾時，故限制平行數並拉長 timeout 留一點餘裕。
  workers: 4,
  timeout: 45000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
