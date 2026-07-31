import { NextRequest, NextResponse } from 'next/server';
import { getTransactions } from '@/lib/supabase';
import { fetchPortfolioHistory, type HistoryRange } from '@/lib/portfolio-history';

export const dynamic = 'force-dynamic';

const VALID_RANGES: HistoryRange[] = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'];

export async function GET(request: NextRequest) {
  try {
    const rangeParam = request.nextUrl.searchParams.get('range');
    const range: HistoryRange = VALID_RANGES.includes(rangeParam as HistoryRange)
      ? (rangeParam as HistoryRange)
      : '1D';

    const transactions = await getTransactions();
    const series = await fetchPortfolioHistory(range, transactions);

    return NextResponse.json(series);
  } catch (error) {
    console.error('Portfolio history fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch portfolio history' },
      { status: 500 }
    );
  }
}
