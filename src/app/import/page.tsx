'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Broker, Transaction } from '@/types';

interface PreviewData {
  preview: Omit<Transaction, 'id' | 'created_at'>[];
  counts: {
    total: number;
    buys: number;
    sells: number;
    dividends: number;
  };
  brokers: Broker[];
}

interface ImportResult {
  success: boolean;
  message: string;
  counts: {
    imported: number;
    buys: number;
    sells: number;
    dividends: number;
    skippedDividends: number;
  };
}

export default function ImportPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [selectedBroker, setSelectedBroker] = useState<string>('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setResult(null);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/import', {
        method: 'PUT', // Preview endpoint
        body: formData,
      });

      if (!response.ok) {
        throw new Error('預覽失敗');
      }

      const data: PreviewData = await response.json();
      setPreview(data);

      // Auto-select first broker if available
      if (data.brokers.length > 0 && !selectedBroker) {
        setSelectedBroker(data.brokers[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '預覽失敗');
      setPreview(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !selectedBroker) return;

    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('brokerId', selectedBroker);

      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '匯入失敗');
      }

      const data: ImportResult = await response.json();
      setResult(data);

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯入失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">匯入交易記錄</h1>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>使用說明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>上傳您的交易記錄 CSV 檔案，系統會自動解析並匯入。</p>
          <p className="text-sm text-muted-foreground">
            支援的 CSV 格式應包含以下欄位：交易日期、買/賣/股利、代號、股票、交易類別、買入股數、買入價格、賣出股數、賣出價格等。
          </p>
          <p className="text-sm text-blue-600">
            注意：股利記錄不會被匯入，因為系統會自動從網路取得股利資料。
          </p>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle>選擇檔案</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">CSV 檔案</Label>
            <input
              ref={fileInputRef}
              id="file"
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
          </div>

          {preview && (
            <div className="space-y-2">
              <Label htmlFor="broker">選擇券商</Label>
              <Select value={selectedBroker} onValueChange={setSelectedBroker}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇券商" />
                </SelectTrigger>
                <SelectContent>
                  {preview.brokers.map((broker) => (
                    <SelectItem key={broker.id} value={broker.id}>
                      {broker.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {preview && !result && (
        <Card>
          <CardHeader>
            <CardTitle>預覽</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">將匯入的交易</p>
                <p className="text-2xl font-bold">{preview.counts.total}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-md">
                <p className="text-sm text-green-600">買入</p>
                <p className="text-2xl font-bold text-green-700">{preview.counts.buys}</p>
              </div>
              <div className="p-3 bg-red-50 rounded-md">
                <p className="text-sm text-red-600">賣出</p>
                <p className="text-2xl font-bold text-red-700">{preview.counts.sells}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-600">股利 (略過)</p>
                <p className="text-2xl font-bold text-blue-700">{preview.counts.dividends}</p>
              </div>
            </div>

            {preview.preview.length > 0 && (
              <>
                <p className="text-sm text-muted-foreground">前 10 筆交易預覽：</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>日期</TableHead>
                      <TableHead>類型</TableHead>
                      <TableHead>股票</TableHead>
                      <TableHead className="text-right">股數</TableHead>
                      <TableHead className="text-right">價格</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.preview.map((tx, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{tx.transaction_date}</TableCell>
                        <TableCell>
                          {tx.transaction_type === 'BUY' ? '買入' : '賣出'}
                        </TableCell>
                        <TableCell>{tx.ticker}</TableCell>
                        <TableCell className="text-right">
                          {tx.quantity.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {tx.price.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}

            <div className="flex gap-4">
              <Button
                onClick={handleImport}
                disabled={isLoading || !selectedBroker}
              >
                {isLoading ? '匯入中...' : '確認匯入'}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card className="border-green-500">
          <CardHeader>
            <CardTitle className="text-green-600">匯入成功</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{result.message}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-green-50 rounded-md">
                <p className="text-sm text-green-600">已匯入</p>
                <p className="text-2xl font-bold text-green-700">
                  {result.counts.imported}
                </p>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">買入</p>
                <p className="text-2xl font-bold">{result.counts.buys}</p>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">賣出</p>
                <p className="text-2xl font-bold">{result.counts.sells}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-600">股利 (自動追蹤)</p>
                <p className="text-2xl font-bold text-blue-700">
                  {result.counts.skippedDividends}
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Button onClick={() => router.push('/')}>查看總覽</Button>
              <Button variant="outline" onClick={resetForm}>
                匯入更多
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
