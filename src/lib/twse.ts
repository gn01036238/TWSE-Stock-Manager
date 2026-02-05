import type { StockPrice, TWseApiResponse } from '@/types';

const TWSE_API = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';

// Stock code to exchange mapping (some ETFs and stocks need different prefixes)
const OTC_STOCKS = new Set<string>([
  // Add OTC stock codes here if needed
]);

function getExchangeCode(ticker: string): string {
  return OTC_STOCKS.has(ticker) ? 'otc' : 'tse';
}

export async function fetchStockPrices(tickers: string[]): Promise<Map<string, StockPrice>> {
  if (tickers.length === 0) return new Map();

  const codes = tickers.map(t => `${getExchangeCode(t)}_${t}.tw`).join('|');

  try {
    const response = await fetch(`${TWSE_API}?ex_ch=${codes}&json=1&delay=0`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`TWSE API error: ${response.status}`);
    }

    const data: TWseApiResponse = await response.json();

    const prices = new Map<string, StockPrice>();

    if (data.msgArray && Array.isArray(data.msgArray)) {
      for (const item of data.msgArray) {
        const currentPrice = parseFloat(item.z) || parseFloat(item.y) || 0;
        const previousClose = parseFloat(item.y) || 0;
        const change = currentPrice - previousClose;

        prices.set(item.c, {
          ticker: item.c,
          name: item.n,
          price: currentPrice,
          previousClose,
          change,
          changePercent: previousClose > 0 ? (change / previousClose) * 100 : 0,
          high: parseFloat(item.h) || currentPrice,
          low: parseFloat(item.l) || currentPrice,
          volume: parseInt(item.v) || 0,
          updatedAt: new Date(),
        });
      }
    }

    return prices;
  } catch (error) {
    console.error('Failed to fetch TWSE prices:', error);
    return new Map();
  }
}

export async function fetchStockPrice(ticker: string): Promise<StockPrice | null> {
  const prices = await fetchStockPrices([ticker]);
  return prices.get(ticker) || null;
}

// Get stock name from price data
export function getStockName(prices: Map<string, StockPrice>, ticker: string): string {
  return prices.get(ticker)?.name || ticker;
}
