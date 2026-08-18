'use client';

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePortfolioHistory } from '@/hooks/usePortfolioHistory';
import type { HistoryRange } from '@/lib/portfolio-history';
import { formatCurrency } from '@/lib/calculations';
import { DOWN_HEX, UP_HEX } from '@/lib/colors';

const RANGES: HistoryRange[] = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'];

/** 總市值走勢固定用這個顏色，跟紅漲綠跌的損益線區隔開 */
const MARKET_VALUE_COLOR = '#3b82f6';

function compactCurrency(value: number): string {
  return new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  );
}

function formatTimeLabel(offsetMinutes: number): string {
  const total = 9 * 60 + offsetMinutes;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDateLabel(dateKey: string, range: HistoryRange): string {
  const [y, m, d] = dateKey.split('-');
  return range === '5Y' || range === 'MAX' ? `${y}/${m}` : `${m}/${d}`;
}

interface ChartPoint {
  label: string;
  marketValue: number;
  totalPnl: number;
}

interface TooltipPayloadEntry {
  dataKey?: string;
  value?: number;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const marketValue = payload.find((p) => p.dataKey === 'marketValue')?.value ?? 0;
  const totalPnl = payload.find((p) => p.dataKey === 'totalPnl')?.value ?? 0;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      <p className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">總市值</span>
        <span className="font-medium" style={{ color: MARKET_VALUE_COLOR }}>
          {formatCurrency(marketValue)}
        </span>
      </p>
      <p className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">總損益</span>
        <span className="font-medium" style={{ color: totalPnl >= 0 ? UP_HEX : DOWN_HEX }}>
          {formatCurrency(totalPnl)}
        </span>
      </p>
    </div>
  );
}

interface ReferenceLineViewBox {
  x?: number;
  y?: number;
  width?: number;
}

/**
 * 基準線的文字標籤，帶底色的小標籤而不是直接把字疊在虛線上——不然線會從字中間穿過去，很難讀。
 * 太靠近圖表頂端時自動改往線的下方畫，避免被裁掉。
 */
function BaselineLabel({
  viewBox,
  text,
  color,
  align,
}: {
  viewBox?: ReferenceLineViewBox;
  text: string;
  color: string;
  align: 'left' | 'right';
}) {
  if (!viewBox) return null;
  const { x = 0, y = 0, width = 0 } = viewBox;

  const boxWidth = text.length * 6 + 10;
  const boxHeight = 14;
  const boxX = align === 'left' ? x + 2 : x + width - boxWidth - 2;
  const boxY = y - boxHeight - 4 >= 0 ? y - boxHeight - 4 : y + 4;

  return (
    <g>
      <rect
        x={boxX}
        y={boxY}
        width={boxWidth}
        height={boxHeight}
        rx={3}
        fill="var(--card)"
        stroke={color}
        strokeOpacity={0.4}
      />
      <text
        x={boxX + boxWidth / 2}
        y={boxY + boxHeight / 2 + 3}
        textAnchor="middle"
        fontSize={10}
        fill={color}
      >
        {text}
      </text>
    </g>
  );
}

/**
 * 總覽頁的績效走勢圖：總市值 + 總損益（未實現＋已實現＋股利）雙 Y 軸疊在同一張圖。
 * 損益線以基準線（1D 是昨收，其餘區間是區間前一個收盤）為界拆成紅（賺）綠（賠）兩段，
 * 用 SVG gradient 的硬轉折做出來，不是漸層。
 */
