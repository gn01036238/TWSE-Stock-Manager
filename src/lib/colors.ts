/**
 * 台股慣例配色：漲紅、跌綠。
 * 全站漲跌／損益的顏色都從這裡取，要換成美股慣例只需改這個檔案。
 */

export const UP_TEXT = 'text-red-500';
export const DOWN_TEXT = 'text-green-500';

/** SVG / canvas 用的色碼 */
export const UP_HEX = 'oklch(0.64 0.21 25)';
export const DOWN_HEX = 'oklch(0.72 0.19 149)';

export function gainTextClass(value: number): string {
  return value >= 0 ? UP_TEXT : DOWN_TEXT;
}

export function gainBadgeClass(value: number): string {
  return value >= 0
    ? 'bg-red-500/15 text-red-400 border-red-500/40'
    : 'bg-green-500/15 text-green-400 border-green-500/40';
}
