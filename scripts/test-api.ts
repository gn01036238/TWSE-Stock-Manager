/**
 * Test what the transactions API returns
 * This simulates what the frontend receives
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Replicate the computation from calculations.ts
function computeHoldings(transactions: any[]) {
  const byTicker = new Map<string, any[]>();

  for (const tx of transactions) {
    if (!byTicker.has(tx.ticker)) {
      byTicker.set(tx.ticker, []);
    }
    byTicker.get(tx.ticker)!.push(tx);
  }

  const holdings: { ticker: string; shares: number }[] = [];

  for (const [ticker, txns] of byTicker) {
    let shares = 0;

    const sortedTxns = [...txns].sort(
      (a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
    );

    for (const tx of sortedTxns) {
      if (tx.transaction_type === 'BUY') {
        shares += tx.quantity;
      } else if (tx.transaction_type === 'SELL') {
        shares -= tx.quantity;
      }
    }

    // This is what the UI shows - only if shares > 0
    if (shares > 0) {
      holdings.push({ ticker, shares });
    }
  }

  return holdings;
}

async function testApi() {
  console.log('=== Testing API Response ===\n');

  // Fetch all transactions (same as API does)
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .order('transaction_date', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total transactions fetched: ${transactions?.length}\n`);

  // Compute holdings (same as frontend does)
  const holdings = computeHoldings(transactions || []);

  console.log('Holdings that SHOULD appear in UI:');
  console.log('─'.repeat(40));

  for (const h of holdings.sort((a, b) => b.shares - a.shares)) {
    console.log(`${h.ticker.padEnd(8)} ${h.shares.toLocaleString().padStart(10)} shares`);
  }

  console.log('─'.repeat(40));
  console.log(`\nTotal holdings: ${holdings.length}`);

  // Check specifically for 2382 and 4938
  const check2382 = holdings.find(h => h.ticker === '2382');
  const check4938 = holdings.find(h => h.ticker === '4938');

  console.log('\n=== Problem Tickers ===');
  console.log(`2382: ${check2382 ? `⚠️ FOUND with ${check2382.shares} shares` : '✓ Not in holdings (correct)'}`);
  console.log(`4938: ${check4938 ? `⚠️ FOUND with ${check4938.shares} shares` : '✓ Not in holdings (correct)'}`);
}

testApi().catch(console.error);
