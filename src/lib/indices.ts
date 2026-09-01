import type { IndexQuote } from '@/types';
import { getYahooClient } from './yahoo';
import { INDEX_NAMES } from './index-symbols';
import { mergeWithLive, toBucket, type LiveSample } from './intraday-store';
import { fetchTaiexSnapshot, TAIEX_SYMBOL } from './volume';
import { sessionOpenBucket, SESSION_MINUTES } from './market';

/** 只要涵蓋得到「最後一個交易日」就好；分鐘線抓太多天資料量會很可觀 */
const LOOKBACK_DAYS = 4;

function dateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * 走勢圖要的價格序列與 X 座標。台股給得出「距離開盤幾分鐘」，X 軸才能固定成
 * 09:00–13:30；其他市場的交易時段不一樣，留空讓走勢圖平均分佈。
 */
function toSeries(samples: LiveSample[], tradingDate: string | null) {
  return {
    points: samples.map((sample) => sample.price),
    offsets: tradingDate
      ? samples.map((sample) => sample.bucket - sessionOpenBucket(tradingDate))
      : [],
    sessionMinutes: tradingDate ? SESSION_MINUTES : 0,
  };
}

/** 反推的昨收與另一個來源差在這個比例內就當成同一天（漲跌幅只到小數第 2~3 位） */
const PREVIOUS_CLOSE_TOLERANCE = 0.001;

/** 只有 meta 的昨收壞掉時才會用到，抓兩週日線足夠回頭找上一個交易日 */
const DAILY_LOOKBACK_DAYS = 14;
const DAILY_CACHE_TTL = 30 * 60 * 1000;

const dailyCloseCache = new Map<string, { at: number; value: { date: string; close: number }[] }>();

