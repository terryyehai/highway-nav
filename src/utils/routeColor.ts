// 依路線類型對應台灣公路指標實際配色：國道＝綠底白字，省道/快速公路＝藍底白字。

export interface RouteColorScheme {
  bg: string; // Tailwind 背景色 class
  bgSoft: string; // 次要區塊（表頭列）用的較深疊色
  text: string;
  textSub: string;
  divider: string;
}

export function routeColorScheme(routeId: string): RouteColorScheme {
  if (routeId.startsWith('E')) {
    return {
      bg: 'bg-shield-blue',
      bgSoft: 'bg-black/15',
      text: 'text-white',
      textSub: 'text-white/70',
      divider: 'border-white/20',
    };
  }
  return {
    bg: 'bg-highway-green',
    bgSoft: 'bg-black/15',
    text: 'text-white',
    textSub: 'text-white/70',
    divider: 'border-white/20',
  };
}
