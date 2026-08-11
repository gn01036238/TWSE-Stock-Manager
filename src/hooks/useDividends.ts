'use client';

import { useQuery } from '@tanstack/react-query';
import type { DividendIncome } from '@/types';

/** JSON 上的一筆配息紀錄：日期是字串，其餘欄位跟 DividendIncome 一樣 */
export type SerializedDividend = Omit<DividendIncome, 'exDate' | 'paymentDate'> & {
  exDate: string;
  paymentDate: string;
};

interface DividendData {
  stockName: string;
  dividends: SerializedDividend[];
  totalIncome: number;
  /** 二代健保補充保費合計 */
  totalNhiPremium: number;
  /** 扣掉補充保費後實際入帳的股利合計 */
  totalNetIncome: number;
  /** 持有期間每股累積配息 */
  dividendPerShare: number;
}

export function useDividends(tickers: string[]) {
  return useQuery<Record<string, DividendData>>({
    queryKey: ['dividends', [...tickers].sort().join(',')],
    queryFn: async () => {
      if (tickers.length === 0) return {};

      const res = await fetch('/api/dividends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      });

      if (!res.ok) throw new Error('Failed to fetch dividends');
      return res.json();
    },
    enabled: tickers.length > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes (dividends don't change often)
  });
}

export function useDividendHistory(ticker: string) {
  return useQuery<{
    ticker: string;
    stockName: string;
    dividends: DividendIncome[];
    totalIncome: number;
  }>({
    queryKey: ['dividend-history', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/dividends?ticker=${ticker}`);
      if (!res.ok) throw new Error('Failed to fetch dividend history');

      const data = await res.json();

      // Parse date strings to Date objects
      return {
        ...data,
        dividends: data.dividends.map((d: DividendIncome & { exDate: string; paymentDate: string }) => ({
          ...d,
          exDate: new Date(d.exDate),
          paymentDate: new Date(d.paymentDate),
        })),
      };
    },
    enabled: !!ticker,
  });
}
