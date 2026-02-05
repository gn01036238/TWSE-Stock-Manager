/**
 * Fix issues:
 * 1. Add 0050 stock split transaction (4:1 split)
 * 2. Check and report on 2382/4938 issues
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function fixIssues() {
  console.log('=== Fixing Stock Issues ===\n');

  // Get broker
  const { data: brokers } = await supabase.from('brokers').select('*');
  const broker = brokers?.find(b => b.name === '元大證券') || brokers?.[0];

  if (!broker) {
    console.error('No broker found');
    process.exit(1);
  }

  // 1. Fix 0050 stock split
  console.log('1. Adding 0050 stock split transaction...');
  console.log('   Pre-split shares: 6,152');
  console.log('   Split ratio: 4:1 (each share becomes 4 shares)');
  console.log('   Additional shares: 6,152 × 3 = 18,456 shares at $0');
  console.log('   Post-split total: 6,152 + 18,456 = 24,608 shares\n');

  const splitTransaction = {
    broker_id: broker.id,
    ticker: '0050',
    transaction_date: '2025-06-18',  // Stock split date from CSV
    transaction_type: 'BUY' as const,
    quantity: 18456,
    price: 0,
    commission: 0,
    tax: 0,
    decision_reason: '0050元大台灣50 股票分割 1:4 (每股變4股)',
  };

  const { data: inserted, error: insertError } = await supabase
    .from('transactions')
    .insert(splitTransaction)
    .select()
    .single();

  if (insertError) {
    console.error('Error adding split transaction:', insertError);
  } else {
    console.log(`✓ Added 0050 split: +${inserted.quantity} shares (ID: ${inserted.id})\n`);
  }

  // 2. Check 2382 and 4938 for duplicate entries
  console.log('2. Checking 2382 and 4938 for issues...\n');

  for (const ticker of ['2382', '4938']) {
    const { data: txns } = await supabase
      .from('transactions')
      .select('*')
      .eq('ticker', ticker)
      .order('transaction_date');

    console.log(`   ${ticker}:`);

    let buyQty = 0;
    let sellQty = 0;

    for (const t of txns || []) {
      if (t.transaction_type === 'BUY') buyQty += t.quantity;
      else sellQty += t.quantity;
      console.log(`      ${t.id.slice(0, 8)}... ${t.transaction_date} ${t.transaction_type} ${t.quantity}`);
    }

    console.log(`      Total BUY: ${buyQty}, Total SELL: ${sellQty}, Net: ${buyQty - sellQty}\n`);
  }

  // 3. Verify 0050 final state
  console.log('3. Verifying 0050 final state...\n');

  const { data: t0050 } = await supabase
    .from('transactions')
    .select('*')
    .eq('ticker', '0050')
    .order('transaction_date');

  let totalShares = 0;
  let totalCost = 0;

  for (const t of t0050 || []) {
    if (t.transaction_type === 'BUY') {
      totalShares += t.quantity;
      totalCost += t.quantity * t.price;
    } else {
      totalShares -= t.quantity;
    }
  }

  const avgCost = totalCost / totalShares;

  console.log('   0050 元大台灣50:');
  console.log(`   Total shares: ${totalShares.toLocaleString()}`);
  console.log(`   Total cost: $${totalCost.toLocaleString()}`);
  console.log(`   Avg cost per share: $${avgCost.toFixed(2)}`);
  console.log(`   Current price: $72.00`);
  console.log(`   Market value: $${(totalShares * 72).toLocaleString()}`);
  console.log(`   Unrealized gain: $${((totalShares * 72) - totalCost).toLocaleString()} (${(((totalShares * 72) - totalCost) / totalCost * 100).toFixed(2)}%)`);
}

fixIssues().catch(console.error);
