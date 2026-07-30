import type { InstitutionalFlow } from '@/types';

/** 三大法人買賣超日報（個股，單位：股） */
const T86_URL = 'https://www.twse.com.tw/rwd/zh/fund/T86';
/** 三大法人買賣金額統計表（全市場，單位：元） */
const BFI82U_URL = 'https://www.twse.com.tw/rwd/zh/fund/BFI82U';

/** T86 約在收盤後 16:00 才更新，最多往前找幾個日曆日 */
const MAX_LOOKBACK_DAYS = 10;
const CACHE_TTL = 10 * 60 * 1000;

const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'application/json',
};

export interface DailyFlows {
  /** 資料所屬交易日，台北時區 YYYY-MM-DD */
  date: string;
  /** 個股買賣超，單位：張 */
  flows: Map<string, InstitutionalFlow>;
}

interface TwseTable {
  stat?: string;
  fields?: string[];
  data?: string[][];
}

/** TWSE 回傳的數字帶千分位逗號，也可能是 "--" */
function parseNum(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function taipeiParts(date: Date): { key: string; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  return {
    key: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: get('weekday'),
  };
}

async function fetchTable(url: string): Promise<TwseTable | null> {
  try {
    const response = await fetch(url, { cache: 'no-store', headers: REQUEST_HEADERS });
    if (!response.ok) throw new Error(`TWSE ${response.status}`);

    const table = (await response.json()) as TwseTable;
    if (table?.stat !== 'OK' || !table.data?.length) return null;

    return table;
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error);
    return null;
  }
}

/** 依欄位名稱取值，避免 TWSE 調整欄位順序就壞掉 */
function columnPicker(fields: string[]) {
  return (row: string[], ...candidates: string[]): number => {
    for (const name of candidates) {
      const index = fields.findIndex((field) => field.trim() === name);
      if (index >= 0) return parseNum(row[index]);
    }
    return 0;
  };
}

function parseT86(table: TwseTable): Map<string, InstitutionalFlow> {
  const fields = table.fields ?? [];
  const pick = columnPicker(fields);
  const flows = new Map<string, InstitutionalFlow>();

  for (const row of table.data ?? []) {
    const ticker = row[0]?.trim();
    if (!ticker) continue;

    // 外資自營商已計入自營商，法人合計不重複計算，這裡的外資同樣採不含外資自營商
    const foreign = pick(row, '外陸資買賣超股數(不含外資自營商)', '外資買賣超股數');
    const trust = pick(row, '投信買賣超股數');
    const dealer = pick(row, '自營商買賣超股數');
    const total = pick(row, '三大法人買賣超股數');

    flows.set(ticker, {
      foreign: foreign / 1000,
      trust: trust / 1000,
      dealer: dealer / 1000,
      total: total / 1000,
    });
  }

  return flows;
}

let flowsCache: { at: number; value: DailyFlows | null } | null = null;

/**
 * 取得「最近一個有三大法人資料的交易日」個股買賣超。
 * 盤中查詢時當日資料還沒出，會自動退回前一個交易日。
 */
export async function fetchInstitutionalFlows(): Promise<DailyFlows | null> {
  if (flowsCache && Date.now() - flowsCache.at < CACHE_TTL) {
    return flowsCache.value;
  }

  let result: DailyFlows | null = null;

  for (let offset = 0; offset < MAX_LOOKBACK_DAYS; offset++) {
    const day = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    const { key, weekday } = taipeiParts(day);
    if (weekday === 'Sat' || weekday === 'Sun') continue;

    const compact = key.replace(/-/g, '');
    const table = await fetchTable(
      `${T86_URL}?date=${compact}&selectType=ALL&response=json`
    );
    if (!table) continue;

    result = { date: key, flows: parseT86(table) };
    break;
  }

  flowsCache = { at: Date.now(), value: result };
  return result;
}

const MARKET_UNITS: Record<keyof InstitutionalFlow, string[]> = {
  foreign: ['外資及陸資(不含外資自營商)', '外資及陸資'],
  trust: ['投信'],
  dealer: ['自營商(自行買賣)', '自營商(避險)', '自營商'],
  total: ['合計'],
};

const marketFlowCache = new Map<string, { at: number; value: InstitutionalFlow | null }>();

/**
 * 全市場三大法人買賣超金額，單位：億元。
 * @param date 台北時區 YYYY-MM-DD，需與個股資料同一天
 */
export async function fetchMarketFlow(date: string): Promise<InstitutionalFlow | null> {
  const cached = marketFlowCache.get(date);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.value;

  const table = await fetchTable(
    `${BFI82U_URL}?dayDate=${date.replace(/-/g, '')}&type=day&response=json`
  );

  let flow: InstitutionalFlow | null = null;

  if (table) {
    const amounts = new Map<string, number>();
    for (const row of table.data ?? []) {
      // 欄位：單位名稱、買進金額、賣出金額、買賣差額
      amounts.set(row[0]?.trim(), parseNum(row[3]));
    }

    const sum = (names: string[]) =>
      names.reduce((total, name) => total + (amounts.get(name) ?? 0), 0) / 1e8;

    flow = {
      foreign: sum(MARKET_UNITS.foreign),
      trust: sum(MARKET_UNITS.trust),
      dealer: sum(MARKET_UNITS.dealer),
      total: sum(MARKET_UNITS.total),
    };
  }

  marketFlowCache.set(date, { at: Date.now(), value: flow });
  return flow;
}
