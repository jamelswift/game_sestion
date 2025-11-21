import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  MarketPriceData,
  MarketEvent,
  PriceHistory,
  EconomicIndicators,
  MarketSnapshot,
  PriceUpdateResult,
  MarketTrend,
  EconomicPhase,
  EventSeverity,
  PriceSystemConfig,
  MarketAnalysis,
  MarketForecast
} from './price-system.interface';

/**
 * Dynamic Price Engine Logic
 * ระบบคำนวณและจัดการราคาสินทรัพย์แบบ Dynamic
 * 
 * ความรับผิดชอบหลัก:
 * 1. คำนวณราคาสินทรัพย์ตามสภาวะตลาด
 * 2. จำลองความผันผวนของราคา (Volatility)
 * 3. ประมวลผลผลกระทบจาก Market Events
 * 4. ติดตาม Price History และ Market Trends
 * 
 * การทำงาน:
 * - ใช้ algorithms ทางการเงินในการคำนวณราคา
 * - รองรับ Random Walk และ Mean Reversion
 * - คำนวณ Technical Indicators (RSI, Moving Averages)
 * - จำลอง Market Psychology และ Sentiment
 */
@Injectable()
export class DynamicPriceEngine {
  private readonly logger = new Logger(DynamicPriceEngine.name);
  private readonly priceCache: Map<string, MarketPriceData> = new Map(); // sessionId_assetId -> PriceData
  private readonly updateTimers: Map<number, NodeJS.Timeout> = new Map(); // sessionId -> Timer
  
  private readonly config: PriceSystemConfig = {
    priceUpdateInterval: 1, // ทุกเทิร์น
    baseVolatility: 0.02, // 2% volatility พื้นฐาน
    maxPriceChangePerTurn: 0.15, // ±15% ต่อเทิร์น
    eventProbabilityPerTurn: 0.1, // 10% โอกาสเกิด event
    enableRandomEvents: true,
    enableEconomicCycles: true,
    historicalDataRetention: 50, // เก็บ 50 เทิร์น
    minimumAssetPrice: 10, // ราคาต่ำสุด 10 บาท
    maximumAssetPrice: 1000000, // ราคาสูงสุด 1 ล้าน
    marketHours: { start: 1, end: 999 }
  };

  constructor(private readonly prisma: PrismaService) {
    this.logger.log('💹 Dynamic Price Engine initialized');
    this.initializePriceEngine();
  }

  // ========================================
  //  Core Price Calculation Methods
  // ========================================

