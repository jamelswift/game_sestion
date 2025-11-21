/**
 * Market Price System Interfaces
 * ระบบจัดการราคาตลาดและเหตุการณ์ทางเศรษฐกิจ
 * 
 * Features:
 * - Dynamic asset pricing with real-time updates
 * - Market events that affect prices globally
 * - Price history tracking for analytics
 * - Economic indicators and market sentiment
 */

export interface MarketPriceData {
  assetId: number;
  sessionId: number;
  currentPrice: number;
  previousPrice: number;
  basePrice: number; // ราคาเริ่มต้นจาก database
  priceChange: number;
  priceChangePercentage: number;
  changePercent?: number; // alias for priceChangePercentage for broadcasting
  dayHigh: number;
  dayLow: number;
  volume: number; // จำนวนการซื้อขาย
  lastUpdated: Date;
  volatility: number; // ความผันผวน 0-1
  marketTrend: MarketTrend;
}

export interface MarketEvent {
  id: string;
  sessionId: number;
  type: MarketEventType;
  title: string;
  description: string;
  severity: EventSeverity;
  duration: number; // จำนวนเทิร์นที่มีผล
  startTurn: number;
  endTurn: number;
  affectedAssets: number[]; // IDs ของสินทรัพย์ที่ได้รับผลกระทบ
  priceMultipliers: Record<number, number>; // assetId -> multiplier
  economicImpact: EconomicImpact;
  triggerConditions?: EventTrigger[];
  isActive: boolean;
  createdAt: Date;
}

export interface PriceHistory {
  assetId: number;
  sessionId: number;
  turn: number;
  price: number;
  volume: number;
  marketEvent?: string; // ID ของ event ที่เกิดขึ้น
  timestamp: Date;
}

export interface EconomicIndicators {
  sessionId: number;
  turn: number;
  marketSentiment: number; // -1 (bearish) ถึง 1 (bullish)
  inflationRate: number; // %
  interestRate: number; // %
  unemploymentRate: number; // %
  gdpGrowth: number; // %
  consumerConfidence: number; // 0-100
  marketVolatility: number; // 0-1
  economicPhase: EconomicPhase;
  lastUpdated: Date;
}

export interface MarketSnapshot {
  sessionId: number;
  turn: number;
  totalMarketValue: number;
  activeAssets: MarketPriceData[];
  activeEvents: MarketEvent[];
  economicIndicators: EconomicIndicators;
  topGainers: AssetPerformance[];
  topLosers: AssetPerformance[];
  timestamp: Date;
}

export interface AssetPerformance {
  assetId: number;
  assetName: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercentage: number;
  volume: number;
  marketCap?: number;
}

export interface PriceUpdateResult {
  success: boolean;
  updatedAssets: MarketPriceData[];
  triggeredEvents: MarketEvent[];
  economicIndicators: EconomicIndicators;
  message: string;
  errors?: string[];
}

// Enums

export enum MarketEventType {
  ECONOMIC_BOOM = 'economic_boom',
  RECESSION = 'recession',
  TECH_BUBBLE = 'tech_bubble',
  MARKET_CRASH = 'market_crash',
  BULL_MARKET = 'bull_market',
  BEAR_MARKET = 'bear_market',
  INFLATION_SPIKE = 'inflation_spike',
  INTEREST_RATE_CHANGE = 'interest_rate_change',
  NATURAL_DISASTER = 'natural_disaster',
  POLITICAL_UNREST = 'political_unrest',
  PANDEMIC = 'pandemic',
  REGULATORY_CHANGE = 'regulatory_change',
  COMPANY_NEWS = 'company_news',
  SECTOR_ROTATION = 'sector_rotation',
  CURRENCY_CRISIS = 'currency_crisis',
  COMMODITY_SHOCK = 'commodity_shock'
}

export enum EventSeverity {
  MINOR = 'minor',     // 1-5% price impact
  MODERATE = 'moderate', // 5-15% price impact
  MAJOR = 'major',     // 15-30% price impact
  SEVERE = 'severe'    // 30%+ price impact
}

export enum MarketTrend {
  STRONGLY_BEARISH = 'strongly_bearish',
  BEARISH = 'bearish',
  NEUTRAL = 'neutral',
  BULLISH = 'bullish',
  STRONGLY_BULLISH = 'strongly_bullish'
}

