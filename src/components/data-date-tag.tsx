/**
 * 收盤資料的日期標籤。當日資料上線前會停在前一個交易日，
 * 用顏色跟文字直接標出來，免得看錯成今天的籌碼。
 */
export function DataDateTag({
  label,
  date,
  tradingDate,
}: {
  label: string;
  date: string | null | undefined;
  tradingDate: string | null | undefined;
}) {
  const isLatest = date != null && date === tradingDate;
  const status = date == null ? '無資料' : isLatest ? '當日收盤' : '前一交易日';
  const className = isLatest
    ? 'border-border text-muted-foreground'
    : 'border-amber-500/50 text-amber-600 dark:text-amber-400';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${className}`}
    >
      <span className="font-medium">{label}</span>
      <span className="tabular-nums">{date ? date.slice(5).replace('-', '/') : '--'}</span>
      <span>· {status}</span>
    </span>
  );
}
