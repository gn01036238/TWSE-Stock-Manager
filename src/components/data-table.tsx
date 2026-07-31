'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Check, GripVertical, Pin, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTableLayout } from '@/hooks/useTableLayout';
import { cn } from '@/lib/utils';

export interface CellContext {
  /** 這一列是否展開（有 renderExpanded 時才有意義） */
  expanded: boolean;
}

export interface ColumnDef<T> {
  id: string;
  /** 表頭顯示內容 */
  header: React.ReactNode;
  /** 表頭的純文字，用在 tooltip 與欄位設定清單（表頭會截斷，滑過看得到全名） */
  headerText?: string;
  /** 預設欄寬（px），使用者調過之後以 localStorage 為準 */
  width: number;
  minWidth?: number;
  align?: 'left' | 'right';
  /** 預設凍結在左側 */
  frozen?: boolean;
  /** 預設隱藏 */
  hidden?: boolean;
  cell: (row: T, context: CellContext) => React.ReactNode;
  /** 整欄套用的 className（顏色、字體等） */
  className?: string;
}

interface DataTableProps<T> {
  /** localStorage 的 key，換了會讓使用者的欄位設定重來，不要隨便改 */
  tableId: string;
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  /** 表尾彙總列，例如加權指數 */
  footerRow?: T | null;
  /** 有回傳內容時該列可點擊展開（例如配息紀錄） */
  renderExpanded?: (row: T) => React.ReactNode | null;
  /** 放進欄位設定面板最上方的額外選項（例如「只顯示名稱」） */
  settingsExtra?: React.ReactNode;
  /** 列屬於哪一組；有給的話拖曳排序只能在同一組內進行，不能跨組 */
  rowGroup?: (row: T) => string;
  /** 有給的話最左邊會出現拖曳把手，可在同組內拖曳調整列順序 */
  onMoveRow?: (fromKey: string, toKey: string) => void;
}

const DRAG_THRESHOLD = 4;
const ROW_HANDLE_WIDTH = 22;

/**
 * 欄寬可拖曳、欄位可拖曳排序、可隱藏、可凍結的表格；設定存在瀏覽器，重開也還在。
 * 表頭本體拖曳 = 換順序，表頭右緣拖曳 = 改欄寬，右上齒輪 = 顯示/隱藏與凍結。
 */
