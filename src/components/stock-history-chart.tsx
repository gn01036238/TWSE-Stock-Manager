'use client';

import { useState } from 'react';
import { useElementWidth } from '@/hooks/useElementWidth';
import { DOWN_HEX, DOWN_TEXT, UP_HEX, UP_TEXT } from '@/lib/colors';
import { formatLots } from '@/lib/chips-format';
import { formatCompactLots, niceTicks } from '@/lib/chart-scale';
import type { MovingAverages, StockHistoryDay } from '@/types';

/** 均線：避開漲紅跌綠，免得跟 K 棒混在一起 */
const MA_LINES: { key: keyof MovingAverages; label: string; color: string }[] = [
  { key: 'ma20', label: '月線', color: '#f59e0b' },
  { key: 'ma60', label: '季線', color: '#3b82f6' },
  { key: 'ma100', label: '20週', color: '#a855f7' },
  { key: 'ma240', label: '年線', color: '#06b6d4' },
];

/** 右側價格／張數標籤的寬度 */
const AXIS_WIDTH = 56;
const PRICE_HEIGHT = 220;
const PANEL_HEIGHT = 56;
const X_AXIS_HEIGHT = 16;
const PRICE_PADDING = 8;

export type PointerHandlers = {
  onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPointerLeave: () => void;
};

export interface Scale {
  plotWidth: number;
  pitch: number;
  center: (index: number) => number;
  barWidth: number;
}

function candleColor(day: StockHistoryDay): string {
  return day.close >= day.open ? UP_HEX : DOWN_HEX;
}

function formatPrice(value: number): string {
  return value.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function signedLots(value: number | null | undefined): string {
  if (value == null) return '--';
  const text = formatLots(value);
  return value > 0 ? `+${text}` : text;
}

/** 張數的漲跌色；四捨五入後是 0 張就不上色 */
function signedClass(value: number | null | undefined): string {
  if (value == null || Math.round(value) === 0) return 'text-muted-foreground';
  return value > 0 ? UP_TEXT : DOWN_TEXT;
}

/** 價格漲跌色；平盤不上色 */
function priceChangeClass(change: number | null): string {
  if (change == null || Math.abs(change) < 1e-9) return 'text-muted-foreground';
  return change > 0 ? UP_TEXT : DOWN_TEXT;
}

function Crosshair({ x, height }: { x: number | null; height: number }) {
  if (x == null) return null;
  return (
    <line
      x1={x}
      x2={x}
      y1={0}
      y2={height}
      stroke="currentColor"
      strokeDasharray="3 3"
      className="pointer-events-none text-muted-foreground"
    />
  );
}

function PriceLabel({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <text x={x + 6} y={y} dy="0.32em" fontSize={10} className="fill-muted-foreground">
      {children}
    </text>
  );
}

function PricePanel({
  days,
  scale,
  hoverX,
  handlers,
}: {
  days: StockHistoryDay[];
  scale: Scale;
  hoverX: number | null;
  handlers: PointerHandlers;
}) {
  // 刻度也要容得下均線，年線離股價很遠時才不會畫出框外
  const maValues = days.flatMap((day) =>
    MA_LINES.map((line) => day[line.key]).filter((value): value is number => value != null)
  );
  const min = Math.min(...days.map((day) => day.low), ...maValues);
  const max = Math.max(...days.map((day) => day.high), ...maValues);
  const range = max - min || 1;
  const usable = PRICE_HEIGHT - PRICE_PADDING * 2;
  const toY = (value: number) => PRICE_PADDING + (1 - (value - min) / range) * usable;
  const { ticks, decimals } = niceTicks(min, max, 5);

  return (
    <svg width={scale.plotWidth + AXIS_WIDTH} height={PRICE_HEIGHT} className="block touch-pan-y" {...handlers}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={0}
            x2={scale.plotWidth}
            y1={toY(tick)}
            y2={toY(tick)}
            stroke="currentColor"
            className="text-border"
          />
          <PriceLabel x={scale.plotWidth} y={toY(tick)}>
            {tick.toFixed(decimals)}
          </PriceLabel>
        </g>
      ))}

      {days.map((day, index) => {
        const center = scale.center(index);
        const color = candleColor(day);
        const top = toY(Math.max(day.open, day.close));
        const bottom = toY(Math.min(day.open, day.close));

        return (
          <g key={day.date}>
            <line x1={center} x2={center} y1={toY(day.high)} y2={toY(day.low)} stroke={color} />
            <rect
              x={center - scale.barWidth / 2}
              y={top}
              width={scale.barWidth}
              height={Math.max(1, bottom - top)}
              fill={color}
            />
          </g>
        );
      })}

      {MA_LINES.map((line) => {
        // 缺值（區間開頭算不出來）就斷開，不要硬接
        let path = '';
        let pen = 'M';
        days.forEach((day, index) => {
          const value = day[line.key];
          if (value == null) {
            pen = 'M';
            return;
          }
          path += `${pen}${scale.center(index).toFixed(2)},${toY(value).toFixed(2)} `;
          pen = 'L';
        });
        return path ? (
          <path
            key={line.key}
            d={path}
            fill="none"
            stroke={line.color}
            strokeWidth={1.2}
            strokeLinejoin="round"
            className="pointer-events-none"
          />
        ) : null;
      })}

      <Crosshair x={hoverX} height={PRICE_HEIGHT} />
    </svg>
  );
}

