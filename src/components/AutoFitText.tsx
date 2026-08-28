// 自適應字級文字：依容器寬度自動縮小字級至剛好容納，避免固定大字級造成文字重疊或被裁切。
import { useLayoutEffect, useRef, useState } from 'react';

export function AutoFitText({
  text,
  className,
  maxFontPx,
  minFontPx = 20,
}: {
  text: string;
  className?: string;
  maxFontPx: number;
  minFontPx?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fontPx, setFontPx] = useState(maxFontPx);

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
  }, [text, maxFontPx, minFontPx]);

  return (
    <div
      ref={ref}
      className={`overflow-hidden whitespace-nowrap ${className ?? ''}`}
      style={{ fontSize: fontPx }}
    >
      {text}
    </div>
  );
}
