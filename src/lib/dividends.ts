import type { DividendEvent, DividendIncome, Transaction } from '@/types';
import { addDays } from 'date-fns';
import { PAR_VALUE, corporateActionsFor, sharesFromStockDividend } from './corporate-actions';
import { taipeiDateKey } from './market';
import { nhiPremium } from './nhi';
import { getYahooClient, toYahooSymbols } from './yahoo';

const DIVIDEND_HISTORY_START = '2010-01-01';

interface YahooDividendEvent {
  date: Date;
  amount: number;
}

interface ClosePoint {
  time: number;
  close: number;
}

interface DividendChart {
  events: YahooDividendEvent[];
  /** 依日期遞增的日線收盤價，用來推算除權息前股價 */
  closes: ClosePoint[];
  /** 分割（台股的配股在 Yahoo 也記成分割），已換算成「當天台北零點」的時間戳 */
  splits: { time: number; ratio: number }[];
}

/** v3 回傳陣列，舊版可能是以時間戳為 key 的物件，兩種都吃 */
function toEventList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value ? Object.values(value as Record<string, unknown>) : [];
}

/** 分割是「當天開始」生效，所以用台北零點當界線，才不會被 K 棒的時間（13:30）影響 */
function startOfTaipeiDay(date: Date): number {
  return new Date(`${taipeiDateKey(date)}T00:00:00+08:00`).getTime();
}

async function fetchDividendChart(symbol: string): Promise<DividendChart> {
  const result = await getYahooClient().chart(symbol, {
    period1: DIVIDEND_HISTORY_START,
    interval: '1d',
    events: 'div|split',
  });

  const events = result.events as { dividends?: unknown; splits?: unknown } | undefined;

  const splits = toEventList(events?.splits)
    .map((raw) => raw as { date?: Date; numerator?: number; denominator?: number })
    .filter((s) => s?.date != null && !!s.numerator && !!s.denominator)
    .map((s) => ({ time: startOfTaipeiDay(new Date(s.date!)), ratio: s.numerator! / s.denominator! }))
    .filter((s) => Number.isFinite(s.ratio) && s.ratio > 0);

  const quotes = (result.quotes ?? []) as { date?: Date; close?: number | null }[];
  const closes = quotes
    .filter((q): q is { date: Date; close: number } => q?.date != null && q.close != null)
    .map((q) => ({ time: new Date(q.date).getTime(), close: q.close }))
    .sort((a, b) => a.time - b.time);

  return { events: toEventList(events?.dividends) as YahooDividendEvent[], closes, splits };
}

/**
 * 還原倍數：某個時間點**之後**（不含當天）發生的分割倍數相乘。
 *
 * Yahoo 給的收盤價與股利金額都是「分割還原後」的——台股的配股在 Yahoo 記成分割
 * （2887 的 0.1 元股票股利就是 1.01 分割），所以除權日以前的價格與配息都被先除掉 1.01。
 * 要顯示當時真正的股價與配息、以及算對填權，得先把這些倍數乘回去。
 */
function unadjustFactor(splits: DividendChart['splits'], time: number): number {
  let factor = 1;
  for (const split of splits) {
    if (split.time > time) factor *= split.ratio;
  }
  return factor;
}

/** 除權息日前最後一個交易日的收盤價（已還原成當時的實際價格） */
function closeBefore(chart: DividendChart, exDate: Date): number | null {
  const target = exDate.getTime();
  let result: ClosePoint | null = null;
  for (const point of chart.closes) {
    if (point.time >= target) break;
    result = point;
  }
  return result ? result.close * unadjustFactor(chart.splits, result.time) : null;
}

/**
 * 填權（息）天數：除權息日起算，第幾個交易日的**還原價**回到除權前股價。
 *
 * 還原價 = 收盤價 ×（1 ＋ 每股股票股利 ÷ 面額）＋ 每股現金股利。
 * 配股會把股價稀釋掉，只比收盤價的話配股愈多就愈不可能「填權」，
 * 所以要先把配股與配息還原回去再比。還沒填回去回 null。
 */
function daysToFill(chart: DividendChart, event: DividendEvent): number | null {
  if (!event.priceBefore) return null;

  const ratio = 1 + (event.stockPerShare ?? 0) / PAR_VALUE;
  const start = event.exDate.getTime();
  let tradingDays = 0;

  for (const point of chart.closes) {
    if (point.time < start) continue;
    // 兩邊都要是「當時的實際股價」才比得下去（priceBefore 也已經還原過）
    const close = point.close * unadjustFactor(chart.splits, point.time);
    tradingDays++;
    if (close * ratio + event.amount >= event.priceBefore) return tradingDays;
  }

  return null;
}

