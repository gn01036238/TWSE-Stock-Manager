import type { DividendEvent, DividendIncome, Transaction } from '@/types';
import { addDays } from 'date-fns';

interface YahooHistoricalDividend {
  date: Date;
  dividends: number;
}

// Fetch dividend history for a Taiwan stock using yahoo-finance2
export async function fetchDividendHistory(ticker: string): Promise<DividendEvent[]> {
  try {
    // Dynamic import to avoid SSR issues
    const yahooFinance = (await import('yahoo-finance2')).default;

    const result = await yahooFinance.historical(`${ticker}.TW`, {
      period1: '2020-01-01',
      events: 'dividends',
    });

    // Type assertion since yahoo-finance2 types are complex
    const dividends = result as unknown as YahooHistoricalDividend[];

    if (!Array.isArray(dividends)) {
      return [];
    }

    return dividends.map((d) => ({
      ticker,
      exDate: new Date(d.date),
      paymentDate: addDays(new Date(d.date), 28), // Taiwan: ~28 days after ex-date
      amount: d.dividends,
    }));
  } catch (error) {
    console.error(`Failed to fetch dividends for ${ticker}:`, error);
    return [];
  }
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
