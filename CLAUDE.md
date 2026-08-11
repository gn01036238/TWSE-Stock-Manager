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
│   ├── dividend-history.tsx # 配息紀錄表格與共用欄位定義（總覽展開列／股利收入頁共用）
│   ├── sparkline.tsx      # 走勢圖；給了 offsets/sessionMinutes 就用固定的 09:00–13:30 X 軸
│   ├── navbar.tsx         # Navigation
│   └── providers.tsx      # Query client provider
├── hooks/                 # Custom React hooks (useHoldings, useTransactions, usePrices, useDividends)
├── lib/                   # Utilities (supabase, twse, calculations, csv-parser, dividends,
│                          #   corporate-actions, nhi, stock-dividend-sync,
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

### 除權息與配股（重要）

- **現金股利走 Yahoo，股票股利（配股）只走 `lib/corporate-actions.ts` 的手動清單**。
  Yahoo 的 chart events 沒有可靠的台股配股資料，新增一次除權息就在那個陣列加一筆，
  配息紀錄的欄位與交易紀錄裡的配股都會自動跟上
- **Yahoo 的 close 與股利金額都是分割還原後的數字**。台股的配股在 Yahoo 記成分割
  （2887 的 0.1 元股票股利＝1.01 分割），所以除權日以前的收盤價與配息都先被除掉 1.01
  （0.9 元的股利會變成 0.891089）。`lib/dividends.ts` 的 `unadjustFactor()` 會把
  之後所有分割的倍數乘回去，除權前股價、每股配息、填權判斷都用還原後的實際價格
- **`getSharesAtDate()` 是嚴格小於除權息日**：除權息當天買進不參與這次配息，
  這同時讓自動補進來的配股（日期就是除權息日）不會被拿去再配一次息
- **填權天數**：從除權息日起算，第幾個交易日的 `收盤價 ×(1 + 股票股利/10) + 現金股利`
  回到除權前股價。只比收盤價的話，配股愈多就愈不可能填權
- **二代健保補充保費**（`lib/nhi.ts`）：單次給付達 20,000 元就源扣繳 2.11%，
  上限 1,000 萬。**股票股利以面額 10 元併入給付金額**再判斷門檻。
  實發股利 = 現金股利 − 補充保費；總覽與摘要的「累積股利」仍是未扣的金額
- **配股交易**（`transaction_type = 'STOCK_DIVIDEND'`）由 `lib/stock-dividend-sync.ts`
  在 `GET /api/transactions` 時自動補寫，以（ticker, transaction_date）判重，重跑不會重複。
  股數 = 除權前持股 × 每股股票股利 ÷ 10（畸零股折現，無條件捨去），
  price/commission/tax 都是 0 → 成本不變、均價被稀釋，賣掉時整筆都是已實現獲利。
  所有算股數的地方（`computeHoldings`、`computeRealizedGains`、`computeTransactionPnL`、
  `portfolio-history` 的 `replayTicker`、`getSharesAtDate`）都把它當成零成本的買入

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
- `transactions`: id, broker_id, ticker, transaction_date,
  transaction_type (BUY/SELL/STOCK_DIVIDEND), quantity, price, commission, tax, decision_reason

`STOCK_DIVIDEND` 需要放寬 `transaction_type` 的 CHECK 條件，見
`supabase-migration-stock-dividend.sql`（貼到 Supabase SQL Editor 跑一次，重跑安全）。
沒跑之前配股補寫會失敗，交易記錄頁會顯示一條琥珀色提示，其餘功能不受影響。

Both tables have RLS enabled with no policies. All DB access goes through server-side
API routes using the secret (service_role) key, which bypasses RLS. The anon key would
silently return zero rows — never use it for these tables.

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SECRET_KEY=          # sb_secret_... server-side only, bypasses RLS
```
