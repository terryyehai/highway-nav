// 速限標誌：仿台灣道路標誌牌 R-2「速度限制」— 白底紅圈黑字。

export function SpeedLimitSign({ limit, size = 64 }: { limit: number; size?: number }) {
  const fontSize = limit >= 100 ? 15 : 17;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`速限 ${limit} 公里`}>
      <circle cx="20" cy="20" r="19" fill="#ffffff" />
      <circle cx="20" cy="20" r="17" fill="none" stroke="var(--color-shield-red)" strokeWidth="4" />
      <text
        x="20"
        y={20 + fontSize * 0.36}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={800}
        fill="#1a1a1a"
        fontFamily="system-ui, sans-serif"
      >
        {limit}
      </text>
    </svg>
  );
}