/** 同一檔的兩次除權息至少隔好幾個月，兩天的容差只會對到同一次，不會誤合併 */
const EX_DATE_MATCH_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * 把手動維護的除權息（lib/corporate-actions.ts）併進 Yahoo 給的現金股利。
 * 對得到同一天的就覆蓋數字並補上配股，對不到的直接新增一筆。
 */
function mergeCorporateActions(
  ticker: string,
  events: DividendEvent[],
  chart: DividendChart
): DividendEvent[] {
  const merged = [...events];

  for (const action of corporateActionsFor(ticker)) {
    const exDate = new Date(`${action.exDate}T00:00:00+08:00`);
    const existing = merged.find(
      (event) => Math.abs(event.exDate.getTime() - exDate.getTime()) <= EX_DATE_MATCH_MS
    );
    const priceBefore = closeBefore(chart, existing?.exDate ?? exDate) ?? undefined;

    const event: DividendEvent = {
      ticker,
      exDate: existing?.exDate ?? exDate,
      paymentDate: existing?.paymentDate ?? addDays(exDate, 28),
      amount: action.cashPerShare,
      stockPerShare: action.stockPerShare,
      priceBefore,
      yieldPercent: priceBefore ? (action.cashPerShare / priceBefore) * 100 : undefined,
    };

    if (existing) Object.assign(existing, event);
    else merged.push(event);
  }

  return merged;
}

// Fetch dividend history for a Taiwan stock using yahoo-finance2
export async function fetchDividendHistory(ticker: string): Promise<DividendEvent[]> {
  const hasManualAction = corporateActionsFor(ticker).length > 0;

  for (const symbol of toYahooSymbols(ticker)) {
    try {
      const chart = await fetchDividendChart(symbol);
      const { events, closes } = chart;
      // 只有手動清單有資料時，Yahoo 沒給股利也還是要吐出那幾筆（但要拿得到日線才算得出股價）
      if (events.length === 0 && !(hasManualAction && closes.length > 0)) continue;

      const fromYahoo = events
        .filter((d) => d?.date && typeof d.amount === 'number' && d.amount > 0)
        .map((d) => {
          const exDate = new Date(d.date);
          const priceBefore = closeBefore(chart, exDate);
          // 股利金額同樣被後來的分割還原過（0.9 元會變成 0.891089），乘回去才是當年真的配多少
          const amount = d.amount * unadjustFactor(chart.splits, exDate.getTime());

          return {
            ticker,
            exDate,
            paymentDate: addDays(exDate, 28), // Taiwan: ~28 days after ex-date
            amount,
            priceBefore: priceBefore ?? undefined,
            yieldPercent: priceBefore ? (amount / priceBefore) * 100 : undefined,
          };
        });

      const merged = mergeCorporateActions(ticker, fromYahoo, chart);
      for (const event of merged) {
        event.daysToFill = daysToFill(chart, event);
      }

      return merged.sort((a, b) => a.exDate.getTime() - b.exDate.getTime());
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

/**
 * 除權息基準日的持股數。
 *
 * 除權息**當天**買進的不參與這次配息（最後買進日是除權息前一交易日），所以是嚴格小於。
 * 這同時讓自動補進來的「配股」交易（日期就是除權息日）不會被算進同一次除權息的持股，
 * 否則配到的股票會再被拿去配一次息。日期一律以台北時區的 YYYY-MM-DD 比對。
 */
export function getSharesAtDate(transactions: Transaction[], date: Date): number {
  const cutoff = taipeiDateKey(date);
  let shares = 0;

  const sortedTxns = [...transactions].sort((a, b) =>
    a.transaction_date.localeCompare(b.transaction_date)
  );

  for (const tx of sortedTxns) {
    if (tx.transaction_date.slice(0, 10) >= cutoff) break;

    if (tx.transaction_type === 'SELL') shares -= tx.quantity;
    else shares += tx.quantity; // 買入與配股都是增加股數
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
      const stockPerShare = event.stockPerShare ?? 0;
      const income = sharesHeld * event.amount;
      const sharesGained = sharesFromStockDividend(sharesHeld, stockPerShare);
      // 股票股利以面額折算後跟現金股利合併，才是二代健保看的「單次給付金額」
      const nhiBase = income + sharesGained * PAR_VALUE;
      const premium = nhiPremium(nhiBase);

      return {
        ticker: event.ticker,
        stockName,
        exDate: event.exDate,
        paymentDate: event.paymentDate,
        amount: event.amount,
        stockPerShare,
        priceBefore: event.priceBefore,
        yieldPercent: event.yieldPercent,
        daysToFill: event.daysToFill ?? null,
        sharesHeld,
        sharesGained,
        income,
        nhiBase,
        nhiPremium: premium,
        // 補充保費是就源扣繳，實際入帳的是扣完的現金
        netIncome: income - premium,
      };
    })
    .filter((d) => d.sharesHeld > 0 && (d.income > 0 || d.sharesGained > 0));
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