export enum EconomicPhase {
  EXPANSION = 'expansion',
  PEAK = 'peak',
  CONTRACTION = 'contraction',
  TROUGH = 'trough'
}

export interface EconomicImpact {
  gdpImpact: number; // %
  inflationImpact: number; // %
  unemploymentImpact: number; // %
  marketSentimentImpact: number; // -1 to 1
}

export interface EventTrigger {
  type: 'turn_count' | 'market_condition' | 'player_action' | 'random' | 'economic_indicator';
  condition: any;
  probability: number; // 0-1
}

// Price System Configuration
export interface PriceSystemConfig {
  priceUpdateInterval: number; // เทิร์น
  baseVolatility: number; // 0-1
  maxPriceChangePerTurn: number; // %
  eventProbabilityPerTurn: number; // 0-1
  enableRandomEvents: boolean;
  enableEconomicCycles: boolean;
  historicalDataRetention: number; // จำนวนเทิร์นที่เก็บข้อมูล
  minimumAssetPrice: number; // ราคาต่ำสุด
  maximumAssetPrice: number; // ราคาสูงสุด
  marketHours: {
    start: number; // เทิร์นที่ตลาดเปิด
    end: number;   // เทิร์นที่ตลาดปิด
  };
}

// WebSocket Events สำหรับ Price System
export interface PriceWebSocketEvents {
  // Server -> Client
  price_update: MarketPriceData[];
  market_event_triggered: MarketEvent;
  market_snapshot: MarketSnapshot;
  economic_indicators_updated: EconomicIndicators;
  asset_alert: { assetId: number; alertType: string; message: string };
  
  // Client -> Server
  subscribe_price_updates: { assetIds: number[] };
  unsubscribe_price_updates: { assetIds: number[] };
  request_market_snapshot: { sessionId: number };
  request_price_history: { assetId: number; turns: number };
}

// Market Analysis Types
export interface MarketAnalysis {
  trend: MarketTrend;
  momentum: number; // -1 to 1
  support: number; // ราคาจุดรองรับ
  resistance: number; // ราคาจุดต้านทาน
  rsi: number; // Relative Strength Index 0-100
  movingAverage: {
    short: number; // MA 5 เทิร์น
    medium: number; // MA 10 เทิร์น
    long: number; // MA 20 เทิร์น
  };
  volatilityIndex: number; // 0-1
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
}

export interface MarketForecast {
  assetId: number;
  sessionId: number;
  nextTurnPrediction: {
    expectedPrice: number;
    confidence: number; // 0-1
    priceRange: { min: number; max: number };
  };
  shortTermOutlook: MarketTrend; // 1-3 เทิร์น
  mediumTermOutlook: MarketTrend; // 4-10 เทิร์น
  riskFactors: string[];
  opportunities: string[];
  generatedAt: Date;
}

/**
 * Price Broadcasting Message Interface
 * ข้อความสำหรับ WebSocket Broadcasting
 */
export interface PriceBroadcastMessage {
  type: 'price_update' | 'market_analysis' | 'market_forecast' | 'market_snapshot' | 'market_event';
  timestamp: Date;
  sessionId: number;
  data: any;
}

/**
 * Market Update Subscription Interface
 * การ Subscribe ข้อมูล Market Update
 */
export interface MarketUpdateSubscription {
  socketId: string;
  sessionId: number;
  subscribedAssets: Set<number>;
  updateFrequency: 'high' | 'normal' | 'low';
  includeAnalysis: boolean;
  includeForecast: boolean;
  lastUpdate: Date;
}

/**
 * Price Alert Interface
 * ระบบแจ้งเตือนราคา
 */
export interface PriceAlert {
  id: string;
  assetId: number;
  userId: string;
  type: 'above' | 'below' | 'change_percent';
  threshold: number;
  enabled: boolean;
  triggered: boolean;
  createdAt: Date;
  triggeredAt?: Date;
}

/**
 * Market Event Info for Market Snapshot
 */
export interface MarketEventInfo {
  id: string;
  type: MarketEventType;
  title: string;
  severity: EventSeverity;
  turnsRemaining: number;
}