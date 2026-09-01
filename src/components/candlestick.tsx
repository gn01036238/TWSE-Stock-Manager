'use client';

import { DOWN_HEX, UP_HEX } from '@/lib/colors';
import type { DailyBar } from '@/types';

/** 台股慣例：收盤 ≥ 開盤畫紅（實心），收盤 < 開盤畫綠 */
function barColor(bar: DailyBar): string {
  return bar.close >= bar.open ? UP_HEX : DOWN_HEX;
}

function formatOhlc(bar: DailyBar): string {
  const price = (value: number) =>
    value.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
  return `${bar.date} 開 ${price(bar.open)} 高 ${price(bar.high)} 低 ${price(
    bar.low
  )} 收 ${price(bar.close)}`;
}

/**
 * 單獨一根當日 K 棒（漲跌幅欄位用），高低價撐滿整個高度。
 * 盤中還沒有波動（高＝低）時退成一條橫線。
 */
export function DayCandle({
  bar,
  width = 9,
  height = 14,
  className = '',
}: {
  bar: DailyBar;
  width?: number;
  height?: number;
  className?: string;
}) {
  const range = bar.high - bar.low || 1;
  const toY = (value: number) => (1 - (value - bar.low) / range) * height;

  const color = barColor(bar);
  const center = width / 2;
  const bodyWidth = Math.max(2, width * 0.7);
  const top = toY(Math.max(bar.open, bar.close));
  const bodyHeight = Math.max(1, toY(Math.min(bar.open, bar.close)) - top);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`shrink-0 ${className}`}
      role="img"
      aria-label={`當日 K 棒 ${formatOhlc(bar)}`}
    >
      <title>{formatOhlc(bar)}</title>
      <line
        x1={center}
        x2={center}
        y1={toY(bar.high)}
        y2={toY(bar.low)}
        stroke={color}
        strokeWidth="1"
      />
      <rect
        x={center - bodyWidth / 2}
        y={top}
        width={bodyWidth}
        height={bodyHeight}
        fill={color}
      />
    </svg>
  );
}

/**
 * 表格裡的迷你日 K 棒圖。最後一根是最新交易日（盤中還會動），
 * 滑過去可以看最新一根的開高低收。
 */
export function Candlestick({
  bars,
  width = 110,
  height = 30,
  className = '',
}: {
  bars: DailyBar[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!bars || bars.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-muted-foreground ${className}`}
        style={{ width, height }}
      >
        —
      </div>
    );
  }

  const min = Math.min(...bars.map((bar) => bar.low));
  const max = Math.max(...bars.map((bar) => bar.high));
  const range = max - min || 1;

  const padding = 2;
  const usableHeight = height - padding * 2;
  const toY = (value: number) => padding + (1 - (value - min) / range) * usableHeight;

  // 每根 K 棒的水平間距；實體佔 70%，留一點縫才看得出是幾根
  const pitch = width / bars.length;
  const bodyWidth = Math.max(1, pitch * 0.7);

  const last = bars[bars.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`近 ${bars.length} 個交易日日 K，最新 ${formatOhlc(last)}`}
    >
      <title>{`近 ${bars.length} 個交易日日K｜最新 ${formatOhlc(last)}`}</title>

      {bars.map((bar, index) => {
        const center = index * pitch + pitch / 2;
        const color = barColor(bar);
        const top = toY(Math.max(bar.open, bar.close));
        const bottom = toY(Math.min(bar.open, bar.close));
        // 開平收（十字線）至少留 1px 才看得到
        const bodyHeight = Math.max(1, bottom - top);

        return (
          <g key={`${bar.date}-${index}`}>
            <line
              x1={center}
              x2={center}
              y1={toY(bar.high)}
              y2={toY(bar.low)}
              stroke={color}
              strokeWidth="1"
            />
            <rect
              x={center - bodyWidth / 2}
              y={top}
              width={bodyWidth}
              height={bodyHeight}
              fill={color}
            />
          </g>
        );
      })}
    </svg>
  );
}
