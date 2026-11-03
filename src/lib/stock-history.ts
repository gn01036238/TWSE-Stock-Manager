import type { DailyBar, HistoryRange, InstitutionalFlow, MovingAverages } from '@/types';
import { fetchDailyBars } from './daily-bars';
import { isAfterTaipeiHour, taipeiDateKey } from './market';

/**
 * 個股詳細圖表的歷史資料：日 K 走 Yahoo（跟表格的迷你 K 棒同一份快取），
 * 三大法人與主力的逐日買賣超走富邦 DJ 的籌碼頁。
 *
 * - 法人（zcl）一次查一整段日期區間，一年份一個請求就回來
 * - 主力（zco）只能一天一天查：買超前 15 大券商合計 − 賣超前 15 大券商合計，
 *   定義跟總覽表格用的 Yahoo「主力進出」相同（Yahoo 那頁只有最新一天，沒有歷史）。
 *   已經過去的交易日不會再變，查過就一直留在記憶體裡
 */
const DJ_BASE = 'https://fubon-ebrokerdj.fbs.com.tw/z/zc';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 每個區間往回抓幾個日曆日 */
export const RANGE_DAYS: Record<HistoryRange, number> = {
  '1m': 31,
  '3m': 92,
  '6m': 183,
  '1y': 366,
};

export function isHistoryRange(value: string | null): value is HistoryRange {
  return value != null && value in RANGE_DAYS;
}

/**
 * 均線要往區間之前多抓的日曆日：年線要 240 個交易日，一年約 245 個交易日，
 * 再留過年長假的餘裕，區間最左邊那天的年線才算得出來
 */
const MA_WARMUP_DAYS = 380;
/** 法人一次抓一年多一點，所有區間共用同一個請求 */
const INSTITUTIONAL_LOOKBACK_DAYS = 380;
/** 法人約 16:00 才出當日資料 */
const INSTITUTIONAL_TTL = 10 * 60 * 1000;
/** 主力當日或還沒出來的日子，隔一陣子再問 */
const MAJOR_RETRY_TTL = 10 * 60 * 1000;
/** 主力逐日查，一次併發幾個請求 */
const MAJOR_CONCURRENCY = 6;

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
};

