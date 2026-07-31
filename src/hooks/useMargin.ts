'use client';

import { useQuery } from '@tanstack/react-query';
import type { MarginBalance } from '@/types';

/** 資券餘額一天只換一次資料，輪詢間隔不用跟報價一樣短 */
const MARGIN_REFRESH_INTERVAL = 5 * 60 * 1000;

export function useMargin() {
  return useQuery<MarginBalance>({
    queryKey: ['margin'],
    queryFn: async () => {
      const res = await fetch('/api/margin');
      if (!res.ok) throw new Error('Failed to fetch margin balance');
      return res.json();
    },
    staleTime: 0,
    refetchInterval: MARGIN_REFRESH_INTERVAL,
    refetchIntervalInBackground: true,
    placeholderData: (prev) => prev,
  });
}
