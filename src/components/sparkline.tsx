'use client';

import { useId } from 'react';
import { DOWN_HEX, UP_HEX } from '@/lib/colors';

export function Sparkline({
  points,
  baseline,
  width = 104,
  height = 40,
  className = '',
}: {
  points: number[];
  /** 昨收價，畫成虛線基準線 */
  baseline?: number;
  width?: number;
  height?: number;
  className?: string;
}) {
  const gradientId = useId();

  if (!points || points.length < 2) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-muted-foreground ${className}`}
        style={{ width, height }}
      >
        —
      </div>
    );
  }

  const base = baseline ?? points[0];
  const min = Math.min(...points, base);
  const max = Math.max(...points, base);
  const range = max - min || 1;

  const padding = 3;
  const usableHeight = height - padding * 2;

  const toX = (index: number) => (index / (points.length - 1)) * width;
  const toY = (value: number) => padding + (1 - (value - min) / range) * usableHeight;

  const line = points
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${toX(index).toFixed(2)},${toY(value).toFixed(2)}`)
    .join(' ');

  const area = `${line} L${width},${height} L0,${height} Z`;

  const last = points[points.length - 1];
  const isUp = last >= base;
  const color = isUp ? UP_HEX : DOWN_HEX;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={isUp ? '走勢上漲' : '走勢下跌'}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {baseline !== undefined && (
        <line
          x1="0"
          x2={width}
          y1={toY(base)}
          y2={toY(base)}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 3"
          className="text-muted-foreground opacity-50"
        />
      )}

      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={toX(points.length - 1)}
        cy={toY(last)}
        r="2.5"
        fill={color}
        stroke={color}
        strokeWidth="3"
        strokeOpacity="0.25"
      />
    </svg>
  );
}
