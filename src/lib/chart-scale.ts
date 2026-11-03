/**
 * 圖表座標軸的刻度：挑 1／2／2.5／5 × 10^n 這種好讀的間距，
 * 回傳落在 [min, max] 之間的刻度與建議的小數位數。
 */
export function niceTicks(
  min: number,
  max: number,
  count = 4
): { ticks: number[]; decimals: number } {
  const span = max - min;
  if (!(span > 0)) return { ticks: [min], decimals: 2 };

  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= raw) ??
    10 * magnitude;

  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }

  // 間距本身有幾位小數，標籤就顯示幾位（0.25 的間距要兩位，不然 42.25 會變成 42.3）
  const decimals = step.toFixed(10).replace(/\.?0+$/, '').split('.')[1]?.length ?? 0;
  return { ticks, decimals: Math.min(decimals, 2) };
}

/** 張數的精簡寫法，軸標籤用：12,345 → 1.2萬 */
export function formatCompactLots(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10000) return `${(value / 10000).toFixed(abs >= 100000 ? 0 : 1)}萬`;
  return Math.round(value).toLocaleString('zh-TW');
}
