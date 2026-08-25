# 台灣國道即時導航 PWA

行駛國道時自動顯示「前方最近 3 個交流道 / 服務區」的距離與 ETA。
Zero-Touch 全自動、TTS 語音播報、Wake Lock 防休眠、離線可用。

## 快速開始

```bash
npm install --legacy-peer-deps
npm run dev
```

開啟 `http://localhost:5173/?sim=n1-south` 可用內建 GPS 模擬器在桌機測試（含倍速/暫停/seek 面板）。

## 常用指令

| 指令 | 說明 |
|------|------|
| `npm run dev` | 開發伺服器 |
| `npm test` | Vitest 單元測試 + 軌跡回放端到端測試 |
| `npm run build` | 型別檢查 + production build（PWA） |
| `npm run build:topo` | 由高公局開放資料重新產製圖資（免金鑰） |
| `npm run gen:fixture -- --route=N1 --from=20 --to=60 --speed=95 --name=xxx` | 合成測試軌跡 |

## 架構

- **`src/core/`** — 純函式演算法（map matching、方向判定、ETA、Dead Reckoning、設施過濾），零 React 依賴，統合於 `trackerReducer.ts`。
- **`src/hooks/useHighwayTracker.ts`** — React 接線層：GeoProvider 依賴注入（真實 GPS / 模擬器共用介面）、sessionStorage 無縫恢復、低速 GPS 降頻。
- **`src/data/freeway-topo.json`** — 建置期產製的全國道圖資（11 條路線、線形 + 里程索引 + 設施）。
- **`scripts/build-topo.ts`** — 圖資產製：高公局 tisvcloud 開放資料（Section + SectionShape），含品質報表；人工修正寫 `scripts/topo-overrides.json`。
- **`src/dev/`** — DEV 專用 GPS 軌跡回放模擬器（`?sim=<fixture>` 啟用，不進 production bundle）。

## 圖資更新

```bash
npm run build:topo
```

資料源為高公局 tisvcloud（每日更新的 MOTC 交通資料標準檔），無需 TDX 金鑰。
高架/平面自動切換的 trigger zone 因缺乏匝道分岔幾何預設停用（會誤觸），
需要時於 `scripts/topo-overrides.json` 的 `extraTransitions` 人工定義；
駕駛可隨時用畫面上的「平面 ⇄ 高架」按鈕手動切換（切換後 10km 內封鎖自動判定）。

## 實路軌跡錄製（M6 迴歸測試）

實機開啟 `https://<部署網址>/?rec=1`，右上角出現錄製面板：
開車前按「● 錄製」、下高速公路後按「停止」→「下載」。
下載的 `.track.json` 放入 `tests/fixtures/` 即可在 `replay.test.ts` 加入回灌斷言，
或以 `?sim=<檔名>` 在桌機重播檢視。

## 部署

推上 `main` 即由 GitHub Actions 部署至 GitHub Pages。
base path 取自 repo 名稱自動注入，無需手動設定。

## 已知限制

- 高架（汐五/五楊）與平面主線垂直重疊，GPS 無法自動分辨；預設吸附平面主線，請以手動切換鈕修正。
- iOS Wake Lock 需 16.4+；TTS 需在「開始導航」按鈕手勢後才能發聲（已處理）。
- `serves`（單向出口）資料源未提供，目前全部設為雙向服務。
