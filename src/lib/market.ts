export type MarketStatus = 'pre' | 'open' | 'closed' | 'weekend';

const MARKET_OPEN_MINUTES = 9 * 60; // 09:00
const MARKET_CLOSE_MINUTES = 13 * 60 + 30; // 13:30
const SESSION_MINUTES = MARKET_CLOSE_MINUTES - MARKET_OPEN_MINUTES; // 270

function taipeiClock(now: Date): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';

  return {
    weekday: get('weekday'),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/**
 * TWSE 交易時段判斷，一律以台北時間計算（不受使用者裝置時區影響）。
 * 註：不含國定假日 / 颱風假，僅以星期與時間判斷。
 */
export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const { weekday, minutes } = taipeiClock(now);

  if (weekday === 'Sat' || weekday === 'Sun') return 'weekend';
  if (minutes < MARKET_OPEN_MINUTES) return 'pre';
  if (minutes <= MARKET_CLOSE_MINUTES) return 'open';
  return 'closed';
}

/**
 * 盤中經過的時間比例（0~1）。量比要把「開盤才半小時」的成交量
 * 換算成全日速度才能跟均量比較，非交易時段一律當 1（全日）。
 */
export function getSessionProgress(now: Date = new Date()): number {
  const status = getMarketStatus(now);
  if (status !== 'open') return status === 'pre' ? 0 : 1;

  const { minutes } = taipeiClock(now);
  const elapsed = minutes - MARKET_OPEN_MINUTES;
  return Math.min(1, Math.max(elapsed / SESSION_MINUTES, 1 / SESSION_MINUTES));
}

/**
 * 台北時間是否已過某個整點。收盤資料（法人、分點）最早也要收盤後才會出來，
 * 用這個避免整個上午都在空轉重抓。
 */
export function isAfterTaipeiHour(hour: number, now: Date = new Date()): boolean {
  return taipeiClock(now).minutes >= hour * 60;
}

/** 台北時區的 YYYY-MM-DD */
export function taipeiDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * 最新交易日（台北時區 YYYY-MM-DD）。盤前與週末會退回上一個交易日，
 * 這樣「今日買入」的判斷才不會在星期六把週五的成交當成昨天的持股。
 * 註：同 getMarketStatus，不含國定假日；有行情資料回傳的交易日時以那個為準。
 */
export function latestTradingDateKey(now: Date = new Date()): string {
  const DAY_MS = 24 * 60 * 60 * 1000;
  // 盤前的「今天」還沒開盤，基準日要算前一個交易日
  let cursor = getMarketStatus(now) === 'pre' ? new Date(now.getTime() - DAY_MS) : now;

  for (let i = 0; i < 7; i++) {
    const { weekday } = taipeiClock(cursor);
    if (weekday !== 'Sat' && weekday !== 'Sun') break;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  return taipeiDateKey(cursor);
}

export const MARKET_STATUS_LABEL: Record<MarketStatus, string> = {
  pre: '盤前',
  open: '盤中',
  closed: '已收盤',
  weekend: '休市',
};

export function formatTaipeiTime(date: Date): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}
