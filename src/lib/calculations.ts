import type { Holding, PortfolioSummary, RealizedGain, StockPrice, Transaction } from '@/types';

// Group transactions by ticker
function groupByTicker(transactions: Transaction[]): Map<string, Transaction[]> {
  const grouped = new Map<string, Transaction[]>();

  for (const tx of transactions) {
    if (!grouped.has(tx.ticker)) {
      grouped.set(tx.ticker, []);
    }
    grouped.get(tx.ticker)!.push(tx);
  }

  return grouped;
}

// Compute current holdings from transactions
export function computeHoldings(
  transactions: Transaction[],
  prices: Map<string, StockPrice>,
  dividendsByTicker: Map<string, number> = new Map(),
  dividendPerShareByTicker: Map<string, number> = new Map()
): Holding[] {
  const byTicker = groupByTicker(transactions);
  const holdings: Holding[] = [];

  for (const [ticker, txns] of byTicker) {
    let shares = 0;
    let totalCost = 0;

    // Sort by date ascending, then BUY before SELL (so same-day trades work correctly)
    const sortedTxns = [...txns].sort((a, b) => {
      const dateCompare = new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime();
      if (dateCompare !== 0) return dateCompare;
      // On same day, BUY should come before SELL
      if (a.transaction_type === 'BUY' && b.transaction_type === 'SELL') return -1;
      if (a.transaction_type === 'SELL' && b.transaction_type === 'BUY') return 1;
      return 0;
    });

    for (const tx of sortedTxns) {
      if (tx.transaction_type === 'BUY') {
        totalCost += tx.quantity * tx.price + (tx.commission || 0);
        shares += tx.quantity;
      } else if (tx.transaction_type === 'SELL') {
        // Reduce cost proportionally (average cost method)
        if (shares > 0) {
          const costPerShare = totalCost / shares;
          totalCost -= tx.quantity * costPerShare;
          shares -= tx.quantity;
        }
      }
    }

    // Only include if we still hold shares
    if (shares > 0) {
      const priceData = prices.get(ticker);
      const currentPrice = priceData?.price || 0;
      const name = priceData?.name || ticker;
      const marketValue = shares * currentPrice;
      const unrealizedGain = marketValue - totalCost;
      const totalDividends = dividendsByTicker.get(ticker) || 0;
      const dividendPerShare = dividendPerShareByTicker.get(ticker) || 0;
      const adjustedPrice = currentPrice + dividendPerShare;
      // 含息損益：市值成長 + 已領股利
      const adjustedGain = shares * adjustedPrice - totalCost;

      holdings.push({
        ticker,
        name,
        shares,
        avgCost: totalCost / shares,
        totalCost,
        currentPrice,
        marketValue,
        unrealizedGain,
        unrealizedGainPercent: totalCost > 0 ? (unrealizedGain / totalCost) * 100 : 0,
        totalDividends,
        dividendPerShare,
        adjustedPrice,
        adjustedGainPercent: totalCost > 0 ? (adjustedGain / totalCost) * 100 : 0,
      });
    }
  }

  // Sort by market value descending
  return holdings.sort((a, b) => b.marketValue - a.marketValue);
}

// Calculate realized gains from sell transactions
export function computeRealizedGains(
  transactions: Transaction[],
  stockNames: Map<string, string>
): RealizedGain[] {
  const byTicker = groupByTicker(transactions);
  const gains: RealizedGain[] = [];

  for (const [ticker, txns] of byTicker) {
    const buyQueue: { quantity: number; price: number; commission: number }[] = [];
    // Sort by date ascending, then BUY before SELL (so same-day trades work correctly)
    const sortedTxns = [...txns].sort((a, b) => {
      const dateCompare = new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime();
      if (dateCompare !== 0) return dateCompare;
      if (a.transaction_type === 'BUY' && b.transaction_type === 'SELL') return -1;
      if (a.transaction_type === 'SELL' && b.transaction_type === 'BUY') return 1;
      return 0;
    });

    for (const tx of sortedTxns) {
      if (tx.transaction_type === 'BUY') {
        buyQueue.push({
          quantity: tx.quantity,
          price: tx.price,
          commission: tx.commission || 0,
        });
      } else if (tx.transaction_type === 'SELL') {
        let remainingToSell = tx.quantity;
        let totalBuyCost = 0;

        // FIFO method
        while (remainingToSell > 0 && buyQueue.length > 0) {
          const buy = buyQueue[0];
          const soldFromThisBuy = Math.min(remainingToSell, buy.quantity);

          totalBuyCost += soldFromThisBuy * buy.price + (buy.commission / buy.quantity) * soldFromThisBuy;
          buy.quantity -= soldFromThisBuy;
          remainingToSell -= soldFromThisBuy;

          if (buy.quantity <= 0) {
            buyQueue.shift();
          }
        }

        const sellRevenue = tx.quantity * tx.price - (tx.commission || 0) - (tx.tax || 0);
        const gain = sellRevenue - totalBuyCost;
        const avgBuyPrice = totalBuyCost / tx.quantity;

        gains.push({
          ticker,
          stockName: stockNames.get(ticker) || ticker,
          sellDate: tx.transaction_date,
          quantity: tx.quantity,
          buyPrice: avgBuyPrice,
          sellPrice: tx.price,
          gain,
          gainPercent: totalBuyCost > 0 ? (gain / totalBuyCost) * 100 : 0,
        });
      }
    }
  }

  // Sort by date descending
  return gains.sort((a, b) => new Date(b.sellDate).getTime() - new Date(a.sellDate).getTime());
}

// Calculate portfolio summary
export function computePortfolioSummary(
  holdings: Holding[],
  realizedGains: RealizedGain[]
): PortfolioSummary {
  const totalInvested = holdings.reduce((sum, h) => sum + h.totalCost, 0);
  const totalMarketValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  const totalUnrealizedGain = holdings.reduce((sum, h) => sum + h.unrealizedGain, 0);
  const totalRealizedGain = realizedGains.reduce((sum, g) => sum + g.gain, 0);
  const totalDividends = holdings.reduce((sum, h) => sum + h.totalDividends, 0);

  return {
    totalInvested,
    totalMarketValue,
    totalUnrealizedGain,
    totalUnrealizedGainPercent: totalInvested > 0 ? (totalUnrealizedGain / totalInvested) * 100 : 0,
    totalRealizedGain,
    totalDividends,
    holdingsCount: holdings.length,
  };
}

// Calculate commission based on broker settings
export function calculateCommission(
  amount: number,
  commissionRate: number,
  discount: number
): number {
  const commission = amount * commissionRate;
  const discountedCommission = commission * discount;
  return Math.max(20, discountedCommission); // Minimum 20 TWD
}

// Calculate sell tax (0.3% for stocks, 0.1% for ETFs)
export function calculateSellTax(amount: number, isETF: boolean): number {
  const taxRate = isETF ? 0.001 : 0.003;
  return amount * taxRate;
}

// Check if a ticker is an ETF (starts with 00)
export function isETF(ticker: string): boolean {
  return ticker.startsWith('00');
}

// Format currency
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format percentage
export function formatPercent(value: number): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}
