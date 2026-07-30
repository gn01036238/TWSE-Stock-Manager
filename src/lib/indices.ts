import type { IndexQuote } from '@/types';
import { getYahooClient } from './yahoo';
import { INDEX_NAMES } from './index-symbols';

const LOOKBACK_DAYS = 7;

function dateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export async function fetchIndexQuote(symbol: string): Promise<IndexQuote | null> {
  try {
    const result = await getYahooClient().chart(symbol, {
      period1: new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
      interval: '5m',
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
      points: series.map((q) => q.close),
    };
  } catch (error) {
    console.error(`Failed to fetch index ${symbol}:`, error);
    return null;
  }
}

export async function fetchIndexQuotes(
  symbols: string[]
): Promise<Record<string, IndexQuote>> {
  const results = await Promise.all(symbols.map(fetchIndexQuote));

  const map: Record<string, IndexQuote> = {};
  for (const quote of results) {
    if (quote) map[quote.symbol] = quote;
  }
  return map;
}
