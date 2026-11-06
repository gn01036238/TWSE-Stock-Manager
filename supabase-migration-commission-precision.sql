-- 手續費率 0.001425 需要 6 位小數；原本 NUMERIC(5,4) 會把它存成 0.0014。
-- 貼到 Supabase SQL Editor 跑一次，重跑安全。
ALTER TABLE brokers ALTER COLUMN commission_rate TYPE NUMERIC(7,6);
UPDATE brokers SET commission_rate = 0.001425;
