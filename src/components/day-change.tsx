'use client';

import { DayCandle } from '@/components/candlestick';
import { LivePrice } from '@/components/live-price';
import { gainTextClass } from '@/lib/colors';
import type { StockPrice } from '@/types';

/** 當日漲跌（元 + %），資料來源為 TWSE 即時報價 */
export function DayChange({
  price,
  showAmount = true,
}: {
  price?: StockPrice;
  showAmount?: boolean;
}) {
  if (!price || !price.previousClose) {
    return <span className="text-muted-foreground">—</span>;
  }

  const isUp = price.change >= 0;
  const color = gainTextClass(price.change);
  const sign = isUp ? '+' : '';

  return (
    <span className={`inline-flex items-center justify-end gap-1 ${color}`}>
      <DayCandle
        bar={{
          date: price.tradingDate ?? '今日',
          open: price.open,
          high: price.high,
          low: price.low,
          close: price.price,
          volume: null,
        }}
      />
      {showAmount && (
        <LivePrice
          value={price.change}
          format={(v) => `${sign}${v.toFixed(2)}`}
          className="px-0"
        />
      )}
      <LivePrice
        value={price.changePercent}
        format={(v) => `${sign}${v.toFixed(2)}%`}
        className="px-0"
      />
    </span>
  );
}
