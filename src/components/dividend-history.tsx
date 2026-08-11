'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import type { SerializedDividend } from '@/hooks/useDividends';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { NHI_MIN_PAYMENT, NHI_RATE } from '@/lib/nhi';

/** 配息紀錄的一列；就是 /api/dividends 回來的那筆（日期是字串） */
export type DividendRecord = SerializedDividend;

const dash = <span className="text-muted-foreground">-</span>;

/** 二代健保費那格的說明，滑過去就知道為什麼有扣／沒扣 */
function nhiHint(record: DividendRecord): string {
  const base = `給付金額 ${formatCurrency(record.nhiBase)}（現金 ${formatCurrency(record.income)}${
    record.sharesGained > 0
      ? ` ＋ 配股 ${record.sharesGained.toLocaleString()} 股以面額計 ${formatCurrency(
          record.nhiBase - record.income
        )}`
      : ''
  }）`;

  return record.nhiPremium > 0
    ? `${base}，達 ${formatCurrency(NHI_MIN_PAYMENT)} 門檻，就源扣繳 ${(NHI_RATE * 100).toFixed(
        2
      )}%`
    : `${base}，未達 ${formatCurrency(NHI_MIN_PAYMENT)} 門檻，免扣補充保費`;
}

/**
 * 配息紀錄的欄位定義。總覽頁展開的那一份與股利收入頁共用，
 * 兩邊的欄寬／順序設定也就跟著一致。
 */
export function dividendColumns(options: { showStock?: boolean } = {}): ColumnDef<DividendRecord>[] {
  const columns: ColumnDef<DividendRecord>[] = [];

  if (options.showStock) {
    columns.push({
      id: 'stock',
      header: '股票',
      width: 140,
      minWidth: 60,
      frozen: true,
      cell: (record) => (
        <span className="truncate" title={`${record.ticker} ${record.stockName}`}>
          <span className="font-medium">{record.ticker}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">{record.stockName}</span>
        </span>
      ),
    });
  }

  columns.push(
    {
      id: 'exDate',
      header: '除息日',
      headerText: '除權息交易日（這天起買進就領不到這次的股利）',
      width: 95,
      minWidth: 70,
      frozen: !options.showStock,
      cell: (record) => record.exDate.slice(0, 10),
    },
    {
      id: 'paymentDate',
      header: '發放日',
      headerText: '股利實際入帳日；Yahoo 沒有這個欄位，以除息日 +28 天推估',
      width: 95,
      minWidth: 70,
      className: 'text-muted-foreground',
      cell: (record) => record.paymentDate.slice(0, 10),
    },
    {
      id: 'amount',
      header: '每股配息',
      headerText: '每股現金股利（元）',
      width: 80,
      align: 'right',
      cell: (record) => record.amount.toFixed(2),
    },
    {
      id: 'stockPerShare',
      header: '股票股利',
      headerText: '每股股票股利（元）；面額 10 元，所以 1 元 = 每股配 0.1 股',
      width: 80,
      align: 'right',
      cell: (record) =>
        record.stockPerShare > 0 ? (
          <span title={`每 1,000 股配發 ${(record.stockPerShare * 100).toLocaleString()} 股`}>
            {record.stockPerShare.toFixed(2)}
          </span>
        ) : (
          dash
        ),
    },
    {
      id: 'sharesGained',
      header: '配股',
      headerText: '這次除權配到的股數（畸零股折現，無條件捨去）；會自動寫進交易紀錄',
      width: 75,
      align: 'right',
      cell: (record) =>
        record.sharesGained > 0 ? (
          <span className="font-medium">+{record.sharesGained.toLocaleString()}</span>
        ) : (
          dash
        ),
    },
    {
      id: 'priceBefore',
      header: '除權前股價',
      headerText: '除權息日前最後一個交易日的收盤價',
      width: 95,
      align: 'right',
      cell: (record) => (record.priceBefore != null ? record.priceBefore.toFixed(2) : dash),
    },
    {
      id: 'daysToFill',
      header: '填權天數',
      headerText:
        '從除權息日起算，第幾個交易日的還原價回到除權前股價；還原價 = 收盤價 ×（1 ＋ 股票股利 ÷ 10）＋ 現金股利',
      width: 85,
      align: 'right',
      cell: (record) =>
        record.daysToFill != null ? (
          `${record.daysToFill} 天`
        ) : (
          <span className="text-muted-foreground">未填權</span>
        ),
    },
    {
      id: 'yieldPercent',
      header: '殖利率',
      headerText: '單次現金殖利率 = 每股配息 ÷ 除權前股價',
      width: 75,
      align: 'right',
      cell: (record) =>
        record.yieldPercent != null ? formatPercent(record.yieldPercent) : dash,
    },
    {
      id: 'sharesHeld',
      header: '除息時持股',
      headerText: '除權息日前一交易日收盤時的持股數，股利就是照這個數字配的',
      width: 95,
      align: 'right',
      cell: (record) => record.sharesHeld.toLocaleString(),
    },
    {
      id: 'income',
      header: '股利收入',
      headerText: '現金股利 = 除息時持股 × 每股配息（未扣二代健保費）',
      width: 100,
      align: 'right',
      cell: (record) => formatCurrency(record.income),
    },
    {
      id: 'nhiPremium',
      header: '二代健保費',
      headerText: `單次給付達 ${formatCurrency(
        NHI_MIN_PAYMENT
      )} 就源扣繳 ${(NHI_RATE * 100).toFixed(2)}%；股票股利以面額 10 元併入給付金額`,
      width: 100,
      align: 'right',
      cell: (record) =>
        record.nhiPremium > 0 ? (
          <span className="text-muted-foreground" title={nhiHint(record)}>
            −{formatCurrency(record.nhiPremium)}
          </span>
        ) : (
          <span title={nhiHint(record)}>{dash}</span>
        ),
    },
    {
      id: 'netIncome',
      header: '實發股利',
      headerText: '實際入帳金額 = 股利收入 − 二代健保費',
      width: 105,
      align: 'right',
      className: 'font-medium',
      cell: (record) => formatCurrency(record.netIncome),
    }
  );

  return columns;
}

