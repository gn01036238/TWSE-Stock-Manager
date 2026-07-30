import type { ChipRow, PriceVolumePattern } from '@/types';

export const PATTERN_LABEL: Record<PriceVolumePattern, string> = {
  'up-expand': '價漲量增',
  'up-shrink': '價漲量縮',
  'down-expand': '價跌量增',
  'down-shrink': '價跌量縮',
  unknown: '--',
};

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
