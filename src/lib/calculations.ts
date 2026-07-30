import type {
  Holding,
  PortfolioSummary,
  RealizedGain,
  StockPrice,
  Transaction,
  TransactionPnL,
} from '@/types';

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

/** 日期升冪，同一天買入排在賣出前面（當沖才配對得起來） */
function sortByTradeOrder(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    const dateCompare =
      new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime();
    if (dateCompare !== 0) return dateCompare;
    if (a.transaction_type === 'BUY' && b.transaction_type === 'SELL') return -1;
    if (a.transaction_type === 'SELL' && b.transaction_type === 'BUY') return 1;
    return 0;
  });
}

/**
 * 日期填今天、但成交價根本不在今天的價格區間內（常見於補登舊交易時日期沒改），
 * 這種紀錄不能拿成交價當今日損益的基準，否則會把幾個月的價差算成今天賺賠。
 * 判斷不出今天區間時（沒有報價）一律當成不是今天的交易，維持昨收基準。
 */
function isTodayTradePrice(price: number, quote: StockPrice | undefined): boolean {
  if (!quote) return false;

  const low = Math.min(quote.low, quote.price, quote.previousClose);
  const high = Math.max(quote.high, quote.price, quote.previousClose);
  if (!(low > 0) || !(high > 0)) return false;

  // 留一點容差給四捨五入
  return price >= low * 0.995 && price <= high * 1.005;
}

// Compute current holdings from transactions
/**
 * @param tradingDate 最新交易日（台北時區 YYYY-MM-DD）。用來把當天才買進的股數
 *   從「今日損益」的昨收基準裡拿掉，改用成交價當基準。不給就全部以昨收計算。
 */