/** 指數的日線收盤（舊的在前）；只在需要校正昨收時才抓，並快取避免每次輪詢都問一次 */
async function fetchDailyCloses(
  symbol: string,
  timeZone: string
): Promise<{ date: string; close: number }[]> {
  const cached = dailyCloseCache.get(symbol);
  if (cached && Date.now() - cached.at < DAILY_CACHE_TTL) return cached.value;

  let closes: { date: string; close: number }[] = [];

  try {
    const result = await getYahooClient().chart(symbol, {
      period1: new Date(Date.now() - DAILY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
      interval: '1d',
    });

    closes = ((result.quotes ?? []) as { date?: Date; close?: number | null }[])
      .filter((q): q is { date: Date; close: number } => q?.date != null && q.close != null)
      .map((q) => ({ date: dateKey(new Date(q.date), timeZone), close: q.close }));
  } catch (error) {
    console.error(`Failed to fetch daily closes for ${symbol}:`, error);
  }

  dailyCloseCache.set(symbol, { at: Date.now(), value: closes });
  return closes;
}

/**
 * Yahoo 的 `meta.previousClose` 偶爾會停在更早的交易日：2026-09-01 的 ^TFNI
 * 那格還是 08-28 的 3281.32（該有的是 08-31 的 3343.12），漲跌幅就會把兩天併成
 * 一天（+3.36%，正確的是 +1.45%）。同一份 meta 的 `regularMarketChangePercent`
 * 是對的，兩邊兜不起來時就用它反推昨收。
 *
 * 反推值只到小數第 2~3 位（漲跌點數會差個幾分），所以再去日線撈上一個交易日的收盤，
 * 對得起來就換成那個精確值。日線本身也會缺天（^SOX 就沒有 2026-08-28），
 * 差太多時寧可留反推值——漲跌幅至少是對的。
 */
async function resolvePreviousClose(
  symbol: string,
  meta: Record<string, unknown>,
  price: number,
  timeZone: string,
  lastDay: string,
  fallback: number
): Promise<number> {
  const reported =
    typeof meta?.previousClose === 'number' && meta.previousClose > 0 ? meta.previousClose : null;
  const percent =
    typeof meta?.regularMarketChangePercent === 'number' ? meta.regularMarketChangePercent : null;
  const implied =
    percent != null && percent > -100 && price > 0 ? price / (1 + percent / 100) : null;

  if (implied == null || !(implied > 0)) return reported ?? fallback;

  const agrees = (candidate: number) =>
    Math.abs(candidate - implied) / implied < PREVIOUS_CLOSE_TOLERANCE;

  // 沒被四捨五入過的優先
  if (reported != null && agrees(reported)) return reported;

  const closes = await fetchDailyCloses(symbol, timeZone);
  const previousBar = closes.filter((bar) => bar.date < lastDay).pop();
  if (previousBar && agrees(previousBar.close)) return previousBar.close;

  return implied;
}

/**
 * 台股加權指數改由 TWSE 的即時指數作主。Yahoo 的 ^TWII 盤中常常整場還停在昨收，
 * 那會跟表格裡（同樣來自 TWSE）的加權指數列對不起來。
 */
async function taiexQuote(fallback: IndexQuote | null): Promise<IndexQuote | null> {
  const snapshot = await fetchTaiexSnapshot();
  if (!snapshot) return fallback;

  const change = snapshot.price - snapshot.previousClose;
  const date = snapshot.date ?? fallback?.tradingDate ?? '';

  return {
    symbol: TAIEX_SYMBOL,
    name: INDEX_NAMES[TAIEX_SYMBOL] ?? fallback?.name ?? TAIEX_SYMBOL,
    price: snapshot.price,
    previousClose: snapshot.previousClose,
    change,
    changePercent: snapshot.previousClose ? (change / snapshot.previousClose) * 100 : 0,
    // Yahoo 還停在昨天時它那條線也是昨天的，那就只留今天的即時樣本
    ...(fallback?.tradingDate === date
      ? { points: fallback.points, offsets: fallback.offsets, sessionMinutes: fallback.sessionMinutes }
      : toSeries(mergeWithLive(TAIEX_SYMBOL, date, []), date)),
    tradingDate: date,
  };
}

export async function fetchIndexQuote(symbol: string): Promise<IndexQuote | null> {
  try {
    const result = await getYahooClient().chart(symbol, {
      period1: new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
      // 與即時樣本同樣是分鐘級，兩邊接起來間距才會一致
      interval: '1m',
    });

    const meta = result.meta as unknown as Record<string, unknown>;
    const timeZone =
      typeof meta?.exchangeTimezoneName === 'string' ? meta.exchangeTimezoneName : 'UTC';

    const quotes = (result.quotes ?? []) as { date?: Date; close?: number | null }[];
    const valid = quotes
      .filter((q): q is { date: Date; close: number } => q?.date != null && q.close != null)
      .map((q) => ({ date: new Date(q.date), close: q.close }));

    if (valid.length === 0) return null;

    // 只留最後一個交易日，走勢圖才不會把好幾天串在一起
    const lastDay = dateKey(valid[valid.length - 1].date, timeZone);
    const sameDay = valid.filter((q) => dateKey(q.date, timeZone) === lastDay);
    const series = sameDay.length > 1 ? sameDay : valid;

    const price =
      typeof meta?.regularMarketPrice === 'number'
        ? meta.regularMarketPrice
        : series[series.length - 1].close;

    // meta.previousClose 才是昨收；chartPreviousClose 是查詢區間之前的收盤價
    const previousClose = await resolvePreviousClose(
      symbol,
      meta,
      price,
      timeZone,
      lastDay,
      series[0].close
    );

    const change = price - previousClose;

    return {
      symbol,
      name:
        INDEX_NAMES[symbol] ||
        (typeof meta?.shortName === 'string' ? meta.shortName : symbol),
      price,
      previousClose,
      change,
      changePercent: previousClose ? (change / previousClose) * 100 : 0,
      // Yahoo 的 K 棒延遲約 20 分鐘，最新那一段接自己累積的即時樣本（只有 ^TWII 有）
      ...toSeries(
        mergeWithLive(
          symbol,
          lastDay,
          series.map((q) => ({ bucket: toBucket(q.date), price: q.close }))
        ),
        symbol === TAIEX_SYMBOL ? lastDay : null
      ),
      tradingDate: lastDay,
    };
  } catch (error) {
    console.error(`Failed to fetch index ${symbol}:`, error);
    return null;
  }
}

export async function fetchIndexQuotes(
  symbols: string[]
): Promise<Record<string, IndexQuote>> {
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const quote = await fetchIndexQuote(symbol);
      return symbol === TAIEX_SYMBOL ? taiexQuote(quote) : quote;
    })
  );

  const map: Record<string, IndexQuote> = {};
  for (const quote of results) {
    if (quote) map[quote.symbol] = quote;
  }
  return map;
}
