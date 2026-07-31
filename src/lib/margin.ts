import type { MarginBalance, MarginBalanceItem } from '@/types';

/** 全市場融資融券餘額（信用交易統計） */
const MI_MARGN_URL = 'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN';

/** 收盤後才會更新一次，不用像報價那樣秒級輪詢 */
const CACHE_TTL = 5 * 60 * 1000;

function toNumber(value: string | undefined): number {
  return Number((value ?? '').replace(/,/g, ''));
}

function toDateKey(compact: string | undefined): string | null {
  const match = (compact ?? '').match(/^(\d{4})(\d{2})(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/** 欄位：項目、買進、賣出、現金(券)償還、前日餘額、今日餘額 */
function toItem(row: string[] | undefined, unit: number): MarginBalanceItem | null {
  if (!row) return null;

  const prev = toNumber(row[4]) * unit;
  const value = toNumber(row[5]) * unit;
  if (!Number.isFinite(prev) || !Number.isFinite(value)) return null;

  const change = value - prev;
  return { value, change, changePercent: prev ? (change / prev) * 100 : 0 };
}

let cache: { at: number; value: MarginBalance | null } | null = null;

/** 全市場融資（億元）／融券（張數）餘額，來源是 TWSE 信用交易統計的彙總表 */
export async function fetchMarginBalance(): Promise<MarginBalance | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL) return cache.value;

  try {
    const response = await fetch(`${MI_MARGN_URL}?selectType=ALL&response=json`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) throw new Error(`TWSE ${response.status}`);

    const body = (await response.json()) as {
      stat?: string;
      date?: string;
      tables?: { data?: string[][] }[];
    };

    const rows = body.stat === 'OK' ? body.tables?.[0]?.data ?? [] : [];
    const shortRow = rows.find((row) => row[0]?.startsWith('融券'));
    const amountRow = rows.find((row) => row[0]?.startsWith('融資金額'));

    const short = toItem(shortRow, 1);
    // 融資金額單位是仟元，換算成億元：× 1000 ÷ 1e8 = ÷ 1e5
    const margin = toItem(amountRow, 1 / 100000);

    const value = margin && short ? { date: toDateKey(body.date), margin, short } : null;

    cache = { at: Date.now(), value };
    return value;
  } catch (error) {
    console.error('Failed to fetch margin balance:', error);
    return null;
  }
}
