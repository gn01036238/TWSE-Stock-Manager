-- TWSE Stock Manager Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/yxlxnyfaeueyetwdphrl/sql

-- Brokers table (元大證券, 新光證券)
CREATE TABLE IF NOT EXISTS brokers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  commission_rate NUMERIC(5,4) DEFAULT 0.001425, -- 0.1425%
  commission_discount NUMERIC(5,2) DEFAULT 0.6,  -- 60% discount
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions table (BUY and SELL only - dividends are auto-tracked)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID REFERENCES brokers(id),
  ticker VARCHAR(10) NOT NULL,
  transaction_date DATE NOT NULL,
  transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('BUY', 'SELL')),
  quantity NUMERIC(12,2) NOT NULL,
  price NUMERIC(12,4) NOT NULL,
  commission NUMERIC(10,2) DEFAULT 0,
  tax NUMERIC(10,2) DEFAULT 0,
  decision_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_ticker_date ON transactions(ticker, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_broker ON transactions(broker_id);

-- Insert default brokers
INSERT INTO brokers (name, commission_rate, commission_discount)
VALUES
  ('元大證券', 0.001425, 0.6),
  ('新光證券', 0.001425, 0.1)
ON CONFLICT DO NOTHING;

-- NOTE: RLS is currently ENABLED on both tables with no policies.
-- The app reaches them from server-side API routes using SUPABASE_SECRET_KEY,
-- which bypasses RLS. The statements below are kept only for reference — do not
-- enable the public policies unless you intend the anon key to read/write data.

-- Enable Row Level Security (optional for single-user app)
-- ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since this is a single-user app)
-- CREATE POLICY "Allow all access" ON brokers FOR ALL USING (true);
-- CREATE POLICY "Allow all access" ON transactions FOR ALL USING (true);
