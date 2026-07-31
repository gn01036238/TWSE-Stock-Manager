'use client';

import { useState } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkline } from '@/components/sparkline';
import { useIndexSymbols, useIndices } from '@/hooks/useIndices';
import { gainTextClass } from '@/lib/colors';

function formatIndexValue(value: number): string {
  return value.toLocaleString('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 單列指數條，刻意壓低高度，讓總覽首屏能看到持股表格 */
export function MarketIndices({ className = '' }: { className?: string }) {
  const { symbols, addSymbol, removeSymbol, resetSymbols, loaded } = useIndexSymbols();
  const { data, isLoading } = useIndices(loaded ? symbols : []);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);

  const submit = () => {
    addSymbol(draft);
    setDraft('');
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="text-xs text-muted-foreground">參考指數</span>

        {(loaded ? symbols : []).map((symbol) => {
          const quote = data?.[symbol];

          return (
            <div key={symbol} className="flex items-center gap-1.5">
              <span className="max-w-[9rem] truncate text-xs text-muted-foreground">
                {quote?.name ?? symbol}
              </span>
              {quote ? (
                <>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatIndexValue(quote.price)}
                  </span>
                  <span
                    className={`text-xs tabular-nums ${gainTextClass(quote.change)}`}
                  >
                    {quote.change >= 0 ? '+' : ''}
                    {quote.changePercent.toFixed(2)}%
                  </span>
                  <Sparkline
                    points={quote.points ?? []}
                    offsets={quote.offsets}
                    sessionMinutes={quote.sessionMinutes}
                    baseline={quote.previousClose}
                    width={52}
                    height={18}
                  />
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {isLoading ? '載入中…' : '查無資料'}
                </span>
              )}
              {editing && (
                <button
                  type="button"
                  onClick={() => removeSymbol(symbol)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`移除 ${symbol}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}

        <div className="ml-auto flex items-center gap-1">
          {editing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={resetSymbols}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              回預設
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? '完成' : '編輯'}
          </Button>
        </div>
      </div>

      {editing && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="輸入 Yahoo 代號，例如 ^IXIC、^N225、2330.TW"
            className="h-8 max-w-sm text-sm"
          />
          <Button size="sm" className="h-8" onClick={submit} disabled={!draft.trim()}>
            <Plus className="mr-1 h-3 w-3" />
            新增
          </Button>
        </div>
      )}
    </div>
  );
}
