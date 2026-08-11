-- 除權配股（STOCK_DIVIDEND）交易類型
-- 貼到 Supabase SQL Editor 執行一次即可；重跑安全。
-- https://supabase.com/dashboard/project/yxlxnyfaeueyetwdphrl/sql
--
-- 為什麼要這個：除權配到的股票會由 src/lib/stock-dividend-sync.ts 自動補成一筆
-- 交易紀錄（price / commission / tax 都是 0，股數增加但成本不變），
-- 原本的 CHECK 條件只收 BUY / SELL 會把它擋下來。

-- 1) 欄位放寬到裝得下 'STOCK_DIVIDEND'（原本是 VARCHAR(10)）
ALTER TABLE transactions ALTER COLUMN transaction_type TYPE VARCHAR(20);

-- 2) 換掉 CHECK 條件
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_transaction_type_check
  CHECK (transaction_type IN ('BUY', 'SELL', 'STOCK_DIVIDEND'));

-- 3) 同一檔的同一次除權息只會有一筆配股。程式本身就會判重，
--    這個索引是最後一道保險（例如兩個分頁同時載入）。
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_stock_dividend_once
  ON transactions(ticker, transaction_date)
  WHERE transaction_type = 'STOCK_DIVIDEND';

-- 跑完重新整理任一頁面，2887 在 2026-07-21 的配股就會自己補上去。
