/**
 * 觀察清單存 Yahoo 代號格式（跟參考指標一致）：上市 .TW、上櫃 .TWO 視為台股，
 * 沿用跟持股一樣的 TWSE 籌碼／日K／即時走勢；其餘一律當成 Yahoo 報價（美股等）。
 */
export function isTwWatchlistSymbol(symbol: string): boolean {
  return /\.(TW|TWO)$/i.test(symbol);
}

/** 從 Yahoo 代號還原成 TWSE 端用的純代號，例如 2330.TW → 2330 */
export function twTickerFromSymbol(symbol: string): string {
  return symbol.replace(/\.(TW|TWO)$/i, '');
}
