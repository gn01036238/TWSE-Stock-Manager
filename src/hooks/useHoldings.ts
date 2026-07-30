'use client';

import { useMemo } from 'react';
import { useTransactions } from './useTransactions';
import { usePrices } from './usePrices';
import { useIntraday } from './useIntraday';
import { useDividends } from './useDividends';
import { computeHoldings, computeRealizedGains, computePortfolioSummary } from '@/lib/calculations';
import type { Holding, PortfolioSummary, RealizedGain, StockPrice } from '@/types';

export function useHoldings() {
  const { data: txData, isLoading: txLoading, error: txError } = useTransactions();

  // Get unique tickers from transactions
  const tickers = useMemo(() => {
    if (!txData?.transactions) return [];
    const set = new Set(txData.transactions.map((t) => t.ticker));
    return Array.from(set);
  }, [txData?.transactions]);

  const {
    data: prices,
    isLoading: pricesLoading,
    isFetching: pricesFetching,
    dataUpdatedAt: pricesUpdatedAt,
    refetch: refetchPrices,
  } = usePrices(tickers);
  const { data: dividendsData, isLoading: dividendsLoading } = useDividends(tickers);

  // 日內走勢圖資料。刻意不列入 isLoading，避免走勢圖拖慢整頁顯示
  const { data: intraday } = useIntraday(tickers);

  // Compute holdings, realized gains, and portfolio summary
  const { holdings, realizedGains, summary } = useMemo(() => {
    if (!txData?.transactions || !prices) {
      return {
        holdings: [] as Holding[],
        realizedGains: [] as RealizedGain[],
        summary: {
          totalInvested: 0,
          totalMarketValue: 0,
          totalUnrealizedGain: 0,
          totalUnrealizedGainPercent: 0,
          totalRealizedGain: 0,
          totalDividends: 0,
          holdingsCount: 0,
        } as PortfolioSummary,
      };
    }

    const pricesMap = new Map<string, StockPrice>();
    for (const [ticker, price] of Object.entries(prices)) {
      pricesMap.set(ticker, price);
    }

    // Calculate dividends per ticker
    const dividendsByTicker = new Map<string, number>();
    const dividendPerShareByTicker = new Map<string, number>();
    if (dividendsData) {
      for (const [ticker, data] of Object.entries(dividendsData)) {
        dividendsByTicker.set(ticker, data.totalIncome || 0);
        dividendPerShareByTicker.set(ticker, data.dividendPerShare || 0);
      }
    }

    const stockNames = new Map<string, string>();
    pricesMap.forEach((price, ticker) => {
      stockNames.set(ticker, price.name);
    });

    const holdings = computeHoldings(
      txData.transactions,
      pricesMap,
      dividendsByTicker,
      dividendPerShareByTicker
    );
    const realizedGains = computeRealizedGains(txData.transactions, stockNames);
    const summary = computePortfolioSummary(holdings, realizedGains);

    // Add dividends to summary
    const totalDividends = Array.from(dividendsByTicker.values()).reduce((sum, d) => sum + d, 0);
    summary.totalDividends = totalDividends;

    return { holdings, realizedGains, summary };
  }, [txData?.transactions, prices, dividendsData]);

  return {
    holdings,
    realizedGains,
    summary,
    brokers: txData?.brokers || [],
    isLoading: txLoading || pricesLoading || dividendsLoading,
    error: txError,
    prices,
    intraday: intraday ?? {},
    dividends: dividendsData ?? {},
    // 即時報價狀態
    pricesUpdatedAt,
    isPricesFetching: pricesFetching,
    refreshPrices: refetchPrices,
  };
}
