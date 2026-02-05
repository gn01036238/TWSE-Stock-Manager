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

export interface DividendEvent {
  ticker: string;
  exDate: Date;
  paymentDate: Date;
  amount: number; // TWD per share
}

export interface DividendIncome {
  ticker: string;
  stockName: string;
  exDate: Date;
  paymentDate: Date;
  amount: number;
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
}

export interface TWseApiResponse {
  msgArray: TWseStockInfo[];
  rtcode: string;
  rtmessage: string;
}
