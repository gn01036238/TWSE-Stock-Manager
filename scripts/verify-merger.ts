/**
 * Verify merger transactions are properly recorded
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function verify() {
  // Check 2888 transactions
  const { data: t2888 } = await supabase
    .from('transactions')
    .select('*')
    .eq('ticker', '2888')
    .order('transaction_date');

  console.log('=== 2888 新光金 Transactions ===');
  let net2888 = 0;
  for (const t of t2888 || []) {
    const qty = t.transaction_type === 'BUY' ? t.quantity : -t.quantity;
    net2888 += qty;
    console.log(`${t.transaction_date} ${t.transaction_type.padEnd(4)} ${t.quantity.toString().padStart(6)} @ $${t.price}`);
  }
  console.log(`Net shares: ${net2888}\n`);

  // Check 2887I transactions
  const { data: t2887i } = await supabase
    .from('transactions')
    .select('*')
    .eq('ticker', '2887I')
    .order('transaction_date');

  console.log('=== 2887I 台新金特別股 Transactions ===');
  let net2887i = 0;
  for (const t of t2887i || []) {
    const qty = t.transaction_type === 'BUY' ? t.quantity : -t.quantity;
    net2887i += qty;
    console.log(`${t.transaction_date} ${t.transaction_type.padEnd(4)} ${t.quantity.toString().padStart(6)} @ $${t.price}`);
  }
  console.log(`Net shares: ${net2887i}\n`);

  // Check 2887 transactions
  const { data: t2887 } = await supabase
    .from('transactions')
    .select('*')
    .eq('ticker', '2887')
    .order('transaction_date');

  console.log('=== 2887 台新金 Transactions ===');
  let net2887 = 0;
  for (const t of t2887 || []) {
    const qty = t.transaction_type === 'BUY' ? t.quantity : -t.quantity;
    net2887 += qty;
    console.log(`${t.transaction_date} ${t.transaction_type.padEnd(4)} ${t.quantity.toString().padStart(6)} @ $${t.price}`);
  }
  console.log(`Net shares: ${net2887}\n`);

  // Summary
  console.log('═'.repeat(50));
  console.log('CURRENT HOLDINGS SUMMARY:');
  console.log('═'.repeat(50));
  console.log(`2888 新光金:        ${net2888.toLocaleString().padStart(8)} shares (should be 0)`);
  console.log(`2887 台新金:        ${net2887.toLocaleString().padStart(8)} shares`);
  console.log(`2887I 台新金特別股: ${net2887i.toLocaleString().padStart(8)} shares`);
  console.log('═'.repeat(50));
}

verify().catch(console.error);
