import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  PriceHistory,
  MarketPriceData,
  MarketAnalysis,
  MarketForecast,
  MarketTrend,
  MarketSnapshot
} from './price-system.interface';

/**
 * Price History & Analytics Service
 * ระบบบันทึกและวิเคราะห์ประวัติราคาสินทรัพย์
 * 
 * ความรับผิดชอบหลัก:
 * 1. บันทึกประวัติราคาทุกการเปลี่ยนแปลง
 * 2. คำนวณ Technical Indicators (RSI, Moving Averages, etc.)
 * 3. วิเคราะห์ Market Trends และ Patterns
 * 4. ทำนายราคาแบบพื้นฐาน (Basic Forecasting)
 * 
 * การทำงาน:
 * - เก็บ Price History ในรูปแบบ Time Series
 * - คำนวณ Technical Analysis indicators
 * - ระบบ Pattern Recognition เบื้องต้น
 * - การ์ดข้อมูลไม่ให้เกินขีดจำกัด (Data Retention)
 */
@Injectable()
export class PriceHistoryService {
  private readonly logger = new Logger(PriceHistoryService.name);
  private readonly historyCache: Map<string, PriceHistory[]> = new Map(); // sessionId_assetId -> History[]
  private readonly analysisCache: Map<string, MarketAnalysis> = new Map(); // sessionId_assetId -> Analysis
  
  private readonly config = {
    maxHistoryRecords: 100, // เก็บ 100 records ต่อสินทรัพย์
    cacheTTL: 300000, // 5 minutes cache
    analysisUpdateInterval: 5, // update analysis ทุก 5 เทิร์น
    forecastHorizon: 10 // ทำนาย 10 เทิร์นข้างหน้า
  };

  constructor(private readonly prisma: PrismaService) {
    this.logger.log('📈 Price History & Analytics Service initialized');
    this.initializeAnalyticsEngine();
  }

  // ========================================
  //  Price History Management
  // ========================================

  /**
   * บันทึกประวัติราคาใหม่
   * เรียกใช้ทุกครั้งที่ราคาเปลี่ยนแปลง
   */
  async recordPriceHistory(
    sessionId: number,
    assetId: number,
    turn: number,
    price: number,
    volume: number,
    marketEventId?: string
  ): Promise<void> {
    try {
      const historyRecord: PriceHistory = {
        assetId,
        sessionId,
        turn,
        price,
        volume,
        marketEvent: marketEventId,
        timestamp: new Date()
      };

      // บันทึกลง cache
      const cacheKey = `${sessionId}_${assetId}`;
      if (!this.historyCache.has(cacheKey)) {
        this.historyCache.set(cacheKey, []);
      }
      
      const history = this.historyCache.get(cacheKey)!;
      history.push(historyRecord);
      
      // จำกัดจำนวน records
      if (history.length > this.config.maxHistoryRecords) {
        history.shift(); // ลบ record เก่าสุด
      }

      // บันทึกลง database
      await this.savePriceHistoryToDatabase(historyRecord);

      this.logger.debug(`📊 Price history recorded: Asset ${assetId}, Turn ${turn}, Price ${price}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to record price history: ${errorMessage}`);
    }
  }

