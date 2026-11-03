'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 量元素的內容寬度（取整數），跟著視窗／欄寬變動更新。
 * 圖表用它算座標，才能撐滿外框又保持線條清晰。
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // 取整數，避免內容寬度跟外框互相推擠造成反覆重算
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width))
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
