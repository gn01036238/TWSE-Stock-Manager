# CLAUDE.md - TWSE Stock Manager

## Project Overview

TWSE Stock Manager is a web-based portfolio management application for tracking Taiwan Stock Exchange (TWSE) investments. It allows users to import trading records from CSV files, track holdings, monitor dividends, analyze performance metrics, and view realized gains.

## Tech Stack

- **Framework**: Next.js 16 with App Router (TypeScript)
- **UI**: Tailwind CSS 4, Shadcn/ui components, Radix UI, Lucide icons
- **State**: TanStack React Query v5, React Hook Form, Zod validation
- **Database**: Supabase (PostgreSQL)
- **External APIs**: TWSE API (stock prices), Yahoo Finance (dividends)

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes (transactions, prices, import, dividends)
│   ├── holdings/          # Holdings detail page
│   ├── transactions/      # Transaction list and new transaction form
│   ├── dividends/         # Dividend tracking
│   ├── analytics/         # Performance analytics
│   └── import/            # CSV import
├── components/
│   ├── ui/                # Shadcn/ui components
│   ├── navbar.tsx         # Navigation
│   └── providers.tsx      # Query client provider
├── hooks/                 # Custom React hooks (useHoldings, useTransactions, usePrices, useDividends)
├── lib/                   # Utilities (supabase, twse, calculations, csv-parser, dividends)
└── types/index.ts         # TypeScript interfaces
```

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
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

### Financial Calculations
- **Cost basis**: FIFO for realized gains, average cost for holdings
- **Commission**: min 20 TWD, broker-specific discount rates
- **Tax**: 0.3% stocks, 0.1% ETFs (tickers starting with "00")
- **Currency**: TWD, no decimals

### CSV Import
- Supports Taiwan broker format (Chinese column headers)
- Date format: "2022/5/30" → "2022-05-05"
- Skips dividend records automatically

## API Endpoints

- `GET/POST/PATCH/DELETE /api/transactions` - Transaction CRUD
- `GET /api/prices?tickers=` - Stock prices from TWSE
- `PUT /api/import` - Preview CSV, `POST /api/import` - Import CSV
- `GET /api/dividends` - Dividend income data

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
