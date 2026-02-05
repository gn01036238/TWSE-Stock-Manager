'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTransactions, useCreateTransaction } from '@/hooks/useTransactions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { calculateCommission, calculateSellTax, isETF } from '@/lib/calculations';

export default function NewTransactionPage() {
  const router = useRouter();
  const { data } = useTransactions();
  const createTransaction = useCreateTransaction();

  const brokers = data?.brokers || [];

  const [formData, setFormData] = useState({
    broker_id: '',
    ticker: '',
    transaction_date: new Date().toISOString().split('T')[0],
    transaction_type: 'BUY' as 'BUY' | 'SELL',
    quantity: '',
    price: '',
    commission: '',
    tax: '',
    decision_reason: '',
  });

  const [autoCalcCommission, setAutoCalcCommission] = useState(true);
  const [autoCalcTax, setAutoCalcTax] = useState(true);

  // Auto-calculate commission and tax
  const updateAutoCalc = (
    quantity: string,
    price: string,
    brokerId: string,
    txType: 'BUY' | 'SELL',
    ticker: string
  ) => {
    const qty = parseFloat(quantity) || 0;
    const prc = parseFloat(price) || 0;
    const amount = qty * prc;

    if (autoCalcCommission && brokerId) {
      const broker = brokers.find((b) => b.id === brokerId);
      if (broker) {
        const commission = calculateCommission(
          amount,
          broker.commission_rate,
          broker.commission_discount
        );
        setFormData((prev) => ({
          ...prev,
          commission: Math.round(commission).toString(),
        }));
      }
    }

    if (autoCalcTax && txType === 'SELL') {
      const tax = calculateSellTax(amount, isETF(ticker));
      setFormData((prev) => ({
        ...prev,
        tax: Math.round(tax).toString(),
      }));
    } else if (txType === 'BUY') {
      setFormData((prev) => ({
        ...prev,
        tax: '0',
      }));
    }
  };

  const handleChange = (field: string, value: string) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);

    // Trigger auto-calc if relevant fields change
    if (['quantity', 'price', 'broker_id', 'transaction_type', 'ticker'].includes(field)) {
      updateAutoCalc(
        field === 'quantity' ? value : newData.quantity,
        field === 'price' ? value : newData.price,
        field === 'broker_id' ? value : newData.broker_id,
        (field === 'transaction_type' ? value : newData.transaction_type) as 'BUY' | 'SELL',
        field === 'ticker' ? value : newData.ticker
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createTransaction.mutateAsync({
        broker_id: formData.broker_id,
        ticker: formData.ticker.toUpperCase(),
        transaction_date: formData.transaction_date,
        transaction_type: formData.transaction_type,
        quantity: parseFloat(formData.quantity),
        price: parseFloat(formData.price),
        commission: parseFloat(formData.commission) || 0,
        tax: parseFloat(formData.tax) || 0,
        decision_reason: formData.decision_reason || undefined,
      });

      router.push('/transactions');
    } catch (error) {
      console.error('Failed to create transaction:', error);
      alert('新增交易失敗');
    }
  };

  const amount =
    (parseFloat(formData.quantity) || 0) * (parseFloat(formData.price) || 0);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">新增交易</h1>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>交易資訊</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="transaction_type">交易類型</Label>
                <Select
                  value={formData.transaction_type}
                  onValueChange={(v) => handleChange('transaction_type', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY">買入</SelectItem>
                    <SelectItem value="SELL">賣出</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="broker_id">券商</Label>
                <Select
                  value={formData.broker_id}
                  onValueChange={(v) => handleChange('broker_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇券商" />
                  </SelectTrigger>
                  <SelectContent>
                    {brokers.map((broker) => (
                      <SelectItem key={broker.id} value={broker.id}>
                        {broker.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ticker">股票代號</Label>
                <Input
                  id="ticker"
                  placeholder="例如: 2330"
                  value={formData.ticker}
                  onChange={(e) => handleChange('ticker', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="transaction_date">交易日期</Label>
                <Input
                  id="transaction_date"
                  type="date"
                  value={formData.transaction_date}
                  onChange={(e) => handleChange('transaction_date', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">股數</Label>
                <Input
                  id="quantity"
                  type="number"
                  placeholder="例如: 1000"
                  value={formData.quantity}
                  onChange={(e) => handleChange('quantity', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">價格</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  placeholder="例如: 500.00"
                  value={formData.price}
                  onChange={(e) => handleChange('price', e.target.value)}
                  required
                />
              </div>
            </div>

            {amount > 0 && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">
                  成交金額: <span className="font-semibold">NT${amount.toLocaleString()}</span>
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="commission">手續費</Label>
                  <label className="text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={autoCalcCommission}
                      onChange={(e) => setAutoCalcCommission(e.target.checked)}
                      className="mr-1"
                    />
                    自動計算
                  </label>
                </div>
                <Input
                  id="commission"
                  type="number"
                  value={formData.commission}
                  onChange={(e) => {
                    setAutoCalcCommission(false);
                    handleChange('commission', e.target.value);
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tax">
                    交易稅 {formData.transaction_type === 'BUY' && '(買入免稅)'}
                  </Label>
                  {formData.transaction_type === 'SELL' && (
                    <label className="text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={autoCalcTax}
                        onChange={(e) => setAutoCalcTax(e.target.checked)}
                        className="mr-1"
                      />
                      自動計算
                    </label>
                  )}
                </div>
                <Input
                  id="tax"
                  type="number"
                  value={formData.tax}
                  onChange={(e) => {
                    setAutoCalcTax(false);
                    handleChange('tax', e.target.value);
                  }}
                  disabled={formData.transaction_type === 'BUY'}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="decision_reason">備註 (選填)</Label>
              <Input
                id="decision_reason"
                placeholder="例如: 定期定額、換股..."
                value={formData.decision_reason}
                onChange={(e) => handleChange('decision_reason', e.target.value)}
              />
            </div>

            <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                disabled={createTransaction.isPending || !formData.broker_id}
              >
                {createTransaction.isPending ? '儲存中...' : '儲存交易'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                取消
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
