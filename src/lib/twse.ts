import type { StockPrice, TWseApiResponse, TWseStockInfo } from '@/types';
import { getYahooClient, toYahooSymbols } from './yahoo';

const TWSE_API = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';

// Stock code to exchange mapping (some ETFs and stocks need different prefixes)
const OTC_STOCKS = new Set<string>([
  // Add OTC stock codes here if needed
]);

function getExchangeCode(ticker: string): string {
  return OTC_STOCKS.has(ticker) ? 'otc' : 'tse';
}

/** TWSE 用 "-" 表示無資料 */
function num(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** 五檔欄位形如 "32.9500_32.9000_..."，取最佳一檔 */
function bestQuote(field: string | undefined): number | null {
  if (!field) return null;
  return num(field.split('_')[0]);
}

/** 無成交價時，用最佳買賣價中間值推估 */
function midPrice(item: TWseStockInfo | undefined): number | null {
  const bid = bestQuote(item?.b);
  const ask = bestQuote(item?.a);
  if (bid && ask) return (bid + ask) / 2;
  return bid ?? ask;
}

async function fetchTwseSnapshot(
  tickers: string[]
): Promise<Map<string, TWseStockInfo>> {
  const codes = tickers.map((t) => `${getExchangeCode(t)}_${t}.tw`).join('|');
  const map = new Map<string, TWseStockInfo>();

  try {
    const response = await fetch(`${TWSE_API}?ex_ch=${codes}&json=1&delay=0`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`TWSE API error: ${response.status}`);
    }

    const data: TWseApiResponse = await response.json();

    for (const item of data.msgArray ?? []) {
      if (item?.c) map.set(item.c, item);
    }
  } catch (error) {
    console.error('Failed to fetch TWSE prices:', error);
  }

  return map;
}

interface YahooQuoteLite {
  price: number | null;
  previousClose: number | null;
  name: string | null;
  high: number | null;
  low: number | null;
  volume: number | null;
}

/**
 * 盤中 TWSE 的 z（最近成交價）常常是 "-"（該五秒快照無成交），
 * 收盤後更是永遠沒有。用 Yahoo 的最後成交價補上。
 */
async function fetchYahooQuotes(
  tickers: string[]
): Promise<Map<string, YahooQuoteLite>> {
  const map = new Map<string, YahooQuoteLite>();
  if (tickers.length === 0) return map;

  const symbolToTicker = new Map<string, string>();
  for (const ticker of tickers) {
    for (const symbol of toYahooSymbols(ticker)) {
      symbolToTicker.set(symbol, ticker);
    }
  }

  try {
    const results = await getYahooClient().quote([...symbolToTicker.keys()]);
    const list = Array.isArray(results) ? results : [results];

    for (const quote of list) {
      const q = quote as unknown as Record<string, unknown>;
      const symbol = typeof q?.symbol === 'string' ? q.symbol : null;
      const ticker = symbol ? symbolToTicker.get(symbol) : undefined;
      const price = typeof q?.regularMarketPrice === 'number' ? q.regularMarketPrice : null;

      // 同一檔可能同時查 .TW / .TWO，只留有報價的那個
      if (!ticker || !price || map.has(ticker)) continue;

      map.set(ticker, {
        price,
        previousClose:
          typeof q.regularMarketPreviousClose === 'number'
            ? q.regularMarketPreviousClose
            : null,
        name:
          (typeof q.longName === 'string' && q.longName) ||
          (typeof q.shortName === 'string' && q.shortName) ||
          null,
        high: typeof q.regularMarketDayHigh === 'number' ? q.regularMarketDayHigh : null,
        low: typeof q.regularMarketDayLow === 'number' ? q.regularMarketDayLow : null,
        volume: typeof q.regularMarketVolume === 'number' ? q.regularMarketVolume : null,
      });
    }
  } catch (error) {
    console.error('Failed to fetch Yahoo quotes:', error);
  }

  return map;
}

export async function fetchStockPrices(tickers: string[]): Promise<Map<string, StockPrice>> {
  if (tickers.length === 0) return new Map();

  const snapshot = await fetchTwseSnapshot(tickers);

  // TWSE 沒給成交價的，統一交給 Yahoo 補
  const needsFallback = tickers.filter((ticker) => !num(snapshot.get(ticker)?.z));
  const yahooQuotes = await fetchYahooQuotes(needsFallback);

  const prices = new Map<string, StockPrice>();

  for (const ticker of tickers) {
    const item = snapshot.get(ticker);
    const yahoo = yahooQuotes.get(ticker);

    // 現價優先序：TWSE 成交價 → Yahoo 最後成交價 → TWSE 最佳買賣中價
    const currentPrice = num(item?.z) ?? yahoo?.price ?? midPrice(item);
    const previousClose = num(item?.y) ?? yahoo?.previousClose ?? null;

    // 完全查不到報價（例如已下市個股）就不放進結果
    if (!currentPrice) continue;

    const change = previousClose ? currentPrice - previousClose : 0;

    prices.set(ticker, {
      ticker,
      name: item?.n || yahoo?.name || ticker,
      price: currentPrice,
      previousClose: previousClose ?? currentPrice,
      change,
      changePercent: previousClose ? (change / previousClose) * 100 : 0,
      high: num(item?.h) ?? yahoo?.high ?? currentPrice,
      low: num(item?.l) ?? yahoo?.low ?? currentPrice,
      // 一律以「張」為單位：TWSE 的 v 已是張，Yahoo 給的是股數
      volume: num(item?.v) ?? (yahoo?.volume != null ? yahoo.volume / 1000 : 0),
      updatedAt: new Date(),
    });
  }

  return prices;
}

export async function fetchStockPrice(ticker: string): Promise<StockPrice | null> {
  const prices = await fetchStockPrices([ticker]);
  return prices.get(ticker) || null;
}

// Get stock name from price data
export function getStockName(prices: Map<string, StockPrice>, ticker: string): string {
  return prices.get(ticker)?.name || ticker;
}
