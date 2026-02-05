'use client';

import { useQuery } from '@tanstack/react-query';
import type { StockPrice } from '@/types';

export function usePrices(tickers: string[]) {
  return useQuery<Record<string, StockPrice>>({
    queryKey: ['prices', tickers.sort().join(',')],
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
    refetchInterval: 60000, // Refresh every minute
  });
}
