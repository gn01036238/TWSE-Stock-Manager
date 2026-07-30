'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
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
  const Icon = isUp ? ArrowUp : ArrowDown;
  const color = gainTextClass(price.change);
  const sign = isUp ? '+' : '';

  return (
    <span className={`inline-flex items-center justify-end gap-1 ${color}`}>
      <Icon className="h-3.5 w-3.5" />
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