/** DJ 的頁面是 Big5 編碼 */
async function fetchDjPage(path: string): Promise<string | null> {
  try {
    const response = await fetch(`${DJ_BASE}/${path}`, {
      cache: 'no-store',
      headers: REQUEST_HEADERS,
    });
    if (!response.ok) throw new Error(`DJ ${response.status}`);
    return new TextDecoder('big5').decode(await response.arrayBuffer());
  } catch (error) {
    console.error(`Failed to fetch DJ page ${path}:`, error);
    return null;
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNum(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/** DJ 的日期參數不補零：2026-9-1 */
function djDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return `${year}-${month}-${day}`;
}

/** 民國年 115/09/11 → 2026-09-11 */
function fromRocDate(value: string): string | null {
  const match = value.match(/^(\d{2,3})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;
  return `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
}

/** 收盤價的 N 日簡單移動平均，與 bars 等長；前 N−1 根為 null */
function movingAverage(bars: DailyBar[], period: number): (number | null)[] {
  let sum = 0;
  return bars.map((bar, index) => {
    sum += bar.close;
    if (index >= period) sum -= bars[index - period].close;
    return index >= period - 1 ? sum / period : null;
  });
}

/**
 * 區間內的日 K 與月線、季線、20 週線、年線。長區間的快取比較久，最近兩個月改用
 * 常更新的那份蓋過去，最後一根（盤中還在跳）才不會停在幾個小時前；均線也跟著這根算。
 */
export async function fetchHistoryBars(
  ticker: string,
  range: HistoryRange
): Promise<(DailyBar & MovingAverages)[]> {
  const days = RANGE_DAYS[range] + MA_WARMUP_DAYS + 7;
  const [long, recent] = await Promise.all([fetchDailyBars(ticker, days), fetchDailyBars(ticker)]);

  const byDate = new Map<string, DailyBar>();
  for (const bar of [...long, ...recent]) byDate.set(bar.date, bar);
  const bars = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const ma20 = movingAverage(bars, 20);
  const ma60 = movingAverage(bars, 60);
  const ma100 = movingAverage(bars, 100);
  const ma240 = movingAverage(bars, 240);

  const cutoff = taipeiDateKey(new Date(Date.now() - RANGE_DAYS[range] * DAY_MS));
  return bars
    .map((bar, index) => ({
      ...bar,
      ma20: ma20[index],
      ma60: ma60[index],
      ma100: ma100[index],
      ma240: ma240[index],
    }))
    .filter((bar) => bar.date >= cutoff);
}

const institutionalCache = new Map<string, { at: number; value: Map<string, InstitutionalFlow> }>();

/** 近一年的逐日三大法人買賣超（張），key 是 YYYY-MM-DD */
export async function fetchInstitutionalHistory(
  ticker: string
): Promise<Map<string, InstitutionalFlow>> {
  const cached = institutionalCache.get(ticker);
  if (cached && Date.now() - cached.at < INSTITUTIONAL_TTL) return cached.value;

  const from = taipeiDateKey(new Date(Date.now() - INSTITUTIONAL_LOOKBACK_DAYS * DAY_MS));
  const html = await fetchDjPage(
    `zcl/zcl.djhtm?a=${encodeURIComponent(ticker)}&c=${djDate(from)}&d=${djDate(taipeiDateKey())}`
  );

  const flows = new Map<string, InstitutionalFlow>();

  for (const [, row] of (html ?? '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    // 欄位：日期、外資、投信、自營商、單日合計、（之後是估計持股與持股比重）
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => stripTags(cell[1]));
    const date = cells[0] ? fromRocDate(cells[0]) : null;
    if (!date || cells.length < 5) continue;

    const foreign = parseNum(cells[1]);
    const trust = parseNum(cells[2]);
    const dealer = parseNum(cells[3]);
    const total = parseNum(cells[4]);
    if (foreign == null || trust == null || dealer == null) continue;

    flows.set(date, { foreign, trust, dealer, total: total ?? foreign + trust + dealer });
  }

  // 抓失敗不要把空結果快取十分鐘，下次再試
  if (html) institutionalCache.set(ticker, { at: Date.now(), value: flows });
  return flows;
}

const majorCache = new Map<string, { at: number; value: number | null }>();

async function fetchMajorOnDate(ticker: string, date: string): Promise<number | null> {
  const key = `${ticker}:${date}`;
  const cached = majorCache.get(key);
  const isPast = date < taipeiDateKey();

  if (cached) {
    // 過去的交易日拿到數字就不會再變
    if (isPast && cached.value != null) return cached.value;
    if (Date.now() - cached.at < MAJOR_RETRY_TTL) return cached.value;
  }

  const html = await fetchDjPage(
    `zco/zco.djhtm?a=${encodeURIComponent(ticker)}&e=${djDate(date)}&f=${djDate(date)}`
  );
  if (html == null) return cached?.value ?? null;

  const text = stripTags(html);
  const totals = text.match(/合計買超張數\s*([\d,]+)\s*合計賣超張數\s*([\d,]+)/);
  // 頁面上會印出資料日期，對不上（例如休市日）就當沒資料
  const onDate = text.includes(date.replace(/-/g, '/'));

  const buy = parseNum(totals?.[1]);
  const sell = parseNum(totals?.[2]);
  const value = onDate && buy != null && sell != null ? buy - sell : null;

  majorCache.set(key, { at: Date.now(), value });
  return value;
}

/**
 * 指定交易日的主力買賣超（張）。當日要收盤後才有分點資料，盤中不去問。
 */
export async function fetchMajorHistory(
  ticker: string,
  dates: string[]
): Promise<Record<string, number | null>> {
  const today = taipeiDateKey();
  const flows: Record<string, number | null> = {};
  const pending = dates.filter((date) => {
    if (date === today && !isAfterTaipeiHour(15)) {
      flows[date] = null;
      return false;
    }
    return true;
  });

  for (let i = 0; i < pending.length; i += MAJOR_CONCURRENCY) {
    const batch = pending.slice(i, i + MAJOR_CONCURRENCY);
    const values = await Promise.all(batch.map((date) => fetchMajorOnDate(ticker, date)));
    batch.forEach((date, index) => {
      flows[date] = values[index];
    });
  }

  return flows;
}
