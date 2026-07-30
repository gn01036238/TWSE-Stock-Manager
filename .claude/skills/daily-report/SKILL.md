---
name: daily-report
description: Generate a comprehensive daily stock portfolio report including macro events, market indicators, and per-stock technical/institutional analysis. Use when you want a full daily briefing of your TWSE portfolio.
---

Generate a comprehensive daily portfolio intelligence report. The entire report MUST be written in Traditional Chinese (zh-TW). All monetary values in TWD with no decimals. All percentages to 2 decimal places.

Execute the following steps in order. Use parallel tool calls and subagents wherever possible to speed up data gathering.

---

## Step 1: Fetch Portfolio Data

1. Call `GET http://localhost:3000/api/transactions` to get all transactions and brokers.
2. Extract unique tickers from the transactions (only tickers with shares > 0 after computing buys - sells).
3. Call `GET http://localhost:3000/api/prices?tickers={comma-separated}` to get current market prices.
4. Call `POST http://localhost:3000/api/dividends` with `{ "tickers": [...] }` to get dividend data.

Use `curl` for all API calls. If the dev server is not running, tell the user to start it with `npm run dev` first.

---

## Step 2: Gather Macro & Market Intelligence

Use **WebSearch** to gather the following. Search in English for international data, in Chinese (繁體中文) for Taiwan-specific data. Always use today's date context.

### 2a. International Macro Events (國際總經事件)

Search for: "major central bank interest rate decisions this week 2026", "Fed ECB BOJ rate decision", "global macro events impacting stock markets this week"

Collect:
- Recent or upcoming central bank rate decisions (Fed, ECB, BOJ, BOE, PBOC)
- Major geopolitical events affecting markets
- Key US economic data releases (CPI, NFP, GDP, PMI)
- Classify each event as 利多 (bullish) or 利空 (bearish) for Taiwan equities

### 2b. USD Index & USD/TWD Exchange Rate (美元指數與匯率)

Search for: "US dollar index DXY today", "USD TWD exchange rate today"

Collect:
- DXY current level, daily change
- USD/TWD rate, daily change
- Brief trend comment (strengthening/weakening)

### 2c. Taiwan Market Margin Balance (台股融資餘額)

Search for: "台股 融資餘額 今日" or "TWSE margin balance today"

Collect:
- Total margin balance (融資餘額)
- Daily change (增減)
- Margin utilization rate if available

### 2d. Taiwan Futures & Options Open Interest (期貨選擇權未平倉)

Search for: "台指期 未平倉 外資 今日", "台指選擇權 未平倉 put call ratio 今日", "期交所 三大法人 期貨未平倉"

Collect:
- Taiwan futures (台指期) open interest changes: 外資 (foreign), 自營商 (dealers)
- Top 5 / Top 10 traders net position changes (前五大/前十大交易人淨部位增減)
- Options Put/Call ratio and open interest skew
- Foreign investor futures net position (外資台指期淨多/空單口數增減)

---

## Step 3: Per-Stock Deep Analysis

For EACH ticker in the portfolio, use **WebSearch** to gather the following. Launch searches for different stocks in parallel using subagents.

### 3a. Recent Important Events (近期重要事件)

Search for: "{ticker} {stock_name} 新聞 今日", "{ticker} 財報 法說會 2026"

Collect:
- Earnings announcements or guidance updates
- Material news (contracts, product launches, regulatory changes)
- Analyst upgrades/downgrades
- Classify each as 利多 or 利空

### 3b. Price-Volume Analysis (量價關係)

Use the price data from Step 1 (current price, previous close, change, volume) and search for: "{ticker} 成交量 均量 近期走勢"

Determine the price-volume relationship using this matrix:
- 價漲量增 → 多方強勢 (bullish confirmation)
- 價漲量縮 → 多方力道不足 (weak rally)
- 價漲量平 → 溫和上漲
- 價跌量增 → 空方強勢 (bearish confirmation)
- 價跌量縮 → 賣壓減輕 (selling pressure easing)
- 價跌量平 → 溫和下跌
- 價平量增 → 多空角力
- 價平量縮 → 觀望
- 價平量平 → 盤整

### 3c. Key Technical Indicators (技術面觀察)

Search for: "{ticker} 技術分析 均線 KD RSI", "{ticker} stock technical analysis moving average"

Look for and report:
- Moving average status: Is price above/below 5MA, 10MA, 20MA, 60MA, 120MA, 240MA? Any MA crossovers (黃金交叉/死亡交叉)?
- Whether key MAs were broken (均線遭貫破) or being tested
- Resistance/support levels: Did the stock approach resistance and form upper shadows (上影線) without breaking through? Or break below support?
- RSI overbought (>80) / oversold (<20) signals
- KD crossover signals (K穿越D)
- Any notable candlestick patterns (長上影線, 長下影線, 十字線, 吞噬型態)

