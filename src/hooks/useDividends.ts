'use client';

import { useQuery } from '@tanstack/react-query';
import type { DividendIncome } from '@/types';

interface DividendData {
  stockName: string;
  dividends: (Omit<DividendIncome, 'exDate' | 'paymentDate'> & {
    exDate: string;
    paymentDate: string;
  })[];
  totalIncome: number;
}

export function useDividends(tickers: string[]) {
  return useQuery<Record<string, DividendData>>({
    queryKey: ['dividends', tickers.sort().join(',')],
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
