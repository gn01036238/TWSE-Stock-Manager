'use client';

import { useQuery } from '@tanstack/react-query';
import type { ChipsResponse } from '@/types';

/** 籌碼表更新間隔：成交量／量比盤中會變，法人買賣超一天只換一次 */
export const CHIPS_REFRESH_INTERVAL = 60 * 1000;

export function useChips(tickers: string[]) {
  return useQuery<ChipsResponse>({
    queryKey: ['chips', [...tickers].sort().join(',')],
    queryFn: async () => {
      const res = await fetch(`/api/chips?tickers=${tickers.join(',')}`);
      if (!res.ok) throw new Error('Failed to fetch chips');
      return res.json();
    },
    enabled: tickers.length > 0,
    staleTime: 0,
    refetchInterval: CHIPS_REFRESH_INTERVAL,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });
}
