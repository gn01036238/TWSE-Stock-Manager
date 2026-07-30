import type { DividendEvent, DividendIncome, Transaction } from '@/types';
import { addDays } from 'date-fns';
import { getYahooClient, toYahooSymbols } from './yahoo';

const DIVIDEND_HISTORY_START = '2010-01-01';

interface YahooDividendEvent {
  date: Date;
  amount: number;
}

interface DividendChart {
  events: YahooDividendEvent[];
  /** 依日期遞增的日線收盤價，用來推算除息前股價 */
  closes: { time: number; close: number }[];
}

async function fetchDividendChart(symbol: string): Promise<DividendChart> {
  const result = await getYahooClient().chart(symbol, {
    period1: DIVIDEND_HISTORY_START,
    interval: '1d',
    events: 'dividends',
  });

  const dividends = (result.events as { dividends?: unknown } | undefined)?.dividends;

  // v3 回傳陣列，舊版可能是以時間戳為 key 的物件，兩種都吃
  const list = Array.isArray(dividends)
    ? dividends
    : dividends
    ? Object.values(dividends)
    : [];

  const quotes = (result.quotes ?? []) as { date?: Date; close?: number | null }[];
  const closes = quotes
    .filter((q): q is { date: Date; close: number } => q?.date != null && q.close != null)
    .map((q) => ({ time: new Date(q.date).getTime(), close: q.close }))
    .sort((a, b) => a.time - b.time);

  return { events: list as YahooDividendEvent[], closes };
}

/** 除息日前最後一個交易日的收盤價 */
function closeBefore(closes: DividendChart['closes'], exDate: Date): number | null {
  const target = exDate.getTime();
  let result: number | null = null;
  for (const point of closes) {
    if (point.time >= target) break;
    result = point.close;
  }
  return result;
}

// Fetch dividend history for a Taiwan stock using yahoo-finance2
export async function fetchDividendHistory(ticker: string): Promise<DividendEvent[]> {
  for (const symbol of toYahooSymbols(ticker)) {
    try {
      const { events, closes } = await fetchDividendChart(symbol);
      if (events.length === 0) continue;

      return events
        .filter((d) => d?.date && typeof d.amount === 'number' && d.amount > 0)
        .map((d) => {
          const exDate = new Date(d.date);
          const priceBefore = closeBefore(closes, exDate);

          return {
            ticker,
            exDate,
            paymentDate: addDays(exDate, 28), // Taiwan: ~28 days after ex-date
            amount: d.amount,
            priceBefore: priceBefore ?? undefined,
            yieldPercent: priceBefore ? (d.amount / priceBefore) * 100 : undefined,
          };
        });
    } catch (error) {
      console.error(`Failed to fetch dividends for ${symbol}:`, error);
    }
  }

  return [];
}

// Fetch dividends for multiple stocks
export async function fetchDividendsForStocks(tickers: string[]): Promise<Map<string, DividendEvent[]>> {
  const dividendsMap = new Map<string, DividendEvent[]>();

  await Promise.all(
    tickers.map(async (ticker) => {
      const dividends = await fetchDividendHistory(ticker);
      dividendsMap.set(ticker, dividends);
    })
  );

  return dividendsMap;
}

// Calculate shares held at a specific date
export function getSharesAtDate(transactions: Transaction[], date: Date): number {
  let shares = 0;

  const sortedTxns = [...transactions].sort(
    (a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
  );

  for (const tx of sortedTxns) {
    const txDate = new Date(tx.transaction_date);
    if (txDate > date) break;

    if (tx.transaction_type === 'BUY') {
      shares += tx.quantity;
    } else if (tx.transaction_type === 'SELL') {
      shares -= tx.quantity;
    }
  }

  return Math.max(0, shares);
}

// Calculate dividend income for a user based on their transactions
export function calculateDividendIncome(
  transactions: Transaction[],
  dividendEvents: DividendEvent[],
  stockName: string
): DividendIncome[] {
  return dividendEvents
    .map((event) => {
      const sharesHeld = getSharesAtDate(transactions, event.exDate);
      return {
        ticker: event.ticker,
        stockName,
        exDate: event.exDate,
        paymentDate: event.paymentDate,
        amount: event.amount,
        priceBefore: event.priceBefore,
        yieldPercent: event.yieldPercent,
        sharesHeld,
        income: sharesHeld * event.amount,
      };
    })
    .filter((d) => d.sharesHeld > 0 && d.income > 0);
}

// Calculate total dividend income
export function calculateTotalDividendIncome(dividendIncomes: DividendIncome[]): number {
  return dividendIncomes.reduce((total, d) => total + d.income, 0);
}

// Group dividend income by year
export function groupDividendsByYear(
  dividendIncomes: DividendIncome[]
): Map<number, DividendIncome[]> {
  const byYear = new Map<number, DividendIncome[]>();

  for (const d of dividendIncomes) {
    const year = d.paymentDate.getFullYear();
    if (!byYear.has(year)) {
      byYear.set(year, []);
    }
    byYear.get(year)!.push(d);
  }

  return byYear;
}

// Group dividend income by stock
export function groupDividendsByStock(
  dividendIncomes: DividendIncome[]
): Map<string, DividendIncome[]> {
  const byStock = new Map<string, DividendIncome[]>();

  for (const d of dividendIncomes) {
    if (!byStock.has(d.ticker)) {
      byStock.set(d.ticker, []);
    }
    byStock.get(d.ticker)!.push(d);
  }

  return byStock;
}
