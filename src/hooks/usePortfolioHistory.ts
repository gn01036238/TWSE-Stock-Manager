'use client';

import { useQuery } from '@tanstack/react-query';
import type { HistoryRange, PortfolioHistorySeries } from '@/lib/portfolio-history';

/** 1D 是盤中走勢，跟報價一樣常更新；其餘區間變化很慢，不用頻繁重抓 */
const INTRADAY_REFRESH_INTERVAL = 60 * 1000;
const DAILY_STALE_TIME = 5 * 60 * 1000;

export function usePortfolioHistory(range: HistoryRange) {
  return useQuery<PortfolioHistorySeries>({
    queryKey: ['portfolio-history', range],
    queryFn: async () => {
      const res = await fetch(`/api/portfolio-history?range=${range}`);
      if (!res.ok) throw new Error('Failed to fetch portfolio history');
      return res.json();
    },
    staleTime: range === '1D' ? INTRADAY_REFRESH_INTERVAL : DAILY_STALE_TIME,
    refetchInterval: range === '1D' ? INTRADAY_REFRESH_INTERVAL : false,
    placeholderData: (prev) => prev,
  });
}
