'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useHoldings } from '@/hooks/useHoldings';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { gainBadgeClass, gainTextClass } from '@/lib/colors';
import { LivePrice } from '@/components/live-price';
import { LivePriceStatus } from '@/components/live-price-status';
import { Sparkline } from '@/components/sparkline';
import { DayChange } from '@/components/day-change';
import type { Holding } from '@/types';

interface DividendRecord {
  exDate: string;
  paymentDate: string;
  amount: number;
  yieldPercent?: number;
  sharesHeld: number;
  income: number;
}

const COLUMN_COUNT = 11;

function formatDate(value: string): string {
  return value.slice(0, 10);
}

/** 展開後的配息紀錄：我參與過的每一次除權息 */
function DividendHistory({ records }: { records: DividendRecord[] }) {
  if (records.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        尚無參與過的除權息紀錄。
      </p>
    );
  }

  const totalIncome = records.reduce((sum, r) => sum + r.income, 0);

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="mb-2 text-sm font-medium">
        配息紀錄（{records.length} 次，累計 {formatCurrency(totalIncome)}）
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>除息日</TableHead>
            <TableHead className="text-right">每股配息</TableHead>
            <TableHead className="text-right">殖利率</TableHead>
            <TableHead className="text-right">除息時持股</TableHead>
            <TableHead className="text-right">領取金額</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...records]
            .sort((a, b) => b.exDate.localeCompare(a.exDate))
            .map((record) => (
              <TableRow key={`${record.exDate}-${record.amount}`}>
                <TableCell>{formatDate(record.exDate)}</TableCell>
                <TableCell className="text-right">
                  {record.amount.toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  {record.yieldPercent != null
                    ? formatPercent(record.yieldPercent)
                    : '-'}
                </TableCell>
                <TableCell className="text-right">
                  {record.sharesHeld.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(record.income)}
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function HoldingsPage() {
  const {
    holdings,
    isLoading,
    error,
    prices,
    intraday,
    dividends,
    pricesUpdatedAt,
    isPricesFetching,
    refreshPrices,
  } = useHoldings();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (ticker: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) {
        next.delete(ticker);
      } else {
        next.add(ticker);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">持股明細</h1>
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">載入中...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <p className="text-destructive">載入資料時發生錯誤。</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-bold">持股明細 ({holdings.length})</h1>
        <LivePriceStatus
          updatedAt={pricesUpdatedAt}
          isFetching={isPricesFetching}
          onRefresh={refreshPrices}
        />
      </div>

      {holdings.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground text-center">
              尚無持股資料。請先匯入交易記錄或新增交易。
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>股票</TableHead>
                  <TableHead className="w-[110px]">今日走勢</TableHead>
                  <TableHead className="text-right">漲跌幅</TableHead>
                  <TableHead className="text-right">持股</TableHead>
                  <TableHead className="text-right">均價</TableHead>
                  <TableHead className="text-right">現價</TableHead>
                  <TableHead className="text-right">市值</TableHead>
                  <TableHead className="text-right">未實現損益</TableHead>
                  <TableHead className="text-right">累積股利</TableHead>
                  <TableHead className="text-right">報酬率(含息)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((holding: Holding) => {
                  const isOpen = expanded.has(holding.ticker);
                  const records =
                    (dividends[holding.ticker]?.dividends as DividendRecord[]) ?? [];

                  return (
                    <Fragment key={holding.ticker}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => toggle(holding.ticker)}
                      >
                        <TableCell className="pr-0">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{holding.ticker}</span>
                          <span className="ml-2 text-sm text-muted-foreground">
                            {holding.name}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Sparkline
                            points={intraday[holding.ticker]?.points ?? []}
                            baseline={intraday[holding.ticker]?.previousClose}
                            width={96}
                            height={32}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <DayChange price={prices?.[holding.ticker]} showAmount={false} />
                        </TableCell>
                        <TableCell className="text-right">
                          {holding.shares.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {holding.avgCost.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <LivePrice value={holding.currentPrice} />
                        </TableCell>
                        <TableCell className="text-right">
                          <LivePrice value={holding.marketValue} format={formatCurrency} />
                        </TableCell>
                        <TableCell
                          className={`text-right ${gainTextClass(holding.unrealizedGain)}`}
                        >
                          <LivePrice
                            value={holding.unrealizedGain}
                            format={formatCurrency}
                          />
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {holding.totalDividends > 0
                            ? formatCurrency(holding.totalDividends)
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="outline"
                            className={gainBadgeClass(holding.adjustedGainPercent)}
                            title={`不含息 ${formatPercent(holding.unrealizedGainPercent)}`}
                          >
                            {formatPercent(holding.adjustedGainPercent)}
                          </Badge>
                        </TableCell>
                      </TableRow>

                      {isOpen && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={COLUMN_COUNT} className="p-3">
                            <DividendHistory records={records} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
