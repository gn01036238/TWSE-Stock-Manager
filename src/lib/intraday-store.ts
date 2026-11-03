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
  /** 時間桶編號 = floor(epoch ms / 1 分鐘) */
  bucket: number;
  price: number;
  /** 這一分鐘的成交量（張）；不知道時為 null 或不給 */
  volume?: number | null;
}

/** store 裡存的是當下的累積成交量，每分鐘的量等合併時再相減算出來 */
interface StoredSample {
  bucket: number;
  price: number;
  /** 當日累積成交量（張），TWSE MIS 的 v */
  cumVolume: number | null;
}

interface Series {
  /** 樣本所屬交易日，台北時區 YYYY-MM-DD */
  date: string;
  /** 舊的在前 */
  samples: StoredSample[];
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
 * @param cumVolume 當日累積成交量（張）；指數沒有就不給
 */
export function recordLivePrice(
  key: string,
  date: string,
  price: number,
  at: Date = new Date(),
  cumVolume: number | null = null
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

  if (last && last.bucket === bucket) {
    last.price = price;
    if (cumVolume != null) last.cumVolume = cumVolume;
  } else {
    series.samples.push({ bucket, price, cumVolume });
  }

  if (series.samples.length > MAX_POINTS) {
    series.samples.splice(0, series.samples.length - MAX_POINTS);
  }
}

function getStored(key: string, date: string): StoredSample[] {
  const series = store.get(key);
  if (!series || series.date !== date) return [];

  return series.samples;
}

/**
 * 累積量相減成每分鐘的量。取樣不一定每分鐘都有（沒人在看就沒人問報價），
 * 漏掉的分鐘的量會併進下一個有樣本的那一分鐘。
 * @param startCum 第一個樣本之前的累積量；不知道就給 null，第一個點的量留空
 */
function toLiveSamples(samples: StoredSample[], startCum: number | null): LiveSample[] {
  let previous = startCum;

  return samples.map((sample) => {
    const diff =
      sample.cumVolume != null && previous != null ? sample.cumVolume - previous : null;
    if (sample.cumVolume != null) previous = sample.cumVolume;

    return {
      bucket: sample.bucket,
      price: sample.price,
      volume: diff != null && diff >= 0 ? diff : null,
    };
  });
}

/** 指定交易日累積到的樣本；沒有該日的資料回空陣列 */
export function getLiveSamples(key: string, date: string): LiveSample[] {
  return toLiveSamples(getStored(key, date), null);
}

/** 指定交易日累積到的價格序列 */
export function getLivePoints(key: string, date: string): number[] {
  return getStored(key, date).map((sample) => sample.price);
}

/**
 * 把 Yahoo 的 K 棒與比它新的即時樣本接成一條線。
 * Yahoo 負責開盤到 20 分鐘前那段，即時樣本負責最新的尾巴。
 */
export function mergeWithLive(key: string, date: string, bars: LiveSample[]): LiveSample[] {
  const stored = getStored(key, date);
  if (bars.length === 0) return toLiveSamples(stored, null);

  const lastBar = bars[bars.length - 1].bucket;
  // 接縫後第一分鐘的量 = TWSE 累積量 − Yahoo 那段 K 棒的量加總
  const yahooCum = bars.every((bar) => bar.volume != null)
    ? bars.reduce((sum, bar) => sum + (bar.volume ?? 0), 0)
    : null;

  return [
    ...bars,
    ...toLiveSamples(
      stored.filter((sample) => sample.bucket > lastBar),
      yahooCum
    ),
  ];
}