export function PortfolioHistoryChart() {
  const [range, setRange] = useState<HistoryRange>('1D');
  const { data, isLoading } = usePortfolioHistory(range);

  const chartData: ChartPoint[] = useMemo(() => {
    if (!data) return [];
    return data.points.map((p) => ({
      label: range === '1D' ? formatTimeLabel(Number(p.date)) : formatDateLabel(p.date, range),
      marketValue: p.marketValue,
      totalPnl: p.totalPnl,
    }));
  }, [data, range]);

  const { mvDomain, pnlDomain, mvBaseline, baseline, baselineOffset } = useMemo(() => {
    const marketValues = chartData.map((p) => p.marketValue);
    const pnlValues = chartData.map((p) => p.totalPnl);
    // 基準線是「這段區間損益 ±0 的位置」＝ 前一個收盤（1D 就是昨收），不是第一個點，
    // 也不是總損益 0——總損益含已實現與股利，天生離 0 很遠，硬把它塞進 Y 軸只會把走勢壓平。
    // 昨收常常落在當日高低點之外，所以要一起算進 min/max，不然全紅或全綠的日子會看不到線
    const mvBase = data?.baseline?.marketValue ?? marketValues[0] ?? 0;
    const base = data?.baseline?.totalPnl ?? pnlValues[0] ?? 0;

    const mvMin = Math.min(...marketValues, mvBase);
    const mvMax = Math.max(...marketValues, mvBase);
    const mvPad = (mvMax - mvMin) * 0.15 || Math.max(Math.abs(mvMax) * 0.01, 1);

    const pnlMin = Math.min(...pnlValues, base);
    const pnlMax = Math.max(...pnlValues, base);
    const pnlPad = (pnlMax - pnlMin) * 0.15 || Math.max(Math.abs(base) * 0.01, 1);

    const pnlLow = pnlMin - pnlPad;
    const pnlHigh = pnlMax + pnlPad;
    // 基準線落在圖表高度的哪個比例（從頂端算），gradient 的硬轉折點就設在這裡
    const offset =
      pnlHigh <= pnlLow ? 0.5 : Math.min(1, Math.max(0, (pnlHigh - base) / (pnlHigh - pnlLow)));

    return {
      mvDomain: [mvMin - mvPad, mvMax + mvPad] as [number, number],
      pnlDomain: [pnlLow, pnlHigh] as [number, number],
      mvBaseline: mvBase,
      baseline: base,
      baselineOffset: offset,
    };
  }, [chartData, data]);

  const baselineLabel =
    range !== '1D' ? '期初' : data?.baseline ? '昨收' : '開盤';

  // 高點：兩條線各自在目前這段區間的最大值，標在圖上
  const { mvPeak, pnlPeak } = useMemo(() => {
    if (chartData.length === 0) return { mvPeak: null, pnlPeak: null };

    let mvIdx = 0;
    let pnlIdx = 0;
    for (let i = 1; i < chartData.length; i++) {
      if (chartData[i].marketValue > chartData[mvIdx].marketValue) mvIdx = i;
      if (chartData[i].totalPnl > chartData[pnlIdx].totalPnl) pnlIdx = i;
    }

    return { mvPeak: chartData[mvIdx], pnlPeak: chartData[pnlIdx] };
  }, [chartData]);

  // 1D 損益＝市值加一個常數，兩條線的高點常常落在同一個 X，標籤會疊在一起，
  // 這種情況把兩個標籤分別擺到上／下兩側
  const peaksCollide = mvPeak != null && pnlPeak != null && mvPeak.label === pnlPeak.label;

  const tickInterval = Math.max(0, Math.ceil(chartData.length / 8) - 1);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <CardTitle className="text-xs font-medium text-foreground">績效走勢</CardTitle>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-0.5 w-3 rounded-full"
              style={{ backgroundColor: MARKET_VALUE_COLOR }}
            />
            總市值
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-0.5 w-3 rounded-full"
              style={{ background: `linear-gradient(to right, ${UP_HEX}, ${DOWN_HEX})` }}
            />
            總損益（高於{baselineLabel}紅／低於{baselineLabel}綠）
          </span>
        </div>
        <div className="flex gap-0.5">
          {RANGES.map((r) => (
            <Button
              key={r}
              type="button"
              size="xs"
              variant={r === range ? 'secondary' : 'ghost'}
              onClick={() => setRange(r)}
            >
              {r}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 py-1.5">
        <div className="h-[180px]">
          {isLoading && chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              載入中...
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              尚無足夠資料繪製走勢圖
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
                <defs>
                  <linearGradient id="portfolio-pnl-color" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={baselineOffset} stopColor={UP_HEX} stopOpacity={1} />
                    <stop offset={baselineOffset} stopColor={DOWN_HEX} stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  interval={tickInterval}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="value"
                  orientation="left"
                  tick={{ fontSize: 11 }}
                  tickFormatter={compactCurrency}
                  domain={mvDomain}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <YAxis
                  yAxisId="pnl"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={compactCurrency}
                  domain={pnlDomain}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  yAxisId="value"
                  dataKey="marketValue"
                  stroke={MARKET_VALUE_COLOR}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="pnl"
                  dataKey="totalPnl"
                  stroke="url(#portfolio-pnl-color)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                {/* 基準線畫在資料線之後（才不會被蓋住），並直接標文字說明是昨收／期初，不能只靠一條虛線讓人猜 */}
                <ReferenceLine
                  yAxisId="value"
                  y={mvBaseline}
                  stroke="#9ca3af"
                  strokeDasharray="4 3"
                  strokeWidth={1.25}
                  label={
                    <BaselineLabel
                      text={`${baselineLabel} ${compactCurrency(mvBaseline)}`}
                      color="#9ca3af"
                      align="left"
                    />
                  }
                />
                <ReferenceLine
                  yAxisId="pnl"
                  y={baseline}
                  stroke="#9ca3af"
                  strokeDasharray="4 3"
                  strokeWidth={1.25}
                  label={
                    <BaselineLabel
                      text={`${baselineLabel} ${compactCurrency(baseline)}`}
                      color="#9ca3af"
                      align="right"
                    />
                  }
                />
                {mvPeak && (
                  <ReferenceDot
                    yAxisId="value"
                    x={mvPeak.label}
                    y={mvPeak.marketValue}
                    r={3}
                    fill={MARKET_VALUE_COLOR}
                    stroke="var(--card)"
                    strokeWidth={1.5}
                    label={{
                      value: compactCurrency(mvPeak.marketValue),
                      position: 'top',
                      offset: 6,
                      fontSize: 10,
                      fill: MARKET_VALUE_COLOR,
                    }}
                  />
                )}
                {pnlPeak && (
                  <ReferenceDot
                    yAxisId="pnl"
                    x={pnlPeak.label}
                    y={pnlPeak.totalPnl}
                    r={3}
                    fill={pnlPeak.totalPnl >= baseline ? UP_HEX : DOWN_HEX}
                    stroke="var(--card)"
                    strokeWidth={1.5}
                    label={{
                      value: compactCurrency(pnlPeak.totalPnl),
                      position: peaksCollide ? 'bottom' : 'top',
                      offset: 6,
                      fontSize: 10,
                      fill: pnlPeak.totalPnl >= baseline ? UP_HEX : DOWN_HEX,
                    }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
