/**
 * Check issues with 2382, 4938, and 0050
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkTicker(ticker: string, name: string) {
  const { data } = await supabase
    .from('transactions')
    .select('*')
    .eq('ticker', ticker)
    .order('transaction_date');

  console.log(`\n=== ${ticker} ${name} ===`);

  let netShares = 0;
  let totalBuyCost = 0;
  let totalBuyShares = 0;

  for (const t of data || []) {
    const qty = t.transaction_type === 'BUY' ? t.quantity : -t.quantity;
    netShares += qty;

    if (t.transaction_type === 'BUY') {
      totalBuyCost += t.quantity * t.price;
      totalBuyShares += t.quantity;
    }

    console.log(`${t.transaction_date} ${t.transaction_type.padEnd(4)} ${t.quantity.toString().padStart(8)} @ $${t.price.toString().padStart(8)} | Running total: ${netShares}`);
  }

  console.log(`\nNet shares: ${netShares}`);
  if (totalBuyShares > 0) {
    console.log(`Avg buy cost: $${(totalBuyCost / totalBuyShares).toFixed(2)}`);
  }

  return { ticker, netShares };
}

async function main() {
  console.log('Checking problematic tickers...\n');

  const results = await Promise.all([
    checkTicker('2382', '廣達'),
    checkTicker('4938', '和碩'),
    checkTicker('0050', '元大台灣50'),
  ]);

  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY:');
  console.log('═'.repeat(60));
  for (const r of results) {
    const status = r.netShares === 0 ? '✓ Should not appear' : `⚠ Shows ${r.netShares} shares`;
    console.log(`${r.ticker}: ${status}`);
  }
}

main().catch(console.error);
