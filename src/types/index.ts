// Database types
export interface Broker {
  id: string;
  name: string;
  commission_rate: number;
  commission_discount: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  broker_id: string;
  ticker: string;
  transaction_date: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  commission: number;
  tax: number;
  decision_reason?: string;
  created_at: string;
}

// Computed types (not stored in DB)
export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  totalCost: number;
  currentPrice: number;
  /** 前一交易日收盤價；報價抓不到時為 0 */
  previousClose: number;
  /** 今日損益的基準值：昨日持股 × 昨收 ＋ 今日買進批次 × 成交價；算不出來時為 0 */
  dayBasis: number;
  /** 今日損益 = 持股現值 − dayBasis（未計手續費）；算不出來時為 0 */
  dayChange: number;
  /** 今日損益中來自昨日持股的部分（現價 − 昨收） */
  dayChangeHeld: number;
  /** 今日損益中來自今日買進批次的部分（現價 − 成交價） */
  dayChangeToday: number;
  /** 今日買進且還留著的股數；成交價明顯不在今天區間的紀錄不算在內 */
  todayShares: number;
  marketValue: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  totalDividends: number;
  /** 持有期間每股累積配息 */
  dividendPerShare: number;
  /** 還原除權息現價 = 現價 + 持有期間每股累積配息 */
  adjustedPrice: number;
  /** 以還原價計算的報酬率（含息） */
  adjustedGainPercent: number;
}

export interface StockPrice {
  ticker: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  updatedAt: Date;
}

/** 單一交易日的日內走勢（5 分鐘線收盤價序列） */
export interface IntradaySeries {
  ticker: string;
  points: number[];
  previousClose: number;
  /** 資料所屬交易日，台北時區 YYYY-MM-DD */
  tradingDate: string;
}

/** 單一交易日的日線（K 棒）；最後一根在盤中還會變動 */
export interface DailyBar {
  /** 交易日，台北時區 YYYY-MM-DD */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** 成交量（張）；抓不到時為 null */
  volume: number | null;
}

/** 單檔的日 K 序列，舊的在前 */
export interface CandleSeries {
  ticker: string;
  bars: DailyBar[];
}

/** 總覽的參考指數報價（費半、KOSPI、加權指數…） */
export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  points: number[];
}

/** 單一交易日的三大法人買賣超（外資不含外資自營商，避免與自營商重複） */
export interface InstitutionalFlow {
  foreign: number;
  trust: number;
  dealer: number;
  /** 三大法人合計 */
  total: number;
}

/** 主力（買超前 15 大券商 − 賣超前 15 大券商）單日買賣超，單位：張 */
export interface MajorTraderFlow {
  net: number;
  buy: number | null;
  sell: number | null;
  /** 分點資料所屬交易日，台北時區 YYYY-MM-DD */
  date: string | null;
}

/** 價量型態：價漲/價跌 × 量增/量縮 */
export type PriceVolumePattern =
  | 'up-expand'
  | 'up-shrink'
  | 'down-expand'
  | 'down-shrink'
  | 'unknown';

/** 籌碼表的一列 */
export interface ChipRow {
  ticker: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  /** 當日累計成交量（張） */
  volume: number | null;
  /** 量比：當日成交速度 / 前 5 日均量 */
  volumeRatio: number | null;
  pattern: PriceVolumePattern;
  /** 買賣超；個股單位張，大盤單位億元 */
  flow: InstitutionalFlow | null;
  flowUnit: 'lot' | 'yi';
  /** 主力買賣超（張）；加權指數列沒有分點資料，固定為 null */
  major: MajorTraderFlow | null;
}

export interface ChipsResponse {
  /** 最新交易日（台北時區 YYYY-MM-DD），用來判斷收盤資料是不是還落後一天 */
  tradingDate: string | null;
  /** 三大法人資料所屬交易日，台北時區 YYYY-MM-DD */
  flowDate: string | null;
  /** 主力（券商分點）資料所屬交易日，台北時區 YYYY-MM-DD */
  majorDate: string | null;
  rows: ChipRow[];
  /** 加權指數彙總列 */
  market: ChipRow | null;
}

export interface DividendEvent {
  ticker: string;
  exDate: Date;
  paymentDate: Date;
  amount: number; // TWD per share
  /** 除息前最後一個交易日收盤價 */
  priceBefore?: number;
  /** 單次現金殖利率 = amount / priceBefore */
  yieldPercent?: number;
}

export interface DividendIncome {
  ticker: string;
  stockName: string;
  exDate: Date;
  paymentDate: Date;
  amount: number;
  priceBefore?: number;
  yieldPercent?: number;
  sharesHeld: number;
  income: number;
}

export interface PortfolioSummary {
  totalInvested: number;
  totalMarketValue: number;
  totalUnrealizedGain: number;
  totalUnrealizedGainPercent: number;
  /** 今日損益合計（今日買進的部位以成交價為基準） */
  totalDayChange: number;
  /** 今日損益 ÷ 今日基準值 */
  totalDayChangePercent: number;
  totalRealizedGain: number;
  totalDividends: number;
  holdingsCount: number;
}

export interface RealizedGain {
  ticker: string;
  stockName: string;
  sellDate: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  gain: number;
  gainPercent: number;
}

/**
 * 單筆交易的收益狀況。
 * 賣出：FIFO 配對買入成本算出的已實現損益。
 * 買入：已被賣掉的部分算已實現，還持有的部分以現價算未實現，兩者相加。
 */
export interface TransactionPnL {
  /** 已實現 + 未實現；算不出來（買入但沒報價、賣出但沒有對應買入紀錄）為 null */
  gain: number | null;
  /** gain ÷ 成本基礎 */
  gainPercent: number | null;
  /** 已實現部分 */
  realized: number;
  /** 未實現部分；沒有現價時為 null */
  unrealized: number | null;
  /** 這筆買入已被賣掉的股數（賣出交易為賣出股數中配對到成本的部分） */
  soldShares: number;
  /** 這筆買入還持有的股數（賣出交易固定為 0） */
  heldShares: number;
  /** 算報酬率的分母 */
  basis: number;
}

// API response types
export interface TWseStockInfo {
  c: string;  // Stock code
  n: string;  // Company name
  z: string;  // Current price
  y: string;  // Previous close
  h: string;  // High
  l: string;  // Low
  v: string;  // Volume
  d: string;  // Date
  t: string;  // Time
  o?: string; // Open
  b?: string; // Best bids, underscore-separated
  a?: string; // Best asks, underscore-separated
}

export interface TWseApiResponse {
  msgArray: TWseStockInfo[];
  rtcode: string;
  rtmessage: string;
}
