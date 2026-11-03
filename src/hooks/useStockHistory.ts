'use client';

import { useQuery } from '@tanstack/react-query';
import { CANDLES_REFRESH_INTERVAL } from './useCandles';
import type { HistoryRange, MajorHistoryResponse, StockHistoryResponse } from '@/types';

/** 個股詳細圖表的日 K ＋ 三大法人 */
export function useStockHistory(ticker: string, range: HistoryRange | null) {
  return useQuery<StockHistoryResponse>({
    queryKey: ['stock-history', ticker, range],
    queryFn: async () => {
      const res = await fetch(`/api/stock-history?ticker=${encodeURIComponent(ticker)}&range=${range}`);
      if (!res.ok) throw new Error('Failed to fetch stock history');
      return res.json();
    },
    enabled: !!ticker && range != null,
    staleTime: CANDLES_REFRESH_INTERVAL,
    refetchInterval: CANDLES_REFRESH_INTERVAL,
    placeholderData: (prev) => (prev?.ticker === ticker ? prev : undefined),
  });
}

/** 逐日主力買賣超；第一次查長區間比較慢，跟日 K 分開抓 */
export function useMajorHistory(ticker: string, range: HistoryRange | null) {
  return useQuery<MajorHistoryResponse>({
    queryKey: ['major-history', ticker, range],
    queryFn: async () => {
      const res = await fetch(
        `/api/stock-history/major?ticker=${encodeURIComponent(ticker)}&range=${range}`
      );
      if (!res.ok) throw new Error('Failed to fetch major history');
      return res.json();
    },
    enabled: !!ticker && range != null,
    staleTime: CANDLES_REFRESH_INTERVAL,
    refetchInterval: CANDLES_REFRESH_INTERVAL,
    placeholderData: (prev) => (prev?.ticker === ticker ? prev : undefined),
  });
}
