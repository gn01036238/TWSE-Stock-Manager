'use client';

import { useMemo } from 'react';
import { useDividends, type SerializedDividend } from '@/hooks/useDividends';
import { useTransactions } from '@/hooks/useTransactions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/data-table';
import { dividendColumns, dividendRowKey } from '@/components/dividend-history';
import { formatCurrency } from '@/lib/calculations';
import { NHI_MIN_PAYMENT, NHI_RATE } from '@/lib/nhi';

function SummaryCard({
  title,
  value,
  valueClassName,
  hint,
}: {
  title: string;
  value: string;
  valueClassName?: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueClassName ?? ''}`} title={hint}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DividendsPage() {
  const { data: txData, isLoading: txLoading } = useTransactions();
  const transactions = txData?.transactions;
  const tickers = useMemo(
    () => Array.from(new Set((transactions ?? []).map((t) => t.ticker))),
    [transactions]
  );

  const { data: dividendsData, isLoading: divLoading } = useDividends(tickers);

  const isLoading = txLoading || divLoading;

  const columns = useMemo(() => dividendColumns({ showStock: true }), []);

  // Flatten and sort all dividend records
  const allDividends = useMemo(() => {
    if (!dividendsData) return [];

    const dividends: SerializedDividend[] = [];

    for (const data of Object.values(dividendsData)) {
      // 純配股（沒有現金股利）的那幾次也要列出來，配股欄才看得到
      for (const d of data.dividends) {
        if (d.income > 0 || d.sharesGained > 0) dividends.push(d);
      }
    }

    // Sort by payment date descending
    return dividends.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [dividendsData]);

  // Group by year
  const dividendsByYear = useMemo(() => {
    const byYear = new Map<number, SerializedDividend[]>();

    for (const d of allDividends) {
      const year = Number(d.paymentDate.slice(0, 4));
      if (!byYear.has(year)) {
        byYear.set(year, []);
      }
      byYear.get(year)!.push(d);
    }

    return byYear;
  }, [allDividends]);

  // Calculate totals
  const totalIncome = allDividends.reduce((sum, d) => sum + d.income, 0);
  const totalNhi = allDividends.reduce((sum, d) => sum + d.nhiPremium, 0);
  const totalShares = allDividends.reduce((sum, d) => sum + d.sharesGained, 0);
  const currentYear = new Date().getFullYear();
  const currentYearIncome = allDividends
    .filter((d) => Number(d.paymentDate.slice(0, 4)) === currentYear)
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          title="累積股利收入"
          value={formatCurrency(totalIncome)}
          valueClassName="text-red-500"
          hint="未扣二代健保費的現金股利合計"
        />
        <SummaryCard
          title="二代健保費"
          value={totalNhi > 0 ? `−${formatCurrency(totalNhi)}` : formatCurrency(0)}
          valueClassName="text-muted-foreground"
          hint={`單次給付達 ${formatCurrency(NHI_MIN_PAYMENT)} 就源扣繳 ${(
            NHI_RATE * 100
          ).toFixed(2)}%`}
        />
        <SummaryCard
          title="累積實發股利"
          value={formatCurrency(totalIncome - totalNhi)}
          hint="扣掉二代健保費後實際入帳的金額"
        />
        <SummaryCard title={`${currentYear} 年股利`} value={formatCurrency(currentYearIncome)} />
        <SummaryCard
          title="領取次數"
          value={`${allDividends.length} 次`}
          hint={totalShares > 0 ? `累計配股 ${totalShares.toLocaleString()} 股` : undefined}
        />
      </div>

      {/* Info Banner */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="py-4">
          <p className="text-sm text-blue-800">
            股利資料會自動從 Yahoo Finance 取得，並根據您的持股記錄自動計算應領金額。
            股利是根據除權息日前的持有股數計算；股票股利（配股）另外由設定檔維護，
            並會自動補一筆「配股」到交易記錄裡。表頭可拖曳調整順序、拖右緣調欄寬。
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
            const yearNet = dividends.reduce((sum, d) => sum + d.netIncome, 0);

            return (
              <Card key={year}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{year} 年</CardTitle>
                    <Badge
                      variant="secondary"
                      className="text-lg px-3 py-1"
                      title={`實發 ${formatCurrency(yearNet)}（已扣二代健保費）`}
                    >
                      {formatCurrency(yearTotal)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <DataTable
                    tableId="dividend-records"
                    columns={columns}
                    rows={dividends}
                    rowKey={dividendRowKey}
                  />
                </CardContent>
              </Card>
            );
          })
      )}

      <p className="text-xs text-muted-foreground">
        發放日是以除息日 +28 天推估（Yahoo 沒有這個欄位），實際入帳日以券商對帳單為準。
        二代健保補充保費為單次給付達 {formatCurrency(NHI_MIN_PAYMENT)} 時就源扣繳{' '}
        {(NHI_RATE * 100).toFixed(2)}%，股票股利以面額 10 元併入給付金額計算。
        填權天數是從除權息日起算、還原價回到除權前股價所花的交易日數。
      </p>
    </div>
  );
}
