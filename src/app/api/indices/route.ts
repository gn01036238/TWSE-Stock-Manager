import { NextRequest, NextResponse } from 'next/server';
import { fetchIndexQuotes } from '@/lib/indices';

export const dynamic = 'force-dynamic';

const MAX_SYMBOLS = 12;

export async function GET(request: NextRequest) {
  try {
    const symbolsParam = request.nextUrl.searchParams.get('symbols');

    if (!symbolsParam) {
      return NextResponse.json({ error: 'No symbols provided' }, { status: 400 });
    }

    const symbols = symbolsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_SYMBOLS);

    if (symbols.length === 0) {
      return NextResponse.json({ error: 'No valid symbols provided' }, { status: 400 });
    }

    return NextResponse.json(await fetchIndexQuotes(symbols));
  } catch (error) {
    console.error('Index fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch indices' },
      { status: 500 }
    );
  }
}
