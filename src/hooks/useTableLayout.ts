'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export interface ColumnLayoutDefault {
  id: string;
  width: number;
  minWidth?: number;
  /** 預設是否凍結（橫向捲動時固定在左邊） */
  frozen?: boolean;
  /** 預設是否隱藏 */
  hidden?: boolean;
}

export interface TableLayout {
  order: string[];
  widths: Record<string, number>;
  /** 隱藏的欄位 id */
  hidden: string[];
  /** 凍結的欄位 id */
  frozen: string[];
}

const STORAGE_VERSION = 1;
const FALLBACK_MIN_WIDTH = 48;

function storageKey(tableId: string): string {
  return `twse:table-layout:v${STORAGE_VERSION}:${tableId}`;
}

function buildDefault(defaults: ColumnLayoutDefault[]): TableLayout {
  return {
    order: defaults.map((column) => column.id),
    widths: Object.fromEntries(defaults.map((column) => [column.id, column.width])),
    hidden: defaults.filter((column) => column.hidden).map((column) => column.id),
    frozen: defaults.filter((column) => column.frozen).map((column) => column.id),
  };
}

/**
 * 合併已存的設定與目前的欄位定義：認不出來的欄位丟掉，
 * 新增的欄位補在最後面並用預設值，這樣改欄位不會讓舊設定整組失效。
 */
function mergeStored(
  stored: Partial<TableLayout> | null,
  defaults: ColumnLayoutDefault[]
): TableLayout {
  const fallback = buildDefault(defaults);
  if (!stored) return fallback;

  const known = new Set(fallback.order);
  const order = (stored.order ?? []).filter((id) => known.has(id));
  for (const id of fallback.order) {
    if (!order.includes(id)) order.push(id);
  }

  const widths: Record<string, number> = {};
  for (const column of defaults) {
    const saved = stored.widths?.[column.id];
    const min = column.minWidth ?? FALLBACK_MIN_WIDTH;
    widths[column.id] =
      typeof saved === 'number' && Number.isFinite(saved) ? Math.max(min, saved) : column.width;
  }

  const keepKnown = (ids: string[] | undefined, defaultIds: string[]) =>
    ids ? ids.filter((id) => known.has(id)) : defaultIds;

  return {
    order,
    widths,
    hidden: keepKnown(stored.hidden, fallback.hidden),
    frozen: keepKnown(stored.frozen, fallback.frozen),
  };
}

function readStored(tableId: string): Partial<TableLayout> | null {
  try {
    const raw = window.localStorage.getItem(storageKey(tableId));
    return raw ? (JSON.parse(raw) as Partial<TableLayout>) : null;
  } catch {
    return null;
  }
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

/**
 * 表格的欄寬、欄位順序、隱藏與凍結設定，存在 localStorage 所以關掉瀏覽器再開也還在。
 * 刻意在 mount 後才讀取，避免 SSR 與首次 render 不一致。
 */
export function useTableLayout(tableId: string, defaults: ColumnLayoutDefault[]) {
  // defaults 每次 render 都是新陣列，用內容當相依值
  const signature = useMemo(
    () =>
      defaults
        .map((column) => `${column.id}:${column.width}:${column.frozen ? 1 : 0}:${column.hidden ? 1 : 0}`)
        .join('|'),
    [defaults]
  );

  const [layout, setLayout] = useState<TableLayout>(() => buildDefault(defaults));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLayout(mergeStored(readStored(tableId), defaults));
    setLoaded(true);
    // defaults 以 signature 代表
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, signature]);

  // 拖曳欄寬時每次 pointermove 都會改狀態，稍微延後再寫，免得一直敲 localStorage
  useEffect(() => {
    if (!loaded) return;

    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey(tableId), JSON.stringify(layout));
      } catch {
        // 無痕模式或空間不足：記不起來就算了，不影響顯示
      }
    }, 150);

    return () => window.clearTimeout(timer);
  }, [tableId, layout, loaded]);

  const minWidths = useMemo(
    () =>
      Object.fromEntries(
        defaults.map((column) => [column.id, column.minWidth ?? FALLBACK_MIN_WIDTH])
      ),
    [defaults]
  );

  const setWidth = useCallback(
    (id: string, width: number) => {
      setLayout((prev) => {
        const min = minWidths[id] ?? FALLBACK_MIN_WIDTH;
        const next = Math.max(min, Math.round(width));
        if (prev.widths[id] === next) return prev;
        return { ...prev, widths: { ...prev.widths, [id]: next } };
      });
    },
    [minWidths]
  );

  /** 把 fromId 移到 toId 現在的位置 */
  const moveColumn = useCallback((fromId: string, toId: string) => {
    setLayout((prev) => {
      const order = [...prev.order];
      const from = order.indexOf(fromId);
      const to = order.indexOf(toId);
      if (from < 0 || to < 0 || from === to) return prev;
      order.splice(from, 1);
      order.splice(to, 0, fromId);
      return { ...prev, order };
    });
  }, []);

  const toggleHidden = useCallback((id: string) => {
    setLayout((prev) => {
      // 全部藏起來就沒東西看了，至少留一欄
      const next = toggle(prev.hidden, id);
      if (next.length >= prev.order.length) return prev;
      return { ...prev, hidden: next };
    });
  }, []);

  const toggleFrozen = useCallback((id: string) => {
    setLayout((prev) => ({ ...prev, frozen: toggle(prev.frozen, id) }));
  }, []);

  const reset = useCallback(() => {
    setLayout(buildDefault(defaults));
    try {
      window.localStorage.removeItem(storageKey(tableId));
    } catch {
      // 同上
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, signature]);

  const isCustomized = useMemo(() => {
    const fallback = buildDefault(defaults);
    const sameSet = (a: string[], b: string[]) =>
      a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

    return (
      fallback.order.join('|') !== layout.order.join('|') ||
      fallback.order.some((id) => fallback.widths[id] !== layout.widths[id]) ||
      !sameSet(fallback.hidden, layout.hidden) ||
      !sameSet(fallback.frozen, layout.frozen)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, signature]);

  return { layout, setWidth, moveColumn, toggleHidden, toggleFrozen, reset, isCustomized };
}
