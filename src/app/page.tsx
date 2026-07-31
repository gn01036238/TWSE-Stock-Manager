'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { useHoldings } from '@/hooks/useHoldings';
import { useChips } from '@/hooks/useChips';
import { useCandles } from '@/hooks/useCandles';
import { useIntraday } from '@/hooks/useIntraday';
import { useIndices } from '@/hooks/useIndices';
import { useWatchlist } from '@/hooks/useWatchlist';
import { usePersistentState } from '@/hooks/usePersistentState';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { isTwWatchlistSymbol, twTickerFromSymbol } from '@/lib/watchlist';
import { LivePrice } from '@/components/live-price';
import { LivePriceStatus } from '@/components/live-price-status';
import { Sparkline } from '@/components/sparkline';
import { Candlestick } from '@/components/candlestick';
import { DayChange } from '@/components/day-change';
import { DataDateTag } from '@/components/data-date-tag';
import { DividendHistory, type DividendRecord } from '@/components/dividend-history';
import { MarketIndices } from '@/components/market-indices';
import { PortfolioHistoryChart } from '@/components/portfolio-history-chart';
import { DOWN_TEXT, UP_TEXT, gainBadgeClass, gainTextClass } from '@/lib/colors';
import { PATTERN_LABEL, formatFlow, formatLots, patternDirection } from '@/lib/chips-format';
import type {
  ChipRow,
  DailyBar,
  Holding,
  IndexQuote,
  IntradaySeries,
  PriceVolumePattern,
  StockPrice,
} from '@/types';

/** 加權指數列借用的代號，跟 /api/chips 一致 */
const TAIEX_TICKER = '0000';

