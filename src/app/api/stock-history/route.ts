import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoryBars, fetchInstitutionalHistory, isHistoryRange } from '@/lib/stock-history';
import type { StockHistoryResponse } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ticker = request.nextUrl.searchParams.get('ticker')?.trim();
    const range = request.nextUrl.searchParams.get('range');

    if (!ticker) {
      return NextResponse.json({ error: 'No ticker provided' }, { status: 400 });
    }
    if (!isHistoryRange(range)) {
      return NextResponse.json({ error: 'Invalid range' }, { status: 400 });
    }

    const [bars, flows] = await Promise.all([
      fetchHistoryBars(ticker, range),
      fetchInstitutionalHistory(ticker),
    ]);

    const body: StockHistoryResponse = {
      ticker,
      days: bars.map((bar) => {
        const flow = flows.get(bar.date);
        return {
          ...bar,
          foreign: flow?.foreign ?? null,
          trust: flow?.trust ?? null,
          dealer: flow?.dealer ?? null,
        };
      }),
    };

    return NextResponse.json(body);
  } catch (error) {
    console.error('Stock history fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch stock history' },
      { status: 500 }
    );
  }
}
