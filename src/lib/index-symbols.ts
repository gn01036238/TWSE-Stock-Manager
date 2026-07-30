/**
 * 參考指數的常數。獨立成一檔，避免 client 元件為了取這些值
 * 而把 lib/indices.ts（會 import yahoo-finance2）打包進瀏覽器。
 */

/** 常用指數的中文名稱；查不到就用 Yahoo 的英文簡稱 */
export const INDEX_NAMES: Record<string, string> = {
  '^TWII': '台股加權指數',
  '^SOX': '費城半導體',
  '^KS11': '韓國 KOSPI',
  '^IXIC': '那斯達克',
  '^GSPC': 'S&P 500',
  '^DJI': '道瓊工業',
  '^N225': '日經 225',
  '^HSI': '恒生指數',
};

/** 總覽預設顯示的參考指數 */
export const DEFAULT_INDEX_SYMBOLS = ['^TWII', '^SOX', '^KS11'];
