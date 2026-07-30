'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * 存在 localStorage 的小設定（例如「只顯示名稱」）。
 * 用 useSyncExternalStore 讀，SSR 時給預設值、掛載後才換成瀏覽器裡存的值。
 */
const listeners = new Map<string, Set<() => void>>();
// getSnapshot 每次都必須回傳同一個值，所以解析結果要快取起來
const cache = new Map<string, unknown>();

function subscribe(key: string, onChange: () => void): () => void {
  const set = listeners.get(key) ?? new Set();
  set.add(onChange);
  listeners.set(key, set);

  // 其他分頁改了同一個 key 也要跟著更新
  const onStorage = (event: StorageEvent) => {
    if (event.key === key) {
      cache.delete(key);
      onChange();
    }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    set.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function read<T>(key: string, fallback: T): T {
  if (!cache.has(key)) {
    try {
      const raw = window.localStorage.getItem(key);
      cache.set(key, raw != null ? (JSON.parse(raw) as T) : fallback);
    } catch {
      cache.set(key, fallback);
    }
  }
  return cache.get(key) as T;
}

export function usePersistentState<T>(key: string, initialValue: T) {
  const value = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribe(key, onChange), [key]),
    useCallback(() => read(key, initialValue), [key, initialValue]),
    useCallback(() => initialValue, [initialValue])
  );

  const setValue = useCallback(
    (next: T) => {
      cache.set(key, next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // 無痕模式或空間不足：記不起來就算了
      }
      listeners.get(key)?.forEach((listener) => listener());
    },
    [key]
  );

  return [value, setValue] as const;
}
