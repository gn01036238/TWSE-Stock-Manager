'use client';

import { useQuery } from '@tanstack/react-query';
import type { StockPrice } from '@/types';

/** 報價自動更新間隔（毫秒） */
export const PRICE_REFRESH_INTERVAL = 60 * 1000;

export function usePrices(tickers: string[]) {
  return useQuery<Record<string, StockPrice>>({
    queryKey: ['prices', [...tickers].sort().join(',')],
    queryFn: async () => {
      if (tickers.length === 0) return {};

      const res = await fetch(`/api/prices?tickers=${tickers.join(',')}`);
      if (!res.ok) throw new Error('Failed to fetch prices');

      const data = await res.json();

      // Convert date strings back to Date objects
      const prices: Record<string, StockPrice> = {};
      for (const [ticker, priceData] of Object.entries(data)) {
        const pd = priceData as StockPrice & { updatedAt: string };
        prices[ticker] = {
          ...pd,
          updatedAt: new Date(pd.updatedAt),
        };
      }

      return prices;
    },
    enabled: tickers.length > 0,
    // 報價永遠視為過期，切回分頁 / 重新掛載時立即補抓
    staleTime: 0,
    refetchInterval: PRICE_REFRESH_INTERVAL,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    // 更新中沿用上一批報價，避免畫面閃回 0
    placeholderData: (prev) => prev,
  });
}
