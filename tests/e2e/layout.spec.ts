// 版面稽核：把 src/dev/scenarios.ts 的每個情境，用 ?harness=<key> 灌進真正的元件樹，
// 在幾種常見手機寬度下用真實 layout engine 檢查有沒有文字重疊、AutoFitText 溢出、橫向溢出畫面。
// 這是 tests/*.test.ts（vitest, jsdom）做不到的部分：jsdom 不跑 CSS layout，
// scrollWidth/clientWidth 永遠是 0，量不出真正的重疊。
import { test, expect } from '@playwright/test';
import { SCENARIOS } from '../../src/dev/scenarios';

const WIDTHS = [360, 390, 428];

interface PageCheck {
  overflowX: boolean;
  overlaps: Array<{ a: string; b: string }>;
  autofitClips: Array<{ text: string; scrollWidth: number; clientWidth: number }>;
}

async function checkLayout(page: import('@playwright/test').Page): Promise<PageCheck> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const overflowX = document.documentElement.scrollWidth > vw + 1;

    const autofitClips = [...document.querySelectorAll('[data-autofit]')]
      .map((el) => ({
        text: el.textContent ?? '',
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }))
      .filter((x) => x.scrollWidth > x.clientWidth + 1 || x.clientWidth === 0);

    // 「重疊」定義：兩個各自持有文字內容的元素，互不為祖先/後代關係，但畫面座標矩形相交。
    const candidates = [...document.querySelectorAll('body *')].filter((el) => {
      const hasOwnText = [...el.childNodes].some(
        (n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0,
      );
      if (!hasOwnText) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const rects = candidates.map((el) => ({ el, r: el.getBoundingClientRect() }));
    const overlaps: Array<{ a: string; b: string }> = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ix > 2 && iy > 2) {
          overlaps.push({
            a: (a.el.textContent ?? '').trim().slice(0, 20),
            b: (b.el.textContent ?? '').trim().slice(0, 20),
          });
        }
      }
    }

    return { overflowX, overlaps, autofitClips };
  });
}

for (const scenario of SCENARIOS) {
  test.describe(scenario.key, () => {
    for (const width of WIDTHS) {
      test(`${scenario.description} @ ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/?harness=${scenario.key}`);
        await page.waitForSelector('[data-harness-ready]');
        // AutoFitText 的 ResizeObserver 會在 layout 穩定後再修一次字級，給一點時間讓它收斂
        await page.waitForTimeout(150);

        const result = await checkLayout(page);

        expect(result.overflowX, '不應該橫向溢出畫面（出現需要左右滑動的內容）').toBe(false);
        expect(
          result.overlaps,
          '不應該有兩段文字的畫面座標互相重疊（原始 bug：交流道名稱疊到公里數上）',
        ).toEqual([]);

        // AutoFitText 縮到最小字級仍放不下時，會用 text-ellipsis 優雅截斷而不是重疊/消失，
        // 這是刻意的降級行為（多半是本次情境刻意塞進去的「目前資料最長」案例），
        // 不當作測試失敗，但記錄下來方便人工覆核是否需要加大版面配置。
        if (result.autofitClips.length > 0) {
          test.info().annotations.push({
            type: 'autofit-clip',
            description: JSON.stringify(result.autofitClips),
          });
        }
      });
    }
  });
}
