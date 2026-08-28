// 自適應字級文字：依容器寬度自動縮小字級至剛好容納，避免固定大字級造成文字重疊或被裁切。
// 支援 text（單純字串）或 children（如「大數字+em 相對縮放的小單位」這種混排內容，
// 縮放時兩者比例會一起等比縮小，不會出現大數字被壓到消失、單位卻維持原尺寸的情況）。
import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export function AutoFitText({
  text,
  children,
  className,
  maxFontPx,
  minFontPx = 20,
}: {
  text?: string;
  children?: ReactNode;
  className?: string;
  maxFontPx: number;
  minFontPx?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fontPx, setFontPx] = useState(maxFontPx);
  const content = children ?? text;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      let size = maxFontPx;
      el.style.fontSize = `${size}px`;
      while (el.scrollWidth > el.clientWidth && size > minFontPx) {
        size -= 2;
        el.style.fontSize = `${size}px`;
      }
      setFontPx(size);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [content, maxFontPx, minFontPx]);

  return (
    <div
      ref={ref}
      data-autofit="true"
      className={`overflow-hidden text-ellipsis whitespace-nowrap ${className ?? ''}`}
      style={{ fontSize: fontPx }}
    >
      {content}
    </div>
  );
}
