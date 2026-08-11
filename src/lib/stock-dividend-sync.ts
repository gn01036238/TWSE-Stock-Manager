import type { Transaction } from '@/types';
import { CORPORATE_ACTIONS, sharesFromStockDividend, sharesPerLot } from './corporate-actions';
import { getSharesAtDate } from './dividends';
import { taipeiDateKey } from './market';
import { createTransactions } from './supabase';

/**
 * 把除權配到的股票補成一筆真的交易紀錄（類型 STOCK_DIVIDEND），
 * 持股數才會反映「除權後股數變多」這件事，而不是只出現在配息紀錄裡。
 *
 * - 只處理 lib/corporate-actions.ts 列到、而且除權日已經到了的除權息
 * - 以（代號 + 除權日）判斷有沒有補過，所以每次載入交易紀錄都跑一次也不會重複寫入
 * - 股數用除權日**前一天**的持股算（getSharesAtDate 是嚴格小於），畸零股無條件捨去
 * - price / commission / tax 都是 0：配股不花錢，成本不變、均價被稀釋
 */
export async function syncStockDividendTransactions(
  transactions: Transaction[]
): Promise<Omit<Transaction, 'id' | 'created_at'>[]> {
  const today = taipeiDateKey();
  const pending: Omit<Transaction, 'id' | 'created_at'>[] = [];

  for (const action of CORPORATE_ACTIONS) {
    if (action.stockPerShare <= 0 || action.exDate > today) continue;

    const own = transactions.filter((tx) => tx.ticker === action.ticker);
    if (own.length === 0) continue;

    const alreadyLogged = own.some(
      (tx) =>
        tx.transaction_type === 'STOCK_DIVIDEND' &&
        tx.transaction_date.slice(0, 10) === action.exDate
    );
    if (alreadyLogged) continue;

    const sharesHeld = getSharesAtDate(own, new Date(`${action.exDate}T00:00:00+08:00`));
    const quantity = sharesFromStockDividend(sharesHeld, action.stockPerShare);
    if (quantity <= 0) continue;

    // 沿用該檔最後一筆交易的券商，配股才會歸在同一個帳戶底下
    const brokerId = [...own]
      .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
      .at(-1)!.broker_id;

    pending.push({
      broker_id: brokerId,
      ticker: action.ticker,
      transaction_date: action.exDate,
      transaction_type: 'STOCK_DIVIDEND',
      quantity,
      price: 0,
      commission: 0,
      tax: 0,
      decision_reason:
        `除權配股：每股股票股利 ${action.stockPerShare} 元（每 1,000 股配發 ${sharesPerLot(
          action.stockPerShare
        )} 股），除權前持有 ${sharesHeld.toLocaleString()} 股`,
    });
  }

  if (pending.length === 0) return [];

  await createTransactions(pending);
  return pending;
}
