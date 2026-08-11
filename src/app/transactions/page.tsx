'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTransactions, useDeleteTransaction } from '@/hooks/useTransactions';
import { usePrices } from '@/hooks/usePrices';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  computeTransactionPnL,
  formatCurrency,
  formatPercent,
} from '@/lib/calculations';
import { gainTextClass } from '@/lib/colors';
import type { Broker, StockPrice, TransactionPnL, TransactionType } from '@/types';

const ALL = 'all';

const TYPE_LABEL: Record<TransactionType, string> = {
  BUY: '買入',
  SELL: '賣出',
  STOCK_DIVIDEND: '配股',
};

/** 配股是零成本入帳，用另一個底色跟真正的買賣分開 */
const TYPE_BADGE: Record<TransactionType, 'default' | 'destructive' | 'secondary'> = {
  BUY: 'default',
  SELL: 'destructive',
  STOCK_DIVIDEND: 'secondary',
};

/** 正號要自己補，負數本身已經帶負號 */
function withSign(value: number, text: string): string {
  return value > 0 ? `+${text}` : text;
}

/** 滑過損益數字就知道這個數字是怎麼來的 */
function pnlHint(
  pnl: TransactionPnL,
  type: TransactionType,
  price: StockPrice | undefined
): string {
  if (type === 'STOCK_DIVIDEND') {
    const at = price ? `，現價 ${price.price.toFixed(2)}` : '';
    return `配股沒有成本，還持有的 ${pnl.heldShares.toLocaleString()} 股整筆都是獲利${at}`;
  }

  if (type === 'SELL') {
    return `已實現 ${withSign(pnl.realized, formatCurrency(pnl.realized))}（賣出淨收入 − FIFO 買入成本 ${formatCurrency(
      pnl.basis
    )}，已扣手續費與交易稅）`;
  }

  const parts: string[] = [];

  if (pnl.soldShares > 0) {
    parts.push(
      `已實現 ${withSign(pnl.realized, formatCurrency(pnl.realized))}（這批已賣出 ${pnl.soldShares.toLocaleString()} 股）`
    );
  }

  if (pnl.heldShares > 0) {
    const base =
      pnl.unrealized != null
        ? `未實現 ${withSign(pnl.unrealized, formatCurrency(pnl.unrealized))}`
        : '未實現：抓不到現價';
    const at = price ? `，現價 ${price.price.toFixed(2)}` : '';
    parts.push(`${base}（還持有 ${pnl.heldShares.toLocaleString()} 股${at}）`);
  }

  return parts.join('；') || '尚未賣出也沒有現價';
}

function PnLCell({
  pnl,
  type,
  price,
}: {
  pnl: TransactionPnL | undefined;
  type: TransactionType;
  price: StockPrice | undefined;
}) {
  if (!pnl || pnl.gain == null) {
    return <span className="text-muted-foreground">--</span>;
  }

  // 買入尚未賣出的部分還會浮動，標一下不是最終結果
  const label = type === 'SELL' ? '已實現' : pnl.heldShares > 0 ? '未實現' : '已實現';

  return (
    <span className={gainTextClass(pnl.gain)} title={pnlHint(pnl, type, price)}>
      <span className="block leading-tight">
        {withSign(pnl.gain, formatCurrency(pnl.gain))}
      </span>
      <span className="block text-[11px] leading-tight opacity-80">
        {pnl.gainPercent != null ? withSign(pnl.gainPercent, formatPercent(pnl.gainPercent)) : ''}
        <span className="ml-1 text-muted-foreground">{label}</span>
      </span>
    </span>
  );
}

