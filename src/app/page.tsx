'use client';

import { useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useHoldings } from '@/hooks/useHoldings';
import { useChips } from '@/hooks/useChips';
import { usePersistentState } from '@/hooks/usePersistentState';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { LivePrice } from '@/components/live-price';
import { LivePriceStatus } from '@/components/live-price-status';
import { Sparkline } from '@/components/sparkline';
import { DayChange } from '@/components/day-change';
import { DataDateTag } from '@/components/data-date-tag';
import { DividendHistory, type DividendRecord } from '@/components/dividend-history';
import { MarketIndices } from '@/components/market-indices';
import { DOWN_TEXT, UP_TEXT, gainBadgeClass, gainTextClass } from '@/lib/colors';
import { PATTERN_LABEL, formatFlow, formatLots } from '@/lib/chips-format';
import type { ChipRow, Holding, IntradaySeries, StockPrice } from '@/types';

/** 表格的一列：持股 + 當日籌碼；加權指數彙總列沒有 holding */
interface OverviewRow {
  ticker: string;
  name: string;
  holding: Holding | null;
  chip: ChipRow | null;
  price?: StockPrice;
  intraday?: IntradaySeries;
  dividends: DividendRecord[];
}

function SummaryStat({
  title,
  value,
  subValue,
  trend,
  /** 連主要數字一起上漲跌色，用在今日損益這類需要一眼看出方向的欄位 */
  colorValue = false,
}: {
  title: string;
  value: React.ReactNode;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  colorValue?: boolean;
}) {
  const trendColor =
    trend === 'up' ? UP_TEXT : trend === 'down' ? DOWN_TEXT : 'text-muted-foreground';

  return (
    <div className="leading-tight">
      <p className="text-[11px] text-muted-foreground">{title}</p>
      <div
        className={`text-lg font-bold ${
          colorValue && trend !== 'neutral' ? trendColor : ''
        }`}
      >
        {value}
      </div>
      {subValue && <p className={`text-[11px] ${trendColor}`}>{subValue}</p>}
    </div>
  );
}

/** 今日損益的正負號，跌幅本身已經帶負號 */
function withSign(value: number, text: string): string {
  return value > 0 ? `+${text}` : text;
}

const money = (value: number) => withSign(value, formatCurrency(value));

/** 今日損益的組成，滑過去就知道數字怎麼來的 */
function dayChangeHint(holding: Holding): string {
  const heldShares = holding.shares - holding.todayShares;
  const held = `昨日持股 ${heldShares.toLocaleString()} 股（昨收 ${holding.previousClose}）${money(
    holding.dayChangeHeld
  )}`;

  if (holding.todayShares === 0) return held;

  return `${held}；今日買進 ${holding.todayShares.toLocaleString()} 股（以成交價為基準）${money(
    holding.dayChangeToday
  )}`;
}

