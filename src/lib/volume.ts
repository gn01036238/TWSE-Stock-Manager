import type { PriceVolumePattern } from '@/types';
import { getYahooClient, toYahooSymbols } from './yahoo';
import { taipeiDateKey } from './market';

/** 大盤每日成交資訊（單位：元、股） */
const FMTQIK_URL = 'https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK';
/** 盤中即時指數 */
const MIS_URL = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';

const LOOKBACK_DAYS = 45;
/** 已收盤交易日的成交量不會再變，可以放心快取 */
const CACHE_TTL = 30 * 60 * 1000;
/** 量比的均量天數，含當日 */
const AVERAGE_DAYS = 5;

export interface VolumeStats {
  /** 上一個交易日成交量（張） */
  prev: number | null;
  /** 前幾個交易日成交量（張），舊的在前，不含當日 */
  history: number[];
}

const EMPTY_STATS: VolumeStats = { prev: null, history: [] };

function statsFromLots(lots: number[]): VolumeStats {
  if (lots.length === 0) return EMPTY_STATS;

  return {
    prev: lots[lots.length - 1],
    history: lots.slice(-(AVERAGE_DAYS - 1)),
  };
}

const statsCache = new Map<string, { at: number; value: VolumeStats }>();

async function fetchTickerStats(ticker: string): Promise<VolumeStats> {
  const cached = statsCache.get(ticker);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.value;

  const today = taipeiDateKey();
  let stats = EMPTY_STATS;

  for (const symbol of toYahooSymbols(ticker)) {
    try {
      const result = await getYahooClient().chart(symbol, {
        period1: new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
        interval: '1d',
      });

      const bars = (result.quotes ?? []) as { date?: Date; volume?: number | null }[];
      const lots = bars
        .filter((bar) => bar?.date != null && bar.volume != null && bar.volume > 0)
        // 當日還在跳動，均量只取已收盤的交易日
        .filter((bar) => taipeiDateKey(new Date(bar.date!)) !== today)
        .map((bar) => bar.volume! / 1000);

      if (lots.length === 0) continue;

      stats = statsFromLots(lots);
      break;
    } catch (error) {
      console.error(`Failed to fetch daily volume for ${symbol}:`, error);
    }
  }

  statsCache.set(ticker, { at: Date.now(), value: stats });
  return stats;
}

export async function fetchVolumeStats(
  tickers: string[]
): Promise<Map<string, VolumeStats>> {
  const results = await Promise.all(
    tickers.map(async (ticker) => [ticker, await fetchTickerStats(ticker)] as const)
  );

  return new Map(results);
}

/**
 * 量比 = 當日成交速度 / 5 日均量（含當日，與看盤軟體的算法一致）。
 * 1 代表跟近期平均一樣熱，>1 是量能放大。
 */
export function computeVolumeRatio(
  volume: number | null,
  history: number[],
  progress: number
): number | null {
  if (!volume || progress <= 0 || history.length === 0) return null;

  const projected = volume / progress;
  const total = history.reduce((sum, v) => sum + v, projected);
  const average = total / (history.length + 1);

  return average > 0 ? projected / average : null;
}

/** 價量型態：價漲/價跌 搭配 全日推估量 對比昨日量 */
export function computePricePattern(
  change: number | null,
  volume: number | null,
  prevVolume: number | null,
  progress: number
): PriceVolumePattern {
  if (change == null || change === 0 || !volume || !prevVolume || progress <= 0) {
    return 'unknown';
  }

  const projected = volume / progress;
  const expanding = projected >= prevVolume;

  if (change > 0) return expanding ? 'up-expand' : 'up-shrink';
  return expanding ? 'down-expand' : 'down-shrink';
}

/** 台北時區 民國日期 "115/07/29" → "2026-07-29" */
function fromRocDate(value: string): string | null {
  const match = value.trim().match(/^(\d{2,3})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;
  return `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
}

async function fetchMonthlyMarketLots(date: Date): Promise<Map<string, number>> {
  const compact = taipeiDateKey(date).replace(/-/g, '');
  const lots = new Map<string, number>();

  try {
    const response = await fetch(`${FMTQIK_URL}?date=${compact}&response=json`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) throw new Error(`TWSE ${response.status}`);

    const table = (await response.json()) as { stat?: string; data?: string[][] };
    if (table?.stat !== 'OK') return lots;

    for (const row of table.data ?? []) {
      // 欄位：日期、成交股數、成交金額、成交筆數、加權指數、漲跌點數
      const key = fromRocDate(row[0] ?? '');
      const shares = Number((row[1] ?? '').replace(/,/g, ''));
      if (key && Number.isFinite(shares)) lots.set(key, shares / 1000);
    }
  } catch (error) {
    console.error('Failed to fetch market turnover:', error);
  }

  return lots;
}

let marketStatsCache: { at: number; value: VolumeStats } | null = null;

/** 大盤（加權指數）成交量統計，單位：張 */
export async function fetchMarketVolumeStats(): Promise<VolumeStats> {
  if (marketStatsCache && Date.now() - marketStatsCache.at < CACHE_TTL) {
    return marketStatsCache.value;
  }

  const now = new Date();
  const today = taipeiDateKey(now);
  const byDate = await fetchMonthlyMarketLots(now);

  // 月初時本月資料不足 5 天，補抓上個月
  if (byDate.size <= AVERAGE_DAYS) {
    const lastMonth = await fetchMonthlyMarketLots(
      new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    );
    for (const [key, value] of lastMonth) {
      if (!byDate.has(key)) byDate.set(key, value);
    }
  }

  const lots = [...byDate.entries()]
    .filter(([key]) => key < today)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);

  const stats = statsFromLots(lots);
  marketStatsCache = { at: Date.now(), value: stats };
  return stats;
}

export interface TaiexSnapshot {
  price: number;
  previousClose: number;
  /** 當日累計成交量（張） */
  volume: number | null;
  /** 報價所屬交易日（台北時區 YYYY-MM-DD）；假日會是前一個交易日 */
  date: string | null;
}

/** 盤中加權指數即時報價（mis 的 t00，m 欄位是成交張數） */
export async function fetchTaiexSnapshot(): Promise<TaiexSnapshot | null> {
  try {
    const response = await fetch(`${MIS_URL}?ex_ch=tse_t00.tw&json=1&delay=0`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) throw new Error(`TWSE ${response.status}`);

    const data = (await response.json()) as {
      msgArray?: { z?: string; y?: string; m?: string; d?: string }[];
    };
    const item = data.msgArray?.[0];
    if (!item) return null;

    const price = Number(item.z);
    const previousClose = Number(item.y);
    const volume = Number(item.m);
    // d 是 "20260730"
    const day = item.d?.match(/^(\d{4})(\d{2})(\d{2})$/);

    if (!Number.isFinite(price) || price <= 0) return null;

    return {
      price,
      previousClose: Number.isFinite(previousClose) && previousClose > 0 ? previousClose : price,
      volume: Number.isFinite(volume) && volume > 0 ? volume : null,
      date: day ? `${day[1]}-${day[2]}-${day[3]}` : null,
    };
  } catch (error) {
    console.error('Failed to fetch TAIEX snapshot:', error);
    return null;
  }
}
