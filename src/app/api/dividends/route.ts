import { NextRequest, NextResponse } from 'next/server';
import { fetchDividendHistory, calculateDividendIncome } from '@/lib/dividends';
import { getTransactionsByTicker } from '@/lib/supabase';
import { fetchStockPrice } from '@/lib/twse';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ticker = searchParams.get('ticker');

    if (!ticker) {
      return NextResponse.json({ error: 'No ticker provided' }, { status: 400 });
    }

    // Fetch dividend history
    const dividendEvents = await fetchDividendHistory(ticker);

    // Get user's transactions for this stock
    const transactions = await getTransactionsByTicker(ticker);

    // Get stock name
    const priceData = await fetchStockPrice(ticker);
    const stockName = priceData?.name || ticker;

    // Calculate dividend income based on holdings at each ex-date
    const dividendIncome = calculateDividendIncome(transactions, dividendEvents, stockName);

    // Serialize dates
    const serializedIncome = dividendIncome.map((d) => ({
      ...d,
      exDate: d.exDate.toISOString(),
      paymentDate: d.paymentDate.toISOString(),
    }));

    return NextResponse.json({
      ticker,
      stockName,
      dividends: serializedIncome,
      totalIncome: dividendIncome.reduce((sum, d) => sum + d.income, 0),
      dividendPerShare: dividendIncome.reduce((sum, d) => sum + d.amount, 0),
    });
  } catch (error) {
    console.error('Dividend fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch dividends' },
      { status: 500 }
    );
  }
}

// Get dividends for multiple tickers
export async function POST(request: NextRequest) {
  try {
    const { tickers } = await request.json();

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json({ error: 'No tickers provided' }, { status: 400 });
    }

    const results: Record<string, unknown> = {};

    await Promise.all(
      tickers.map(async (ticker: string) => {
        try {
          const dividendEvents = await fetchDividendHistory(ticker);
          const transactions = await getTransactionsByTicker(ticker);
          const priceData = await fetchStockPrice(ticker);
          const stockName = priceData?.name || ticker;

          const dividendIncome = calculateDividendIncome(transactions, dividendEvents, stockName);

          results[ticker] = {
            stockName,
            dividends: dividendIncome.map((d) => ({
              ...d,
              exDate: d.exDate.toISOString(),
              paymentDate: d.paymentDate.toISOString(),
            })),
            totalIncome: dividendIncome.reduce((sum, d) => sum + d.income, 0),
            dividendPerShare: dividendIncome.reduce((sum, d) => sum + d.amount, 0),
          };
        } catch (err) {
          console.error(`Failed to fetch dividends for ${ticker}:`, err);
          results[ticker] = {
            error: 'Failed to fetch',
            dividends: [],
            totalIncome: 0,
            dividendPerShare: 0,
          };
        }
      })
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error('Dividends batch fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch dividends' },
      { status: 500 }
    );
  }
}
