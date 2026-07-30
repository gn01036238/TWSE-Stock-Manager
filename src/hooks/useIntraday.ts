'use client';

import { useQuery } from '@tanstack/react-query';
import { PRICE_REFRESH_INTERVAL } from './usePrices';
import type { IntradaySeries } from '@/types';

export function useIntraday(tickers: string[]) {
  return useQuery<Record<string, IntradaySeries>>({
    queryKey: ['intraday', [...tickers].sort().join(',')],
    queryFn: async () => {
      if (tickers.length === 0) return {};

      const res = await fetch(`/api/intraday?tickers=${tickers.join(',')}`);
      if (!res.ok) throw new Error('Failed to fetch intraday data');

      return res.json();
    },
    enabled: tickers.length > 0,
    staleTime: 0,
    refetchInterval: PRICE_REFRESH_INTERVAL,
    refetchIntervalInBackground: true,
    placeholderData: (prev) => prev,
  });
}
