'use client';

import { useId, useState } from 'react';
import { useElementWidth } from '@/hooks/useElementWidth';
import { DOWN_HEX, UP_HEX, gainTextClass } from '@/lib/colors';
import { niceTicks } from '@/lib/chart-scale';
import { formatLots } from '@/lib/chips-format';
import { BarPanel, type PointerHandlers, type Scale } from '@/components/stock-history-chart';
import type { IntradaySeries } from '@/types';

/** 平盤那一分鐘的量柱顏色 */
const FLAT_HEX = 'oklch(0.6 0 0)';

const AXIS_WIDTH = 56;
const X_AXIS_HEIGHT = 16;
const PADDING = 8;
/** X 軸標的時間點（距離 09:00 的分鐘數） */
const TIME_TICKS = [0, 60, 120, 180, 240, 270];

function clockLabel(offset: number): string {
  const minutes = 9 * 60 + Math.round(offset);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * 放大版的今日走勢：固定 09:00–13:30 的時間軸、昨收虛線、右側價格刻度，
 * 滑過去看那一分鐘的價格與漲跌幅。
 */
export function IntradayChart({
  series,
  height = 260,
}: {
  series?: IntradaySeries;
  height?: number;
}) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const gradientId = useId();

  const points = series?.points ?? [];
  const count = points.length;
  const plotWidth = Math.max(0, width - AXIS_WIDTH);

  if (width === 0 || count < 2 || !series) {
    return (
      <div ref={containerRef} className="w-full">
        {width > 0 && (
          <p
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height }}
          >
            今日還沒有走勢資料。
          </p>
        )}
      </div>
    );
  }

  const base = series.previousClose || points[0];
  const byTime = series.sessionMinutes > 0 && series.offsets?.length === count;
  const toX = (index: number) =>
    byTime
      ? (Math.min(Math.max(series.offsets[index], 0), series.sessionMinutes) /
          series.sessionMinutes) *
        plotWidth
      : (index / (count - 1)) * plotWidth;

  const min = Math.min(...points, base);
  const max = Math.max(...points, base);
  const range = max - min || 1;
  const toY = (value: number) => PADDING + (1 - (value - min) / range) * (height - PADDING * 2);
  const { ticks, decimals } = niceTicks(min, max, 5);

  const line = points
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${toX(index).toFixed(2)},${toY(value).toFixed(2)}`)
    .join(' ');
  const area = `${line} L${toX(count - 1).toFixed(2)},${height} L${toX(0).toFixed(2)},${height} Z`;

  const activeIndex = hoverIndex ?? count - 1;
  const activePrice = points[activeIndex];
  const change = activePrice - base;
  const changePercent = base ? (change / base) * 100 : 0;
  const color = points[count - 1] >= base ? UP_HEX : DOWN_HEX;

  const volumes = series.volumes?.length === count ? series.volumes : null;
  const hasVolume = !!volumes?.some((volume) => volume != null && volume > 0);
  const activeVolume = volumes?.[activeIndex] ?? null;
  // 一分鐘一根；沒有時間軸時就照點數平分
  const pitch = byTime ? plotWidth / series.sessionMinutes : plotWidth / count;
  const volumeScale: Scale = {
    plotWidth,
    pitch,
    center: toX,
    barWidth: Math.max(1, pitch * 0.7),
  };
  // 量柱顏色：這一分鐘比上一分鐘漲就紅、跌就綠
  const volumeColor = (_: number, index: number) => {
    const previous = index > 0 ? points[index - 1] : base;
    if (points[index] > previous) return UP_HEX;
    if (points[index] < previous) return DOWN_HEX;
    return FLAT_HEX;
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
    if (x < 0 || x > plotWidth) {
      setHoverIndex(null);
      return;
    }
    // 最靠近游標的那個點
    let nearest = 0;
    for (let index = 1; index < count; index++) {
      if (Math.abs(toX(index) - x) < Math.abs(toX(nearest) - x)) nearest = index;
    }
    setHoverIndex(nearest);
  };
  const handlers: PointerHandlers = { onPointerMove, onPointerLeave: () => setHoverIndex(null) };

  return (
    <div ref={containerRef} className="w-full select-none">
      <div className="flex flex-wrap items-baseline gap-x-3 pb-1 text-xs tabular-nums">
        <span className="font-medium">
          {series.tradingDate}
          {byTime && ` ${clockLabel(series.offsets[activeIndex])}`}
        </span>
        <span className={gainTextClass(change)}>{activePrice.toFixed(2)}</span>
        <span className={gainTextClass(change)}>
          {change > 0 ? '+' : ''}
          {change.toFixed(2)}（{changePercent > 0 ? '+' : ''}
          {changePercent.toFixed(2)}%）
        </span>
        <span className="text-muted-foreground">昨收 {base.toFixed(2)}</span>
        {hasVolume && (
          <span>
            <span className="text-muted-foreground">量</span>{' '}
            {activeVolume != null ? `${formatLots(activeVolume)} 張` : '--'}
          </span>
        )}
      </div>

      <svg
        width={width}
        height={height}
        className="block touch-pan-y"
        {...handlers}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={0} x2={plotWidth} y1={toY(tick)} y2={toY(tick)} stroke="currentColor" className="text-border" />
            <text x={plotWidth + 6} y={toY(tick)} dy="0.32em" fontSize={10} className="fill-muted-foreground">
              {tick.toFixed(decimals)}
            </text>
          </g>
        ))}

        <line
          x1={0}
          x2={plotWidth}
          y1={toY(base)}
          y2={toY(base)}
          stroke="currentColor"
          strokeDasharray="4 4"
          className="text-muted-foreground"
        />

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />

        {hoverIndex != null && (
          <>
            <line
              x1={toX(hoverIndex)}
              x2={toX(hoverIndex)}
              y1={0}
              y2={height}
              stroke="currentColor"
              strokeDasharray="3 3"
              className="pointer-events-none text-muted-foreground"
            />
            <circle cx={toX(hoverIndex)} cy={toY(activePrice)} r="3" fill={color} />
          </>
        )}
      </svg>

      {hasVolume && (
        <BarPanel
          title="成交量（張）"
          valueText={activeVolume != null ? formatLots(activeVolume) : '--'}
          valueClass=""
          values={volumes!}
          colors={volumeColor}
          signed={false}
          scale={volumeScale}
          hoverX={hoverIndex != null ? toX(hoverIndex) : null}
          handlers={handlers}
        />
      )}

      {byTime && (
        <svg width={width} height={X_AXIS_HEIGHT} className="block">
          {TIME_TICKS.map((offset, index) => (
            <text
              key={offset}
              x={(offset / series.sessionMinutes) * plotWidth}
              y={12}
              fontSize={10}
              textAnchor={index === 0 ? 'start' : index === TIME_TICKS.length - 1 ? 'end' : 'middle'}
              className="fill-muted-foreground"
            >
              {clockLabel(offset)}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}