export function dividendRowKey(record: DividendRecord): string {
  return `${record.ticker}-${record.exDate}`;
}

/** 展開持股後的配息紀錄：我參與過的每一次除權息 */
export function DividendHistory({ records }: { records: DividendRecord[] }) {
  const columns = useMemo(() => dividendColumns(), []);
  const rows = useMemo(
    () => [...records].sort((a, b) => b.exDate.localeCompare(a.exDate)),
    [records]
  );

  if (records.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        尚無參與過的除權息紀錄。
      </p>
    );
  }

  const totalIncome = records.reduce((sum, record) => sum + record.income, 0);
  const totalNet = records.reduce((sum, record) => sum + record.netIncome, 0);
  const totalShares = records.reduce((sum, record) => sum + record.sharesGained, 0);

  return (
    <div
      className="rounded-md border bg-muted/30 p-3"
      // 這塊在總覽表格的展開列裡，整列跟表格一樣寬；點欄位設定或拖曳欄寬時
      // 不要讓事件冒泡上去把該列收起來
      onClick={(event) => event.stopPropagation()}
    >
      <p className="mb-2 text-sm font-medium">
        配息紀錄（{records.length} 次，累計 {formatCurrency(totalIncome)}，實發{' '}
        {formatCurrency(totalNet)}
        {totalShares > 0 && `，配股 ${totalShares.toLocaleString()} 股`}）
      </p>
      <DataTable
        tableId="dividend-history"
        columns={columns}
        rows={rows}
        rowKey={dividendRowKey}
      />
    </div>
  );
}
