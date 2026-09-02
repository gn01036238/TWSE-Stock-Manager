import YahooFinance from 'yahoo-finance2';

/**
 * yahoo-finance2 v3 必須先建立實例（v2 的預設匯出直接呼叫會 throw）。
 * 全專案共用同一個實例。
 */
type YahooClient = InstanceType<typeof YahooFinance>;

let client: YahooClient | null = null;

export function getYahooClient(): YahooClient {
  if (!client) {
    client = new YahooFinance({
      suppressNotices: ['yahooSurvey', 'ripHistorical'],
      validation: { logErrors: false },
    });
  }
  return client;
}

/** 上市 .TW，上櫃 .TWO */
export function toYahooSymbols(ticker: string): string[] {
  return [`${ticker}.TW`, `${ticker}.TWO`];
}

/**
 * Yahoo 查不到這檔（已下市／已合併，或只是我們猜錯後綴：上市股問 .TWO 一定會中）
 * 時丟的錯誤。這是預期狀況，每次輪詢都會再問一次、再噴一次，不用洗 console。
 */
export function isSymbolNotFound(error: unknown): boolean {
  return error instanceof Error && /No data found, symbol may be delisted/.test(error.message);
}
