import type { MajorTraderFlow } from '@/types';
import { isAfterTaipeiHour } from './market';

/**
 * 主力買賣超 = 當日買超前 15 大券商合計 − 賣超前 15 大券商合計。
 *
 * 原始的券商分點資料只在證交所 BSR 系統提供，且每次查詢都要過驗證碼，
 * 沒辦法直接程式化取得。這裡改用 Yahoo 股市的「主力進出」頁，
 * 它已經把分點資料彙總成同一個定義的數字（本專案的股利與日線也是取自 Yahoo）。
 */
const PAGE_URL = 'https://tw.stock.yahoo.com/quote';

/** 分點資料一天只更新一次，已經拿到最新交易日就不用再問 */
const CACHE_TTL = 10 * 60 * 1000;
/** 收盤後還停在前一個交易日時縮短快取，當日資料一上線就能盡快換過來 */
const STALE_CACHE_TTL = 3 * 60 * 1000;
/** 一次併發抓幾檔，避免對 Yahoo 連續打太多請求 */
const BATCH_SIZE = 5;

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  'Accept-Language': 'zh-TW,zh;q=0.9',
};

export interface MajorTraderFlows {
  /** 資料所屬交易日，台北時區 YYYY-MM-DD；抓不到任何一檔時為 null */
  date: string | null;
  /** 個股主力買賣超，單位：張 */
  flows: Map<string, MajorTraderFlow>;
}

const cache = new Map<string, { at: number; value: MajorTraderFlow | null }>();

/** 標籤換成換行，數字才不會跟 class 名稱黏在一起 */
function toText(html: string): string {
  return html.replace(/<[^>]+>/g, '\n');
}

function parseNum(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/** 取 label 後面第一個數字，中間夾的標籤已經換成空白 */
function pickAfter(text: string, label: string): number | null {
  return parseNum(text.match(new RegExp(`${label}\\s*(-?[\\d,]+)`))?.[1]);
}

function parsePage(html: string): MajorTraderFlow | null {
  const text = toText(html);

  const net = pickAfter(text, '主力買賣超\\(張\\)');
  if (net == null) return null;

  // 「資料時間：2026/07/29」在主力進出區塊的標題列，取最靠近的那一個
  const head = text.slice(0, text.indexOf('主力買賣超'));
  const marks = [...head.matchAll(/資料時間：\s*(\d{4})\/(\d{2})\/(\d{2})/g)];
  const mark = marks[marks.length - 1];

  return {
    net,
    buy: pickAfter(text, '主力買超\\(張\\)'),
    sell: pickAfter(text, '主力賣超\\(張\\)'),
    date: mark ? `${mark[1]}-${mark[2]}-${mark[3]}` : null,
  };
}

async function fetchOne(
  ticker: string,
  tradingDate?: string
): Promise<MajorTraderFlow | null> {
  const cached = cache.get(ticker);
  if (cached) {
    const stale = cached.value?.date !== tradingDate && isAfterTaipeiHour(14);
    const ttl = stale ? STALE_CACHE_TTL : CACHE_TTL;
    if (Date.now() - cached.at < ttl) return cached.value;
  }

  let flow: MajorTraderFlow | null = null;

  try {
    const response = await fetch(`${PAGE_URL}/${ticker}/broker-trading`, {
      cache: 'no-store',
      headers: REQUEST_HEADERS,
    });
    if (!response.ok) throw new Error(`Yahoo ${response.status}`);

    flow = parsePage(await response.text());
  } catch (error) {
    console.error(`Failed to fetch major trader flow for ${ticker}:`, error);
  }

  cache.set(ticker, { at: Date.now(), value: flow });
  return flow;
}

/**
 * 個股主力買賣超，單位：張。抓不到的個股不會出現在 Map 裡。
 *
 * @param tradingDate 最新交易日（台北時區 YYYY-MM-DD），用來判斷資料是不是還落後一天
 */
export async function fetchMajorTraderFlows(
  tickers: string[],
  tradingDate?: string
): Promise<MajorTraderFlows> {
  const flows = new Map<string, MajorTraderFlow>();
  const dates = new Map<string, number>();

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((ticker) => fetchOne(ticker, tradingDate))
    );

    batch.forEach((ticker, index) => {
      const flow = results[index];
      if (!flow) return;

      flows.set(ticker, flow);
      if (flow.date) dates.set(flow.date, (dates.get(flow.date) ?? 0) + 1);
    });
  }

  // 極少數個股可能落後一天，取多數決當作整頁的資料日期
  const date =
    [...dates.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ??
    null;

  return { date, flows };
}