export function computeHoldings(
  transactions: Transaction[],
  prices: Map<string, StockPrice>,
  dividendsByTicker: Map<string, number> = new Map(),
  dividendPerShareByTicker: Map<string, number> = new Map(),
  tradingDate?: string
): Holding[] {
  const byTicker = groupByTicker(transactions);
  const holdings: Holding[] = [];

  for (const [ticker, txns] of byTicker) {
    const priceData = prices.get(ticker);
    let shares = 0;
    let totalCost = 0;
    // 今日損益的基準：昨日就持有的股數（用昨收）＋ 今日買進的批次（用成交價）
    let sharesBeforeToday = 0;
    const todayLots: { quantity: number; price: number }[] = [];

    const sortedTxns = sortByTradeOrder(txns);

    for (const tx of sortedTxns) {
      // 日期可能帶時間（DB 為 date 欄位，但匯入來源不一），只比對 YYYY-MM-DD
      const isToday = tradingDate != null && tx.transaction_date.slice(0, 10) === tradingDate;

      if (tx.transaction_type === 'BUY') {
        totalCost += tx.quantity * tx.price + (tx.commission || 0);
        shares += tx.quantity;

        if (isToday && isTodayTradePrice(tx.price, priceData)) {
          todayLots.push({ quantity: tx.quantity, price: tx.price });
        } else {
          sharesBeforeToday += tx.quantity;
        }
      } else if (tx.transaction_type === 'SELL') {
        // Reduce cost proportionally (average cost method)
        if (shares > 0) {
          const costPerShare = totalCost / shares;
          totalCost -= tx.quantity * costPerShare;
          shares -= tx.quantity;
        }

        // 今日損益基準同樣用 FIFO：先賣掉舊持股，再賣今日買進的批次（當沖）
        let remaining = tx.quantity;
        const fromBefore = Math.min(remaining, sharesBeforeToday);
        sharesBeforeToday -= fromBefore;
        remaining -= fromBefore;

        while (remaining > 0 && todayLots.length > 0) {
          const lot = todayLots[0];
          const taken = Math.min(remaining, lot.quantity);
          lot.quantity -= taken;
          remaining -= taken;
          if (lot.quantity <= 0) todayLots.shift();
        }
      }
    }

    // Only include if we still hold shares
    if (shares > 0) {
      const currentPrice = priceData?.price || 0;
      const previousClose = priceData?.previousClose || 0;
      const name = priceData?.name || ticker;
      const marketValue = shares * currentPrice;

      // 今日損益 = 現值 − 今日基準值（昨日持股用昨收，今日買進用成交價，未計手續費）
      const todayLotShares = todayLots.reduce((sum, lot) => sum + lot.quantity, 0);
      const todayLotBasis = todayLots.reduce((sum, lot) => sum + lot.quantity * lot.price, 0);
      // 報價或昨收抓不到時不猜，直接算 0，避免把整段漲跌（或整筆成本）算成今日損益
      const canComputeDay =
        currentPrice > 0 && (previousClose > 0 || sharesBeforeToday === 0);
      const dayBasis = canComputeDay
        ? sharesBeforeToday * previousClose + todayLotBasis
        : 0;
      // 拆成兩段方便畫面說明「這個數字是怎麼來的」
      const dayChangeHeld =
        dayBasis > 0 ? sharesBeforeToday * (currentPrice - previousClose) : 0;
      const dayChangeToday = dayBasis > 0 ? todayLotShares * currentPrice - todayLotBasis : 0;
      const dayChange = dayChangeHeld + dayChangeToday;
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
        previousClose,
        dayBasis,
        dayChange,
        dayChangeHeld,
        dayChangeToday,
        todayShares: todayLotShares,
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
    const sortedTxns = sortByTradeOrder(txns);

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

/**
 * 每一筆交易的收益狀況（交易記錄畫面用），以 FIFO 把賣出配對到買入。
 *
 * - 賣出：賣出淨收入（扣手續費與交易稅）− 配對到的買入成本 = 已實現損益。
 * - 買入：被後續賣出配對掉的股數算已實現，剩下還持有的股數以現價算未實現，兩段相加。
 *   報酬率的分母都用該筆交易自己的成本（賣出用配對到的買入成本）。
 */
export function computeTransactionPnL(
  transactions: Transaction[],
  prices: Map<string, StockPrice>
): Map<string, TransactionPnL> {
  const result = new Map<string, TransactionPnL>();
  const byTicker = groupByTicker(transactions);

  for (const [ticker, txns] of byTicker) {
    const currentPrice = prices.get(ticker)?.price ?? 0;
    // 還沒被賣掉的買入批次，舊的在前
    const buyQueue: { id: string; quantity: number; price: number; feePerShare: number }[] = [];

    for (const tx of sortByTradeOrder(txns)) {
      if (tx.quantity <= 0) continue;

      if (tx.transaction_type === 'BUY') {
        const feePerShare = (tx.commission || 0) / tx.quantity;

        result.set(tx.id, {
          gain: null,
          gainPercent: null,
          realized: 0,
          unrealized: null,
          soldShares: 0,
          heldShares: tx.quantity,
          basis: tx.quantity * tx.price + (tx.commission || 0),
        });

        buyQueue.push({ id: tx.id, quantity: tx.quantity, price: tx.price, feePerShare });
        continue;
      }

      // 賣出：淨收入扣掉手續費與交易稅，再減掉 FIFO 配對到的買入成本
      const sellFeePerShare = ((tx.commission || 0) + (tx.tax || 0)) / tx.quantity;
      let remaining = tx.quantity;
      let matchedShares = 0;
      let matchedCost = 0;
      let realized = 0;

      while (remaining > 0 && buyQueue.length > 0) {
        const lot = buyQueue[0];
        const taken = Math.min(remaining, lot.quantity);
        const buyCost = taken * (lot.price + lot.feePerShare);
        const revenue = taken * (tx.price - sellFeePerShare);
        const gain = revenue - buyCost;

        realized += gain;
        matchedShares += taken;
        matchedCost += buyCost;
        remaining -= taken;
        lot.quantity -= taken;

        // 這段獲利同時掛在被賣掉的那筆買入上
        const buyPnL = result.get(lot.id);
        if (buyPnL) {
          buyPnL.realized += gain;
          buyPnL.soldShares += taken;
          buyPnL.heldShares -= taken;
        }

        if (lot.quantity <= 0) buyQueue.shift();
      }

      result.set(tx.id, {
        // 沒有任何對應的買入紀錄（例如只匯入部分歷史）就不硬算
        gain: matchedShares > 0 ? realized : null,
        gainPercent: matchedCost > 0 ? (realized / matchedCost) * 100 : null,
        realized,
        unrealized: 0,
        soldShares: matchedShares,
        heldShares: 0,
        basis: matchedCost,
      });
    }

    // 買入的未實現部分：還留著的股數用現價評價
    for (const lot of buyQueue) {
      const pnl = result.get(lot.id);
      if (!pnl || currentPrice <= 0) continue;
      pnl.unrealized = lot.quantity * (currentPrice - lot.price - lot.feePerShare);
    }

    for (const tx of txns) {
      const pnl = result.get(tx.id);
      if (!pnl || tx.transaction_type !== 'BUY') continue;

      // 全部賣掉了就沒有未實現的部分
      if (pnl.heldShares <= 0) pnl.unrealized = 0;
      // 還有持股但抓不到現價時不猜，整筆顯示為無法計算
      else if (pnl.unrealized == null) continue;

      pnl.gain = pnl.realized + (pnl.unrealized ?? 0);
      pnl.gainPercent = pnl.basis > 0 ? (pnl.gain / pnl.basis) * 100 : null;
    }
  }

  return result;
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
  const totalDayChange = holdings.reduce((sum, h) => sum + h.dayChange, 0);
  // 分母為今日基準值，只計入算得出今日損益的持股，比例才不會被沒報價的部位稀釋
  const dayBasisValue = holdings.reduce((sum, h) => sum + h.dayBasis, 0);

  return {
    totalInvested,
    totalMarketValue,
    totalUnrealizedGain,
    totalUnrealizedGainPercent: totalInvested > 0 ? (totalUnrealizedGain / totalInvested) * 100 : 0,
    totalDayChange,
    totalDayChangePercent: dayBasisValue > 0 ? (totalDayChange / dayBasisValue) * 100 : 0,
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
