/**
 * Full database audit - check ALL transactions
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function fullAudit() {
  console.log('=== FULL DATABASE AUDIT ===\n');

  const { data: allTxns, error } = await supabase
    .from('transactions')
    .select('*')
    .order('ticker')
    .order('transaction_date');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total transactions in DB: ${allTxns?.length}\n`);

  // Group by ticker and compute net shares
  const byTicker = new Map<string, { buys: number; sells: number; transactions: any[] }>();

  for (const tx of allTxns || []) {
    if (!byTicker.has(tx.ticker)) {
      byTicker.set(tx.ticker, { buys: 0, sells: 0, transactions: [] });
    }
    const data = byTicker.get(tx.ticker)!;
    data.transactions.push(tx);
    if (tx.transaction_type === 'BUY') {
      data.buys += tx.quantity;
    } else {
      data.sells += tx.quantity;
    }
  }

  console.log('Ticker Summary:');
  console.log('═'.repeat(80));
  console.log('Ticker'.padEnd(10) + 'BUY Qty'.padStart(12) + 'SELL Qty'.padStart(12) + 'Net Shares'.padStart(12) + '  Status');
  console.log('─'.repeat(80));

  const sortedTickers = [...byTicker.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  for (const [ticker, data] of sortedTickers) {
    const net = data.buys - data.sells;
    const status = net > 0 ? '✓ HOLDING' : net === 0 ? '○ CLOSED' : '⚠️ NEGATIVE!';
    console.log(
      ticker.padEnd(10) +
      data.buys.toLocaleString().padStart(12) +
      data.sells.toLocaleString().padStart(12) +
      net.toLocaleString().padStart(12) +
      '  ' + status
    );
  }

  console.log('═'.repeat(80));

  // Specifically check 2382 and 4938
  console.log('\n\n=== DETAILED CHECK: 2382 ===');
  const t2382 = byTicker.get('2382');
  if (t2382) {
    for (const tx of t2382.transactions) {
      console.log(`${tx.id} | ${tx.transaction_date} | ${tx.transaction_type} | ${tx.quantity} @ $${tx.price}`);
    }
    console.log(`Net: ${t2382.buys} - ${t2382.sells} = ${t2382.buys - t2382.sells}`);
  }

  console.log('\n=== DETAILED CHECK: 4938 ===');
  const t4938 = byTicker.get('4938');
  if (t4938) {
    for (const tx of t4938.transactions) {
      console.log(`${tx.id} | ${tx.transaction_date} | ${tx.transaction_type} | ${tx.quantity} @ $${tx.price}`);
    }
    console.log(`Net: ${t4938.buys} - ${t4938.sells} = ${t4938.buys - t4938.sells}`);
  }

  // Check if there are any issues with the data types
  console.log('\n\n=== DATA TYPE CHECK ===');
  const sample2382 = t2382?.transactions[0];
  if (sample2382) {
    console.log('Sample 2382 transaction:');
    console.log('  quantity type:', typeof sample2382.quantity, '| value:', sample2382.quantity);
    console.log('  transaction_type:', typeof sample2382.transaction_type, '| value:', sample2382.transaction_type);
  }
}

fullAudit().catch(console.error);
