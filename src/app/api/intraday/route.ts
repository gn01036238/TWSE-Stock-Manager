import { NextRequest, NextResponse } from 'next/server';
import { fetchIntradaySeries } from '@/lib/intraday';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const tickersParam = request.nextUrl.searchParams.get('tickers');

    if (!tickersParam) {
      return NextResponse.json({ error: 'No tickers provided' }, { status: 400 });
    }

    const tickers = tickersParam.split(',').filter(Boolean);

    if (tickers.length === 0) {
      return NextResponse.json({ error: 'No valid tickers provided' }, { status: 400 });
    }

    const series = await fetchIntradaySeries(tickers);

    return NextResponse.json(series);
  } catch (error) {
    console.error('Intraday fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch intraday data' },
      { status: 500 }
    );
  }
}
