'use client';

import { useMemo } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import { useChips } from '@/hooks/useChips';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LivePriceStatus } from '@/components/live-price-status';
import { gainTextClass } from '@/lib/colors';
import type { ChipRow, PriceVolumePattern, Transaction } from '@/types';

const PATTERN_LABEL: Record<PriceVolumePattern, string> = {
  'up-expand': '價漲量增',
  'up-shrink': '價漲量縮',
  'down-expand': '價跌量增',
  'down-shrink': '價跌量縮',
  unknown: '--',
};

/** 依交易記錄算出目前還有持股的代號 */
function splitTickers(transactions: Transaction[]): { held: string[]; closed: string[] } {
  const shares = new Map<string, number>();

  for (const tx of transactions) {
    const signed = tx.transaction_type === 'BUY' ? tx.quantity : -tx.quantity;
    shares.set(tx.ticker, (shares.get(tx.ticker) ?? 0) + signed);
  }

  const held: string[] = [];
  const closed: string[] = [];

  for (const [ticker, quantity] of [...shares.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    (quantity > 0 ? held : closed).push(ticker);
  }

  return { held, closed };
}

function formatLots(value: number | null): string {
  if (value == null) return '--';
  return Math.round(value).toLocaleString('zh-TW');
}

/** 個股買賣超單位為張，大盤為億元 */
function formatFlow(value: number | undefined, unit: ChipRow['flowUnit']): string {
  if (value == null) return '--';
  if (unit === 'yi') {
    return `${value >= 0 ? '' : '-'}${Math.abs(value).toFixed(1)} 億`;
  }
  return Math.round(value).toLocaleString('zh-TW');
}

function FlowCell({ value, unit }: { value: number | undefined; unit: ChipRow['flowUnit'] }) {
  const text = formatFlow(value, unit);
  const className =
    value == null || Math.round(value) === 0
      ? 'text-muted-foreground'
      : gainTextClass(value);

  return (
    <TableCell className={`text-right tabular-nums ${className}`}>{text}</TableCell>
  );
}

function ChipCells({ row, dimmed = false }: { row: ChipRow; dimmed?: boolean }) {
  return (
    <>
      <TableCell>
        <div className={`font-medium ${dimmed ? 'text-muted-foreground' : ''}`}>
          {row.name}
        </div>
        <div className="text-xs text-muted-foreground">{row.ticker}</div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatLots(row.volume)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {row.volumeRatio != null ? row.volumeRatio.toFixed(2) : '--'}
      </TableCell>
      <TableCell className="text-right">{PATTERN_LABEL[row.pattern]}</TableCell>
      <FlowCell value={row.flow?.foreign} unit={row.flowUnit} />
      <FlowCell value={row.flow?.trust} unit={row.flowUnit} />
      <FlowCell value={row.flow?.dealer} unit={row.flowUnit} />
      <FlowCell value={row.flow?.total} unit={row.flowUnit} />
    </>
  );
}

export default function ChipsPage() {
  const { data: txData, isLoading: txLoading, error: txError } = useTransactions();

  const { held, closed } = useMemo(
    () => splitTickers(txData?.transactions ?? []),
    [txData?.transactions]
  );

  const tickers = [...held, ...closed];

  const {
    data,
    isLoading: chipsLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
    error: chipsError,
  } = useChips(tickers);

  const heldSet = new Set(held);

  // 依 tickers 的順序（持股優先）排好，避免 API 回傳順序影響畫面
  const byTicker = new Map((data?.rows ?? []).map((row) => [row.ticker, row]));
  const rows = tickers
    .map((ticker) => byTicker.get(ticker))
    .filter((row): row is ChipRow => row != null);

  if (txError || chipsError) {
    return (
      <Card className="p-6">
        <p className="text-destructive">載入資料時發生錯誤。</p>
      </Card>
    );
  }

  if (txLoading || (chipsLoading && rows.length === 0)) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">籌碼與量能</h1>
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">載入中...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tickers.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">籌碼與量能</h1>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              尚無交易記錄。請先匯入交易記錄或新增交易。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const flowLabel = data?.flowDate ? data.flowDate.slice(5).replace('-', '/') : '--';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">籌碼與量能</h1>
          <p className="text-sm text-muted-foreground">
            法人買賣超為 {flowLabel} 收盤資料（單位：張）；成交量與量比為當日即時
          </p>
        </div>
        <LivePriceStatus
          updatedAt={dataUpdatedAt}
          isFetching={isFetching}
          onRefresh={refetch}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="align-bottom">
                  <div>股票</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    共 {rows.length} 檔股票
                  </div>
                </TableHead>
                <TableHead className="text-right align-bottom">成交量</TableHead>
                <TableHead className="text-right align-bottom">量比</TableHead>
                <TableHead className="text-right align-bottom">價量型態</TableHead>
                <TableHead className="text-right align-bottom">外資買賣超 (1日)</TableHead>
                <TableHead className="text-right align-bottom">投信買賣超 (1日)</TableHead>
                <TableHead className="text-right align-bottom">自營商買賣超 (1日)</TableHead>
                <TableHead className="text-right align-bottom">三大法人 (1日)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.ticker}>
                  <ChipCells row={row} dimmed={!heldSet.has(row.ticker)} />
                </TableRow>
              ))}
            </TableBody>
            {data?.market && (
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <ChipCells row={data.market} />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        量比 = 當日成交速度 ÷ 前 5 個交易日均量（盤中會依已開盤時間換算成全日速度）。
        價量型態的量增／量縮是與前一交易日成交量比較。
        加權指數列的成交量單位為張，法人買賣超為全市場金額（億元）。
        名稱較暗的個股代表目前已無持股。
      </p>
    </div>
  );
}
