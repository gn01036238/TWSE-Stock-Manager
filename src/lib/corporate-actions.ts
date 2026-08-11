/**
 * 手動維護的除權息事件。
 *
 * Yahoo 的 chart events 只給得到現金股利，**股票股利（配股）它沒有可靠的來源**
 * （台股的配股在 Yahoo 有時被記成 split、有時整個缺漏），所以配股一律以這份清單為準。
 * 這裡列到的除權息會蓋掉 Yahoo 同一天的數字，沒列到的仍然照 Yahoo 走。
 *
 * 新增一次除權息只要在這裡加一筆，配息紀錄的欄位與交易紀錄裡的「配股」都會自動跟上。
 */
export interface CorporateAction {
  ticker: string;
  /** 除權息交易日（台北時區 YYYY-MM-DD） */
  exDate: string;
  /** 每股現金股利（元） */
  cashPerShare: number;
  /** 每股股票股利（元）；面額 10 元，所以 1 元 = 每股配 0.1 股 */
  stockPerShare: number;
  note?: string;
}

/** 股票面額，配股股數 = 持股 × 每股股票股利 ÷ 面額 */
export const PAR_VALUE = 10;

export const CORPORATE_ACTIONS: CorporateAction[] = [
  {
    ticker: '2887',
    exDate: '2026-07-21',
    cashPerShare: 1,
    stockPerShare: 0.1,
    note: '台新新光金 2026 年除權息：每股現金股利 1 元、股票股利 0.1 元（每千股配發 10 股）',
  },
];

export function corporateActionsFor(ticker: string): CorporateAction[] {
  return CORPORATE_ACTIONS.filter((action) => action.ticker === ticker);
}

/** 配發的股數；不足一股的畸零股由公司折發現金，所以無條件捨去 */
export function sharesFromStockDividend(sharesHeld: number, stockPerShare: number): number {
  if (sharesHeld <= 0 || stockPerShare <= 0) return 0;
  return Math.floor((sharesHeld * stockPerShare) / PAR_VALUE);
}

/** 每 1,000 股配發幾股，寫在說明文字裡比「每股 0.1 元」好懂 */
export function sharesPerLot(stockPerShare: number): number {
  return (stockPerShare / PAR_VALUE) * 1000;
}
