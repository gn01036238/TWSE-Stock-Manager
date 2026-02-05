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

export default function HoldingsPage() {
  const { holdings, isLoading, error } = useHoldings();

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
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">持股明細</h1>

      {holdings.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground text-center">
              尚無持股資料。請先匯入交易記錄或新增交易。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {holdings.map((holding) => (
            <Card key={holding.ticker}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <span>{holding.ticker}</span>
                    <span className="text-muted-foreground font-normal">
                      {holding.name}
                    </span>
                  </CardTitle>
                  <Badge
                    variant={
                      holding.unrealizedGainPercent >= 0 ? 'default' : 'destructive'
                    }
                    className="text-lg px-3 py-1"
                  >
                    {formatPercent(holding.unrealizedGainPercent)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">持有股數</p>
                    <p className="text-lg font-semibold">
                      {holding.shares.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">平均成本</p>
                    <p className="text-lg font-semibold">
                      {holding.avgCost.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">現價</p>
                    <p className="text-lg font-semibold">
                      {holding.currentPrice.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">市值</p>
                    <p className="text-lg font-semibold">
                      {formatCurrency(holding.marketValue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">未實現損益</p>
                    <p
                      className={`text-lg font-semibold ${
                        holding.unrealizedGain >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(holding.unrealizedGain)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">累積股利</p>
                    <p className="text-lg font-semibold text-blue-600">
                      {formatCurrency(holding.totalDividends)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
