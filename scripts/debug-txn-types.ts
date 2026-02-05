/**
 * Debug transaction types - check for any encoding/whitespace issues
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function debugTxnTypes() {
  const { data: txns } = await supabase
    .from('transactions')
    .select('*')
    .in('ticker', ['2382', '4938']);

  console.log('=== Transaction Type Debug ===\n');

  for (const tx of txns || []) {
    const typeChars = tx.transaction_type.split('').map((c: string) => c.charCodeAt(0));
    console.log(`${tx.ticker} | ${tx.transaction_date} | type: "${tx.transaction_type}" | char codes: [${typeChars.join(', ')}] | length: ${tx.transaction_type.length}`);
    console.log(`  quantity: ${tx.quantity} (type: ${typeof tx.quantity})`);
    console.log(`  Is exactly "SELL"? ${tx.transaction_type === 'SELL'}`);
    console.log(`  Is exactly "BUY"? ${tx.transaction_type === 'BUY'}`);
    console.log('');
  }

  // Now simulate the exact calculation
  console.log('\n=== Simulating Calculation ===\n');

  for (const ticker of ['2382', '4938']) {
    const tickerTxns = txns?.filter(t => t.ticker === ticker) || [];
    let shares = 0;

    // Sort by date
    tickerTxns.sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());

    for (const tx of tickerTxns) {
      console.log(`Processing ${ticker}: ${tx.transaction_type} ${tx.quantity}`);

      if (tx.transaction_type === 'BUY') {
        shares += tx.quantity;
        console.log(`  After BUY: shares = ${shares}`);
      } else if (tx.transaction_type === 'SELL') {
        shares -= tx.quantity;
        console.log(`  After SELL: shares = ${shares}`);
      } else {
        console.log(`  UNKNOWN TYPE: "${tx.transaction_type}"`);
      }
    }

    console.log(`\n${ticker} final shares: ${shares}`);
    console.log(`shares > 0? ${shares > 0}`);
    console.log(`Would appear in holdings? ${shares > 0 ? 'YES' : 'NO'}\n`);
  }
}

debugTxnTypes().catch(console.error);