/** 表格的一列：持股 + 當日籌碼；加權指數彙總列與觀察清單列沒有 holding */
interface OverviewRow {
  ticker: string;
  name: string;
  holding: Holding | null;
  chip: ChipRow | null;
  price?: StockPrice;
  intraday?: IntradaySeries;
  candles: DailyBar[];
  dividends: DividendRecord[];
  /** 只有台股以外的觀察標的（美股等）才有，走 Yahoo 報價 */
  quote?: IndexQuote | null;
  /** 有值代表這列是觀察清單（而非持股），值即為原始 Yahoo 代號，用來移除 */
  watchlistSymbol?: string;
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

/** 依存好的順序排 key；新出現或已經不在清單裡的項目，維持原本（資料來源）的相對順序接在後面 */
function sortByOrder(keys: string[], order: string[]): string[] {
  if (order.length === 0) return keys;
  const known = new Set(keys);
  const sorted = order.filter((key) => known.has(key));
  for (const key of keys) {
    if (!sorted.includes(key)) sorted.push(key);
  }
  return sorted;
}

/** 把 fromKey 移到 toKey 現在的位置 */
function reorderKeys(keys: string[], fromKey: string, toKey: string): string[] {
  const from = keys.indexOf(fromKey);
  const to = keys.indexOf(toKey);
  if (from < 0 || to < 0 || from === to) return keys;
  const next = [...keys];
  next.splice(from, 1);
  next.splice(to, 0, fromKey);
  return next;
}

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

/** 價量型態只顯示「價」「量」兩個字：紅＝價漲／量增，綠＝價跌／量縮 */
function PatternMark({ pattern }: { pattern: PriceVolumePattern }) {
  const { priceUp, volumeUp } = patternDirection(pattern);

  if (priceUp == null || volumeUp == null) {
    return <span className="text-muted-foreground">--</span>;
  }

  return (
    <span className="font-medium tracking-wide" title={PATTERN_LABEL[pattern]}>
      <span className={priceUp ? UP_TEXT : DOWN_TEXT}>價</span>
      <span className={volumeUp ? UP_TEXT : DOWN_TEXT}>量</span>
    </span>
  );
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

  // 只想觀察、沒有持有的標的；代號格式跟參考指標一致（台股 2330.TW，美股等直接 AAPL）
  const { symbols: watchlistSymbols, addSymbol: addWatchlistSymbol, removeSymbol: removeWatchlistSymbol, loaded: watchlistLoaded } = useWatchlist();
  const [watchlistDraft, setWatchlistDraft] = useState('');

  // 持股／觀察清單各自的列順序（使用者可拖曳調整），兩組分開存才不會讓拖曳把兩邊混在一起
  const [holdingOrder, setHoldingOrder] = usePersistentState<string[]>(
    'twse:overview:holding-order',
    []
  );
  const [watchlistOrder, setWatchlistOrder] = usePersistentState<string[]>(
    'twse:overview:watchlist-order',
    []
  );

  // 籌碼只看現在還持有的標的，出清的不顯示
  const heldTickers = useMemo(() => holdings.map((holding) => holding.ticker), [holdings]);

  // 觀察清單拆成台股（沿用 TWSE 籌碼／日K）跟其他市場（走 Yahoo 報價）；已經持有的台股不重複列一次
  const watchlistEntries = useMemo(() => {
    const heldSet = new Set(heldTickers);
    const seenTw = new Set<string>();

    return watchlistSymbols
      .map((symbol) =>
        isTwWatchlistSymbol(symbol)
          ? { symbol, ticker: twTickerFromSymbol(symbol), isTw: true as const }
          : { symbol, ticker: symbol, isTw: false as const }
      )
      .filter((entry) => {
        if (!entry.isTw) return true;
        if (heldSet.has(entry.ticker) || seenTw.has(entry.ticker)) return false;
        seenTw.add(entry.ticker);
        return true;
      });
  }, [watchlistSymbols, heldTickers]);

  const watchlistTwTickers = useMemo(
    () => watchlistEntries.filter((entry) => entry.isTw).map((entry) => entry.ticker),
    [watchlistEntries]
  );
  const watchlistOtherSymbols = useMemo(
    () => watchlistEntries.filter((entry) => !entry.isTw).map((entry) => entry.symbol),
    [watchlistEntries]
  );

  // 觀察清單的台股要跟持股一樣完整（籌碼、日K、走勢），所以併進同一批請求
  const chipTickers = useMemo(
    () => [...heldTickers, ...watchlistTwTickers],
    [heldTickers, watchlistTwTickers]
  );
  const { data: chips } = useChips(chipTickers);
  const chipRows = chips?.rows;
  const chipMarket = chips?.market;

  // 日 K 連加權指數一起抓，表尾那列才有 K 棒
  const candleTickers = useMemo(
    () => (chipTickers.length > 0 ? [...chipTickers, TAIEX_TICKER] : []),
    [chipTickers]
  );
  const { data: candles } = useCandles(candleTickers);

  const { data: watchlistIntraday } = useIntraday(watchlistLoaded ? watchlistTwTickers : []);
  const { data: watchlistQuotes } = useIndices(watchlistLoaded ? watchlistOtherSymbols : []);

  const chipByTicker = useMemo(
    () => new Map((chipRows ?? []).map((row) => [row.ticker, row])),
    [chipRows]
  );

  // 各自排序後的持股／觀察清單代號，拖曳排序與 rows 都以這份為準
  const orderedHoldingTickers = useMemo(
    () => sortByOrder(heldTickers, holdingOrder),
    [heldTickers, holdingOrder]
  );
  const watchlistRowTickers = useMemo(
    () => watchlistEntries.map((entry) => (entry.isTw ? entry.ticker : entry.symbol)),
    [watchlistEntries]
  );
  const orderedWatchlistTickers = useMemo(
    () => sortByOrder(watchlistRowTickers, watchlistOrder),
    [watchlistRowTickers, watchlistOrder]
  );

  const rows: OverviewRow[] = useMemo(() => {
    const holdingByTicker = new Map(holdings.map((holding) => [holding.ticker, holding]));
    const holdingRows = orderedHoldingTickers.map((ticker) => {
      const holding = holdingByTicker.get(ticker)!;
      return {
        ticker: holding.ticker,
        name: holding.name,
        holding,
        chip: chipByTicker.get(holding.ticker) ?? null,
        price: prices?.[holding.ticker],
        intraday: intraday[holding.ticker],
        candles: candles?.[holding.ticker]?.bars ?? [],
        dividends: (dividends[holding.ticker]?.dividends as DividendRecord[]) ?? [],
      };
    });

    const watchlistByTicker = new Map(
      watchlistEntries.map((entry) => [entry.isTw ? entry.ticker : entry.symbol, entry])
    );
    const watchlistRows: OverviewRow[] = orderedWatchlistTickers.map((ticker) => {
      const entry = watchlistByTicker.get(ticker)!;
      if (entry.isTw) {
        const chip = chipByTicker.get(entry.ticker) ?? null;
        return {
          ticker: entry.ticker,
          name: chip?.name ?? entry.ticker,
          holding: null,
          chip,
          intraday: watchlistIntraday?.[entry.ticker],
          candles: candles?.[entry.ticker]?.bars ?? [],
          dividends: [],
          watchlistSymbol: entry.symbol,
        };
      }

      const quote = watchlistQuotes?.[entry.symbol] ?? null;
      return {
        ticker: entry.symbol,
        name: quote?.name ?? entry.symbol,
        holding: null,
        chip: null,
        quote,
        candles: [],
        dividends: [],
        watchlistSymbol: entry.symbol,
      };
    });

    return [...holdingRows, ...watchlistRows];
  }, [
    holdings,
    orderedHoldingTickers,
    chipByTicker,
    prices,
    intraday,
    candles,
    dividends,
    watchlistEntries,
    orderedWatchlistTickers,
    watchlistIntraday,
    watchlistQuotes,
  ]);

  // 拖曳列把手放開時呼叫；持股與觀察清單各自存順序，天然不會互相拖曳過去
  const moveRow = useCallback(
    (fromKey: string, toKey: string) => {
      if (orderedHoldingTickers.includes(fromKey)) {
        setHoldingOrder(reorderKeys(orderedHoldingTickers, fromKey, toKey));
        return;
      }
      setWatchlistOrder(reorderKeys(orderedWatchlistTickers, fromKey, toKey));
    },
    [orderedHoldingTickers, orderedWatchlistTickers, setHoldingOrder, setWatchlistOrder]
  );

  const marketRow: OverviewRow | null = useMemo(() => {
    if (!chipMarket) return null;
    return {
      ticker: chipMarket.ticker,
      name: chipMarket.name,
      holding: null,
      chip: chipMarket,
      candles: candles?.[chipMarket.ticker]?.bars ?? [],
      dividends: [],
    };
  }, [chipMarket, candles]);

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
            {row.watchlistSymbol && (
              <button
                type="button"
                onClick={() => removeWatchlistSymbol(row.watchlistSymbol!)}
                className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`從觀察清單移除 ${row.watchlistSymbol}`}
                title="從觀察清單移除"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ),
      },
      {
        id: 'trend',
        header: '今日走勢',
        headerText: '今日走勢（X 軸固定為 09:00–13:30，一分鐘取樣；非台股交易時段不同，改平均分佈）',
        width: 100,
        cell: (row) => (
          <Sparkline
            points={row.intraday?.points ?? row.quote?.points ?? []}
            offsets={row.intraday?.offsets ?? row.quote?.offsets}
            sessionMinutes={row.intraday?.sessionMinutes ?? row.quote?.sessionMinutes}
            baseline={row.intraday?.previousClose ?? row.quote?.previousClose}
            width={80}
            height={28}
          />
        ),
      },
      {
        id: 'candles',
        header: '日K',
        headerText: '日K（近 20 個交易日，紅＝收盤高於開盤；滑過看最新一根開高低收）',
        width: 120,
        cell: (row) => <Candlestick bars={row.candles} width={110} height={30} />,
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
          ) : row.quote?.changePercent != null ? (
            <span className={gainTextClass(row.quote.changePercent)}>
              {withSign(row.quote.changePercent, formatPercent(row.quote.changePercent))}
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
          ) : row.quote?.price != null ? (
            row.quote.price.toLocaleString('zh-TW', { maximumFractionDigits: 2 })
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
        header: '價量',
        headerText:
          '價量型態：價紅＝漲、綠＝跌；量紅＝量增、綠＝量縮（量與前一交易日比較）',
        width: 60,
        align: 'right',
        cell: (row) =>
          row.chip ? <PatternMark pattern={row.chip.pattern} /> : <span>--</span>,
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
    [showTicker, removeWatchlistSymbol]
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

      <PortfolioHistoryChart />

      <Card className="gap-2 py-3">
        <CardContent className="px-2">
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="text-xs text-muted-foreground">新增觀察標的</span>
            <Input
              value={watchlistDraft}
              onChange={(event) => setWatchlistDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                addWatchlistSymbol(watchlistDraft);
                setWatchlistDraft('');
              }}
              placeholder="輸入 Yahoo 代號，例如 2330.TW（台股）、AAPL（美股）"
              className="h-7 max-w-sm text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={!watchlistDraft.trim()}
              onClick={() => {
                addWatchlistSymbol(watchlistDraft);
                setWatchlistDraft('');
              }}
            >
              <Plus className="mr-1 h-3 w-3" />
              新增
            </Button>
          </div>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              尚無持股資料。請先匯入交易記錄或新增交易，也可以在上方新增觀察標的。
            </p>
          ) : (
            <DataTable
              tableId="overview-holdings"
              columns={columns}
              rows={rows}
              rowKey={(row) => row.ticker}
              footerRow={marketRow}
              rowGroup={(row) => (row.holding ? 'holding' : 'watchlist')}
              onMoveRow={moveRow}
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
        持股 {holdings.length} 檔{watchlistEntries.length > 0 ? `，觀察 ${watchlistEntries.length} 檔` : ''}，點任一列可展開配息紀錄。表頭可拖曳調整順序、拖右緣調欄寬，設定會記在這個瀏覽器裡。
        每列最左邊的把手可拖曳調整順序，持股與觀察清單分開排序，不能互相拖過去。
        今日損益的基準為昨收，當天才買進的部位改以成交價計算，未計手續費。
        日K 為近 20 個交易日，最後一根是當日（盤中還會變動）；價量欄的「價」紅漲綠跌、「量」紅為量增綠為量縮。
        成交量與量比為當日即時；三大法人約 16:00、主力分點更晚才會出當日資料，標題旁的標籤會標明目前看的是哪一天。
        加權指數列的成交量單位為張，法人買賣超為全市場金額（億元），沒有分點資料所以主力欄為空。
        觀察清單的標的沒有持股相關欄位（持股、均價、市值等）；台股觀察標的資料跟持股一樣完整，其餘市場只有現價、漲跌幅與走勢。
        股票欄最右邊的 ✕ 可移除觀察標的，只存在這個瀏覽器裡。
      </p>
    </div>
  );
}
