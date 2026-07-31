import type { StockPrice, TWseApiResponse, TWseStockInfo } from '@/types';
import { getYahooClient, toYahooSymbols } from './yahoo';
import { recordLivePrice } from './intraday-store';
import { getMarketStatus } from './market';

const TWSE_API = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';

// Stock code to exchange mapping (some ETFs and stocks need different prefixes)
const OTC_STOCKS = new Set<string>([
  // Add OTC stock codes here if needed
]);

/** 同一批快照在 /api/prices、/api/chips、/api/intraday 之間共用 */
const SNAPSHOT_TTL = 5 * 1000;

function getExchangeCode(ticker: string): string {
  return OTC_STOCKS.has(ticker) ? 'otc' : 'tse';
}

/** TWSE 用 "-" 表示無資料 */
function num(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * 五檔欄位形如 "245.0000_244.5000_..."，取最好的一檔。
 * 漲跌停時第一檔可能是 "0.0000"（市價單），要往後找到第一個真的價格。
 */
function bestQuote(field: string | undefined): number | null {
  if (!field) return null;

  for (const part of field.split('_')) {
    const price = num(part);
    if (price) return price;
  }

  return null;
}

/** 無成交價時，用最佳買賣價中間值推估 */
function midPrice(item: TWseStockInfo | undefined): number | null {
  const bid = bestQuote(item?.b);
  const ask = bestQuote(item?.a);
  if (bid && ask) return (bid + ask) / 2;
  return bid ?? ask;
}

/** MIS 的 d 是 "20260731" */
function misTradingDate(value: string | undefined): string | null {
  const match = value?.match(/^(\d{4})(\d{2})(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/**
 * TWSE 快照裡屬於「今天」的價格。
 * z（最近成交價）在盤中常常是 "-"（那一筆五秒快照剛好沒成交），漲跌停鎖死時
 * 連五檔都只剩一邊，所以要一路往下退，但絕不能退到 y（昨收）去。
 */
function twseLivePrice(item: TWseStockInfo | undefined, marketOpen: boolean): number | null {
  if (!item) return null;

  const traded = num(item.z) ?? midPrice(item);
  if (traded) return traded;

  // 開盤價至少還是今天的資料；收盤後五檔會清空，那時退到開盤價反而是錯的
  return marketOpen ? num(item.o) : null;
}

async function fetchMisBatch(codes: string[]): Promise<TWseStockInfo[]> {
  if (codes.length === 0) return [];

  try {
    const response = await fetch(`${TWSE_API}?ex_ch=${codes.join('|')}&json=1&delay=0`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!response.ok) {
      throw new Error(`TWSE API error: ${response.status}`);
    }

    const data: TWseApiResponse = await response.json();

    return (data.msgArray ?? []).filter((item) => item?.c);
  } catch (error) {
    console.error('Failed to fetch TWSE prices:', error);
    return [];
  }
}

const snapshotCache = new Map<string, { at: number; item: TWseStockInfo }>();

async function fetchTwseSnapshot(tickers: string[]): Promise<Map<string, TWseStockInfo>> {
  const map = new Map<string, TWseStockInfo>();
  const now = Date.now();
  const stale: string[] = [];

  for (const ticker of tickers) {
    const cached = snapshotCache.get(ticker);
    if (cached && now - cached.at < SNAPSHOT_TTL) map.set(ticker, cached.item);
    else stale.push(ticker);
  }

  if (stale.length === 0) return map;

  const listed = await fetchMisBatch(stale.map((t) => `${getExchangeCode(t)}_${t}.tw`));
  for (const item of listed) map.set(item.c, item);

  // 上市查不到的再問上櫃，免得上櫃股票整場只能吃 Yahoo 的落後報價
  const missing = stale.filter((ticker) => !map.has(ticker));
  if (missing.length > 0) {
    const otc = await fetchMisBatch(missing.map((t) => `otc_${t}.tw`));
    for (const item of otc) map.set(item.c, item);
  }

  for (const ticker of stale) {
    const item = map.get(ticker);
    if (item) snapshotCache.set(ticker, { at: now, item });
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
 * TWSE 完全沒有資料時（下市、非上市櫃、API 掛掉）的備援。
 * 注意 Yahoo 的台股報價常常整場落後一天，只能當最後手段，不能拿來蓋掉 TWSE。
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

  const now = new Date();
  const marketOpen = getMarketStatus(now) === 'open';
  const snapshot = await fetchTwseSnapshot(tickers);

  // 只有 TWSE 連今天的價格都湊不出來的才問 Yahoo。Yahoo 的台股報價常常還停在
  // 昨天收盤，而昨收基準也是同一個數字，用它當現價會讓漲跌幅與今日損益變成 0
  const needsFallback = tickers.filter(
    (ticker) => !twseLivePrice(snapshot.get(ticker), marketOpen)
  );
  const yahooQuotes = await fetchYahooQuotes(needsFallback);

  const prices = new Map<string, StockPrice>();

  for (const ticker of tickers) {
    const item = snapshot.get(ticker);
    const yahoo = yahooQuotes.get(ticker);

    const currentPrice = twseLivePrice(item, marketOpen) ?? yahoo?.price ?? null;
    const previousClose = num(item?.y) ?? yahoo?.previousClose ?? null;

    // 完全查不到報價（例如已下市個股）就不放進結果
    if (!currentPrice) continue;

    const change = previousClose ? currentPrice - previousClose : 0;
    const tradingDate = misTradingDate(item?.d);

    // 盤中順手留樣本，Yahoo 還沒給今天的 K 棒時就靠它畫「今日走勢」
    if (marketOpen && tradingDate) recordLivePrice(ticker, tradingDate, currentPrice, now);

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
      tradingDate,
      updatedAt: now,
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
