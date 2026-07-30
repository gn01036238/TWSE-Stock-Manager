import type { DailyBar } from '@/types';
import { getYahooClient, toYahooSymbols } from './yahoo';
import { taipeiDateKey } from './market';

/** 抓多少天的日線回來（含假日，實際交易日約 2/3） */
const LOOKBACK_DAYS = 60;
/** 當日那根 K 棒盤中還在跳，快取不能太久 */
const CACHE_TTL = 10 * 60 * 1000;

/** 加權指數在表格裡借用 0000，Yahoo 端對應 ^TWII */
const TAIEX_TICKER = '0000';

/** 上市 .TW、上櫃 .TWO；加權指數走 ^TWII */
function symbolsFor(ticker: string): string[] {
  return ticker === TAIEX_TICKER ? ['^TWII'] : toYahooSymbols(ticker);
}

const cache = new Map<string, { at: number; value: DailyBar[] }>();

async function fetchFromYahoo(symbol: string): Promise<DailyBar[]> {
  const result = await getYahooClient().chart(symbol, {
    period1: new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
    interval: '1d',
  });

  const raw = (result.quotes ?? []) as {
    date?: Date;
    open?: number | null;
    high?: number | null;
    low?: number | null;
    close?: number | null;
    volume?: number | null;
  }[];

  const bars: DailyBar[] = [];

  for (const bar of raw) {
    // 缺任何一個價位就畫不出 K 棒（休市日 Yahoo 會回一整排 null）
    if (
      bar?.date == null ||
      bar.open == null ||
      bar.high == null ||
      bar.low == null ||
      bar.close == null ||
      !(bar.close > 0)
    ) {
      continue;
    }

    bars.push({
      date: taipeiDateKey(new Date(bar.date)),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      // Yahoo 給股數，一律換成張
      volume: bar.volume != null && bar.volume > 0 ? bar.volume / 1000 : null,
    });
  }

  return bars;
}

/**
 * 單檔的日線（舊的在前，最後一根可能是還在跳動的當日）。
 * 成交量統計與 K 棒圖共用這份資料與快取，同一檔不會重複問 Yahoo。
 */
export async function fetchDailyBars(ticker: string): Promise<DailyBar[]> {
  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.value;

  let bars: DailyBar[] = [];

  for (const symbol of symbolsFor(ticker)) {
    try {
      bars = await fetchFromYahoo(symbol);
      if (bars.length > 0) break;
    } catch (error) {
      console.error(`Failed to fetch daily bars for ${symbol}:`, error);
    }
  }

  cache.set(ticker, { at: Date.now(), value: bars });
  return bars;
}

/** 多檔日線，回傳最後 limit 根 */
export async function fetchDailyBarsFor(
  tickers: string[],
  limit: number
): Promise<Map<string, DailyBar[]>> {
  const results = await Promise.all(
    tickers.map(async (ticker) => [ticker, (await fetchDailyBars(ticker)).slice(-limit)] as const)
  );

  return new Map(results);
}