  /**
   * อัปเดตราคาสินทรัพย์ทั้งหมดใน session
   * เรียกใช้ทุกเทิร์นหรือเมื่อมี market events
   */
  async updateMarketPrices(sessionId: number, currentTurn: number): Promise<PriceUpdateResult> {
    try {
      this.logger.debug(`🔄 Updating market prices for session ${sessionId}, turn ${currentTurn}`);
      
      // ดึงข้อมูลสินทรัพย์ทั้งหมดใน session
      const sessionAssets = await this.getSessionAssets(sessionId);
      const updatedAssets: MarketPriceData[] = [];
      const errors: string[] = [];
      
      // ดึง Economic Indicators ปัจจุบัน
      const economicIndicators = await this.getEconomicIndicators(sessionId, currentTurn);
      
      // อัปเดตราคาแต่ละสินทรัพย์
      for (const asset of sessionAssets) {
        try {
          const updatedPrice = await this.calculateNewPrice(asset, economicIndicators, currentTurn);
          updatedAssets.push(updatedPrice);
          
          // บันทึกลง cache และ database
          await this.savePriceData(updatedPrice);
          await this.savePriceHistory(updatedPrice, currentTurn);
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Failed to update asset ${asset.assetId}: ${errorMessage}`);
          this.logger.error(`❌ Price update failed for asset ${asset.assetId}: ${errorMessage}`);
        }
      }
      
      // ตรวจสอบและ trigger market events
      const triggeredEvents = await this.checkMarketEventTriggers(sessionId, currentTurn, updatedAssets);
      
      this.logger.log(`✅ Updated ${updatedAssets.length} asset prices in session ${sessionId}`);
      
      return {
        success: errors.length === 0,
        updatedAssets,
        triggeredEvents,
        economicIndicators,
        message: `Updated ${updatedAssets.length} assets`,
        errors: errors.length > 0 ? errors : undefined
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Market price update failed: ${errorMessage}`);
      
      return {
        success: false,
        updatedAssets: [],
        triggeredEvents: [],
        economicIndicators: await this.getEconomicIndicators(sessionId, currentTurn),
        message: 'Price update failed',
        errors: [errorMessage]
      };
    }
  }

  /**
   * คำนวณราคาใหม่สำหรับสินทรัพย์หนึ่งตัว
   * ใช้ Random Walk + Mean Reversion + Market Events
   */
  private async calculateNewPrice(
    currentPrice: MarketPriceData,
    economicIndicators: EconomicIndicators,
    turn: number
  ): Promise<MarketPriceData> {
    
    // 1. คำนวณ Base Change จาก Random Walk
    const randomFactor = this.generateRandomWalk();
    
    // 2. คำนวณ Mean Reversion (แรงดึงกลับสู่ราคาฐาน)
    const meanReversionFactor = this.calculateMeanReversion(currentPrice);
    
    // 3. คำนวณผลกระทบจาก Economic Indicators
    const economicFactor = this.calculateEconomicImpact(economicIndicators);
    
    // 4. คำนวณผลกระทบจาก Market Events
    const eventFactor = await this.calculateEventImpact(currentPrice.sessionId, currentPrice.assetId, turn);
    
    // 5. คำนวณ Volatility แบบ dynamic
    const volatility = this.calculateDynamicVolatility(currentPrice, economicIndicators);
    
    // 6. รวมปัจจัยทั้งหมด
    const totalChange = (randomFactor + meanReversionFactor + economicFactor + eventFactor) * volatility;
    
    // 7. จำกัดการเปลี่ยนแปลงไม่ให้เกินขีดจำกัด
    const limitedChange = Math.max(-this.config.maxPriceChangePerTurn, 
                          Math.min(this.config.maxPriceChangePerTurn, totalChange));
    
    // 8. คำนวณราคาใหม่
    const newPrice = currentPrice.currentPrice * (1 + limitedChange);
    const finalPrice = Math.max(this.config.minimumAssetPrice, 
                       Math.min(this.config.maximumAssetPrice, newPrice));
    
    // 9. อัปเดตข้อมูลตลาด
    const priceChange = finalPrice - currentPrice.currentPrice;
    const priceChangePercentage = (priceChange / currentPrice.currentPrice) * 100;
    
    return {
      ...currentPrice,
      previousPrice: currentPrice.currentPrice,
      currentPrice: finalPrice,
      priceChange,
      priceChangePercentage,
      dayHigh: Math.max(currentPrice.dayHigh, finalPrice),
      dayLow: Math.min(currentPrice.dayLow, finalPrice),
      volume: currentPrice.volume + this.generateVolume(Math.abs(priceChangePercentage)),
      lastUpdated: new Date(),
      volatility,
      marketTrend: this.calculateMarketTrend(priceChangePercentage)
    };
  }

  /**
   * คำนวณ Economic Indicators สำหรับ session
   */
  async updateEconomicIndicators(sessionId: number, currentTurn: number): Promise<EconomicIndicators> {
    try {
      // ดึงข้อมูลเก่า
      const previousIndicators = await this.getEconomicIndicators(sessionId, currentTurn - 1);
      
      // คำนวณค่าใหม่
      const marketSentiment = await this.calculateMarketSentiment(sessionId);
      const inflationRate = this.updateInflationRate(previousIndicators.inflationRate);
      const interestRate = this.updateInterestRate(previousIndicators.interestRate, inflationRate);
      const unemploymentRate = this.updateUnemploymentRate(previousIndicators.unemploymentRate);
      const gdpGrowth = this.calculateGDPGrowth(inflationRate, unemploymentRate);
      const consumerConfidence = this.calculateConsumerConfidence(gdpGrowth, unemploymentRate);
      const marketVolatility = await this.calculateMarketVolatility(sessionId);
      const economicPhase = this.determineEconomicPhase(gdpGrowth, inflationRate, unemploymentRate);
      
      const newIndicators: EconomicIndicators = {
        sessionId,
        turn: currentTurn,
        marketSentiment,
        inflationRate,
        interestRate,
        unemploymentRate,
        gdpGrowth,
        consumerConfidence,
        marketVolatility,
        economicPhase,
        lastUpdated: new Date()
      };
      
      // บันทึกลง database
      await this.saveEconomicIndicators(newIndicators);
      
      this.logger.debug(`📊 Economic indicators updated for session ${sessionId}: sentiment=${marketSentiment.toFixed(2)}, phase=${economicPhase}`);
      
      return newIndicators;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to update economic indicators: ${errorMessage}`);
      throw error;
    }
  }

  // ========================================
  //  Price Calculation Helper Methods
  // ========================================

  /**
   * สร้าง Random Walk สำหรับราคา
   */
  private generateRandomWalk(): number {
    // Box-Muller transformation สำหรับ normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    
    return z0 * this.config.baseVolatility;
  }

  /**
   * คำนวณ Mean Reversion (แรงดึงกลับสู่ราคาฐาน)
   */
  private calculateMeanReversion(priceData: MarketPriceData): number {
    const deviationFromBase = (priceData.currentPrice - priceData.basePrice) / priceData.basePrice;
    const reversionStrength = 0.05; // 5% แรงดึงกลับ
    
    return -deviationFromBase * reversionStrength;
  }

  /**
   * คำนวณผลกระทบจาก Economic Indicators
   */
  private calculateEconomicImpact(indicators: EconomicIndicators): number {
    let impact = 0;
    
    // Market sentiment impact
    impact += indicators.marketSentiment * 0.02;
    
    // Inflation impact (เงินเฟ้อสูง = ราคาสินทรัพย์สูง)
    impact += (indicators.inflationRate - 2) * 0.001; // 2% เป็น baseline
    
    // Interest rate impact (ดอกเบี้ยสูง = ราคาหุ้นต่ำ)
    impact -= (indicators.interestRate - 3) * 0.002; // 3% เป็น baseline
    
    // GDP growth impact
    impact += indicators.gdpGrowth * 0.001;
    
    // Consumer confidence impact
    impact += (indicators.consumerConfidence - 50) * 0.0002;
    
    return impact;
  }

  /**
   * คำนวณผลกระทบจาก Market Events
   */
  private async calculateEventImpact(sessionId: number, assetId: number, turn: number): Promise<number> {
    // ดึง active events ที่ส่งผลต่อสินทรัพย์นี้
    const activeEvents = await this.getActiveMarketEvents(sessionId, assetId, turn);
    
    let totalImpact = 0;
    for (const event of activeEvents) {
      const multiplier = event.priceMultipliers[assetId] || 1;
      const eventImpact = (multiplier - 1) * this.getEventIntensity(event, turn);
      totalImpact += eventImpact;
    }
    
    return totalImpact;
  }

  /**
   * คำนวณ Dynamic Volatility
   */
  private calculateDynamicVolatility(
    priceData: MarketPriceData,
    indicators: EconomicIndicators
  ): number {
    let volatility = this.config.baseVolatility;
    
    // เพิ่ม volatility ตาม market volatility index
    volatility *= (1 + indicators.marketVolatility);
    
    // เพิ่ม volatility ตาม economic uncertainty
    const uncertainty = Math.abs(indicators.gdpGrowth) + Math.abs(indicators.inflationRate - 2);
    volatility *= (1 + uncertainty * 0.01);
    
    // เพิ่ม volatility ถ้า sentiment extreme
    const extremeSentiment = Math.abs(indicators.marketSentiment);
    if (extremeSentiment > 0.7) {
      volatility *= 1.5;
    }
    
    return Math.min(volatility, 0.5); // จำกัดไม่เกิน 50%
  }

  /**
   * คำนวณ Market Trend จากการเปลี่ยนแปลงราคา
   */
  private calculateMarketTrend(priceChangePercentage: number): MarketTrend {
    if (priceChangePercentage > 5) return MarketTrend.STRONGLY_BULLISH;
    if (priceChangePercentage > 2) return MarketTrend.BULLISH;
    if (priceChangePercentage > -2) return MarketTrend.NEUTRAL;
    if (priceChangePercentage > -5) return MarketTrend.BEARISH;
    return MarketTrend.STRONGLY_BEARISH;
  }

  /**
   * คำนวณ Market Sentiment จากราคาสินทรัพย์ทั้งหมด
   */
  private async calculateMarketSentiment(sessionId: number): Promise<number> {
    const sessionAssets = await this.getSessionAssets(sessionId);
    
    if (sessionAssets.length === 0) return 0;
    
    const totalSentiment = sessionAssets.reduce((sum, asset) => {
      const sentiment = asset.priceChangePercentage > 0 ? 1 : 
                       asset.priceChangePercentage < 0 ? -1 : 0;
      return sum + sentiment;
    }, 0);
    
    return totalSentiment / sessionAssets.length;
  }

  /**
   * สร้าง Volume ตามการเปลี่ยนแปลงราคา
   */
  private generateVolume(priceChangePercentage: number): number {
    const baseVolume = 100;
    const volatilityMultiplier = 1 + Math.abs(priceChangePercentage) * 10;
    return Math.floor(baseVolume * volatilityMultiplier * (0.5 + Math.random()));
  }

  // ========================================
  //  Economic Indicators Calculation
  // ========================================

  private updateInflationRate(currentRate: number): number {
    const randomChange = (Math.random() - 0.5) * 0.2; // ±0.1%
    const newRate = currentRate + randomChange;
    return Math.max(0, Math.min(10, newRate)); // 0-10%
  }

  private updateInterestRate(currentRate: number, inflationRate: number): number {
    // ดอกเบี้ยปรับตามเงินเฟ้อ
    const targetRate = inflationRate + 1; // เงินเฟ้อ + 1%
    const adjustment = (targetRate - currentRate) * 0.1; // ปรับ 10% ต่อเทิร์น
    const newRate = currentRate + adjustment + (Math.random() - 0.5) * 0.1;
    return Math.max(0, Math.min(15, newRate)); // 0-15%
  }

  private updateUnemploymentRate(currentRate: number): number {
    const randomChange = (Math.random() - 0.5) * 0.2; // ±0.1%
    const newRate = currentRate + randomChange;
    return Math.max(1, Math.min(20, newRate)); // 1-20%
  }

  private calculateGDPGrowth(inflationRate: number, unemploymentRate: number): number {
    // GDP ต้านกับอัตราการว่างงาน และได้ประโยชน์จากเงินเฟ้อปานกลาง
    const baseGrowth = 3; // 3% baseline
    const unemploymentImpact = -(unemploymentRate - 5) * 0.2; // 5% เป็น natural rate
    const inflationImpact = inflationRate < 4 ? inflationRate * 0.1 : -(inflationRate - 4) * 0.2;
    const randomFactor = (Math.random() - 0.5) * 2; // ±1%
    
    return baseGrowth + unemploymentImpact + inflationImpact + randomFactor;
  }

  private calculateConsumerConfidence(gdpGrowth: number, unemploymentRate: number): number {
    const baseConfidence = 50;
    const gdpImpact = gdpGrowth * 5; // GDP 1% = confidence +5
    const unemploymentImpact = -(unemploymentRate - 5) * 2; // unemployment 1% = confidence -2
    const randomFactor = (Math.random() - 0.5) * 10; // ±5
    
    const confidence = baseConfidence + gdpImpact + unemploymentImpact + randomFactor;
    return Math.max(0, Math.min(100, confidence));
  }

  private async calculateMarketVolatility(sessionId: number): Promise<number> {
    const sessionAssets = await this.getSessionAssets(sessionId);
    
    if (sessionAssets.length === 0) return 0;
    
    const avgVolatility = sessionAssets.reduce((sum, asset) => sum + asset.volatility, 0) / sessionAssets.length;
    return avgVolatility;
  }

  private determineEconomicPhase(gdpGrowth: number, inflationRate: number, unemploymentRate: number): EconomicPhase {
    if (gdpGrowth > 3 && unemploymentRate < 5) return EconomicPhase.EXPANSION;
    if (gdpGrowth > 2 && inflationRate > 4) return EconomicPhase.PEAK;
    if (gdpGrowth < 0 || unemploymentRate > 8) return EconomicPhase.CONTRACTION;
    return EconomicPhase.TROUGH;
  }

  // ========================================
  //  Data Access Methods
  // ========================================

  /**
   * ดึงข้อมูลสินทรัพย์ทั้งหมดใน session
   */
  private async getSessionAssets(sessionId: number): Promise<MarketPriceData[]> {
    // TODO: Implement database query
    // For now, return cached data or default
    return [];
  }

  /**
   * ดึง Economic Indicators
   */
  private async getEconomicIndicators(sessionId: number, turn: number): Promise<EconomicIndicators> {
    // TODO: Implement database query
    // Return default indicators for now
    return {
      sessionId,
      turn,
      marketSentiment: 0,
      inflationRate: 2.5,
      interestRate: 3.5,
      unemploymentRate: 5.0,
      gdpGrowth: 2.5,
      consumerConfidence: 60,
      marketVolatility: 0.1,
      economicPhase: EconomicPhase.EXPANSION,
      lastUpdated: new Date()
    };
  }

  private async getActiveMarketEvents(sessionId: number, assetId: number, turn: number): Promise<MarketEvent[]> {
    // TODO: Implement database query for active events
    return [];
  }

  private async checkMarketEventTriggers(sessionId: number, turn: number, prices: MarketPriceData[]): Promise<MarketEvent[]> {
    // TODO: Implement event trigger logic
    return [];
  }

  private getEventIntensity(event: MarketEvent, currentTurn: number): number {
    const eventAge = currentTurn - event.startTurn;
    const eventDuration = event.endTurn - event.startTurn;
    
    if (eventAge > eventDuration) return 0;
    
    // Event intensity decreases over time
    return 1 - (eventAge / eventDuration);
  }

  private async savePriceData(priceData: MarketPriceData): Promise<void> {
    // Save to cache
    const key = `${priceData.sessionId}_${priceData.assetId}`;
    this.priceCache.set(key, priceData);
    
    // TODO: Save to database
  }

  private async savePriceHistory(priceData: MarketPriceData, turn: number): Promise<void> {
    // TODO: Save price history to database
  }

  private async saveEconomicIndicators(indicators: EconomicIndicators): Promise<void> {
    // TODO: Save economic indicators to database
  }

  // ========================================
  //  Initialization
  // ========================================

  private async initializePriceEngine(): Promise<void> {
    this.logger.debug('🔧 Initializing price calculation algorithms...');
    // Initialize any required data structures or algorithms
  }

  // ========================================
  //  Public Query Methods
  // ========================================

  /**
   * ดึงราคาปัจจุบันของสินทรัพย์
   */
  async getCurrentPrice(sessionId: number, assetId: number): Promise<number> {
    const key = `${sessionId}_${assetId}`;
    const cachedPrice = this.priceCache.get(key);
    
    if (cachedPrice) {
      return cachedPrice.currentPrice;
    }
    
    // TODO: Query from database
    return 0;
  }

  /**
   * ดึงข้อมูลตลาดทั้งหมด
   */
  async getMarketSnapshot(sessionId: number, turn: number): Promise<MarketSnapshot> {
    const activeAssets = await this.getSessionAssets(sessionId);
    const economicIndicators = await this.getEconomicIndicators(sessionId, turn);
    const activeEvents = await this.getActiveMarketEvents(sessionId, 0, turn);
    
    // คำนวณ top gainers/losers
    const sortedByPerformance = [...activeAssets].sort((a, b) => b.priceChangePercentage - a.priceChangePercentage);
    const topGainers = sortedByPerformance.slice(0, 5).map(asset => ({
      assetId: asset.assetId,
      assetName: `Asset ${asset.assetId}`, // TODO: Get real name
      currentPrice: asset.currentPrice,
      priceChange: asset.priceChange,
      priceChangePercentage: asset.priceChangePercentage,
      volume: asset.volume
    }));
    const topLosers = sortedByPerformance.slice(-5).reverse().map(asset => ({
      assetId: asset.assetId,
      assetName: `Asset ${asset.assetId}`,
      currentPrice: asset.currentPrice,
      priceChange: asset.priceChange,
      priceChangePercentage: asset.priceChangePercentage,
      volume: asset.volume
    }));
    
    return {
      sessionId,
      turn,
      totalMarketValue: activeAssets.reduce((sum, asset) => sum + asset.currentPrice * asset.volume, 0),
      activeAssets,
      activeEvents,
      economicIndicators,
      topGainers,
      topLosers,
      timestamp: new Date()
    };
  }

  /**
   * ดึงสถิติราคาระบบ
   */
  getPriceSystemStats() {
    return {
      cachedPrices: this.priceCache.size,
      activeTimers: this.updateTimers.size,
      config: this.config,
      lastUpdate: new Date()
    };
  }
}