'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * 是否已在瀏覽器掛載完成。
 * 用來把「只有瀏覽器才知道的值」（現在時間、localStorage）延後到 hydration 之後再畫，
 * 避免 SSR/CSR 內容不一致。
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
