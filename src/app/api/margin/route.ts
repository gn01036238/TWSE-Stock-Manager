import { NextResponse } from 'next/server';
import { fetchMarginBalance } from '@/lib/margin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const balance = await fetchMarginBalance();
    if (!balance) {
      return NextResponse.json({ error: 'Margin balance unavailable' }, { status: 502 });
    }

    return NextResponse.json(balance);
  } catch (error) {
    console.error('Margin balance fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch margin balance' },
      { status: 500 }
    );
  }
}
