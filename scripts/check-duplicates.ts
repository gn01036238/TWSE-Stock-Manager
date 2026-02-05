/**
 * Check for duplicate transactions and data integrity issues
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkDuplicates() {
  console.log('=== Checking for Duplicate/Missing Transactions ===\n');

  for (const ticker of ['2382', '4938']) {
    const { data: txns } = await supabase
      .from('transactions')
      .select('*')
      .eq('ticker', ticker)
      .order('transaction_date')
      .order('transaction_type');

    console.log(`\n${ticker} - All transactions:`);
    console.log('─'.repeat(90));

    let buyTotal = 0;
    let sellTotal = 0;

    for (const t of txns || []) {
      const type = t.transaction_type;
      if (type === 'BUY') buyTotal += t.quantity;
      else sellTotal += t.quantity;

      console.log(
        `ID: ${t.id} | ${t.transaction_date} | ${type.padEnd(4)} | ` +
        `${t.quantity.toString().padStart(6)} @ $${t.price.toString().padStart(8)} | ` +
        `reason: ${t.decision_reason || '(none)'}`
      );
    }

    console.log('─'.repeat(90));
    console.log(`Total BUY:  ${buyTotal}`);
    console.log(`Total SELL: ${sellTotal}`);
    console.log(`Net shares: ${buyTotal - sellTotal}`);

    if (buyTotal !== sellTotal) {
      console.log(`\n⚠️  MISMATCH DETECTED! Expected 0 shares but have ${buyTotal - sellTotal}`);
    } else {
      console.log(`\n✓ Correctly balanced (0 shares)`);
    }
  }

  // Also count total transactions
  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true });

  console.log(`\n\nTotal transactions in database: ${count}`);
}

checkDuplicates().catch(console.error);
