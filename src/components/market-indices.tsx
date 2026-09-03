'use client';

import { useRef, useState } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkline } from '@/components/sparkline';
import { useIndexSymbols, useIndices } from '@/hooks/useIndices';
import { useMargin } from '@/hooks/useMargin';
import { cn } from '@/lib/utils';
import { gainTextClass } from '@/lib/colors';

/** 移動超過這個距離才算拖曳，免得單純點一下就重排 */
const DRAG_THRESHOLD = 4;

function formatIndexValue(value: number): string {
  return value.toLocaleString('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 資券餘額借用指數條的格式：名稱 + 今日餘額 + 增減率，不畫走勢圖 */
function MarginChip({
  label,
  value,
  changePercent,
}: {
  label: string;
  value: string;
  changePercent: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className={`text-xs tabular-nums ${gainTextClass(changePercent)}`}>
        {changePercent >= 0 ? '+' : ''}
        {changePercent.toFixed(2)}%
      </span>
    </div>
  );
}

/** 單列指數條，刻意壓低高度，讓總覽首屏能看到持股表格 */
export function MarketIndices({ className = '' }: { className?: string }) {
  const { symbols, addSymbol, removeSymbol, moveSymbol, resetSymbols, loaded } =
    useIndexSymbols();
  const { data, isLoading } = useIndices(loaded ? symbols : []);
  const { data: margin } = useMargin();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);

  const rowRef = useRef<HTMLDivElement>(null);
  const [dragSymbol, setDragSymbol] = useState<string | null>(null);
  const [overSymbol, setOverSymbol] = useState<string | null>(null);
  // onUp 是原生事件的 closure，讀不到最新的 state，另外用 ref 記一份
  const overRef = useRef<string | null>(null);

  const setOver = (symbol: string | null) => {
    overRef.current = symbol;
    setOverSymbol(symbol);
  };

  const submit = () => {
    addSymbol(draft);
    setDraft('');
  };

  function startReorder(event: React.PointerEvent, symbol: string) {
    if (event.button !== 0) return;

    const row = rowRef.current;
    if (!row) return;

    // 指標條會換行，命中判斷要同時看 X 與 Y；拖曳中版面不變，開始時量一次就夠
    const rects = symbols
      .map((s) => {
        const el = row.querySelector<HTMLElement>(`[data-index-symbol="${CSS.escape(s)}"]`);
        const rect = el?.getBoundingClientRect();
        return rect ? { symbol: s, rect } : null;
      })
      .filter((r): r is { symbol: string; rect: DOMRect } => r != null);

    const state = { startX: event.clientX, startY: event.clientY, active: false };

    const onMove = (moveEvent: PointerEvent) => {
      if (!state.active) {
        const moved = Math.hypot(
          moveEvent.clientX - state.startX,
          moveEvent.clientY - state.startY
        );
        if (moved < DRAG_THRESHOLD) return;
        state.active = true;
        setDragSymbol(symbol);
      }
      const hit = rects.find(
        ({ rect }) =>
          moveEvent.clientX >= rect.left &&
          moveEvent.clientX <= rect.right &&
          moveEvent.clientY >= rect.top &&
          moveEvent.clientY <= rect.bottom
      );
      setOver(hit && hit.symbol !== symbol ? hit.symbol : null);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (state.active && overRef.current) {
        moveSymbol(symbol, overRef.current);
      }
      setDragSymbol(null);
      setOver(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <div className={className}>
      <div ref={rowRef} className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="text-xs text-muted-foreground">參考指標</span>

        {(loaded ? symbols : []).map((symbol) => {
          const quote = data?.[symbol];

          return (
            <div
              key={symbol}
              data-index-symbol={symbol}
              onPointerDown={(event) => startReorder(event, symbol)}
              className={cn(
                'flex cursor-grab touch-pan-y items-center gap-1.5 rounded select-none',
                dragSymbol === symbol && 'opacity-40',
                // outline 畫在框外，底色才有留白又不會把旁邊的指標推開
                overSymbol === symbol && 'bg-accent outline-4 outline-accent'
              )}
            >
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
                  {/* 這條只有 52px 寬。台股若照 09:00–13:30 的固定時間軸畫，盤中
                      就只填得到左邊一小截，跟旁邊平均分佈的國外指數看起來不齊，
                      所以指標條一律平均分佈，每格都用滿整個寬度 */}
                  <Sparkline
                    points={quote.points ?? []}
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
                  onPointerDown={(event) => event.stopPropagation()}
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

        {margin && (
          <>
            <MarginChip
              label="資餘(億元)"
              value={formatIndexValue(margin.margin.value)}
              changePercent={margin.margin.changePercent}
            />
            <MarginChip
              label="券餘(張數)"
              value={margin.short.value.toLocaleString('zh-TW')}
              changePercent={margin.short.changePercent}
            />
          </>
        )}

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
