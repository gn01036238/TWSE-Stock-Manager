/**
 * 盤中走勢的即時樣本。
 *
 * Yahoo 的台股分鐘線大約延遲 20 分鐘（開盤後好一段時間，meta.regularMarketTime
 * 都還停在昨天收盤），沒有這層就只能把昨天的線當成「今日走勢」畫出來。
 * 每次向 TWSE 要即時報價時順手記一筆，接在 Yahoo 的 K 棒後面補上最新那一段。
 *
 * 只活在記憶體：程序重啟會從當下重新累積，前面缺的那段由 Yahoo 的 K 棒補回來。
 */

/** 取樣的時間桶，對齊 Yahoo 的 1 分鐘線，兩邊接起來間距才會一致 */
const BUCKET_MS = 60 * 1000;
/** 每檔最多留幾個點；交易時段 270 分鐘、一分鐘一點，留這麼多綽綽有餘 */
const MAX_POINTS = 400;

export interface LiveSample {
  /** 時間桶編號 = floor(epoch ms / 5 分鐘) */
  bucket: number;
  price: number;
}

interface Series {
  /** 樣本所屬交易日，台北時區 YYYY-MM-DD */
  date: string;
  /** 舊的在前 */
  samples: LiveSample[];
}

const store = new Map<string, Series>();

/** 時間換算成時間桶編號（分鐘），用來跟 Yahoo 的 K 棒對齊 */
export function toBucket(date: Date): number {
  return Math.floor(date.getTime() / BUCKET_MS);
}

/**
 * 記一筆即時價。同一個時間桶內重複取樣只留最新的，所以線的尾端會隨報價跳動，
 * 但要等桶子換了才會多一個點。
 * @param key 個股用 ticker，指數用它的 symbol（例如 ^TWII）
 * @param date 報價所屬交易日，台北時區 YYYY-MM-DD
 */
export function recordLivePrice(
  key: string,
  date: string,
  price: number,
  at: Date = new Date()
): void {
  if (!(price > 0)) return;

  let series = store.get(key);
  // 換日就重來，不要把昨天的尾巴接在今天前面
  if (!series || series.date !== date) {
    series = { date, samples: [] };
    store.set(key, series);
  }

  const bucket = toBucket(at);
  const last = series.samples[series.samples.length - 1];

  if (last && last.bucket === bucket) last.price = price;
  else series.samples.push({ bucket, price });

  if (series.samples.length > MAX_POINTS) {
    series.samples.splice(0, series.samples.length - MAX_POINTS);
  }
}

/** 指定交易日累積到的樣本；沒有該日的資料回空陣列 */
export function getLiveSamples(key: string, date: string): LiveSample[] {
  const series = store.get(key);
  if (!series || series.date !== date) return [];

  return series.samples;
}

/** 指定交易日累積到的價格序列 */
export function getLivePoints(key: string, date: string): number[] {
  return getLiveSamples(key, date).map((sample) => sample.price);
}

/**
 * 把 Yahoo 的 K 棒與比它新的即時樣本接成一條線。
 * Yahoo 負責開盤到 20 分鐘前那段，即時樣本負責最新的尾巴。
 */
export function mergeWithLive(key: string, date: string, bars: LiveSample[]): LiveSample[] {
  const live = getLiveSamples(key, date);
  if (bars.length === 0) return [...live];

  const lastBar = bars[bars.length - 1].bucket;

  return [...bars, ...live.filter((sample) => sample.bucket > lastBar)];
}
