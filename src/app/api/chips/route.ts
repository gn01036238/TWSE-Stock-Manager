import { NextRequest, NextResponse } from 'next/server';
import { fetchStockPrices } from '@/lib/twse';
import { fetchInstitutionalFlows, fetchMarketFlow } from '@/lib/institutional';
import {
  computePricePattern,
  computeVolumeRatio,
  fetchMarketVolumeStats,
  fetchTaiexSnapshot,
  fetchVolumeStats,
} from '@/lib/volume';
import { getSessionProgress } from '@/lib/market';
import type { ChipRow, ChipsResponse } from '@/types';

/** 加權指數在表格裡借用的代號，對齊各家看盤軟體的習慣 */
const TAIEX_TICKER = '0000';

export async function GET(request: NextRequest) {
  try {
    const tickersParam = request.nextUrl.searchParams.get('tickers');
    const tickers = (tickersParam ?? '').split(',').filter(Boolean);

    if (tickers.length === 0) {
      return NextResponse.json({ error: 'No tickers provided' }, { status: 400 });
    }

    const progress = getSessionProgress();

    const [prices, volumeStats, daily] = await Promise.all([
      fetchStockPrices(tickers),
      fetchVolumeStats(tickers),
      fetchInstitutionalFlows(),
    ]);

    const rows: ChipRow[] = tickers.map((ticker) => {
      const price = prices.get(ticker);
      const stats = volumeStats.get(ticker);
      const volume = price?.volume ?? null;

      return {
        ticker,
        name: price?.name ?? ticker,
        price: price?.price ?? null,
        changePercent: price?.changePercent ?? null,
        volume,
        volumeRatio: computeVolumeRatio(volume, stats?.history ?? [], progress),
        pattern: computePricePattern(
          price?.change ?? null,
          volume,
          stats?.prev ?? null,
          progress
        ),
        flow: daily?.flows.get(ticker) ?? null,
        flowUnit: 'lot',
      };
    });

    const [marketFlow, marketStats, taiex] = await Promise.all([
      daily ? fetchMarketFlow(daily.date) : Promise.resolve(null),
      fetchMarketVolumeStats(),
      fetchTaiexSnapshot(),
    ]);

    const taiexChange = taiex ? taiex.price - taiex.previousClose : null;

    const market: ChipRow | null = taiex
      ? {
          ticker: TAIEX_TICKER,
          name: '加權指數',
          price: taiex.price,
          changePercent: taiex.previousClose
            ? ((taiex.price - taiex.previousClose) / taiex.previousClose) * 100
            : null,
          volume: taiex.volume,
          volumeRatio: computeVolumeRatio(taiex.volume, marketStats.history, progress),
          pattern: computePricePattern(
            taiexChange,
            taiex.volume,
            marketStats.prev,
            progress
          ),
          flow: marketFlow,
          flowUnit: 'yi',
        }
      : null;

    const body: ChipsResponse = {
      flowDate: daily?.date ?? null,
      rows,
      market,
    };

    return NextResponse.json(body);
  } catch (error) {
    console.error('Chips fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch chips' },
      { status: 500 }
    );
  }
}
