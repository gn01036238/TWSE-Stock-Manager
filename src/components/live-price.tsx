'use client';

import { useEffect, useRef, useState } from 'react';

type Direction = 'up' | 'down';

/**
 * 數值變動時短暫閃動（漲綠 / 跌紅），讓使用者看得見報價正在跳動。
 */
export function LivePrice({
  value,
  format = (v: number) => v.toFixed(2),
  className = '',
}: {
  value: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const previous = useRef(value);
  const [flash, setFlash] = useState<Direction | null>(null);

  useEffect(() => {
    if (previous.current === value) return;

    const direction: Direction = value > previous.current ? 'up' : 'down';
    previous.current = value;

    // 先清空再設值，確保連續變動時動畫會重新播放
    setFlash(null);
    const raf = requestAnimationFrame(() => setFlash(direction));
    const timer = setTimeout(() => setFlash(null), 1200);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [value]);

  return (
    <span
      className={`inline-block rounded px-1 tabular-nums ${
        flash ? `price-flash-${flash}` : ''
      } ${className}`}
    >
      {format(value)}
    </span>
  );
}
