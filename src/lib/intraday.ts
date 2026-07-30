import type { IntradaySeries } from '@/types';
import { getYahooClient, toYahooSymbols } from './yahoo';

const LOOKBACK_DAYS = 7;

interface Quote {
  date: Date;
  close: number;
}

/** 以台北時區取得 YYYY-MM-DD，用來切出「最後一個交易日」 */
function taipeiDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function fetchQuotes(
  symbol: string
): Promise<{ quotes: Quote[]; previousClose: number | null }> {
  const result = await getYahooClient().chart(symbol, {
    period1: new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
    interval: '5m',
  });

  const raw = (result.quotes ?? []) as { date?: Date; close?: number | null }[];
  const meta = result.meta as unknown as Record<string, unknown>;

  return {
    quotes: raw
      .filter(
        (q): q is { date: Date; close: number } =>
          q?.close != null && !Number.isNaN(q.close) && q.date != null
      )
      .map((q) => ({ date: new Date(q.date), close: q.close })),
    // 官方昨收。注意 chartPreviousClose 是查詢區間之前的收盤價，不是昨收
    previousClose: typeof meta?.previousClose === 'number' ? meta.previousClose : null,
  };
}

/** 取得單檔股票「最後一個交易日」的 5 分鐘線 */
export async function fetchIntradayForTicker(ticker: string): Promise<IntradaySeries | null> {
  for (const symbol of toYahooSymbols(ticker)) {
    try {
      const { quotes, previousClose } = await fetchQuotes(symbol);
      if (quotes.length === 0) continue;

      const lastDay = taipeiDateKey(quotes[quotes.length - 1].date);
      const todayQuotes = quotes.filter((q) => taipeiDateKey(q.date) === lastDay);

      // 當日資料太少（例如剛開盤）時退回顯示整段區間，至少畫得出線
      const series = todayQuotes.length > 1 ? todayQuotes : quotes;

      return {
        ticker,
        points: series.map((q) => q.close),
        previousClose: previousClose ?? series[0].close,
        tradingDate: lastDay,
      };
    } catch (error) {
      console.error(`Failed to fetch intraday chart for ${symbol}:`, error);
    }
  }

  return null;
}

export async function fetchIntradaySeries(
  tickers: string[]
): Promise<Record<string, IntradaySeries>> {
  const results = await Promise.all(tickers.map(fetchIntradayForTicker));

  const map: Record<string, IntradaySeries> = {};
  for (const series of results) {
    if (series) map[series.ticker] = series;
  }
  return map;
}
