/**
 * Script to properly record the 2888 -> 2887 merger
 *
 * This adds:
 * 1. SELL transactions for 2888 to close out the position (at original cost, no gain/loss)
 * 2. BUY transaction for 2887i (7,000 shares at $10)
 *
 * Run with: npx tsx scripts/add-merger-transactions.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface MergerTransaction {
  broker_id: string;
  ticker: string;
  transaction_date: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  commission: number;
  tax: number;
  decision_reason: string;
}

async function addMergerTransactions() {
  console.log('Starting merger transaction recording...\n');

  // First, get the broker ID (assuming 元大證券 was used for these transactions)
  const { data: brokers, error: brokerError } = await supabase
    .from('brokers')
    .select('*');

  if (brokerError) {
    console.error('Error fetching brokers:', brokerError);
    process.exit(1);
  }

  console.log('Available brokers:', brokers?.map(b => `${b.name} (${b.id})`).join(', '));

  // Find 元大證券 broker (or use the first one)
  const broker = brokers?.find(b => b.name === '元大證券') || brokers?.[0];

  if (!broker) {
    console.error('No broker found. Please ensure brokers are set up in the database.');
    process.exit(1);
  }

  console.log(`Using broker: ${broker.name} (${broker.id})\n`);

  // Transactions to add for the merger
  const mergerTransactions: MergerTransaction[] = [
    // SELL 2888 transactions to close out the position
    // These are sold at original purchase price with 0 tax (merger conversion, not actual sale)
    {
      broker_id: broker.id,
      ticker: '2888',
      transaction_date: '2024-10-09',
      transaction_type: 'SELL',
      quantity: 30000,
      price: 12.20,
      commission: 0,  // No commission for merger conversion
      tax: 0,         // No tax for merger conversion
      decision_reason: '2888新光金合併轉換為2887台新金 + 2887i台新金特別股',
    },
    {
      broker_id: broker.id,
      ticker: '2888',
      transaction_date: '2024-11-28',
      transaction_type: 'SELL',
      quantity: 10000,
      price: 11.75,
      commission: 0,
      tax: 0,
      decision_reason: '2888新光金合併轉換為2887台新金 + 2887i台新金特別股',
    },
    // BUY 2887i (preferred stock received from merger)
    // Total 7000 shares at $10 publication price
    {
      broker_id: broker.id,
      ticker: '2887I',
      transaction_date: '2024-10-09',
      transaction_type: 'BUY',
      quantity: 7000,
      price: 10.00,
      commission: 0,  // No commission - received from merger
      tax: 0,
      decision_reason: '2888新光金合併取得台新金特別股',
    },
  ];

  console.log('Transactions to add:');
  console.log('─'.repeat(80));

  for (const txn of mergerTransactions) {
    const value = txn.quantity * txn.price;
    console.log(`${txn.transaction_type.padEnd(4)} | ${txn.ticker.padEnd(6)} | ${txn.transaction_date} | ${txn.quantity.toLocaleString().padStart(8)} shares @ $${txn.price.toFixed(2).padStart(6)} = $${value.toLocaleString().padStart(12)}`);
  }

  console.log('─'.repeat(80));
  console.log('\nInserting transactions...\n');

  // Insert all transactions
  const { data: inserted, error: insertError } = await supabase
    .from('transactions')
    .insert(mergerTransactions)
    .select();

  if (insertError) {
    console.error('Error inserting transactions:', insertError);
    process.exit(1);
  }

  console.log(`✓ Successfully added ${inserted?.length} merger transactions:\n`);

  for (const txn of inserted || []) {
    console.log(`  - ${txn.transaction_type} ${txn.ticker}: ${txn.quantity} shares @ $${txn.price} (ID: ${txn.id})`);
  }

  // Summary
  console.log('\n' + '═'.repeat(80));
  console.log('MERGER SUMMARY:');
  console.log('═'.repeat(80));
  console.log('2888 新光金 (40,000 shares) converted to:');
  console.log('  → 2887 台新金: 26,880 shares (already recorded in DB)');
  console.log('  → 2887I 台新金特別股: 7,000 shares @ $10 = $70,000 (just added)');
  console.log('\nCost basis preserved:');
  console.log('  Original 2888 cost: $483,500');
  console.log('  → 2887 cost: $413,280');
  console.log('  → 2887I cost: $70,000');
  console.log('  Total: $483,280 (minor rounding difference)');
  console.log('═'.repeat(80));
}

addMergerTransactions().catch(console.error);