function FlowText({ value, unit }: { value: number | undefined; unit: ChipRow['flowUnit'] }) {
  const className =
    value == null || Math.round(value) === 0 ? 'text-muted-foreground' : gainTextClass(value);
  return <span className={className}>{formatFlow(value, unit)}</span>;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="py-6">
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="py-6">
          <div className="h-64 w-full animate-pulse rounded bg-muted" />
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
    dividends,
    pricesUpdatedAt,
    isPricesFetching,
    refreshPrices,
  } = useHoldings();

  // 股票欄位要不要顯示代號，記在瀏覽器
  const [showTicker, setShowTicker] = usePersistentState('twse:overview:show-ticker', true);

  // 籌碼只看現在還持有的標的，出清的不顯示
  const heldTickers = useMemo(() => holdings.map((holding) => holding.ticker), [holdings]);
  const { data: chips } = useChips(heldTickers);
  const chipRows = chips?.rows;
  const chipMarket = chips?.market;

  const rows: OverviewRow[] = useMemo(() => {
    const chipByTicker = new Map((chipRows ?? []).map((row) => [row.ticker, row]));

    return holdings.map((holding) => ({
      ticker: holding.ticker,
      name: holding.name,
      holding,
      chip: chipByTicker.get(holding.ticker) ?? null,
      price: prices?.[holding.ticker],
      intraday: intraday[holding.ticker],
      dividends: (dividends[holding.ticker]?.dividends as DividendRecord[]) ?? [],
    }));
  }, [holdings, chipRows, prices, intraday, dividends]);

  const marketRow: OverviewRow | null = useMemo(() => {
    if (!chipMarket) return null;
    return {
      ticker: chipMarket.ticker,
      name: chipMarket.name,
      holding: null,
      chip: chipMarket,
      dividends: [],
    };
  }, [chipMarket]);

  const columns = useMemo<ColumnDef<OverviewRow>[]>(
    () => [
      {
        id: 'stock',
        header: '股票',
        headerText: '股票（點擊該列可展開配息紀錄）',
        width: 150,
        minWidth: 60,
        frozen: true,
        cell: (row, { expanded }) => (
          <div className="flex items-center gap-1">
            {row.holding ? (
              expanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )
            ) : null}
            <span className="truncate" title={`${row.ticker} ${row.name}`}>
              {showTicker && <span className="font-medium">{row.ticker}</span>}
              <span
                className={showTicker ? 'ml-1.5 text-xs text-muted-foreground' : 'font-medium'}
              >
                {row.name}
              </span>
            </span>
          </div>
        ),
      },
      {
        id: 'trend',
        header: '今日走勢',
        headerText: '今日走勢（5 分鐘線）',
        width: 100,
        cell: (row) => (
          <Sparkline
            points={row.intraday?.points ?? []}
            baseline={row.intraday?.previousClose}
            width={80}
            height={28}
          />
        ),
      },
      {
        id: 'changePercent',
        header: '漲跌幅',
        width: 80,
        align: 'right',
        cell: (row) =>
          row.holding ? (
            <DayChange price={row.price} showAmount={false} />
          ) : row.chip?.changePercent != null ? (
            <span className={gainTextClass(row.chip.changePercent)}>
              {withSign(row.chip.changePercent, formatPercent(row.chip.changePercent))}
            </span>
          ) : (
            '--'
          ),
      },
      {
        id: 'dayChange',
        header: '今日損益',
        headerText: '今日損益（今日買進的部位以成交價為基準，未計手續費）',
        width: 100,
        align: 'right',
        cell: (row) =>
          row.holding ? (
            <span
              className={gainTextClass(row.holding.dayChange)}
              title={dayChangeHint(row.holding)}
            >
              <LivePrice
                value={row.holding.dayChange}
                format={(value) => withSign(value, formatCurrency(value))}
                className="px-0"
              />
            </span>
          ) : (
            '--'
          ),
      },
      {
        id: 'shares',
        header: '持股',
        width: 80,
        align: 'right',
        cell: (row) => (row.holding ? row.holding.shares.toLocaleString() : '--'),
      },
      {
        id: 'avgCost',
        header: '均價',
        width: 70,
        align: 'right',
        cell: (row) => (row.holding ? row.holding.avgCost.toFixed(2) : '--'),
      },
      {
        id: 'price',
        header: '現價',
        width: 80,
        align: 'right',
        cell: (row) =>
          row.holding ? (
            <LivePrice value={row.holding.currentPrice} className="px-0" />
          ) : row.chip?.price != null ? (
            row.chip.price.toLocaleString('zh-TW', { maximumFractionDigits: 2 })
          ) : (
            '--'
          ),
      },
      {
        id: 'marketValue',
        header: '市值',
        width: 100,
        align: 'right',
        cell: (row) =>
          row.holding ? (
            <LivePrice
              value={row.holding.marketValue}
              format={formatCurrency}
              className="px-0"
            />
          ) : (
            '--'
          ),
      },
      {
        id: 'unrealizedGain',
        header: '未實現損益',
        width: 105,
        align: 'right',
        cell: (row) =>
          row.holding ? (
            <span className={gainTextClass(row.holding.unrealizedGain)}>
              <LivePrice
                value={row.holding.unrealizedGain}
                format={formatCurrency}
                className="px-0"
              />
            </span>
          ) : (
            '--'
          ),
      },
      {
        id: 'dividends',
        header: '累積股利',
        width: 90,
        align: 'right',
        className: 'text-muted-foreground',
        cell: (row) =>
          row.holding && row.holding.totalDividends > 0
            ? formatCurrency(row.holding.totalDividends)
            : '-',
      },
      {
        id: 'returnPercent',
        header: '報酬率(含息)',
        width: 100,
        align: 'right',
        cell: (row) =>
          row.holding ? (
            <Badge
              variant="outline"
              className={gainBadgeClass(row.holding.adjustedGainPercent)}
              title={`不含息 ${formatPercent(row.holding.unrealizedGainPercent)}`}
            >
              {formatPercent(row.holding.adjustedGainPercent)}
            </Badge>
          ) : (
            '--'
          ),
      },
      {
        id: 'volume',
        header: '成交量',
        headerText: '成交量（張，當日即時）',
        width: 85,
        align: 'right',
        cell: (row) => formatLots(row.chip?.volume),
      },
      {
        id: 'volumeRatio',
        header: '量比',
        headerText: '量比 = 當日成交速度 ÷ 前 5 個交易日均量',
        width: 60,
        align: 'right',
        cell: (row) =>
          row.chip?.volumeRatio != null ? row.chip.volumeRatio.toFixed(2) : '--',
      },
      {
        id: 'pattern',
        header: '價量型態',
        headerText: '價量型態（量增／量縮與前一交易日比較）',
        width: 90,
        align: 'right',
        cell: (row) => (row.chip ? PATTERN_LABEL[row.chip.pattern] : '--'),
      },
      {
        id: 'major',
        header: '主力買賣超 (1日)',
        headerText: '主力買賣超 (1日)：買超前 15 大券商 − 賣超前 15 大券商，單位張',
        width: 105,
        align: 'right',
        cell: (row) => <FlowText value={row.chip?.major?.net} unit="lot" />,
      },
      {
        id: 'foreign',
        header: '外資買賣超 (1日)',
        headerText: '外資買賣超 (1日)：個股單位張，加權指數為金額（億元）',
        width: 105,
        align: 'right',
        cell: (row) => (
          <FlowText value={row.chip?.flow?.foreign} unit={row.chip?.flowUnit ?? 'lot'} />
        ),
      },
      {
        id: 'trust',
        header: '投信買賣超 (1日)',
        headerText: '投信買賣超 (1日)：個股單位張，加權指數為金額（億元）',
        width: 105,
        align: 'right',
        cell: (row) => (
          <FlowText value={row.chip?.flow?.trust} unit={row.chip?.flowUnit ?? 'lot'} />
        ),
      },
      {
        id: 'dealer',
        header: '自營商買賣超 (1日)',
        headerText: '自營商買賣超 (1日)：個股單位張，加權指數為金額（億元）',
        width: 105,
        align: 'right',
        cell: (row) => (
          <FlowText value={row.chip?.flow?.dealer} unit={row.chip?.flowUnit ?? 'lot'} />
        ),
      },
    ],
    [showTicker]
  );

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <Card className="p-6">
        <p className="text-destructive">
          載入資料時發生錯誤。請確認 Supabase 連線設定是否正確。
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          請先執行 supabase-schema.sql 建立資料表。
        </p>
      </Card>
    );
  }

  // 含息報酬率：未實現損益 + 持有期間已領股利
  const totalAdjustedGainPercent =
    summary.totalInvested > 0
      ? ((summary.totalUnrealizedGain + summary.totalDividends) / summary.totalInvested) * 100
      : 0;

  const unrealizedTrend =
    summary.totalUnrealizedGain > 0
      ? 'up'
      : summary.totalUnrealizedGain < 0
      ? 'down'
      : 'neutral';

  const dayTrend =
    summary.totalDayChange > 0 ? 'up' : summary.totalDayChange < 0 ? 'down' : 'neutral';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">投資組合總覽</h1>
          <DataDateTag label="主力" date={chips?.majorDate} tradingDate={chips?.tradingDate} />
          <DataDateTag
            label="三大法人"
            date={chips?.flowDate}
            tradingDate={chips?.tradingDate}
          />
        </div>
        <LivePriceStatus
          updatedAt={pricesUpdatedAt}
          isFetching={isPricesFetching}
          onRefresh={refreshPrices}
        />
      </div>

      {/* Summary + 指數：合併成單一精簡卡片，讓持股表格留在首屏 */}
      <Card className="gap-0 py-0">
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-2.5 lg:grid-cols-5">
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
            title="今日損益"
            value={
              <LivePrice
                value={summary.totalDayChange}
                format={(value) => withSign(value, formatCurrency(value))}
                className="-ml-1"
              />
            }
            subValue={withSign(
              summary.totalDayChangePercent,
              formatPercent(summary.totalDayChangePercent)
            )}
            trend={dayTrend}
            colorValue
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
          <SummaryStat title="總投入成本" value={formatCurrency(summary.totalInvested)} />
        </CardContent>
        <MarketIndices className="border-t px-4 py-2" />
      </Card>

      <Card className="gap-2 py-3">
        <CardContent className="px-2">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              尚無持股資料。請先匯入交易記錄或新增交易。
            </p>
          ) : (
            <DataTable
              tableId="overview-holdings"
              columns={columns}
              rows={rows}
              rowKey={(row) => row.ticker}
              footerRow={marketRow}
              renderExpanded={(row) =>
                row.holding ? <DividendHistory records={row.dividends} /> : null
              }
              settingsExtra={
                <label className="flex cursor-pointer items-center gap-1.5 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={!showTicker}
                    onChange={(event) => setShowTicker(!event.target.checked)}
                    className="h-3 w-3 accent-primary"
                  />
                  只顯示名稱（隱藏代號）
                </label>
              }
            />
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        持股 {rows.length} 檔，點任一列可展開配息紀錄。表頭可拖曳調整順序、拖右緣調欄寬，設定會記在這個瀏覽器裡。
        今日損益的基準為昨收，當天才買進的部位改以成交價計算，未計手續費。
        成交量與量比為當日即時；三大法人約 16:00、主力分點更晚才會出當日資料，標題旁的標籤會標明目前看的是哪一天。
        加權指數列的成交量單位為張，法人買賣超為全市場金額（億元），沒有分點資料所以主力欄為空。
      </p>
    </div>
  );
}
