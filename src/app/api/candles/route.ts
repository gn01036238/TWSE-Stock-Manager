import { NextRequest, NextResponse } from 'next/server';
import { fetchDailyBarsFor } from '@/lib/daily-bars';
import type { CandleSeries } from '@/types';

export const dynamic = 'force-dynamic';

/** 表格裡的迷你 K 棒圖畫得下的根數 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 60;

export async function GET(request: NextRequest) {
  try {
    const tickersParam = request.nextUrl.searchParams.get('tickers');
    const tickers = (tickersParam ?? '').split(',').filter(Boolean);

    if (tickers.length === 0) {
      return NextResponse.json({ error: 'No tickers provided' }, { status: 400 });
    }

    const requested = Number(request.nextUrl.searchParams.get('limit'));
    const limit =
      Number.isFinite(requested) && requested > 0
        ? Math.min(Math.floor(requested), MAX_LIMIT)
        : DEFAULT_LIMIT;

    const barsByTicker = await fetchDailyBarsFor(tickers, limit);

    const series: Record<string, CandleSeries> = {};
    for (const [ticker, bars] of barsByTicker) {
      if (bars.length > 0) series[ticker] = { ticker, bars };
    }

    return NextResponse.json(series);
  } catch (error) {
    console.error('Candles fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch candles' },
      { status: 500 }
    );
  }
}
