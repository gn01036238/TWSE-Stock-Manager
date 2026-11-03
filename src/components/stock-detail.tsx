'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DividendHistory, type DividendRecord } from '@/components/dividend-history';
import { IntradayChart } from '@/components/intraday-chart';
import { StockHistoryChart } from '@/components/stock-history-chart';
import { TransactionHistory } from '@/components/transaction-history';
import { useMajorHistory, useStockHistory } from '@/hooks/useStockHistory';
import { usePersistentState } from '@/hooks/usePersistentState';
import { cn } from '@/lib/utils';
import type { HistoryRange, IntradaySeries, StockPrice } from '@/types';

type ChartRange = 'today' | HistoryRange;

const RANGE_OPTIONS: { value: ChartRange; label: string }[] = [
  { value: 'today', label: '今日' },
  { value: '1m', label: '1月' },
  { value: '3m', label: '3月' },
  { value: '6m', label: '6月' },
  { value: '1y', label: '1年' },
];

type DetailTab = 'chart' | 'dividends' | 'transactions';

function ChartTab({ ticker, intraday }: { ticker: string; intraday?: IntradaySeries }) {
  const [range, setRange] = usePersistentState<ChartRange>('twse:overview:detail-range', '3m');
  const historyRange = range === 'today' ? null : range;

  const history = useStockHistory(ticker, historyRange);
  const major = useMajorHistory(ticker, historyRange);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRange(option.value)}
            className={cn(
              'rounded px-2 py-0.5 text-xs',
              range === option.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        ))}
        {historyRange && history.isFetching && (
          <span className="ml-2 text-[11px] text-muted-foreground">更新中…</span>
        )}
      </div>

      {range === 'today' ? (
        <IntradayChart series={intraday} />
      ) : history.data ? (
        <StockHistoryChart
          days={history.data.days}
          majorFlows={major.data?.flows}
          majorLoading={major.isFetching}
        />
      ) : history.isError ? (
        <p className="py-12 text-center text-sm text-muted-foreground">歷史資料載入失敗。</p>
      ) : (
        <div className="h-[520px] w-full animate-pulse rounded bg-muted/50" />
      )}

      {historyRange && (
        <p className="text-[11px] text-muted-foreground">
          日 K 與成交量來自 Yahoo；外資、投信買賣超與主力（買超前 15 大券商 − 賣超前 15 大券商）來自富邦 DJ，
          法人約 16:00、主力約收盤後才會有當日資料。
        </p>
      )}
    </div>
  );
}

/**
 * 總覽表格展開列的內容：走勢／日 K、配息紀錄、交易紀錄三個分頁。
 * 最後看的分頁與時間區間記在瀏覽器，展開別檔時沿用。
 */
export function StockDetail({
  ticker,
  intraday,
  price,
  dividends,
}: {
  ticker: string;
  intraday?: IntradaySeries;
  price?: StockPrice;
  dividends: DividendRecord[];
}) {
  const [tab, setTab] = usePersistentState<DetailTab>('twse:overview:detail-tab', 'chart');

  return (
    <div
      className="rounded-md border bg-muted/30 p-3"
      // 這塊在總覽表格的展開列裡；點分頁、欄位設定或拖曳欄寬時不要讓事件冒泡上去把該列收起來
      onClick={(event) => event.stopPropagation()}
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as DetailTab)}>
        <TabsList className="h-8">
          <TabsTrigger value="chart" className="px-3 text-xs">
            走勢／日K
          </TabsTrigger>
          <TabsTrigger value="dividends" className="px-3 text-xs">
            配息紀錄
          </TabsTrigger>
          <TabsTrigger value="transactions" className="px-3 text-xs">
            交易紀錄
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chart">
          <ChartTab ticker={ticker} intraday={intraday} />
        </TabsContent>
        <TabsContent value="dividends">
          <DividendHistory records={dividends} />
        </TabsContent>
        <TabsContent value="transactions">
          <TransactionHistory ticker={ticker} price={price} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
