'use client';

import { useQuery } from '@tanstack/react-query';
import type { CandleSeries } from '@/types';

/** 只有當日那根 K 棒會變，不用跟報價一樣一分鐘就重抓 */
export const CANDLES_REFRESH_INTERVAL = 5 * 60 * 1000;

export function useCandles(tickers: string[], limit = 20) {
  return useQuery<Record<string, CandleSeries>>({
    queryKey: ['candles', [...tickers].sort().join(','), limit],
    queryFn: async () => {
      if (tickers.length === 0) return {};

      const res = await fetch(`/api/candles?tickers=${tickers.join(',')}&limit=${limit}`);
      if (!res.ok) throw new Error('Failed to fetch candles');

      return res.json();
    },
    enabled: tickers.length > 0,
    staleTime: CANDLES_REFRESH_INTERVAL,
    refetchInterval: CANDLES_REFRESH_INTERVAL,
    refetchIntervalInBackground: true,
    placeholderData: (prev) => prev,
  });
}
