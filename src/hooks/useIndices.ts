'use client';

import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PRICE_REFRESH_INTERVAL } from './usePrices';
import { useIsMounted } from './useIsMounted';
import { DEFAULT_INDEX_SYMBOLS } from '@/lib/index-symbols';
import type { IndexQuote } from '@/types';

const STORAGE_KEY = 'twse-manager:index-symbols';

function readStoredSymbols(): string[] | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return null;

    return parsed.filter((s): s is string => typeof s === 'string');
  } catch {
    return null;
  }
}

function writeStoredSymbols(symbols: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    // 無痕模式等情況寫不進去，只影響下次開啟時的記憶
  }
}

/** 使用者自選的參考指數清單，存在瀏覽器 localStorage */
export function useIndexSymbols() {
  const [symbols, setSymbols] = useState<string[]>(
    () => readStoredSymbols() ?? DEFAULT_INDEX_SYMBOLS
  );
  // localStorage 只有瀏覽器讀得到，掛載前不要畫清單，否則 hydration 會對不上
  const loaded = useIsMounted();

  const persist = useCallback((next: string[]) => {
    setSymbols(next);
    writeStoredSymbols(next);
  }, []);

  const addSymbol = useCallback((raw: string) => {
    const symbol = raw.trim().toUpperCase();
    if (!symbol) return;

    setSymbols((prev) => {
      if (prev.includes(symbol)) return prev;
      const next = [...prev, symbol];
      writeStoredSymbols(next);
      return next;
    });
  }, []);

  const removeSymbol = useCallback(
    (symbol: string) => persist(symbols.filter((s) => s !== symbol)),
    [persist, symbols]
  );

  const resetSymbols = useCallback(() => persist(DEFAULT_INDEX_SYMBOLS), [persist]);

  return { symbols, addSymbol, removeSymbol, resetSymbols, loaded };
}

export function useIndices(symbols: string[]) {
  return useQuery<Record<string, IndexQuote>>({
    queryKey: ['indices', symbols.join(',')],
    queryFn: async () => {
      if (symbols.length === 0) return {};

      const res = await fetch(
        `/api/indices?symbols=${symbols.map(encodeURIComponent).join(',')}`
      );
      if (!res.ok) throw new Error('Failed to fetch indices');

      return res.json();
    },
    enabled: symbols.length > 0,
    staleTime: 0,
    refetchInterval: PRICE_REFRESH_INTERVAL,
    refetchIntervalInBackground: true,
    placeholderData: (prev) => prev,
  });
}