export function DataTable<T>({
  tableId,
  columns,
  rows,
  rowKey,
  rowClassName,
  footerRow,
  renderExpanded,
  settingsExtra,
  rowGroup,
  onMoveRow,
}: DataTableProps<T>) {
  const defaults = useMemo(
    () => columns.map(({ id, width, minWidth, frozen, hidden }) => ({ id, width, minWidth, frozen, hidden })),
    [columns]
  );
  const { layout, setWidth, moveColumn, toggleHidden, toggleFrozen, reset, isCustomized } =
    useTableLayout(tableId, defaults);

  /** 依使用者順序排好的全部欄位（含隱藏的，欄位設定面板要用） */
  const ordered = useMemo(() => {
    const byId = new Map(columns.map((column) => [column.id, column]));
    return layout.order
      .map((id) => byId.get(id))
      .filter((column): column is ColumnDef<T> => column != null);
  }, [columns, layout.order]);

  const hiddenSet = useMemo(() => new Set(layout.hidden), [layout.hidden]);
  const frozenSet = useMemo(() => new Set(layout.frozen), [layout.frozen]);
  const visible = useMemo(
    () => ordered.filter((column) => !hiddenSet.has(column.id)),
    [ordered, hiddenSet]
  );

  const widthOf = (column: ColumnDef<T>) => layout.widths[column.id] ?? column.width;
  const totalWidth = visible.reduce((sum, column) => sum + widthOf(column), 0);

  /** 有拖曳把手時，凍結欄要讓出最左邊那一小欄的寬度 */
  const handleWidth = onMoveRow ? ROW_HANDLE_WIDTH : 0;

  /** 凍結欄位的 left 位移，以及最右邊那個凍結欄（要畫分界線） */
  const { offsets, lastFrozenId } = useMemo(() => {
    const map = new Map<string, number>();
    let accumulated = handleWidth;
    let last: string | null = null;

    for (const column of visible) {
      if (!frozenSet.has(column.id)) continue;
      map.set(column.id, accumulated);
      accumulated += layout.widths[column.id] ?? column.width;
      last = column.id;
    }

    return { offsets: map, lastFrozenId: last };
  }, [visible, frozenSet, layout.widths, handleWidth]);

  const headerRowRef = useRef<HTMLTableRowElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const overIdRef = useRef<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const [dragRowKey, setDragRowKey] = useState<string | null>(null);
  const [dragRowGroup, setDragRowGroup] = useState<string | null>(null);
  const [overRowKey, setOverRowKey] = useState<string | null>(null);
  const overRowKeyRef = useRef<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [settingsOpen]);

  const setOver = (id: string | null) => {
    overIdRef.current = id;
    setOverId(id);
  };

  function startResize(event: React.PointerEvent, id: string) {
    if (event.button !== 0) return;
    // 不要讓拖曳排序也跟著啟動
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = layout.widths[id] ?? 0;

    const onMove = (moveEvent: PointerEvent) => {
      setWidth(id, startWidth + moveEvent.clientX - startX);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startReorder(event: React.PointerEvent, id: string) {
    if (event.button !== 0) return;

    const row = headerRowRef.current;
    if (!row) return;

    // 拖曳中欄寬不會變，開始時量一次就夠；有拖曳把手欄的話表頭第一格要跳過
    const childOffset = onMoveRow ? 1 : 0;
    const rects = visible.map((column, index) => {
      const rect = (row.children[index + childOffset] as HTMLElement).getBoundingClientRect();
      return { id: column.id, left: rect.left, right: rect.right };
    });

    const state = { startX: event.clientX, active: false };

    const onMove = (moveEvent: PointerEvent) => {
      if (!state.active) {
        if (Math.abs(moveEvent.clientX - state.startX) < DRAG_THRESHOLD) return;
        state.active = true;
        setDragId(id);
      }
      const hit = rects.find(
        (rect) => moveEvent.clientX >= rect.left && moveEvent.clientX <= rect.right
      );
      setOver(hit && hit.id !== id ? hit.id : null);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (state.active && overIdRef.current) {
        moveColumn(id, overIdRef.current);
      }
      setDragId(null);
      setOver(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const setRowOver = (key: string | null) => {
    overRowKeyRef.current = key;
    setOverRowKey(key);
  };

  function startRowReorder(event: React.PointerEvent, row: T) {
    if (event.button !== 0 || !onMoveRow) return;
    event.preventDefault();
    event.stopPropagation();

    const key = rowKey(row);
    const group = rowGroup?.(row) ?? null;
    const body = bodyRef.current;
    if (!body) return;

    // 只量同一組的列，拖曳時就只會命中可以放的目標，天然限制不能跨組
    const candidates = rows
      .filter((r) => !rowGroup || rowGroup(r) === group)
      .map((r) => rowKey(r))
      .map((rKey) => {
        const el = body.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(rKey)}"]`);
        const rect = el?.getBoundingClientRect();
        return rect ? { key: rKey, top: rect.top, bottom: rect.bottom } : null;
      })
      .filter((c): c is { key: string; top: number; bottom: number } => c != null);

    const state = { startY: event.clientY, active: false };

    const onMove = (moveEvent: PointerEvent) => {
      if (!state.active) {
        if (Math.abs(moveEvent.clientY - state.startY) < DRAG_THRESHOLD) return;
        state.active = true;
        setDragRowKey(key);
        setDragRowGroup(group);
      }
      const hit = candidates.find(
        (candidate) => moveEvent.clientY >= candidate.top && moveEvent.clientY <= candidate.bottom
      );
      setRowOver(hit && hit.key !== key ? hit.key : null);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (state.active && overRowKeyRef.current) {
        onMoveRow(key, overRowKeyRef.current);
      }
      setDragRowKey(null);
      setDragRowGroup(null);
      setRowOver(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const frozenClass = (column: ColumnDef<T>) =>
    frozenSet.has(column.id) && [
      'sticky z-10 frozen-cell',
      lastFrozenId === column.id && 'frozen-edge',
    ];

  const frozenStyle = (column: ColumnDef<T>) =>
    frozenSet.has(column.id) ? { left: offsets.get(column.id) ?? 0 } : undefined;

  const renderCells = (row: T, expanded = false) =>
    visible.map((column) => (
      <TableCell
        key={column.id}
        style={frozenStyle(column)}
        className={cn(
          'overflow-hidden text-ellipsis',
          column.align === 'right' && 'text-right',
          frozenClass(column),
          column.className
        )}
      >
        {column.cell(row, { expanded })}
      </TableCell>
    ));

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-end gap-3">
        {isCustomized && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            重設欄位
          </button>
        )}

        <div className="relative" ref={settingsRef}>
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal className="h-3 w-3" />
            欄位
          </button>

          {settingsOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 max-h-96 w-60 overflow-y-auto rounded-md border bg-popover p-1.5 shadow-md">
              {settingsExtra && (
                <div className="border-b px-1 pb-1.5 pt-0.5">{settingsExtra}</div>
              )}

              <p className="px-1 py-1 text-[11px] text-muted-foreground">
                打勾＝顯示，圖釘＝凍結在左側
              </p>

              {ordered.map((column) => {
                const isVisible = !hiddenSet.has(column.id);
                const isFrozen = frozenSet.has(column.id);
                const label = column.headerText ?? column.id;

                return (
                  <div key={column.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleHidden(column.id)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-xs hover:bg-accent"
                      title={label}
                    >
                      <span
                        className={cn(
                          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                          isVisible ? 'bg-primary text-primary-foreground' : 'bg-transparent'
                        )}
                      >
                        {isVisible && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <span className={cn('truncate', !isVisible && 'text-muted-foreground')}>
                        {typeof column.header === 'string' ? column.header : label}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleFrozen(column.id)}
                      title={isFrozen ? '取消凍結' : '凍結在左側'}
                      className={cn(
                        'rounded p-1 hover:bg-accent',
                        isFrozen ? 'text-foreground' : 'text-muted-foreground/50'
                      )}
                    >
                      <Pin className={cn('h-3 w-3', isFrozen && 'fill-current')} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Table style={{ tableLayout: 'fixed', width: '100%', minWidth: totalWidth + handleWidth }}>
        <colgroup>
          {onMoveRow && <col style={{ width: handleWidth }} />}
          {visible.map((column) => (
            <col key={column.id} style={{ width: widthOf(column) }} />
          ))}
          {/* 視窗比欄位總寬還寬時，讓多出來的空間由這欄吸收，欄寬才不會被拉伸 */}
          <col />
        </colgroup>
        <TableHeader>
          <TableRow ref={headerRowRef} className="hover:bg-transparent">
            {onMoveRow && (
              <TableHead
                aria-hidden
                style={{ left: 0 }}
                className="sticky z-10 frozen-cell p-0"
              />
            )}
            {visible.map((column) => (
              <TableHead
                key={column.id}
                title={column.headerText}
                style={frozenStyle(column)}
                onPointerDown={(event) => startReorder(event, column.id)}
                className={cn(
                  'relative cursor-grab touch-pan-y select-none overflow-hidden align-bottom',
                  column.align === 'right' && 'text-right',
                  frozenClass(column),
                  dragId === column.id && 'opacity-40',
                  overId === column.id && 'bg-accent'
                )}
              >
                <div className="truncate">{column.header}</div>
                <span
                  onPointerDown={(event) => startResize(event, column.id)}
                  className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none bg-transparent hover:bg-primary/50"
                />
              </TableHead>
            ))}
            <TableHead aria-hidden />
          </TableRow>
        </TableHeader>
        <TableBody ref={bodyRef}>
          {rows.map((row) => {
            const key = rowKey(row);
            const expandedContent = renderExpanded?.(row) ?? null;
            const isExpanded = expandedContent != null && expandedKeys.has(key);
            const group = rowGroup?.(row) ?? null;
            const isDraggedOutOfGroup =
              dragRowKey != null && dragRowKey !== key && !!rowGroup && group !== dragRowGroup;

            return (
              <Fragment key={key}>
                <TableRow
                  data-row-key={key}
                  className={cn(
                    expandedContent != null && 'cursor-pointer',
                    dragRowKey === key && 'opacity-40',
                    overRowKey === key && 'bg-accent',
                    isDraggedOutOfGroup && 'opacity-30',
                    rowClassName?.(row)
                  )}
                  onClick={expandedContent != null ? () => toggleExpanded(key) : undefined}
                >
                  {onMoveRow && (
                    <TableCell
                      style={{ left: 0 }}
                      className="sticky z-10 frozen-cell cursor-grab touch-none p-0 text-center align-middle text-muted-foreground/50 hover:text-foreground"
                      onPointerDown={(event) => startRowReorder(event, row)}
                      onClick={(event) => event.stopPropagation()}
                      title="拖曳調整順序"
                    >
                      <GripVertical className="mx-auto h-3.5 w-3.5" />
                    </TableCell>
                  )}
                  {renderCells(row, isExpanded)}
                  <TableCell aria-hidden />
                </TableRow>

                {isExpanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={visible.length + 1 + (onMoveRow ? 1 : 0)} className="p-3">
                      {expandedContent}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
        {footerRow && (
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              {onMoveRow && (
                <TableCell aria-hidden style={{ left: 0 }} className="sticky z-10 frozen-cell p-0" />
              )}
              {renderCells(footerRow)}
              <TableCell aria-hidden />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
