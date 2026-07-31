'use client';

import { useCallback, useState } from 'react';
import { useIsMounted } from './useIsMounted';

const STORAGE_KEY = 'twse-manager:watchlist-symbols';

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

/**
 * 只想觀察、沒有持有的標的清單，存在瀏覽器 localStorage。
 * 代號格式跟參考指標一致：台股用 Yahoo 代號（例如 2330.TW），其餘（美股等）直接輸入 Yahoo 代號（例如 AAPL）。
 */
export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>(() => readStoredSymbols() ?? []);
  // localStorage 只有瀏覽器讀得到，掛載前不要畫清單，否則 hydration 會對不上
  const loaded = useIsMounted();

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

  const removeSymbol = useCallback((symbol: string) => {
    setSymbols((prev) => {
      const next = prev.filter((s) => s !== symbol);
      writeStoredSymbols(next);
      return next;
    });
  }, []);

  return { symbols, addSymbol, removeSymbol, loaded };
}
