'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMounted } from '@/hooks/useIsMounted';
import { PRICE_REFRESH_INTERVAL } from '@/hooks/usePrices';
import {
  MARKET_STATUS_LABEL,
  formatTaipeiTime,
  getMarketStatus,
  type MarketStatus,
} from '@/lib/market';

const DOT_COLOR: Record<MarketStatus, string> = {
  open: 'bg-green-500',
  pre: 'bg-amber-500',
  closed: 'bg-muted-foreground',
  weekend: 'bg-muted-foreground',
};

export function LivePriceStatus({
  updatedAt,
  isFetching,
  onRefresh,
}: {
  /** React Query 的 dataUpdatedAt（毫秒），尚未取得資料時為 0 */
  updatedAt: number;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  // 每秒 tick 一次，用來重算倒數
  const [now, setNow] = useState(() => Date.now());
  const mounted = useIsMounted();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 時間在 server / client 必然不同，等掛載後再畫
  if (!mounted) {
    return <div className="h-9" aria-hidden />;
  }

  const status = getMarketStatus(new Date(now));
  const secondsLeft = updatedAt
    ? Math.max(0, Math.ceil((updatedAt + PRICE_REFRESH_INTERVAL - now) / 1000))
    : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <span className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          {status === 'open' && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${DOT_COLOR[status]}`}
          />
        </span>
        <span className="font-medium text-foreground">
          {MARKET_STATUS_LABEL[status]}
        </span>
      </span>

      <span aria-live="polite">
        {updatedAt
          ? `最後更新 ${formatTaipeiTime(new Date(updatedAt))}`
          : '尚未取得報價'}
      </span>

      <span>
        {isFetching ? '更新中…' : `${secondsLeft} 秒後自動更新`}
      </span>

      <Button
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        disabled={isFetching}
        className="h-7 px-2"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        <span className="ml-1">立即更新</span>
      </Button>
    </div>
  );
}
