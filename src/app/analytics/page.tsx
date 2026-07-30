'use client';

import { useMemo } from 'react';
import { useHoldings } from '@/hooks/useHoldings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { DOWN_HEX, UP_HEX, gainTextClass } from '@/lib/colors';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

const COLORS = [
  '#0088FE',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#8884D8',
  '#82CA9D',
  '#FFC658',
  '#FF7C7C',
];

export default function AnalyticsPage() {
  const { holdings, realizedGains, summary, isLoading, error } = useHoldings();

  // Allocation data for pie chart
  const allocationData = useMemo(() => {
    return holdings.map((h) => ({
      name: `${h.ticker} ${h.name}`,
      value: h.marketValue,
      ticker: h.ticker,
    }));
  }, [holdings]);

  // Holdings by type (ETF vs stocks)
  const typeAllocation = useMemo(() => {
    const etfValue = holdings
      .filter((h) => h.ticker.startsWith('00'))
      .reduce((sum, h) => sum + h.marketValue, 0);
    const stockValue = holdings
      .filter((h) => !h.ticker.startsWith('00'))
      .reduce((sum, h) => sum + h.marketValue, 0);

    return [
      { name: 'ETF', value: etfValue },
      { name: '個股', value: stockValue },
    ].filter((d) => d.value > 0);
  }, [holdings]);

  // Performance data for bar chart
  const performanceData = useMemo(() => {
    return holdings
      .map((h) => ({
        name: h.ticker,
        gain: h.unrealizedGain,
        percent: h.unrealizedGainPercent,
      }))
      .sort((a, b) => b.gain - a.gain);
  }, [holdings]);

  // Realized gains by stock
  const realizedByStock = useMemo(() => {
    const byStock = new Map<string, number>();
    for (const g of realizedGains) {
      const current = byStock.get(g.ticker) || 0;
      byStock.set(g.ticker, current + g.gain);
    }
    return Array.from(byStock.entries())
      .map(([ticker, gain]) => ({ name: ticker, gain }))
      .sort((a, b) => b.gain - a.gain);
  }, [realizedGains]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">投資分析</h1>
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
      <h1 className="text-3xl font-bold">投資分析</h1>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              總市值
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.totalMarketValue)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              未實現損益
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                gainTextClass(summary.totalUnrealizedGain)
              }`}
            >
              {formatCurrency(summary.totalUnrealizedGain)}
            </div>
            <p className="text-sm text-muted-foreground">
              {formatPercent(summary.totalUnrealizedGainPercent)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              已實現損益
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                gainTextClass(summary.totalRealizedGain)
              }`}
            >
              {formatCurrency(summary.totalRealizedGain)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              累積股利
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(summary.totalDividends)}
            </div>
          </CardContent>
        </Card>
      </div>

      {holdings.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground text-center">
              尚無持股資料可供分析。
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stock Allocation Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>持股配置</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={allocationData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }: { name?: string; percent?: number }) =>
                          `${(name || '').split(' ')[0]} ${((percent || 0) * 100).toFixed(0)}%`
                        }
                      >
                        {allocationData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* ETF vs Stocks Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>資產類型配置</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={typeAllocation}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }: { name?: string; percent?: number }) =>
                          `${name || ''} ${((percent || 0) * 100).toFixed(0)}%`
                        }
                      >
                        <Cell fill="#0088FE" />
                        <Cell fill="#00C49F" />
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle>各持股損益</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                    <YAxis dataKey="name" type="category" width={60} />
                    <Tooltip
                      formatter={(value, name) => [
                        formatCurrency(Number(value)),
                        name === 'gain' ? '損益金額' : '報酬率',
                      ]}
                    />
                    <Bar
                      dataKey="gain"
                      fill="#8884d8"
                      name="損益金額"
                    >
                      {performanceData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.gain >= 0 ? UP_HEX : DOWN_HEX}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Realized Gains */}
          {realizedByStock.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>已實現損益 (按股票)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={realizedByStock}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                      <Bar dataKey="gain" name="已實現損益">
                        {realizedByStock.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.gain >= 0 ? UP_HEX : DOWN_HEX}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
