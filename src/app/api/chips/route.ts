import { NextRequest, NextResponse } from 'next/server';
import { fetchStockPrices } from '@/lib/twse';
import { fetchInstitutionalFlows, fetchMarketFlow } from '@/lib/institutional';
import { fetchMajorTraderFlows } from '@/lib/major';
import {
  computePricePattern,
  computeVolumeRatio,
  fetchMarketVolumeStats,
  fetchTaiexSnapshot,
  fetchVolumeStats,
} from '@/lib/volume';
import { getSessionProgress, taipeiDateKey } from '@/lib/market';
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

    // 先問加權指數報價，它帶的日期就是「最新交易日」（能避開國定假日誤判），
    // 後面才知道法人／主力資料是當日的還是還停在前一個交易日
    const taiex = await fetchTaiexSnapshot();
    const tradingDate = taiex?.date ?? taipeiDateKey();

    const [prices, volumeStats, daily, major] = await Promise.all([
      fetchStockPrices(tickers),
      fetchVolumeStats(tickers),
      fetchInstitutionalFlows(tradingDate),
      fetchMajorTraderFlows(tickers, tradingDate),
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
        major: major.flows.get(ticker) ?? null,
      };
    });

    const [marketFlow, marketStats] = await Promise.all([
      daily ? fetchMarketFlow(daily.date) : Promise.resolve(null),
      fetchMarketVolumeStats(),
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
          major: null,
        }
      : null;

    const body: ChipsResponse = {
      tradingDate,
      flowDate: daily?.date ?? null,
      majorDate: major.date,
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
