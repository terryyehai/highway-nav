// GPS 軌跡合成器：從 freeway-topo.json 沿線形按指定車速產生測試軌跡。
// 用法：npm run gen:fixture -- --route=N1 --from=20 --to=60 --speed=95 --name=n1-south
// 選項：--dir=INCREASING|DECREASING（預設依 from/to 推斷）
//       --dropout=45,52     里程 45~52km 之間斷訊（模擬隧道）
//       --noise=8           GPS 高斯雜訊 σ (meters)，預設 8
//       --interval=1000     取樣間隔 ms

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Args {
  route: string;
  from: number;
  to: number;
  speed: number;
  name: string;
  dropout?: [number, number];
  noise: number;
  interval: number;
}

function parseArgs(): Args {
  const get = (k: string, def?: string): string | undefined => {
    const m = process.argv.find((a) => a.startsWith(`--${k}=`));
    return m ? m.split('=')[1] : def;
  };
  const route = get('route');
  const from = get('from');
  const to = get('to');
  const name = get('name');
  if (!route || !from || !to || !name) {
    console.error('必填：--route --from --to --name');
    process.exit(1);
  }
  const dropout = get('dropout');
  return {
    route,
    from: Number(from),
    to: Number(to),
    speed: Number(get('speed', '95')),
    name,
    dropout: dropout ? (dropout.split(',').map(Number) as [number, number]) : undefined,
    noise: Number(get('noise', '8')),
    interval: Number(get('interval', '1000')),
  };
}

// Box-Muller 高斯雜訊
let spare: number | null = null;
function gaussian(sigma: number): number {
  if (spare !== null) {
    const v = spare;
    spare = null;
    return v * sigma;
  }
  const u = Math.random() || 1e-9;
  const v = Math.random();
  const mag = Math.sqrt(-2 * Math.log(u));
  spare = mag * Math.sin(2 * Math.PI * v);
  return mag * Math.cos(2 * Math.PI * v) * sigma;
}

function main() {
  const args = parseArgs();
  const topo = JSON.parse(
    readFileSync(resolve(__dirname, '../src/data/freeway-topo.json'), 'utf-8'),
  );
  const route = topo.routes.find((r: any) => r.id === args.route);
  if (!route) {
    console.error(`找不到路線 ${args.route}`);
    process.exit(1);
  }
  const { coords, mileageIndex } = route as {
    coords: Array<[number, number]>;
    mileageIndex: number[];
  };

  // 依里程取線形上的座標與方位
  const atMileage = (km: number): { lat: number; lng: number; heading: number } => {
    let i = 0;
    while (i < mileageIndex.length - 2 && mileageIndex[i + 1] < km) i++;
    const m1 = mileageIndex[i];
    const m2 = mileageIndex[i + 1];
    const t = m2 === m1 ? 0 : (km - m1) / (m2 - m1);
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const DEG = Math.PI / 180;
    const y = Math.sin((lng2 - lng1) * DEG) * Math.cos(lat2 * DEG);
    const x =
      Math.cos(lat1 * DEG) * Math.sin(lat2 * DEG) -
      Math.sin(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.cos((lng2 - lng1) * DEG);
    let heading = ((Math.atan2(y, x) / DEG) + 360) % 360;
    return { lat: lat1 + (lat2 - lat1) * t, lng: lng1 + (lng2 - lng1) * t, heading };
  };

  const sign = args.to >= args.from ? 1 : -1;
  const points: any[] = [];
  let mileage = args.from;
  let t = 0;
  const kmPerTick = (args.speed / 3600000) * args.interval;
  while (sign > 0 ? mileage <= args.to : mileage >= args.to) {
    const pos = atMileage(mileage);
    const inDropout =
      args.dropout &&
      mileage >= Math.min(...args.dropout) &&
      mileage <= Math.max(...args.dropout);
    const noiseDeg = args.noise / 111195;
    points.push({
      t,
      lat: Number((pos.lat + gaussian(noiseDeg)).toFixed(6)),
      lng: Number((pos.lng + gaussian(noiseDeg)).toFixed(6)),
      speed: Number((args.speed / 3.6).toFixed(1)),
      heading: sign > 0 ? Math.round(pos.heading) : Math.round((pos.heading + 180) % 360),
      accuracy: 10,
      ...(inDropout ? { dropout: true } : {}),
    });
    mileage += sign * kmPerTick;
    t += args.interval;
  }

  const fixture = {
    name: args.name,
    description: `${args.route} ${args.from}→${args.to}km @${args.speed}km/h${args.dropout ? ` dropout ${args.dropout.join('~')}km` : ''}`,
    points,
  };
  const outDir = resolve(__dirname, '../tests/fixtures');
  mkdirSync(outDir, { recursive: true });
  const out = resolve(outDir, `${args.name}.track.json`);
  writeFileSync(out, JSON.stringify(fixture));
  console.log(`輸出 ${out}（${points.length} 點）`);
}

main();
