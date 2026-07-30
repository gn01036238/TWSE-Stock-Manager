'use client';

import { useHoldings } from '@/hooks/useHoldings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { LivePrice } from '@/components/live-price';
import { LivePriceStatus } from '@/components/live-price-status';
import { Sparkline } from '@/components/sparkline';
import { DayChange } from '@/components/day-change';
import { DOWN_TEXT, UP_TEXT, gainBadgeClass, gainTextClass } from '@/lib/colors';
import { MarketIndices } from '@/components/market-indices';

function SummaryStat({
  title,
  value,
  subValue,
  trend,
}: {
  title: string;
  value: React.ReactNode;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const trendColor =
    trend === 'up'
      ? UP_TEXT
      : trend === 'down'
      ? DOWN_TEXT
      : 'text-muted-foreground';

  return (
    <div className="leading-tight">
      <p className="text-[11px] text-muted-foreground">{title}</p>
      <div className="text-lg font-bold">{value}</div>
      {subValue && <p className={`text-[11px] ${trendColor}`}>{subValue}</p>}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-32 bg-muted animate-pulse rounded" />
              <div className="h-4 w-20 mt-2 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <div className="h-6 w-32 bg-muted animate-pulse rounded" />
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const {
    holdings,
    summary,
    isLoading,
    error,
    prices,
    intraday,
    pricesUpdatedAt,
    isPricesFetching,
    refreshPrices,
  } = useHoldings();

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <Card className="p-6">
        <p className="text-destructive">
          載入資料時發生錯誤。請確認 Supabase 連線設定是否正確。
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          請先執行 supabase-schema.sql 建立資料表。
        </p>
      </Card>
    );
  }

  // 含息報酬率：未實現損益 + 持有期間已領股利
  const totalAdjustedGainPercent =
    summary.totalInvested > 0
      ? ((summary.totalUnrealizedGain + summary.totalDividends) /
          summary.totalInvested) *
        100
      : 0;

  const unrealizedTrend =
    summary.totalUnrealizedGain > 0
      ? 'up'
      : summary.totalUnrealizedGain < 0
      ? 'down'
      : 'neutral';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">投資組合總覽</h1>
        <LivePriceStatus
          updatedAt={pricesUpdatedAt}
          isFetching={isPricesFetching}
          onRefresh={refreshPrices}
        />
      </div>

      {/* Summary + 指數：合併成單一精簡卡片，讓持股表格留在首屏 */}
      <Card className="gap-0 py-0">
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-2.5 lg:grid-cols-4">
          <SummaryStat
            title="總市值"
            value={
              <LivePrice
                value={summary.totalMarketValue}
                format={formatCurrency}
                className="-ml-1"
              />
            }
          />
          <SummaryStat
            title="總投入成本"
            value={formatCurrency(summary.totalInvested)}
          />
          <SummaryStat
            title="未實現損益"
            value={
              <LivePrice
                value={summary.totalUnrealizedGain}
                format={formatCurrency}
                className="-ml-1"
              />
            }
            subValue={`${formatPercent(
              summary.totalUnrealizedGainPercent
            )}　含息 ${formatPercent(totalAdjustedGainPercent)}`}
            trend={unrealizedTrend}
          />
          <SummaryStat
            title="已實現損益 + 股利"
            value={formatCurrency(summary.totalRealizedGain + summary.totalDividends)}
            subValue={`股利 ${formatCurrency(summary.totalDividends)}`}
          />
        </CardContent>
        <MarketIndices className="border-t px-4 py-2" />
      </Card>

      {/* Holdings Table */}
      <Card className="gap-2 py-3">
        <CardHeader className="px-4">
          <CardTitle className="text-base">目前持股 ({holdings.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          {holdings.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              尚無持股資料。請先匯入交易記錄或新增交易。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>股票</TableHead>
                  <TableHead className="w-[120px]">今日走勢</TableHead>
                  <TableHead className="text-right">持有股數</TableHead>
                  <TableHead className="text-right">均價</TableHead>
                  <TableHead className="text-right">現價</TableHead>
                  <TableHead className="text-right">漲跌幅</TableHead>
                  <TableHead className="text-right">市值</TableHead>
                  <TableHead className="text-right">損益</TableHead>
                  <TableHead className="text-right">股利</TableHead>
                  <TableHead className="text-right">報酬率(含息)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((holding) => (
                  <TableRow key={holding.ticker}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{holding.ticker}</span>
                        <span className="text-muted-foreground ml-2 text-sm">
                          {holding.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Sparkline
                        points={intraday[holding.ticker]?.points ?? []}
                        baseline={intraday[holding.ticker]?.previousClose}
                        height={30}
                      />
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
                      <DayChange price={prices?.[holding.ticker]} />
                    </TableCell>
                    <TableCell className="text-right">
                      <LivePrice
                        value={holding.marketValue}
                        format={formatCurrency}
                      />
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
