'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatPercent } from '@/lib/calculations';

export interface DividendRecord {
  exDate: string;
  paymentDate: string;
  amount: number;
  yieldPercent?: number;
  sharesHeld: number;
  income: number;
}

/** 展開持股後的配息紀錄：我參與過的每一次除權息 */
export function DividendHistory({ records }: { records: DividendRecord[] }) {
  if (records.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        尚無參與過的除權息紀錄。
      </p>
    );
  }

  const totalIncome = records.reduce((sum, record) => sum + record.income, 0);

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="mb-2 text-sm font-medium">
        配息紀錄（{records.length} 次，累計 {formatCurrency(totalIncome)}）
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>除息日</TableHead>
            <TableHead className="text-right">每股配息</TableHead>
            <TableHead className="text-right">殖利率</TableHead>
            <TableHead className="text-right">除息時持股</TableHead>
            <TableHead className="text-right">領取金額</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...records]
            .sort((a, b) => b.exDate.localeCompare(a.exDate))
            .map((record) => (
              <TableRow key={`${record.exDate}-${record.amount}`}>
                <TableCell>{record.exDate.slice(0, 10)}</TableCell>
                <TableCell className="text-right">{record.amount.toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  {record.yieldPercent != null ? formatPercent(record.yieldPercent) : '-'}
                </TableCell>
                <TableCell className="text-right">
                  {record.sharesHeld.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(record.income)}
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}
