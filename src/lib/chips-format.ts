import type { ChipRow, PriceVolumePattern } from '@/types';

export const PATTERN_LABEL: Record<PriceVolumePattern, string> = {
  'up-expand': '價漲量增',
  'up-shrink': '價漲量縮',
  'down-expand': '價跌量增',
  'down-shrink': '價跌量縮',
  unknown: '--',
};

/**
 * 把價量型態拆成「價」「量」兩個方向，畫面只顯示這兩個字、用漲跌色表達方向。
 * null 代表沒資料（unknown）。
 */
export function patternDirection(pattern: PriceVolumePattern): {
  /** true = 價漲 */
  priceUp: boolean | null;
  /** true = 量增 */
  volumeUp: boolean | null;
} {
  switch (pattern) {
    case 'up-expand':
      return { priceUp: true, volumeUp: true };
    case 'up-shrink':
      return { priceUp: true, volumeUp: false };
    case 'down-expand':
      return { priceUp: false, volumeUp: true };
    case 'down-shrink':
      return { priceUp: false, volumeUp: false };
    default:
      return { priceUp: null, volumeUp: null };
  }
}

/** 成交量（張） */
export function formatLots(value: number | null | undefined): string {
  if (value == null) return '--';
  return Math.round(value).toLocaleString('zh-TW');
}

/** 個股買賣超單位為張，大盤為億元 */
export function formatFlow(value: number | undefined, unit: ChipRow['flowUnit']): string {
  if (value == null) return '--';
  if (unit === 'yi') {
    return `${value >= 0 ? '' : '-'}${Math.abs(value).toFixed(1)} 億`;
  }
  return Math.round(value).toLocaleString('zh-TW');
}
