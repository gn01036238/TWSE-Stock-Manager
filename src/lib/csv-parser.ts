import type { Transaction } from '@/types';

interface RawCsvTransaction {
  交易日期: string;
  '買/賣/股利': string;
  代號: string;
  股票: string;
  交易類別: string;
  買入股數: string;
  買入價格: string;
  賣出股數: string;
  賣出價格: string;
  折讓後手續費: string;
  交易稅: string;
  決策原因?: string;
}

// Parse a number from CSV, removing commas and quotes
function parseNumber(value: string): number {
  if (!value || value === '-' || value === '') return 0;
  const cleaned = value.replace(/[,"]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Parse date from format like "2022/5/30" to "2022-05-30"
function parseDate(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;

  const year = parts[0];
  const month = parts[1].padStart(2, '0');
  const day = parts[2].padStart(2, '0');

  return `${year}-${month}-${day}`;
}

// Map CSV transaction type to our enum
function mapTransactionType(type: string): 'BUY' | 'SELL' | null {
  if (type === '買') return 'BUY';
  if (type === '賣') return 'SELL';
  return null; // Skip dividend entries (they're auto-calculated)
}

export function parseCsvToTransactions(
  csvContent: string,
  brokerId: string
): Omit<Transaction, 'id' | 'created_at'>[] {
  const lines = csvContent.split('\n');
  const transactions: Omit<Transaction, 'id' | 'created_at'>[] = [];

  // Skip header row (first line)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV line (handle quoted fields with commas)
    const fields = parseCsvLine(line);

    // Skip if not enough fields or empty first field
    if (fields.length < 13 || !fields[0]) continue;

    const transactionType = mapTransactionType(fields[1]);

    // Skip dividend entries and invalid types
    if (!transactionType) continue;

    const ticker = fields[2];
    if (!ticker || ticker === '-') continue;

    const quantity = transactionType === 'BUY'
      ? parseNumber(fields[5])
      : parseNumber(fields[7]);

    const price = transactionType === 'BUY'
      ? parseNumber(fields[6])
      : parseNumber(fields[8]);

    // Skip if no quantity or price
    if (quantity <= 0 || price <= 0) continue;

    const commission = parseNumber(fields[11]); // 折讓後手續費
    const tax = parseNumber(fields[12]); // 交易稅
    const decisionReason = fields[18] || undefined; // 決策原因

    transactions.push({
      broker_id: brokerId,
      ticker,
      transaction_date: parseDate(fields[0]),
      transaction_type: transactionType,
      quantity,
      price,
      commission,
      tax,
      decision_reason: decisionReason,
    });
  }

  return transactions;
}

// Parse a CSV line handling quoted fields
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add the last field
  fields.push(current.trim());

  return fields;
}

// Get unique tickers from CSV
export function getUniqueTickers(csvContent: string): string[] {
  const lines = csvContent.split('\n');
  const tickers = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i].trim());
    if (fields.length >= 3 && fields[2] && fields[2] !== '-') {
      tickers.add(fields[2]);
    }
  }

  return Array.from(tickers);
}

// Count transactions by type
export function countTransactionsByType(csvContent: string): { buys: number; sells: number; dividends: number } {
  const lines = csvContent.split('\n');
  let buys = 0;
  let sells = 0;
  let dividends = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i].trim());
    if (fields.length >= 2) {
      if (fields[1] === '買') buys++;
      else if (fields[1] === '賣') sells++;
      else if (fields[1] === '股利') dividends++;
    }
  }

  return { buys, sells, dividends };
}
