'use client';

import { useMemo } from 'react';
import { useTransactions } from './useTransactions';
import { usePrices } from './usePrices';
import { useIntraday } from './useIntraday';
import { useDividends } from './useDividends';
import { computeHoldings, computeRealizedGains, computePortfolioSummary } from '@/lib/calculations';
import { latestTradingDateKey } from '@/lib/market';
import type { Holding, PortfolioSummary, RealizedGain, StockPrice } from '@/types';

export function useHoldings() {
  const { data: txData, isLoading: txLoading, error: txError } = useTransactions();
  const transactions = txData?.transactions;

  // Get unique tickers from transactions
  const tickers = useMemo(() => {
    if (!transactions) return [];
    const set = new Set(transactions.map((t) => t.ticker));
    return Array.from(set);
  }, [transactions]);

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

  // 今日損益要知道哪些交易是「今天買的」。TWSE 報價帶的交易日最準（避得開國定假日，
  // 也不會像 Yahoo 那樣整場落後一天），沒拿到時才退回用台北時間推算
  const tradingDate = useMemo(() => {
    const dates = Object.values(prices ?? {})
      .map((price) => price?.tradingDate)
      .filter((date): date is string => !!date)
      .sort();
    return dates.at(-1) ?? latestTradingDateKey();
  }, [prices]);

  // Compute holdings, realized gains, and portfolio summary
  const { holdings, realizedGains, summary } = useMemo(() => {
    if (!transactions || !prices) {
      return {
        holdings: [] as Holding[],
        realizedGains: [] as RealizedGain[],
        summary: {
          totalInvested: 0,
          totalMarketValue: 0,
          totalUnrealizedGain: 0,
          totalUnrealizedGainPercent: 0,
          totalDayChange: 0,
          totalDayChangePercent: 0,
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
      transactions,
      pricesMap,
      dividendsByTicker,
      dividendPerShareByTicker,
      tradingDate
    );
    const realizedGains = computeRealizedGains(transactions, stockNames);
    const summary = computePortfolioSummary(holdings, realizedGains);

    // Add dividends to summary
    const totalDividends = Array.from(dividendsByTicker.values()).reduce((sum, d) => sum + d, 0);
    summary.totalDividends = totalDividends;

    return { holdings, realizedGains, summary };
  }, [transactions, prices, dividendsData, tradingDate]);

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