/**
 * 一條長條圖面板：成交量（只有正值）或買賣超（正負值，零軸在中間）。
 */
export function BarPanel({
  title,
  valueText,
  valueClass,
  values,
  colors,
  signed,
  scale,
  hoverX,
  handlers,
  note,
}: {
  title: string;
  valueText: string;
  valueClass: string;
  values: (number | null | undefined)[];
  colors: (value: number, index: number) => string;
  signed: boolean;
  scale: Scale;
  hoverX: number | null;
  handlers: PointerHandlers;
  note?: string;
}) {
  const present = values.filter((value): value is number => value != null);
  const peak = Math.max(1, ...present.map((value) => Math.abs(value)));
  const zeroY = signed ? PANEL_HEIGHT / 2 : PANEL_HEIGHT;
  const reach = signed ? PANEL_HEIGHT / 2 - 2 : PANEL_HEIGHT - 4;

  return (
    <div>
      <div className="flex items-baseline gap-2 pt-2 text-[11px] leading-4">
        <span className="text-muted-foreground">{title}</span>
        <span className={`font-medium tabular-nums ${valueClass}`}>{valueText}</span>
        {note && <span className="text-muted-foreground">{note}</span>}
      </div>
      <svg width={scale.plotWidth + AXIS_WIDTH} height={PANEL_HEIGHT} className="block touch-pan-y" {...handlers}>
        <line
          x1={0}
          x2={scale.plotWidth}
          y1={zeroY - (signed ? 0 : 0.5)}
          y2={zeroY - (signed ? 0 : 0.5)}
          stroke="currentColor"
          className="text-border"
        />
        <PriceLabel x={scale.plotWidth} y={6}>
          {signed ? `+${formatCompactLots(peak)}` : formatCompactLots(peak)}
        </PriceLabel>
        {signed && (
          <PriceLabel x={scale.plotWidth} y={PANEL_HEIGHT - 6}>
            {`-${formatCompactLots(peak)}`}
          </PriceLabel>
        )}

        {values.map((value, index) => {
          if (value == null || value === 0) return null;
          const height = Math.max(1, (Math.abs(value) / peak) * reach);
          const y = value > 0 ? zeroY - height : zeroY;
          return (
            <rect
              key={index}
              x={scale.center(index) - scale.barWidth / 2}
              y={y}
              width={scale.barWidth}
              height={height}
              fill={colors(value, index)}
            />
          );
        })}

        <Crosshair x={hoverX} height={PANEL_HEIGHT} />
      </svg>
    </div>
  );
}

/**
 * 個股詳細圖表：日 K、成交量、外資、投信、主力買賣超，共用同一條 X 軸，
 * 滑過任一個面板都會對齊顯示同一天的數字。
 */