  /**
   * ดึงประวัติราคาของสินทรัพย์
   */
  async getPriceHistory(
    sessionId: number,
    assetId: number,
    turns?: number
  ): Promise<PriceHistory[]> {
    try {
      const cacheKey = `${sessionId}_${assetId}`;
      let history = this.historyCache.get(cacheKey);

      if (!history) {
        // ดึงจาก database
        history = await this.loadPriceHistoryFromDatabase(sessionId, assetId);
        this.historyCache.set(cacheKey, history);
      }

      // จำกัดจำนวน records ถ้าระบุ
      if (turns && turns > 0) {
        return history.slice(-turns);
      }

      return [...history]; // return copy เพื่อไม่ให้แก้ไข cache

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to get price history: ${errorMessage}`);
      return [];
    }
  }

  /**
   * ลบประวัติราคาเก่า (Data Cleanup)
   */
  async cleanupOldHistory(sessionId: number, turnsToKeep: number = 50): Promise<void> {
    try {
      // ลบจาก cache
      for (const [key, history] of this.historyCache.entries()) {
        if (key.startsWith(`${sessionId}_`)) {
          if (history.length > turnsToKeep) {
            const toKeep = history.slice(-turnsToKeep);
            this.historyCache.set(key, toKeep);
          }
        }
      }

      // ลบจาก database
      await this.cleanupDatabaseHistory(sessionId, turnsToKeep);

      this.logger.log(`🧹 Cleaned up old price history for session ${sessionId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to cleanup history: ${errorMessage}`);
    }
  }

  // ========================================
  //  Technical Analysis Methods
  // ========================================

  /**
   * คำนวณ Market Analysis สำหรับสินทรัพย์
   */
  async calculateMarketAnalysis(
    sessionId: number,
    assetId: number,
    currentPrice: MarketPriceData
  ): Promise<MarketAnalysis> {
    try {
      const cacheKey = `${sessionId}_${assetId}`;
      
      // เช็ค cache ก่อน
      const cachedAnalysis = this.analysisCache.get(cacheKey);
      if (cachedAnalysis && this.isCacheValid(cachedAnalysis)) {
        return cachedAnalysis;
      }

      // ดึงประวัติราคา
      const history = await this.getPriceHistory(sessionId, assetId, 30); // ใช้ 30 เทิร์นล่าสุด
      
      if (history.length < 5) {
        // ข้อมูลไม่เพียงพอสำหรับการวิเคราะห์
        return this.getDefaultAnalysis(currentPrice);
      }

      // คำนวณ indicators ต่างๆ
      const prices = history.map(h => h.price);
      const volumes = history.map(h => h.volume);
      
      const trend = this.calculateTrend(prices);
      const momentum = this.calculateMomentum(prices);
      const { support, resistance } = this.calculateSupportResistance(prices);
      const rsi = this.calculateRSI(prices);
      const movingAverage = this.calculateMovingAverages(prices);
      const volatilityIndex = this.calculateVolatilityIndex(prices);
      const recommendation = this.generateRecommendation(rsi, trend, momentum);

      const analysis: MarketAnalysis = {
        trend,
        momentum,
        support,
        resistance,
        rsi,
        movingAverage,
        volatilityIndex,
        recommendation
      };

      // บันทึกลง cache
      this.analysisCache.set(cacheKey, analysis);

      this.logger.debug(`📊 Market analysis calculated for asset ${assetId}: ${trend}, RSI: ${rsi.toFixed(2)}`);

      return analysis;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to calculate market analysis: ${errorMessage}`);
      return this.getDefaultAnalysis(currentPrice);
    }
  }

