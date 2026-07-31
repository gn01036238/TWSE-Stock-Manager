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
    const previousClose =
      typeof meta?.previousClose === 'number' ? meta.previousClose : series[0].close;

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