export function StockHistoryChart({
  days,
  majorFlows,
  majorLoading,
}: {
  days: StockHistoryDay[];
  /** key 是日期；還沒載入完為 undefined */
  majorFlows?: Record<string, number | null>;
  majorLoading: boolean;
}) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const count = days.length;
  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const pitch = count > 0 ? plotWidth / count : 0;
  const scale: Scale = {
    plotWidth,
    pitch,
    center: (index) => index * pitch + pitch / 2,
    // 區間短、K 棒少的時候不要胖成方塊
    barWidth: Math.min(12, Math.max(1, pitch * 0.7)),
  };

  const handlers: PointerHandlers = {
    onPointerMove: (event) => {
      const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
      if (pitch === 0 || x < 0 || x > plotWidth) {
        setHoverIndex(null);
        return;
      }
      setHoverIndex(Math.min(count - 1, Math.floor(x / pitch)));
    },
    onPointerLeave: () => setHoverIndex(null),
  };

  const activeIndex = hoverIndex != null && hoverIndex < count ? hoverIndex : count - 1;
  const active = days[activeIndex];
  const previous = activeIndex > 0 ? days[activeIndex - 1] : null;
  const hoverX = hoverIndex != null && hoverIndex < count ? scale.center(hoverIndex) : null;

  const change = active && previous ? active.close - previous.close : null;
  const changePercent = change != null && previous ? (change / previous.close) * 100 : null;
  const majorOf = (day: StockHistoryDay) => majorFlows?.[day.date];

  // X 軸日期大約每 70px 標一個
  const labelEvery = Math.max(1, Math.ceil(70 / Math.max(pitch, 1)));

  return (
    <div ref={containerRef} className="w-full select-none">
      {width === 0 ? (
        <div style={{ height: PRICE_HEIGHT }} />
      ) : count === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">這段期間沒有日 K 資料。</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pb-1 text-xs tabular-nums">
            <span className="font-medium">{active.date}</span>
            <span>
              <span className="text-muted-foreground">開</span> {formatPrice(active.open)}
            </span>
            <span>
              <span className="text-muted-foreground">高</span> {formatPrice(active.high)}
            </span>
            <span>
              <span className="text-muted-foreground">低</span> {formatPrice(active.low)}
            </span>
            <span>
              <span className="text-muted-foreground">收</span>{' '}
              <span className={priceChangeClass(change)}>{formatPrice(active.close)}</span>
            </span>
            {changePercent != null && (
              <span className={priceChangeClass(change)}>
                {change! > 0 ? '+' : ''}
                {change!.toFixed(2)}（{changePercent > 0 ? '+' : ''}
                {changePercent.toFixed(2)}%）
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 pb-1 text-[11px] tabular-nums">
            {MA_LINES.map((line) => {
              const value = active[line.key];
              return (
                <span key={line.key} style={{ color: line.color }}>
                  {line.label} {value != null ? formatPrice(value) : '--'}
                </span>
              );
            })}
          </div>

          <PricePanel days={days} scale={scale} hoverX={hoverX} handlers={handlers} />

          <BarPanel
            title="成交量（張）"
            valueText={formatLots(active.volume)}
            valueClass=""
            values={days.map((day) => day.volume)}
            colors={(_, index) => candleColor(days[index])}
            signed={false}
            scale={scale}
            hoverX={hoverX}
            handlers={handlers}
          />
          <BarPanel
            title="外資買賣超（張）"
            valueText={signedLots(active.foreign)}
            valueClass={signedClass(active.foreign)}
            values={days.map((day) => day.foreign)}
            colors={(value) => (value > 0 ? UP_HEX : DOWN_HEX)}
            signed
            scale={scale}
            hoverX={hoverX}
            handlers={handlers}
          />
          <BarPanel
            title="投信買賣超（張）"
            valueText={signedLots(active.trust)}
            valueClass={signedClass(active.trust)}
            values={days.map((day) => day.trust)}
            colors={(value) => (value > 0 ? UP_HEX : DOWN_HEX)}
            signed
            scale={scale}
            hoverX={hoverX}
            handlers={handlers}
          />
          <BarPanel
            title="主力買賣超（張）"
            valueText={signedLots(majorOf(active))}
            valueClass={signedClass(majorOf(active))}
            values={days.map(majorOf)}
            colors={(value) => (value > 0 ? UP_HEX : DOWN_HEX)}
            signed
            scale={scale}
            hoverX={hoverX}
            handlers={handlers}
            note={majorLoading && !majorFlows ? '逐日查詢分點資料中…' : undefined}
          />

          <svg width={plotWidth + AXIS_WIDTH} height={X_AXIS_HEIGHT} className="block">
            {days.map((day, index) => {
              if ((count - 1 - index) % labelEvery !== 0) return null;
              const x = scale.center(index);
              if (x < 16 || x > plotWidth - 16) return null;
              return (
                <text
                  key={day.date}
                  x={x}
                  y={12}
                  fontSize={10}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                >
                  {day.date.slice(5).replace('-', '/')}
                </text>
              );
            })}
          </svg>
        </>
      )}
    </div>
  );
}
