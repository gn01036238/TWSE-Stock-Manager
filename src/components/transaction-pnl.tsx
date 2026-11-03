'use client';

import { formatCurrency, formatPercent } from '@/lib/calculations';
import { gainTextClass } from '@/lib/colors';
import type { StockPrice, TransactionPnL, TransactionType } from '@/types';

export const TYPE_LABEL: Record<TransactionType, string> = {
  BUY: '買入',
  SELL: '賣出',
  STOCK_DIVIDEND: '配股',
};

/** 配股是零成本入帳，用另一個底色跟真正的買賣分開 */
export const TYPE_BADGE: Record<TransactionType, 'default' | 'destructive' | 'secondary'> = {
  BUY: 'default',
  SELL: 'destructive',
  STOCK_DIVIDEND: 'secondary',
};

/** 正號要自己補，負數本身已經帶負號 */
export function withSign(value: number, text: string): string {
  return value > 0 ? `+${text}` : text;
}

/** 滑過損益數字就知道這個數字是怎麼來的 */
function pnlHint(
  pnl: TransactionPnL,
  type: TransactionType,
  price: StockPrice | undefined
): string {
  if (type === 'STOCK_DIVIDEND') {
    const at = price ? `，現價 ${price.price.toFixed(2)}` : '';
    return `配股沒有成本，還持有的 ${pnl.heldShares.toLocaleString()} 股整筆都是獲利${at}`;
  }

  if (type === 'SELL') {
    return `已實現 ${withSign(pnl.realized, formatCurrency(pnl.realized))}（賣出淨收入 − FIFO 買入成本 ${formatCurrency(
      pnl.basis
    )}，已扣手續費與交易稅）`;
  }

  const parts: string[] = [];

  if (pnl.soldShares > 0) {
    parts.push(
      `已實現 ${withSign(pnl.realized, formatCurrency(pnl.realized))}（這批已賣出 ${pnl.soldShares.toLocaleString()} 股）`
    );
  }

  if (pnl.heldShares > 0) {
    const base =
      pnl.unrealized != null
        ? `未實現 ${withSign(pnl.unrealized, formatCurrency(pnl.unrealized))}`
        : '未實現：抓不到現價';
    const at = price ? `，現價 ${price.price.toFixed(2)}` : '';
    parts.push(`${base}（還持有 ${pnl.heldShares.toLocaleString()} 股${at}）`);
  }

  return parts.join('；') || '尚未賣出也沒有現價';
}

/** 每筆交易的損益：金額＋報酬率，並標明是已實現還是未實現 */
export function PnLCell({
  pnl,
  type,
  price,
}: {
  pnl: TransactionPnL | undefined;
  type: TransactionType;
  price: StockPrice | undefined;
}) {
  if (!pnl || pnl.gain == null) {
    return <span className="text-muted-foreground">--</span>;
  }

  // 買入尚未賣出的部分還會浮動，標一下不是最終結果
  const label = type === 'SELL' ? '已實現' : pnl.heldShares > 0 ? '未實現' : '已實現';

  return (
    <span className={gainTextClass(pnl.gain)} title={pnlHint(pnl, type, price)}>
      <span className="block leading-tight">
        {withSign(pnl.gain, formatCurrency(pnl.gain))}
      </span>
      <span className="block text-[11px] leading-tight opacity-80">
        {pnl.gainPercent != null ? withSign(pnl.gainPercent, formatPercent(pnl.gainPercent)) : ''}
        <span className="ml-1 text-muted-foreground">{label}</span>
      </span>
    </span>
  );
}
