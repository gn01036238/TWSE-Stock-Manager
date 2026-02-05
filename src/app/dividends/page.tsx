'use client';

import { useMemo } from 'react';
import { useHoldings } from '@/hooks/useHoldings';
import { useDividends } from '@/hooks/useDividends';
import { useTransactions } from '@/hooks/useTransactions';
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
import { formatCurrency } from '@/lib/calculations';
import { format } from 'date-fns';
import { zhTW } from 'date-fns/locale';

interface DividendItem {
  ticker: string;
  stockName: string;
  exDate: Date;
  paymentDate: Date;
  amount: number;
  sharesHeld: number;
  income: number;
}

export default function DividendsPage() {
  const { data: txData, isLoading: txLoading } = useTransactions();
  const tickers = useMemo(() => {
    if (!txData?.transactions) return [];
    const set = new Set(txData.transactions.map((t) => t.ticker));
    return Array.from(set);
  }, [txData?.transactions]);

  const { data: dividendsData, isLoading: divLoading } = useDividends(tickers);

  const isLoading = txLoading || divLoading;

  // Flatten and sort all dividend records
  const allDividends = useMemo(() => {
    if (!dividendsData) return [];

    const dividends: DividendItem[] = [];

    for (const [ticker, data] of Object.entries(dividendsData)) {
      const tickerData = data as {
        stockName: string;
        dividends: Array<{
          exDate: string;
          paymentDate: string;
          amount: number;
          sharesHeld: number;
          income: number;
        }>;
      };

      for (const d of tickerData.dividends) {
        if (d.income > 0) {
          dividends.push({
            ticker,
            stockName: tickerData.stockName,
            exDate: new Date(d.exDate),
            paymentDate: new Date(d.paymentDate),
            amount: d.amount,
            sharesHeld: d.sharesHeld,
            income: d.income,
          });
        }
      }
    }

    // Sort by payment date descending
    return dividends.sort(
      (a, b) => b.paymentDate.getTime() - a.paymentDate.getTime()
    );
  }, [dividendsData]);

  // Group by year
  const dividendsByYear = useMemo(() => {
    const byYear = new Map<number, DividendItem[]>();

    for (const d of allDividends) {
      const year = d.paymentDate.getFullYear();
      if (!byYear.has(year)) {
        byYear.set(year, []);
      }
      byYear.get(year)!.push(d);
    }

    return byYear;
  }, [allDividends]);

  // Calculate totals
  const totalIncome = allDividends.reduce((sum, d) => sum + d.income, 0);
  const currentYear = new Date().getFullYear();
  const currentYearIncome = allDividends
    .filter((d) => d.paymentDate.getFullYear() === currentYear)
    .reduce((sum, d) => sum + d.income, 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">股利收入</h1>
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              載入股利資料中... (從 Yahoo Finance 取得股利歷史)
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">股利收入</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              累積股利收入
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalIncome)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {currentYear} 年股利
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(currentYearIncome)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              領取次數
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allDividends.length} 次</div>
          </CardContent>
        </Card>
      </div>

      {/* Info Banner */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="py-4">
          <p className="text-sm text-blue-800">
            股利資料會自動從 Yahoo Finance 取得，並根據您的持股記錄自動計算應領金額。
            股利是根據除權息日前的持有股數計算。
          </p>
        </CardContent>
      </Card>

      {/* Dividend Records */}
      {allDividends.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground text-center">
              尚無股利記錄。當您持有股票並經過除權息日後，股利會自動顯示在這裡。
            </p>
          </CardContent>
        </Card>
      ) : (
        Array.from(dividendsByYear.entries())
          .sort(([a], [b]) => b - a)
          .map(([year, dividends]) => {
            const yearTotal = dividends.reduce((sum, d) => sum + d.income, 0);

            return (
              <Card key={year}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{year} 年</CardTitle>
                    <Badge variant="secondary" className="text-lg px-3 py-1">
                      {formatCurrency(yearTotal)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>股票</TableHead>
                        <TableHead>除息日</TableHead>
                        <TableHead>發放日</TableHead>
                        <TableHead className="text-right">每股配息</TableHead>
                        <TableHead className="text-right">持有股數</TableHead>
                        <TableHead className="text-right">股利收入</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dividends.map((d, idx) => (
                        <TableRow key={`${d.ticker}-${idx}`}>
                          <TableCell>
                            <div>
                              <span className="font-medium">{d.ticker}</span>
                              <span className="text-muted-foreground ml-2 text-sm">
                                {d.stockName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {format(d.exDate, 'yyyy/MM/dd', { locale: zhTW })}
                          </TableCell>
                          <TableCell>
                            {format(d.paymentDate, 'yyyy/MM/dd', { locale: zhTW })}
                          </TableCell>
                          <TableCell className="text-right">
                            {d.amount.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {d.sharesHeld.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            {formatCurrency(d.income)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })
      )}
    </div>
  );
}
