import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoryBars, fetchMajorHistory, isHistoryRange } from '@/lib/stock-history';
import type { MajorHistoryResponse } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * 主力要逐日查，一年份第一次會比較久，所以跟日 K／法人分成兩個請求，圖表先畫出來再補主力。
 */
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

    // 只查真的有開盤的日子（日 K 有那一根），休市日不用白問
    const bars = await fetchHistoryBars(ticker, range);
    const flows = await fetchMajorHistory(
      ticker,
      bars.map((bar) => bar.date)
    );

    const body: MajorHistoryResponse = { ticker, flows };
    return NextResponse.json(body);
  } catch (error) {
    console.error('Major history fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch major history' },
      { status: 500 }
    );
  }
}