  /**
   * สร้าง Market Forecast
   */
  async generateMarketForecast(
    sessionId: number,
    assetId: number,
    currentPrice: MarketPriceData
  ): Promise<MarketForecast> {
    try {
      const history = await this.getPriceHistory(sessionId, assetId, 20);
      const analysis = await this.calculateMarketAnalysis(sessionId, assetId, currentPrice);

      if (history.length < 10) {
        return this.getDefaultForecast(sessionId, assetId, currentPrice);
      }

      // คำนวณการทำนายราคา
      const prices = history.map(h => h.price);
      const nextTurnPrediction = this.predictNextPrice(prices, analysis);
      const shortTermOutlook = this.predictShortTerm(analysis, prices);
      const mediumTermOutlook = this.predictMediumTerm(analysis, prices);
      const riskFactors = this.identifyRiskFactors(analysis, history);
      const opportunities = this.identifyOpportunities(analysis, history);

      const forecast: MarketForecast = {
        assetId,
        sessionId,
        nextTurnPrediction,
        shortTermOutlook,
        mediumTermOutlook,
        riskFactors,
        opportunities,
        generatedAt: new Date()
      };

      this.logger.debug(`🔮 Market forecast generated for asset ${assetId}: next=${nextTurnPrediction.expectedPrice.toFixed(2)}`);

      return forecast;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to generate forecast: ${errorMessage}`);
      return this.getDefaultForecast(sessionId, assetId, currentPrice);
    }
  }

  // ========================================
  //  Technical Indicators Calculation
  // ========================================

  /**
   * คำนวณ Market Trend
   */
  private calculateTrend(prices: number[]): MarketTrend {
    if (prices.length < 3) return MarketTrend.NEUTRAL;

    const recentPrices = prices.slice(-5); // ใช้ 5 ราคาล่าสุด
    const first = recentPrices[0];
    const last = recentPrices[recentPrices.length - 1];
    const changePercent = ((last - first) / first) * 100;

    if (changePercent > 5) return MarketTrend.STRONGLY_BULLISH;
    if (changePercent > 2) return MarketTrend.BULLISH;
    if (changePercent > -2) return MarketTrend.NEUTRAL;
    if (changePercent > -5) return MarketTrend.BEARISH;
    return MarketTrend.STRONGLY_BEARISH;
  }

  /**
   * คำนวณ Momentum
   */
  private calculateMomentum(prices: number[]): number {
    if (prices.length < 10) return 0;

    const recent = prices.slice(-5);
    const previous = prices.slice(-10, -5);

    const recentAvg = recent.reduce((sum, p) => sum + p, 0) / recent.length;
    const previousAvg = previous.reduce((sum, p) => sum + p, 0) / previous.length;

    return ((recentAvg - previousAvg) / previousAvg);
  }

  /**
   * คำนวณ Support และ Resistance
   */
  private calculateSupportResistance(prices: number[]): { support: number; resistance: number } {
    if (prices.length < 5) {
      const currentPrice = prices[prices.length - 1];
      return {
        support: currentPrice * 0.95,
        resistance: currentPrice * 1.05
      };
    }

    const sortedPrices = [...prices].sort((a, b) => a - b);
    const minPrice = sortedPrices[0];
    const maxPrice = sortedPrices[sortedPrices.length - 1];

    // หา support และ resistance แบบง่าย
    const support = minPrice + (maxPrice - minPrice) * 0.2;
    const resistance = maxPrice - (maxPrice - minPrice) * 0.2;

    return { support, resistance };
  }

  /**
   * คำนวณ RSI (Relative Strength Index)
   */
  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50; // neutral RSI

    const gains: number[] = [];
    const losses: number[] = [];

    // คำนวณ gains และ losses
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    // ใช้ Simple Moving Average สำหรับ period แรก
    const avgGain = gains.slice(-period).reduce((sum, g) => sum + g, 0) / period;
    const avgLoss = losses.slice(-period).reduce((sum, l) => sum + l, 0) / period;

    if (avgLoss === 0) return 100; // ไม่มี loss = RSI 100

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return Math.max(0, Math.min(100, rsi));
  }

  /**
   * คำนวณ Moving Averages
   */
  private calculateMovingAverages(prices: number[]): {
    short: number;
    medium: number;
    long: number;
  } {
    const short = this.calculateSMA(prices, 5);
    const medium = this.calculateSMA(prices, 10);
    const long = this.calculateSMA(prices, 20);

    return { short, medium, long };
  }

  /**
   * คำนวณ Simple Moving Average
   */
  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) {
      return prices.reduce((sum, p) => sum + p, 0) / prices.length;
    }

    const recentPrices = prices.slice(-period);
    return recentPrices.reduce((sum, p) => sum + p, 0) / period;
  }

  /**
   * คำนวณ Volatility Index
   */
  private calculateVolatilityIndex(prices: number[]): number {
    if (prices.length < 5) return 0.1;

    // คำนวณ standard deviation ของผลตอบแทน
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);

    return Math.min(1, Math.max(0, volatility * 10)); // scale to 0-1
  }

  /**
   * สร้าง Recommendation
   */
  private generateRecommendation(
    rsi: number,
    trend: MarketTrend,
    momentum: number
  ): 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell' {
    let score = 0;

    // RSI scoring
    if (rsi < 30) score += 2; // oversold = buy signal
    else if (rsi < 40) score += 1;
    else if (rsi > 70) score -= 2; // overbought = sell signal
    else if (rsi > 60) score -= 1;

    // Trend scoring
    if (trend === MarketTrend.STRONGLY_BULLISH) score += 2;
    else if (trend === MarketTrend.BULLISH) score += 1;
    else if (trend === MarketTrend.STRONGLY_BEARISH) score -= 2;
    else if (trend === MarketTrend.BEARISH) score -= 1;

    // Momentum scoring
    if (momentum > 0.05) score += 1;
    else if (momentum < -0.05) score -= 1;

    // Convert score to recommendation
    if (score >= 3) return 'strong_buy';
    if (score >= 1) return 'buy';
    if (score <= -3) return 'strong_sell';
    if (score <= -1) return 'sell';
    return 'hold';
  }

  // ========================================
  //  Forecasting Methods
  // ========================================

  /**
   * ทำนายราคาเทิร์นถัดไป
   */
  private predictNextPrice(prices: number[], analysis: MarketAnalysis): {
    expectedPrice: number;
    confidence: number;
    priceRange: { min: number; max: number };
  } {
    const currentPrice = prices[prices.length - 1];
    const sma = analysis.movingAverage.short;
    const momentum = analysis.momentum;

    // แบบจำลองง่ายๆ: คาดการณ์จาก trend และ momentum
    let expectedChange = 0;

    // คำนวณจาก moving average divergence
    const maDivergence = (currentPrice - sma) / sma;
    expectedChange += maDivergence * 0.1; // mean reversion factor

    // คำนวณจาก momentum
    expectedChange += momentum * 0.3;

    // เพิ่ม random factor
    expectedChange += (Math.random() - 0.5) * 0.02; // ±1%

    const expectedPrice = currentPrice * (1 + expectedChange);

    // คำนวณ confidence จาก volatility
    const confidence = Math.max(0.3, 1 - analysis.volatilityIndex);

    // คำนวณ price range
    const priceRange = {
      min: expectedPrice * (1 - analysis.volatilityIndex),
      max: expectedPrice * (1 + analysis.volatilityIndex)
    };

    return { expectedPrice, confidence, priceRange };
  }

  /**
   * ทำนายแนวโน้มระยะสั้น (1-3 เทิร์น)
   */
  private predictShortTerm(analysis: MarketAnalysis, prices: number[]): MarketTrend {
    // ใช้ momentum และ RSI ในการทำนาย
    if (analysis.momentum > 0.03 && analysis.rsi < 70) {
      return MarketTrend.BULLISH;
    }
    if (analysis.momentum < -0.03 && analysis.rsi > 30) {
      return MarketTrend.BEARISH;
    }
    return MarketTrend.NEUTRAL;
  }

  /**
   * ทำนายแนวโน้มระยะกลาง (4-10 เทิร์น)
   */
  private predictMediumTerm(analysis: MarketAnalysis, prices: number[]): MarketTrend {
    // ใช้ moving average และ trend analysis
    const { short, medium, long } = analysis.movingAverage;
    
    if (short > medium && medium > long && analysis.trend !== MarketTrend.STRONGLY_BEARISH) {
      return MarketTrend.BULLISH;
    }
    if (short < medium && medium < long && analysis.trend !== MarketTrend.STRONGLY_BULLISH) {
      return MarketTrend.BEARISH;
    }
    return MarketTrend.NEUTRAL;
  }

  /**
   * ระบุปัจจัยเสี่ยง
   */
  private identifyRiskFactors(analysis: MarketAnalysis, history: PriceHistory[]): string[] {
    const risks: string[] = [];

    if (analysis.volatilityIndex > 0.5) {
      risks.push('High price volatility detected');
    }

    if (analysis.rsi > 80) {
      risks.push('Asset may be overbought');
    }

    if (analysis.momentum < -0.1) {
      risks.push('Strong negative momentum');
    }

    // เช็คการมี market events
    const recentEvents = history.filter(h => h.marketEvent).slice(-5);
    if (recentEvents.length > 2) {
      risks.push('Multiple market events affecting price');
    }

    return risks;
  }

  /**
   * ระบุโอกาส
   */
  private identifyOpportunities(analysis: MarketAnalysis, history: PriceHistory[]): string[] {
    const opportunities: string[] = [];

    if (analysis.rsi < 30) {
      opportunities.push('Asset may be oversold - potential buying opportunity');
    }

    if (analysis.momentum > 0.05 && analysis.trend === MarketTrend.BULLISH) {
      opportunities.push('Strong upward momentum continues');
    }

    if (analysis.recommendation === 'strong_buy') {
      opportunities.push('Technical indicators suggest strong buy signal');
    }

    return opportunities;
  }

  // ========================================
  //  Helper Methods
  // ========================================

  private async initializeAnalyticsEngine(): Promise<void> {
    this.logger.debug('🔧 Initializing technical analysis algorithms...');
    // Initialize any required data structures
  }

  private isCacheValid(analysis: MarketAnalysis): boolean {
    // Simple cache validation - could be more sophisticated
    return Date.now() - new Date().getTime() < this.config.cacheTTL;
  }

  private getDefaultAnalysis(currentPrice: MarketPriceData): MarketAnalysis {
    return {
      trend: MarketTrend.NEUTRAL,
      momentum: 0,
      support: currentPrice.currentPrice * 0.95,
      resistance: currentPrice.currentPrice * 1.05,
      rsi: 50,
      movingAverage: {
        short: currentPrice.currentPrice,
        medium: currentPrice.currentPrice,
        long: currentPrice.currentPrice
      },
      volatilityIndex: 0.1,
      recommendation: 'hold'
    };
  }

  private getDefaultForecast(sessionId: number, assetId: number, currentPrice: MarketPriceData): MarketForecast {
    return {
      assetId,
      sessionId,
      nextTurnPrediction: {
        expectedPrice: currentPrice.currentPrice,
        confidence: 0.5,
        priceRange: {
          min: currentPrice.currentPrice * 0.98,
          max: currentPrice.currentPrice * 1.02
        }
      },
      shortTermOutlook: MarketTrend.NEUTRAL,
      mediumTermOutlook: MarketTrend.NEUTRAL,
      riskFactors: ['Insufficient historical data'],
      opportunities: ['Monitor for more data'],
      generatedAt: new Date()
    };
  }

  private async savePriceHistoryToDatabase(history: PriceHistory): Promise<void> {
    // TODO: Save to database
    this.logger.debug(`💾 Price history saved: ${history.assetId} at ${history.price}`);
  }

  private async loadPriceHistoryFromDatabase(sessionId: number, assetId: number): Promise<PriceHistory[]> {
    // TODO: Load from database
    return [];
  }

  private async cleanupDatabaseHistory(sessionId: number, turnsToKeep: number): Promise<void> {
    // TODO: Database cleanup
    this.logger.debug(`🗑️ Database history cleanup: session ${sessionId}, keep ${turnsToKeep} turns`);
  }

  // ========================================
  //  Public Query Methods
  // ========================================

  /**
   * ดึงสถิติ Price History System
   */
  getHistorySystemStats() {
    let totalRecords = 0;
    let totalAssets = 0;

    for (const history of this.historyCache.values()) {
      totalRecords += history.length;
      totalAssets++;
    }

    return {
      totalRecords,
      totalAssets,
      cacheSize: this.historyCache.size,
      analysisCache: this.analysisCache.size,
      config: this.config
    };
  }

  /**
   * ล้าง cache
   */
  clearCache(): void {
    this.historyCache.clear();
    this.analysisCache.clear();
    this.logger.log('🧹 Price history cache cleared');
  }
}