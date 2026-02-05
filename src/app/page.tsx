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

function SummaryCard({
  title,
  value,
  subValue,
  trend,
}: {
  title: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const trendColor =
    trend === 'up'
      ? 'text-green-600'
      : trend === 'down'
      ? 'text-red-600'
      : 'text-muted-foreground';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subValue && <p className={`text-sm ${trendColor}`}>{subValue}</p>}
      </CardContent>
    </Card>
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
  const { holdings, summary, isLoading, error } = useHoldings();

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

  const unrealizedTrend =
    summary.totalUnrealizedGain > 0
      ? 'up'
      : summary.totalUnrealizedGain < 0
      ? 'down'
      : 'neutral';

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">投資組合總覽</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="總市值"
          value={formatCurrency(summary.totalMarketValue)}
        />
        <SummaryCard
          title="總投入成本"
          value={formatCurrency(summary.totalInvested)}
        />
        <SummaryCard
          title="未實現損益"
          value={formatCurrency(summary.totalUnrealizedGain)}
          subValue={formatPercent(summary.totalUnrealizedGainPercent)}
          trend={unrealizedTrend}
        />
        <SummaryCard
          title="已實現損益 + 股利"
          value={formatCurrency(summary.totalRealizedGain + summary.totalDividends)}
          subValue={`股利: ${formatCurrency(summary.totalDividends)}`}
        />
      </div>

      {/* Holdings Table */}
      <Card>
        <CardHeader>
          <CardTitle>目前持股 ({holdings.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {holdings.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              尚無持股資料。請先匯入交易記錄或新增交易。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>股票</TableHead>
                  <TableHead className="text-right">持有股數</TableHead>
                  <TableHead className="text-right">均價</TableHead>
                  <TableHead className="text-right">現價</TableHead>
                  <TableHead className="text-right">市值</TableHead>
                  <TableHead className="text-right">損益</TableHead>
                  <TableHead className="text-right">報酬率</TableHead>
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
                    <TableCell className="text-right">
                      {holding.shares.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {holding.avgCost.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {holding.currentPrice.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(holding.marketValue)}
                    </TableCell>
                    <TableCell
                      className={`text-right ${
                        holding.unrealizedGain >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(holding.unrealizedGain)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          holding.unrealizedGainPercent >= 0
                            ? 'default'
                            : 'destructive'
                        }
                      >
                        {formatPercent(holding.unrealizedGainPercent)}
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
