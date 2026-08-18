import type { Transaction } from '@/types';
import { computeHoldings, groupByTicker, sortByTradeOrder } from './calculations';
import { fetchDailyBars } from './daily-bars';
import { calculateDividendIncome, fetchDividendHistory } from './dividends';
import { fetchIntradaySeries } from './intraday';
import { taipeiDateKey, latestTradingDateKey, SESSION_MINUTES } from './market';
import { fetchStockPrices } from './twse';

export type HistoryRange = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y' | 'MAX';

export interface PortfolioHistoryPoint {
  /** 日線是交易日 YYYY-MM-DD；1D 是距離開盤的分鐘數（字串） */
  date: string;
  marketValue: number;
  totalPnl: number;
}

export interface PortfolioHistorySeries {
  range: HistoryRange;
  points: PortfolioHistoryPoint[];
  /**
   * 這段區間「損益 ±0」的位置：1D 是昨收基準值（今日買進的部位以成交價計，同總覽的今日損益），
   * 其餘區間是區間開始前一個交易日的收盤值。走勢圖的灰色基準線畫在這裡——
   * 不是第一個點（開盤價），開盤本身就已經跳空賺賠過一次了
   */
  baseline?: { marketValue: number; totalPnl: number };
  /** 只有 1D 有值：跟 points 等長，距離開盤幾分鐘，走勢圖用來畫固定 09:00–13:30 的 X 軸 */
  offsets?: number[];
  sessionMinutes?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface TickerState {
  date: string;
  shares: number;
  /** 均價法的成本基礎，算未實現損益用（跟 computeHoldings 邏輯一致） */
  totalCost: number;
  /** FIFO 累積已實現損益（跟 computeRealizedGains 邏輯一致） */
  cumRealized: number;
}

/**
 * 逐筆重播一檔股票的交易紀錄，回傳每一筆交易後的持股狀態。
 * 未實現損益用均價法、已實現損益用 FIFO——跟 calculations.ts 的兩個函式定義完全對齊，
 * 這樣走勢圖最後一個點才會跟總覽頁「現在」的數字一致。
 */
function replayTicker(transactions: Transaction[]): TickerState[] {
  let shares = 0;
  let totalCost = 0;
  let cumRealized = 0;
  const buyQueue: { quantity: number; price: number; commission: number }[] = [];
  const states: TickerState[] = [];

  for (const tx of sortByTradeOrder(transactions)) {
    // 配股跟買入一樣增加股數，只是 price 與 commission 都是 0，成本自然不變
    if (tx.transaction_type !== 'SELL') {
      totalCost += tx.quantity * tx.price + (tx.commission || 0);
      shares += tx.quantity;
      buyQueue.push({ quantity: tx.quantity, price: tx.price, commission: tx.commission || 0 });
    } else {
      if (shares > 0) {
        const costPerShare = totalCost / shares;
        totalCost -= tx.quantity * costPerShare;
        shares -= tx.quantity;
      }

      let remaining = tx.quantity;
      let matchedCost = 0;
      while (remaining > 0 && buyQueue.length > 0) {
        const lot = buyQueue[0];
        const taken = Math.min(remaining, lot.quantity);
        matchedCost += taken * lot.price + (lot.commission / lot.quantity) * taken;
        lot.quantity -= taken;
        remaining -= taken;
        if (lot.quantity <= 0) buyQueue.shift();
      }

      const sellRevenue = tx.quantity * tx.price - (tx.commission || 0) - (tx.tax || 0);
      cumRealized += sellRevenue - matchedCost;
    }

    states.push({ date: tx.transaction_date.slice(0, 10), shares, totalCost, cumRealized });
  }

  return states;
}

const EMPTY_STATE: TickerState = { date: '', shares: 0, totalCost: 0, cumRealized: 0 };

/** 找出 <= date 的最後一筆狀態；那天之前還沒買過就視為空倉 */
function stateAsOf(states: TickerState[], date: string): TickerState {
  let result = EMPTY_STATE;
  for (const state of states) {
    if (state.date > date) break;
    result = state;
  }
  return result;
}

function earliestTransactionDate(transactions: Transaction[]): string | null {
  return transactions.reduce<string | null>((min, t) => {
    const d = t.transaction_date.slice(0, 10);
    return !min || d < min ? d : min;
  }, null);
}

function daysBetween(startKey: string, endKey: string): number {
  const start = new Date(`${startKey}T00:00:00+08:00`).getTime();
  const end = new Date(`${endKey}T00:00:00+08:00`).getTime();
  return Math.max(1, Math.ceil((end - start) / DAY_MS));
}

const RANGE_LOOKBACK_DAYS: Partial<Record<HistoryRange, number>> = {
  '5D': 20,
  '1M': 45,
  '6M': 195,
  '1Y': 380,
  '5Y': 1850,
};

/** 要往回抓幾天的日線，以及最後篩選日線時的起始日期（5D 不用日期篩，直接取最後 5 個交易日） */
function rangeWindow(
  range: Exclude<HistoryRange, '1D'>,
  earliestTxDate: string | null
): { fetchDays: number; cutoff: string | null } {
  const todayKey = taipeiDateKey();

  if (range === 'YTD') {
    const cutoff = `${todayKey.slice(0, 4)}-01-01`;
    return { fetchDays: daysBetween(cutoff, todayKey) + 10, cutoff };
  }

  if (range === 'MAX') {
    if (!earliestTxDate) return { fetchDays: 30, cutoff: null };
    return { fetchDays: daysBetween(earliestTxDate, todayKey) + 10, cutoff: earliestTxDate };
  }

  if (range === '5D') {
    return { fetchDays: 20, cutoff: null };
  }

  const days = RANGE_LOOKBACK_DAYS[range] ?? 45;
  return { fetchDays: days, cutoff: taipeiDateKey(new Date(Date.now() - (days - 10) * DAY_MS)) };
}

/**
 * 日線區間的走勢（5D ~ MAX）。以加權指數的交易日當作行事曆，每檔缺報價的日子
 * （停牌等）往前補最後一次收盤價；市值與損益都用 stateAsOf 對齊到當天的持股狀態。
 */
export async function fetchDailyPortfolioHistory(
  range: Exclude<HistoryRange, '1D'>,
  transactions: Transaction[]
): Promise<PortfolioHistorySeries> {
  const tickers = Array.from(new Set(transactions.map((t) => t.ticker)));
  if (tickers.length === 0) return { range, points: [] };

  const { fetchDays, cutoff } = rangeWindow(range, earliestTransactionDate(transactions));

  const [taiexBars, barsEntries, dividendEntries] = await Promise.all([
    fetchDailyBars('0000', fetchDays),
    Promise.all(tickers.map(async (t) => [t, await fetchDailyBars(t, fetchDays)] as const)),
    Promise.all(tickers.map(async (t) => [t, await fetchDividendHistory(t)] as const)),
  ]);

  const barsByTicker = new Map(barsEntries);
  const dividendEventsByTicker = new Map(dividendEntries);

  let calendar = taiexBars.map((b) => b.date);
  if (calendar.length === 0) {
    calendar = Array.from(new Set(barsEntries.flatMap(([, bars]) => bars.map((b) => b.date)))).sort();
  }
  if (calendar.length === 0) return { range, points: [] };

  // 區間的第一天在 calendar 的位置。前面那幾天照樣算（只是不畫），
  // 因為基準線要的是「區間開始前一個交易日的收盤」——區間第一天自己的漲跌也算在這段裡面
  let startIdx = 0;
  if (cutoff) {
    const idx = calendar.findIndex((d) => d >= cutoff);
    if (idx < 0) return { range, points: [] };
    startIdx = idx;
  }
  if (range === '5D') startIdx = Math.max(0, calendar.length - 5);

  const byTicker = groupByTicker(transactions);
  const statesByTicker = new Map(tickers.map((t) => [t, replayTicker(byTicker.get(t) || [])]));

  const dividendPoints = tickers
    .flatMap((t) =>
      calculateDividendIncome(byTicker.get(t) || [], dividendEventsByTicker.get(t) || [], t)
    )
    .map((d) => ({ date: taipeiDateKey(d.exDate), income: d.income }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // 每檔的收盤價對齊到 calendar，缺的那天往前補最後一次收盤（停牌）
  const closeByTicker = new Map<string, Map<string, number>>();
  for (const ticker of tickers) {
    const bars = barsByTicker.get(ticker) || [];
    const barMap = new Map(bars.map((b) => [b.date, b.close]));
    let last = 0;
    const filled = new Map<string, number>();
    for (const date of calendar) {
      if (barMap.has(date)) last = barMap.get(date)!;
      filled.set(date, last);
    }
    closeByTicker.set(ticker, filled);
  }

  let divIdx = 0;
  let cumDividends = 0;

  const allPoints: PortfolioHistoryPoint[] = calendar.map((date) => {
    while (divIdx < dividendPoints.length && dividendPoints[divIdx].date <= date) {
      cumDividends += dividendPoints[divIdx].income;
      divIdx++;
    }

    let marketValue = 0;
    let totalPnl = cumDividends;

    // 每檔都要算，即使已經出清（shares 為 0）——已實現損益仍要算進總損益，
    // 只是市值那段自然是 0（shares×close），不能整檔跳過
    for (const ticker of tickers) {
      const state = stateAsOf(statesByTicker.get(ticker)!, date);
      const close = closeByTicker.get(ticker)?.get(date) ?? 0;
      const value = state.shares * close;
      marketValue += value;
      totalPnl += value - state.totalCost + state.cumRealized;
    }

    return { date, marketValue, totalPnl };
  });

  const points = allPoints.slice(startIdx);
  if (points.length === 0) return { range, points: [] };

  const prev = startIdx > 0 ? allPoints[startIdx - 1] : null;
  return {
    range,
    points,
    baseline: prev ? { marketValue: prev.marketValue, totalPnl: prev.totalPnl } : undefined,
  };
}

/**
 * 1D 走勢：盤中只有市值會變（成本、已實現損益、股利在收盤前不會變），
 * 所以損益(offset) = 市值(offset) − 市值(現在) + 損益(現在)，不用重算逐分鐘的成本基礎。
 */
export async function fetchIntradayPortfolioHistory(
  transactions: Transaction[]
): Promise<PortfolioHistorySeries> {
  const tickers = Array.from(new Set(transactions.map((t) => t.ticker)));
  if (tickers.length === 0) return { range: '1D', points: [] };

  const byTicker = groupByTicker(transactions);
  const statesByTicker = new Map(tickers.map((t) => [t, replayTicker(byTicker.get(t) || [])]));
  const nowStates = new Map(
    tickers.map((t) => {
      const states = statesByTicker.get(t)!;
      return [t, states[states.length - 1] ?? EMPTY_STATE] as const;
    })
  );

  const heldTickers = tickers.filter((t) => (nowStates.get(t)?.shares ?? 0) > 0);
  if (heldTickers.length === 0) return { range: '1D', points: [] };

  const [prices, intradayMap, dividendEntries] = await Promise.all([
    fetchStockPrices(heldTickers),
    fetchIntradaySeries(heldTickers),
    // 已出清的股票股利照樣要算進「現在」的損益，跟總覽頁一致，所以是全部 tickers、不只 heldTickers
    Promise.all(tickers.map(async (t) => [t, await fetchDividendHistory(t)] as const)),
  ]);
  const dividendEventsByTicker = new Map(dividendEntries);

  // 「現在」損益：所有曾經交易過的股票都算（含已出清的已實現損益、股利），
  // 才會跟總覽頁的「已實現損益＋股利」一致；已出清的股票 shares 為 0，市值自然是 0
  let marketValueNow = 0;
  let totalPnlNow = 0;
  for (const ticker of tickers) {
    const state = nowStates.get(ticker)!;
    const price = prices.get(ticker)?.price || 0;
    const value = state.shares * price;
    marketValueNow += value;
    totalPnlNow += value - state.totalCost + state.cumRealized;
  }
  for (const ticker of tickers) {
    const income = calculateDividendIncome(
      byTicker.get(ticker) || [],
      dividendEventsByTicker.get(ticker) || [],
      ticker
    ).reduce((sum, d) => sum + d.income, 0);
    totalPnlNow += income;
  }

  const offsetSet = new Set<number>();
  for (const ticker of heldTickers) {
    for (const offset of intradayMap[ticker]?.offsets ?? []) offsetSet.add(offset);
  }
  if (offsetSet.size === 0) return { range: '1D', points: [] };
  const offsets = Array.from(offsetSet).sort((a, b) => a - b);

  const priceAtOffset = (ticker: string, offset: number): number => {
    const series = intradayMap[ticker];
    if (!series) return prices.get(ticker)?.previousClose || 0;
    let price = series.previousClose;
    for (let i = 0; i < series.offsets.length; i++) {
      if (series.offsets[i] > offset) break;
      price = series.points[i];
    }
    return price;
  };

  const points = offsets.map((offset) => {
    let marketValue = 0;
    for (const ticker of heldTickers) {
      marketValue += (nowStates.get(ticker)?.shares ?? 0) * priceAtOffset(ticker, offset);
    }
    return {
      date: String(offset),
      marketValue,
      totalPnl: marketValue - marketValueNow + totalPnlNow,
    };
  });

  // 今日損益 ±0 的市值：昨日持股用昨收、今日買進的部位用成交價，直接沿用 computeHoldings
  // 算好的 dayBasis，這樣灰線的位置跟摘要的今日損益一定對得起來。
  // 昨收或報價抓不到（dayBasis 為 0）的那檔就用現值頂替，等於它對今日損益貢獻 0
  const tradingDate =
    Array.from(prices.values())
      .map((p) => p.tradingDate)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? latestTradingDateKey();
  const baselineMarketValue = computeHoldings(
    transactions,
    prices,
    new Map(),
    new Map(),
    tradingDate
  ).reduce((sum, h) => sum + (h.dayBasis > 0 ? h.dayBasis : h.marketValue), 0);

  return {
    range: '1D',
    points,
    baseline: {
      marketValue: baselineMarketValue,
      // 盤中只有市值會動，所以損益的基準跟著市值平移同一個常數
      totalPnl: baselineMarketValue - marketValueNow + totalPnlNow,
    },
    offsets,
    sessionMinutes: SESSION_MINUTES,
  };
}

export async function fetchPortfolioHistory(
  range: HistoryRange,
  transactions: Transaction[]
): Promise<PortfolioHistorySeries> {
  return range === '1D'
    ? fetchIntradayPortfolioHistory(transactions)
    : fetchDailyPortfolioHistory(range, transactions);
}
