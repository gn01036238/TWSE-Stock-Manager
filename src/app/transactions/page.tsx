'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTransactions, useDeleteTransaction } from '@/hooks/useTransactions';
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
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/calculations';
import type { Transaction, Broker } from '@/types';

export default function TransactionsPage() {
  const { data, isLoading, error } = useTransactions();
  const deleteTransaction = useDeleteTransaction();

  const [filterTicker, setFilterTicker] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterBroker, setFilterBroker] = useState<string>('all');

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

  const transactions = data?.transactions || [];
  const brokers = data?.brokers || [];

  const brokerMap = new Map<string, Broker>();
  brokers.forEach((b) => brokerMap.set(b.id, b));

  // Filter transactions
  const filteredTransactions = transactions.filter((tx) => {
    if (filterTicker && !tx.ticker.toLowerCase().includes(filterTicker.toLowerCase())) {
      return false;
    }
    if (filterType !== 'all' && tx.transaction_type !== filterType) {
      return false;
    }
    if (filterBroker !== 'all' && tx.broker_id !== filterBroker) {
      return false;
    }
    return true;
  });

  const handleDelete = async (id: string) => {
    if (confirm('確定要刪除此筆交易嗎？')) {
      deleteTransaction.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">交易記錄</h1>
        <Link href="/transactions/new">
          <Button>新增交易</Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="搜尋股票代號..."
                value={filterTicker}
                onChange={(e) => setFilterTicker(e.target.value)}
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="交易類型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部類型</SelectItem>
                <SelectItem value="BUY">買入</SelectItem>
                <SelectItem value="SELL">賣出</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterBroker} onValueChange={setFilterBroker}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="券商" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部券商</SelectItem>
                {brokers.map((broker) => (
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
          <CardTitle>交易記錄 ({filteredTransactions.length})</CardTitle>
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
                  <TableHead>股票</TableHead>
                  <TableHead className="text-right">股數</TableHead>
                  <TableHead className="text-right">價格</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead>券商</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{tx.transaction_date}</TableCell>
                    <TableCell>
                      <Badge
                        variant={tx.transaction_type === 'BUY' ? 'default' : 'destructive'}
                      >
                        {tx.transaction_type === 'BUY' ? '買入' : '賣出'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{tx.ticker}</TableCell>
                    <TableCell className="text-right">
                      {tx.quantity.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {tx.price.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(tx.quantity * tx.price)}
                    </TableCell>
                    <TableCell>
                      {brokerMap.get(tx.broker_id)?.name || '-'}
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
    </div>
  );
}