### 3d. Institutional Flow (籌碼流向)

Search for: "{ticker} 三大法人 買賣超 今日", "{ticker} 外資 投信 買賣超 連續"

Collect:
- Foreign investors (外資): net buy/sell amount today, consecutive days buying/selling
- Investment trust (投信): net buy/sell amount today, consecutive days
- Dealers (自營商): net buy/sell today
- Major shareholders (大戶): any notable changes
- Flag if any institution has a significant position change (大幅買超/賣超)

### 3e. Ownership Ratio Changes (持股比例增減)

Search for: "{ticker} 外資持股比例", "{ticker} 集保戶股權分散表 大戶"

Collect:
- Foreign ownership % and recent change trend (增/減)
- Large shareholder (400張以上大戶) ownership % change
- Retail investor concentration trend

---

## Step 4: Compile the Report

Assemble the complete report in the following structure. ALL content must be in Traditional Chinese.

```markdown
# 📊 投資組合日報 — {YYYY/MM/DD}

---

## 一、國際總經環境

### 重大國際事件
(Table or bullet list of events with 利多/利空 classification)

### 美元指數與匯率
- 美元指數 (DXY): {value} ({change})
- 美元兌台幣: {value} ({change})
- 趨勢評估: ...

---

## 二、台股市場指標

### 融資餘額
- 融資餘額: {value} 億元 (較前日 {+/-change})
- 融資使用率: {value}%

### 期貨/選擇權未平倉
| 類別 | 外資 | 前五大 | 前十大 |
|------|------|--------|--------|
| 台指期淨部位 | ... | ... | ... |
| 增減口數 | ... | ... | ... |

- 選擇權 Put/Call Ratio: {value}
- 外資選擇權佈局解讀: ...

---

## 三、持股總覽

| 股票代號 | 名稱 | 股數 | 均成本 | 現價 | 市值 | 未實現損益 | 報酬率 |
|---------|------|------|-------|------|------|-----------|--------|

### 投資組合摘要
- 總投入成本: $XXX
- 總市值: $XXX
- 未實現總損益: $XXX (X.XX%)
- 已實現總損益: $XXX
- 股利總收入: $XXX
- 持股檔數: X

---

## 四、個股深度分析

(Repeat for each stock:)

### {ticker} {stock_name}

**近期重要事件**
- (event 1) — 利多/利空
- (event 2) — 利多/利空

**量價關係**: {判定結果} — {解讀}

**技術面觀察**
- 均線: (MA status and any crossovers or breaks)
- 壓力/支撐: (key levels and whether tested/broken)
- 指標訊號: (RSI, KD, candlestick patterns)
- 綜合評估: (brief 1-sentence technical outlook)

**籌碼流向**
| 法人 | 今日買賣超 | 連續天數 |
|------|-----------|---------|
| 外資 | ... | 連N買/賣 |
| 投信 | ... | 連N買/賣 |
| 自營商 | ... | — |

**持股比例變化**
- 外資持股: X.XX% (近期趨勢: 增/減/持平)
- 大戶持股: X.XX% (近期趨勢: 增/減/持平)

---

## 五、近期已實現損益

| 股票代號 | 賣出日期 | 股數 | 買入均價 | 賣出價 | 損益 | 報酬率 |
|---------|---------|------|---------|-------|------|--------|

---

## 六、股利收入摘要

| 股票代號 | 名稱 | 累計股利 | 最近配息日 | 最近每股配息 |
|---------|------|---------|-----------|------------|

---

## 七、綜合評估與注意事項

(Provide a brief overall assessment considering all the above data:)
- 國際面: ...
- 台股面: ...
- 個股面: (highlight any stocks needing attention — approaching key levels, unusual institutional activity, important upcoming events)
- 風險提醒: (any red flags or items requiring action)
```

---

## Step 5: Output

$ARGUMENTS

**Always save the report to a file.** Create the `reports/` directory if it doesn't exist. Default path: `reports/daily_report_{YYYYMMDD}.md`. This ensures all daily reports accumulate for future monthly report aggregation.

- If arguments contain a file path → use that path instead of the default.
- If arguments contain a specific ticker (e.g., "2330") → generate the full macro sections plus a focused deep analysis for that ticker only. Still save to file (default: `reports/daily_report_{YYYYMMDD}_{ticker}.md`).
- Always display the full report in the conversation as well, in addition to saving.
