'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { PnLCell, TYPE_BADGE, TYPE_LABEL, withSign } from '@/components/transaction-pnl';
import { useTransactions } from '@/hooks/useTransactions';
import { computeTransactionPnL, formatCurrency } from '@/lib/calculations';
import { gainTextClass } from '@/lib/colors';
import type { StockPrice, Transaction, TransactionPnL } from '@/types';

interface TransactionRow {
  tx: Transaction;
  pnl: TransactionPnL | undefined;
  brokerName: string;
}

const dash = <span className="text-muted-foreground">-</span>;

/** 展開持股後的交易紀錄：這一檔的每一筆買賣與配股，含每筆損益 */
export function TransactionHistory({ ticker, price }: { ticker: string; price?: StockPrice }) {
  const { data, isLoading } = useTransactions();

  const rows = useMemo<TransactionRow[]>(() => {
    const transactions = (data?.transactions ?? []).filter((tx) => tx.ticker === ticker);
    const brokers = new Map((data?.brokers ?? []).map((broker) => [broker.id, broker.name]));
    const prices = new Map<string, StockPrice>(price ? [[ticker, price]] : []);
    const pnlByTx = computeTransactionPnL(transactions, prices);

    return transactions
      .map((tx) => ({
        tx,
        pnl: pnlByTx.get(tx.id),
        brokerName: brokers.get(tx.broker_id) ?? '-',
      }))
      .sort(
        (a, b) =>
          b.tx.transaction_date.localeCompare(a.tx.transaction_date) ||
          b.tx.created_at.localeCompare(a.tx.created_at)
      );
  }, [data, ticker, price]);

  const columns = useMemo<ColumnDef<TransactionRow>[]>(
    () => [
      {
        id: 'date',
        header: '日期',
        width: 95,
        minWidth: 70,
        frozen: true,
        cell: ({ tx }) => tx.transaction_date,
      },
      {
        id: 'type',
        header: '類型',
        width: 65,
        cell: ({ tx }) => (
          <Badge variant={TYPE_BADGE[tx.transaction_type]}>{TYPE_LABEL[tx.transaction_type]}</Badge>
        ),
      },
      {
        id: 'quantity',
        header: '股數',
        width: 80,
        align: 'right',
        cell: ({ tx }) => tx.quantity.toLocaleString(),
      },
      {
        id: 'price',
        header: '價格',
        width: 80,
        align: 'right',
        // 配股不用花錢買，價格與金額都留白比顯示 0 清楚
        cell: ({ tx }) => (tx.transaction_type === 'STOCK_DIVIDEND' ? dash : tx.price.toFixed(2)),
      },
      {
        id: 'amount',
        header: '金額',
        width: 100,
        align: 'right',
        cell: ({ tx }) =>
          tx.transaction_type === 'STOCK_DIVIDEND' ? dash : formatCurrency(tx.quantity * tx.price),
      },
      {
        id: 'fees',
        header: '手續費／稅',
        headerText: '手續費／交易稅',
        width: 95,
        align: 'right',
        className: 'text-muted-foreground',
        cell: ({ tx }) =>
          tx.commission || tx.tax
            ? `${formatCurrency(tx.commission || 0)}／${formatCurrency(tx.tax || 0)}`
            : dash,
      },
      {
        id: 'pnl',
        header: '損益',
        headerText:
          '損益（賣出＝FIFO 已實現損益，已扣手續費與交易稅；買入＝已賣出部分的已實現 ＋ 還持有部分以現價計的未實現）',
        width: 110,
        align: 'right',
        cell: ({ tx, pnl }) => <PnLCell pnl={pnl} type={tx.transaction_type} price={price} />,
      },
      {
        id: 'broker',
        header: '券商',
        width: 90,
        cell: ({ brokerName }) => brokerName,
      },
      {
        id: 'reason',
        header: '決策原因',
        width: 220,
        fill: true,
        cell: ({ tx }) =>
          tx.decision_reason ? (
            <span className="block truncate" title={tx.decision_reason}>
              {tx.decision_reason}
            </span>
          ) : (
            dash
          ),
      },
    ],
    [price]
  );

  if (isLoading) {
    return <p className="py-4 text-center text-sm text-muted-foreground">載入中…</p>;
  }

  if (rows.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">這一檔沒有交易紀錄。</p>;
  }

  const totalGain = rows.reduce((sum, row) => sum + (row.pnl?.gain ?? 0), 0);

  return (
    <div>
      <p className="mb-2 text-sm font-medium">
        交易紀錄（{rows.length} 筆，損益合計{' '}
        <span className={gainTextClass(totalGain)}>{withSign(totalGain, formatCurrency(totalGain))}</span>
        ）
      </p>
      <DataTable
        tableId="stock-detail-transactions"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.tx.id}
      />
    </div>
  );
}