export default function TransactionsPage() {
  const { data, isLoading, error } = useTransactions();
  const deleteTransaction = useDeleteTransaction();

  const [filterTicker, setFilterTicker] = useState<string>(ALL);
  const [filterType, setFilterType] = useState<string>(ALL);
  const [filterBroker, setFilterBroker] = useState<string>(ALL);

  const transactions = useMemo(() => data?.transactions ?? [], [data?.transactions]);
  const brokers = useMemo(() => data?.brokers ?? [], [data?.brokers]);

  // 股票全名與每筆損益都要現價，代號從交易紀錄取（含已出清的）
  const tickers = useMemo(
    () => Array.from(new Set(transactions.map((tx) => tx.ticker))).sort(),
    [transactions]
  );
  const { data: prices } = usePrices(tickers);

  const nameOf = (ticker: string) => prices?.[ticker]?.name ?? '';

  /** 篩選用的股票清單：交易紀錄裡出現過的代號各一筆 */
  const stockOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tx of transactions) {
      counts.set(tx.ticker, (counts.get(tx.ticker) ?? 0) + 1);
    }
    return tickers.map((ticker) => ({ ticker, count: counts.get(ticker) ?? 0 }));
  }, [transactions, tickers]);

  /** 券商下拉只列出真的有交易紀錄的券商 */
  const brokerOptions = useMemo(() => {
    const used = new Set(transactions.map((tx) => tx.broker_id));
    return brokers.filter((broker) => used.has(broker.id));
  }, [transactions, brokers]);

  const pnlByTx = useMemo(() => {
    const priceMap = new Map<string, StockPrice>(Object.entries(prices ?? {}));
    return computeTransactionPnL(transactions, priceMap);
  }, [transactions, prices]);

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((tx) => {
        if (filterTicker !== ALL && tx.ticker !== filterTicker) return false;
        if (filterType !== ALL && tx.transaction_type !== filterType) return false;
        if (filterBroker !== ALL && tx.broker_id !== filterBroker) return false;
        return true;
      }),
    [transactions, filterTicker, filterType, filterBroker]
  );

  const brokerMap = useMemo(() => {
    const map = new Map<string, Broker>();
    brokers.forEach((broker) => map.set(broker.id, broker));
    return map;
  }, [brokers]);

  /** 篩選後這批交易的損益合計，只加算得出來的 */
  const filteredGain = useMemo(
    () =>
      filteredTransactions.reduce((sum, tx) => sum + (pnlByTx.get(tx.id)?.gain ?? 0), 0),
    [filteredTransactions, pnlByTx]
  );

  const handleDelete = async (id: string) => {
    if (confirm('確定要刪除此筆交易嗎？')) {
      deleteTransaction.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">交易記錄</h1>
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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">交易記錄</h1>
        <Link href="/transactions/new">
          <Button>新增交易</Button>
        </Link>
      </div>

      {data?.stockDividendError && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-900">
            配股紀錄補寫失敗：{data.stockDividendError}
            <br />
            資料表的 transaction_type 檢查條件可能還沒加上 STOCK_DIVIDEND，
            請把 supabase-migration-stock-dividend.sql 貼到 Supabase SQL Editor 執行一次。
          </CardContent>
        </Card>
      )}

      {/* Filters：三個下拉都只列出交易紀錄裡真的出現過的選項 */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4">
            <Select value={filterTicker} onValueChange={setFilterTicker}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="股票" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>全部股票（{stockOptions.length}）</SelectItem>
                {stockOptions.map(({ ticker, count }) => (
                  <SelectItem key={ticker} value={ticker}>
                    {ticker}
                    {nameOf(ticker) && ` ${nameOf(ticker)}`}
                    <span className="text-muted-foreground"> · {count} 筆</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="交易類型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>全部類型</SelectItem>
                <SelectItem value="BUY">買入</SelectItem>
                <SelectItem value="SELL">賣出</SelectItem>
                <SelectItem value="STOCK_DIVIDEND">配股</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterBroker} onValueChange={setFilterBroker}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="券商" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>全部券商</SelectItem>
                {brokerOptions.map((broker) => (
                  <SelectItem key={broker.id} value={broker.id}>
                    {broker.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span>交易記錄 ({filteredTransactions.length})</span>
            <span className="text-sm font-normal text-muted-foreground">
              損益合計{' '}
              <span className={gainTextClass(filteredGain)}>
                {withSign(filteredGain, formatCurrency(filteredGain))}
              </span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTransactions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              尚無交易記錄。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日期</TableHead>
                  <TableHead>類型</TableHead>
                  <TableHead className="min-w-[150px]">股票</TableHead>
                  <TableHead className="text-right">股數</TableHead>
                  <TableHead className="text-right">價格</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead
                    className="text-right"
                    title="賣出＝FIFO 已實現損益（已扣手續費與交易稅）；買入＝已賣出部分的已實現損益 + 還持有部分以現價計算的未實現損益"
                  >
                    損益
                  </TableHead>
                  <TableHead>券商</TableHead>
                  <TableHead className="min-w-[160px]">決策原因</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{tx.transaction_date}</TableCell>
                    <TableCell>
                      <Badge variant={TYPE_BADGE[tx.transaction_type]}>
                        {TYPE_LABEL[tx.transaction_type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{tx.ticker}</span>
                      {nameOf(tx.ticker) && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {nameOf(tx.ticker)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {tx.quantity.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* 配股不用花錢買，價格與金額都留白比顯示 0 清楚 */}
                      {tx.transaction_type === 'STOCK_DIVIDEND' ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        tx.price.toFixed(2)
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {tx.transaction_type === 'STOCK_DIVIDEND' ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        formatCurrency(tx.quantity * tx.price)
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <PnLCell
                        pnl={pnlByTx.get(tx.id)}
                        type={tx.transaction_type}
                        price={prices?.[tx.ticker]}
                      />
                    </TableCell>
                    <TableCell>
                      {brokerMap.get(tx.broker_id)?.name || '-'}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      {tx.decision_reason ? (
                        <span
                          className="block truncate text-sm"
                          title={tx.decision_reason}
                        >
                          {tx.decision_reason}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(tx.id)}
                        disabled={deleteTransaction.isPending}
                      >
                        刪除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        損益欄：賣出為 FIFO 配對買入成本後的已實現損益（已扣手續費與交易稅）；
        買入為「已被賣掉的部分（已實現）＋ 還持有的部分以現價計算（未實現）」，滑過數字可看組成。
        找不到對應買入紀錄或抓不到現價時顯示 --。
        「配股」是除權配到的股票，由系統依除權息設定自動補寫：股數增加、成本為 0（所以均價會被稀釋），
        賣掉時整筆都算已實現獲利，也因為成本是 0 所以沒有報酬率。
      </p>
    </div>
  );
}
