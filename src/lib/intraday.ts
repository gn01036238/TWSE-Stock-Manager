import type { IntradaySeries, StockPrice } from '@/types';
import { getYahooClient, isSymbolNotFound, toYahooSymbols } from './yahoo';
import { fetchStockPrices } from './twse';
import { mergeWithLive, toBucket, type LiveSample } from './intraday-store';
import {
  latestTradingDateKey,
  sessionOpenBucket,
  SESSION_MINUTES,
  taipeiDateKey,
} from './market';

/** 只要涵蓋得到「最後一個交易日」就好；分鐘線抓太多天資料量會很可觀 */
const LOOKBACK_DAYS = 4;

/** Yahoo 手上最後一個交易日的 1 分鐘線 */
interface YahooBars {
  tradingDate: string;
  bars: LiveSample[];
  previousClose: number | null;
}

async function fetchBars(symbol: string): Promise<YahooBars | null> {
  const result = await getYahooClient().chart(symbol, {
    period1: new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
    interval: '1m',
  });

  const raw = (result.quotes ?? []) as { date?: Date; close?: number | null }[];
  const meta = result.meta as unknown as Record<string, unknown>;

  const quotes = raw
    .filter(
      (q): q is { date: Date; close: number } =>
        q?.close != null && !Number.isNaN(q.close) && q.date != null
    )
    .map((q) => ({ date: new Date(q.date), close: q.close }));

  if (quotes.length === 0) return null;

  // 只留最後一個交易日，免得把好幾天串成一條線
  const tradingDate = taipeiDateKey(quotes[quotes.length - 1].date);

  return {
    tradingDate,
    bars: quotes
      .filter((q) => taipeiDateKey(q.date) === tradingDate)
      .map((q) => ({ bucket: toBucket(q.date), price: q.close })),
    // 官方昨收。注意 chartPreviousClose 是查詢區間之前的收盤價，不是昨收
    previousClose: typeof meta?.previousClose === 'number' ? meta.previousClose : null,
  };
}

async function fetchYahooBars(ticker: string): Promise<YahooBars | null> {
  for (const symbol of toYahooSymbols(ticker)) {
    try {
      const bars = await fetchBars(symbol);
      if (bars) return bars;
    } catch (error) {
      if (!isSymbolNotFound(error)) {
        console.error(`Failed to fetch intraday chart for ${symbol}:`, error);
      }
    }
  }

  return null;
}

/** 報價裡最新的交易日；TWSE 給的日期最準（避得開國定假日，也不會落後一天） */
function latestQuoteDate(prices: Map<string, StockPrice>): string | null {
  const dates = [...prices.values()]
    .map((price) => price.tradingDate)
    .filter((date): date is string => !!date)
    .sort();

  return dates[dates.length - 1] ?? null;
}

/** 把樣本換算成走勢圖要的價格序列與 X 座標（距離開盤幾分鐘） */
function toSeries(samples: LiveSample[], tradingDate: string) {
  const openBucket = sessionOpenBucket(tradingDate);

  return {
    points: samples.map((sample) => sample.price),
    offsets: samples.map((sample) => sample.bucket - openBucket),
    sessionMinutes: SESSION_MINUTES,
  };
}

export async function fetchIntradaySeries(
  tickers: string[]
): Promise<Record<string, IntradaySeries>> {
  // 順手讓 TWSE 的即時價進到走勢樣本裡，這是線的尾巴唯一的來源
  const prices = await fetchStockPrices(tickers);
  const tradingDate = latestQuoteDate(prices) ?? latestTradingDateKey();

  const yahooBars = await Promise.all(tickers.map(fetchYahooBars));

  const map: Record<string, IntradaySeries> = {};

  tickers.forEach((ticker, index) => {
    const yahoo = yahooBars[index];
    const quote = prices.get(ticker);
    // Yahoo 的台股分鐘線延遲約 20 分鐘，開盤前 20 分鐘更是整場停在昨天，
    // 確定是今天的才拿來當前半段，最新那一段一律靠自己累積的即時樣本
    const isToday = yahoo?.tradingDate === tradingDate;
    const samples = mergeWithLive(ticker, tradingDate, isToday ? yahoo!.bars : []);

    if (samples.length > 0) {
      map[ticker] = {
        ticker,
        ...toSeries(samples, tradingDate),
        // 昨收也以 TWSE 為準，Yahoo 落後時它的 previousClose 會是前天的
        previousClose: quote?.previousClose ?? yahoo?.previousClose ?? samples[0].price,
        tradingDate,
        // Yahoo 沒補到前半段時，整條線都是自己累積的
        source: isToday ? 'yahoo' : 'live',
      };
      return;
    }

    // 盤前 / 休市：手上只有 Yahoo 那一天，由 tradingDate 誠實標出這條線不是今天的
    if (yahoo && yahoo.bars.length > 0) {
      map[ticker] = {
        ticker,
        ...toSeries(yahoo.bars, yahoo.tradingDate),
        previousClose: yahoo.previousClose ?? yahoo.bars[0].price,
        tradingDate: yahoo.tradingDate,
        source: 'yahoo',
      };
    }
  });

  return map;
}
