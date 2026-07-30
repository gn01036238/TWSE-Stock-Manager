import { createClient } from '@supabase/supabase-js';
import type { Broker, Transaction } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// This module is only ever imported from server-side API routes, so we use the
// secret (service_role) key. It bypasses RLS, which the tables have enabled
// without any policy — the anon key would silently return zero rows.
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseKey) {
  throw new Error(
    'SUPABASE_SECRET_KEY is missing. Copy the sb_secret_... key from ' +
      'Supabase Dashboard → Project Settings → API Keys into .env.local.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Broker operations
export async function getBrokers(): Promise<Broker[]> {
  const { data, error } = await supabase
    .from('brokers')
    .select('*')
    .order('name');

  if (error) throw error;
  return data || [];
}

export async function createBroker(broker: Omit<Broker, 'id' | 'created_at'>): Promise<Broker> {
  const { data, error } = await supabase
    .from('brokers')
    .insert(broker)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Transaction operations
export async function getTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('transaction_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getTransactionsByTicker(ticker: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('ticker', ticker)
    .order('transaction_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createTransaction(
  transaction: Omit<Transaction, 'id' | 'created_at'>
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .insert(transaction)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createTransactions(
  transactions: Omit<Transaction, 'id' | 'created_at'>[]
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .insert(transactions)
    .select();

  if (error) throw error;
  return data || [];
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function updateTransaction(
  id: string,
  updates: Partial<Omit<Transaction, 'id' | 'created_at'>>
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get unique tickers from transactions
export async function getUniqueTickers(): Promise<string[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('ticker')
    .order('ticker');

  if (error) throw error;

  const tickers = new Set(data?.map(t => t.ticker) || []);
  return Array.from(tickers);
}
