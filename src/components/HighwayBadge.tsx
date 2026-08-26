// 公路徽章：國道梅花標（綠框白底）／快速公路盾牌標（藍框紅底白字），仿實體告示牌樣式。

function routeNumber(routeId: string): string {
  // N1H 是內部合成 id（汐止五股/五楊高架，仍屬國道1號），結尾 H 非正式編號需先剝離
  const base = routeId.endsWith('H') ? routeId.slice(0, -1) : routeId;
  const m = base.match(/^[NE](\d+[A-Z]?)/);
  return m ? m[1] : base;
}

function petalCenters(cx: number, cy: number, r: number): Array<[number, number]> {
  return Array.from({ length: 5 }, (_, i) => {
    const angle = (i * 72 - 90) * (Math.PI / 180);
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  });
}

/** 國道梅花標：綠色外框、白色內底、中央深綠字 */
function PlumBlossomBadge({ num, size }: { num: string; size: number }) {
  const cx = 20;
  const cy = 20;
  const outer = petalCenters(cx, cy, 10.5);
  const inner = petalCenters(cx, cy, 9.3);
  const fontSize = num.length >= 2 ? 15 : 18;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`國道${num}號`}>
      <circle cx={cx} cy={cy} r="11.5" fill="var(--color-highway-green)" />
      {outer.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="10.5" fill="var(--color-highway-green)" />
      ))}
      <circle cx={cx} cy={cy} r="9" fill="var(--color-signboard)" />
      {inner.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="8.2" fill="var(--color-signboard)" />
      ))}
      <text
        x={cx}
        y={cy + fontSize * 0.35}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={800}
        fill="var(--color-highway-green)"
        fontFamily="system-ui, sans-serif"
      >
        {num}
      </text>
    </svg>
  );
}

/** 快速公路盾牌標：藍色外框、紅色內底、白字 */
function ExpresswayShieldBadge({ num, size }: { num: string; size: number }) {
  const fontSize = num.length >= 3 ? 13 : 16;
  return (
    <svg
      width={size}
      height={size * 1.05}
      viewBox="0 0 40 42"
      role="img"
      aria-label={`快速公路${num}線`}
    >
      <path
        d="M20 1.5 L36.5 6.5 V19.5 C36.5 29.5 29.5 36.5 20 40.5 C10.5 36.5 3.5 29.5 3.5 19.5 V6.5 Z"
        fill="var(--color-shield-red)"
        stroke="var(--color-shield-blue)"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <text
        x="20"
        y={21 + fontSize * 0.35}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={800}
        fill="#ffffff"
        fontFamily="system-ui, sans-serif"
      >
        {num}
      </text>
    </svg>
  );
}

export function HighwayBadge({ routeId, size = 36 }: { routeId: string; size?: number }) {
  const num = routeNumber(routeId);
  return routeId.startsWith('E') ? (
    <ExpresswayShieldBadge num={num} size={size} />
  ) : (
    <PlumBlossomBadge num={num} size={size} />
  );
}
