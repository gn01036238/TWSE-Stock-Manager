# CLAUDE.md - TWSE Stock Manager

## Project Overview

TWSE Stock Manager is a web-based portfolio management application for tracking Taiwan Stock Exchange (TWSE) investments. It allows users to import trading records from CSV files, track holdings, monitor dividends, analyze performance metrics, and view realized gains.

## Tech Stack

- **Framework**: Next.js 16 with App Router (TypeScript)
- **UI**: Tailwind CSS 4, Shadcn/ui components, Radix UI, Lucide icons
- **State**: TanStack React Query v5, React Hook Form, Zod validation
- **Database**: Supabase (PostgreSQL)
- **External APIs**: TWSE MIS（即時報價、加權指數）、TWSE 開放資料（法人、成交量）、
  Yahoo Finance（股利、日 K、盤中分鐘線）

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes (transactions, prices, intraday, indices, import,
│   │                      #   dividends, chips, candles)
│   ├── page.tsx           # 總覽：摘要 + 持股/籌碼合併表格（原 holdings、chips 頁已併入）
│   ├── transactions/      # 交易列表（含股票全名、每筆損益、distinct 篩選下拉）與新增表單
│   ├── dividends/         # Dividend tracking
│   ├── analytics/         # Performance analytics
│   └── import/            # CSV import
├── components/
│   ├── ui/                # Shadcn/ui components
│   ├── data-table.tsx     # 欄寬可拖曳、欄位可拖曳排序的表格（設定存 localStorage）
│   ├── sparkline.tsx      # 走勢圖；給了 offsets/sessionMinutes 就用固定的 09:00–13:30 X 軸
│   ├── navbar.tsx         # Navigation
│   └── providers.tsx      # Query client provider
├── hooks/                 # Custom React hooks (useHoldings, useTransactions, usePrices, useDividends)
├── lib/                   # Utilities (supabase, twse, calculations, csv-parser, dividends,
│                          #   intraday, intraday-store, indices, volume, institutional, major)
└── types/index.ts         # TypeScript interfaces
```

## Commands

```bash
npm run dev      # Start development server (localhost:3001)
npm run build    # Production build
npm start        # Start production server
npm run lint     # Run ESLint
```

## Key Conventions

### Code Style
- Client components marked with `'use client'`
- Path alias: `@/*` → `./src/*`
- Components: PascalCase, Functions: camelCase
- All UI text in Traditional Chinese (zh-TW)

### Data Flow
- React Query for server state (60s stale time, no refetch on window focus)
- Custom hooks as data layer (`useHoldings`, `useTransactions`, etc.)
- `useMemo` for expensive calculations

### 行情來源（重要）

**Yahoo Finance 的台股報價延遲約 20 分鐘**，而且開盤後前 20 分鐘 `regularMarketTime`
還停在昨天收盤。任何「現在多少錢」的數字都不可以拿它來算。

- **現價一律走 TWSE MIS**（`lib/twse.ts`），順序是 `成交價 z → 五檔中價 → 今日開盤價 o`。
  `z` 在盤中常常是 `"-"`（那筆五秒快照沒成交），漲跌停鎖死時五檔只剩一邊，所以要一路往下退，
  但**絕不能退到 `y`（昨收）**——昨收基準也是同一個數字，相減會剛好是 0，
  漲跌幅與今日損益就會整片變成 0.00% / $0
- 收盤後不退到開盤價（那時五檔會清空，退過去反而是錯的）
- 五檔取價會跳過 `0.0000`（漲跌停時的市價單佔第一檔）
- 上市（`tse_`）查不到的自動再問上櫃（`otc_`）
- **Yahoo 只在 TWSE 整檔查不到時當備援**，另外負責股利、日 K，以及走勢線「20 分鐘前～開盤」那段
- 快照有 5 秒快取，prices / chips / intraday 三個端點共用同一批

### 盤中走勢圖

- `lib/intraday-store.ts` 是**記憶體**裡的即時樣本：每次向 TWSE 要報價時記一筆，
  時間桶 1 分鐘，同桶內只留最新的（所以線的尾端會跟著報價跳，但要換桶才多一個點）
- `lib/intraday.ts` 把 Yahoo 的 1m K 棒（負責前段）與比它新的即時樣本（負責尾巴）接起來；
  Yahoo 那天不是今天就整條丟掉，只畫即時樣本
- 序列會帶 `offsets`（距離開盤幾分鐘）與 `sessionMinutes`（270），
  `Sparkline` 用它畫**固定的 09:00–13:30 X 軸**，盤中只填到現在為止，不把 N 個點攤滿寬度
- 樣本只活在記憶體：伺服器重啟後那段空窗要等 Yahoo 的 K 棒補回來，中間會缺一小段線。
  **價格數字不受影響**
- 加權指數也記在同一個 store（key 用 `^TWII`），`參考指數` 的台股那格改讀 TWSE `t00`，
  才不會跟表格裡的加權指數列打架

### Financial Calculations
- **Cost basis**: FIFO for realized gains, average cost for holdings
- **今日損益**: 昨日持股以昨收為基準、當日買進的部位以成交價為基準（FIFO 決定賣掉的是哪批），
  未計手續費；交易日以 **TWSE 報價帶的 `tradingDate`**（MIS 的 `d` 欄位）為準，
  取不到時才用 `latestTradingDateKey()`。不要改回用走勢圖的日期——Yahoo 落後時會拿到昨天，
  「今天買的」判斷會整片失效
- **每筆交易損益** (`computeTransactionPnL`)：賣出＝FIFO 配對買入成本後的已實現損益（已扣手續費、
  交易稅）；買入＝已被賣掉部分的已實現 ＋ 還持有部分以現價計的未實現。抓不到現價或沒有對應買入紀錄時回 null
- **Commission**: min 20 TWD, broker-specific discount rates
- **Tax**: 0.3% stocks, 0.1% ETFs (tickers starting with "00")
- **Currency**: TWD, no decimals

### CSV Import
- Supports Taiwan broker format (Chinese column headers)
- Date format: "2022/5/30" → "2022-05-05"
- Skips dividend records automatically

## API Endpoints

- `GET/POST/PATCH/DELETE /api/transactions` - Transaction CRUD
- `GET /api/prices?tickers=` - TWSE 即時報價（含 `tradingDate`），Yahoo 僅備援
- `GET /api/intraday?tickers=` - 今日走勢；Yahoo 1m K 棒 ＋ TWSE 即時樣本，帶 `offsets`／`sessionMinutes`
- `GET /api/indices?symbols=` - 參考指數；`^TWII` 讀 TWSE `t00`，其餘走 Yahoo
- `PUT /api/import` - Preview CSV, `POST /api/import` - Import CSV
- `GET /api/dividends` - Dividend income data
- `GET /api/chips?tickers=` - 成交量、量比、價量型態、三大法人與主力買賣超（含加權指數列）
- `GET /api/candles?tickers=&limit=` - 日 K（OHLC）序列；`0000` 代表加權指數（Yahoo `^TWII`）。
  與量比共用 `lib/daily-bars.ts` 的抓取與快取，同一檔不會重複問 Yahoo

## Database

Two tables in Supabase:
- `brokers`: id, name, commission_rate, commission_discount
- `transactions`: id, broker_id, ticker, transaction_date, transaction_type (BUY/SELL), quantity, price, commission, tax, decision_reason

Both tables have RLS enabled with no policies. All DB access goes through server-side
API routes using the secret (service_role) key, which bypasses RLS. The anon key would
silently return zero rows — never use it for these tables.

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SECRET_KEY=          # sb_secret_... server-side only, bypasses RLS
```
