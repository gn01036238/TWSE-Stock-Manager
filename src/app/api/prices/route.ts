import { NextRequest, NextResponse } from 'next/server';
import { fetchStockPrices } from '@/lib/twse';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tickersParam = searchParams.get('tickers');

    if (!tickersParam) {
      return NextResponse.json({ error: 'No tickers provided' }, { status: 400 });
    }

    const tickers = tickersParam.split(',').filter(Boolean);

    if (tickers.length === 0) {
      return NextResponse.json({ error: 'No valid tickers provided' }, { status: 400 });
    }

    const prices = await fetchStockPrices(tickers);

    // Convert Map to object for JSON response
    const pricesObject: Record<string, unknown> = {};
    prices.forEach((value, key) => {
      pricesObject[key] = {
        ...value,
        updatedAt: value.updatedAt.toISOString(),
      };
    });

    return NextResponse.json(pricesObject);
  } catch (error) {
    console.error('Price fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch prices' },
      { status: 500 }
    );
  }
}
