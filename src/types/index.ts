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
}

export interface ChipsResponse {
  /** 三大法人資料所屬交易日，台北時區 YYYY-MM-DD */
  flowDate: string | null;
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
