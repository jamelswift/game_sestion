import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  MarketEvent,
  MarketEventType,
  EventSeverity,
  EconomicImpact,
  EventTrigger,
  EconomicIndicators,
  MarketPriceData
} from './price-system.interface';

/**
 * Market Events System
 * ระบบจัดการเหตุการณ์ตลาดที่ส่งผลต่อราคาสินทรัพย์
 * 
 * ความรับผิดชอบหลัก:
 * 1. สร้างและจัดการ Market Events
 * 2. ตรวจสอบเงื่อนไขการ trigger events
 * 3. คำนวณผลกระทบต่อราคาและเศรษฐกิจ
 * 4. จัดการระยะเวลาและความเข้มข้นของ events
 * 
 * การทำงาน:
 * - มี Event Templates ที่กำหนดไว้ล่วงหน้า
 * - ระบบ Random Events และ Triggered Events
 * - คำนวณผลกระทบแบบ Dynamic ตามสถานการณ์
 * - รองรับ Event Cascading (Event หนึ่งทำให้เกิด Event อื่น)
 */
@Injectable()
export class MarketEventsSystem {
  private readonly logger = new Logger(MarketEventsSystem.name);
  private readonly activeEvents: Map<string, MarketEvent> = new Map(); // eventId -> Event
  private readonly eventTemplates: Map<MarketEventType, Partial<MarketEvent>> = new Map();
  
  constructor(private readonly prisma: PrismaService) {
    this.logger.log('📰 Market Events System initialized');
    this.initializeEventTemplates();
  }

  // ========================================
  //  Core Event Management Methods
  // ========================================

  /**
   * ตรวจสอบและ trigger market events
   * เรียกใช้ทุกเทิร์นหรือเมื่อมีเงื่อนไขเหมาะสม
   */
  async checkAndTriggerEvents(
    sessionId: number,
    currentTurn: number,
    marketData: MarketPriceData[],
    economicIndicators: EconomicIndicators
  ): Promise<MarketEvent[]> {
    try {
      this.logger.debug(`🔍 Checking event triggers for session ${sessionId}, turn ${currentTurn}`);
      
      const triggeredEvents: MarketEvent[] = [];
      
      // 1. ตรวจสอบ Random Events
      const randomEvents = await this.checkRandomEventTriggers(sessionId, currentTurn, economicIndicators);
      triggeredEvents.push(...randomEvents);
      
      // 2. ตรวจสอบ Condition-based Events
      const conditionEvents = await this.checkConditionBasedEvents(sessionId, currentTurn, marketData, economicIndicators);
      triggeredEvents.push(...conditionEvents);
      
      // 3. ตรวจสอบ Economic Threshold Events
      const thresholdEvents = await this.checkEconomicThresholdEvents(sessionId, currentTurn, economicIndicators);
      triggeredEvents.push(...thresholdEvents);
      
      // 4. ตรวจสอบ Market Movement Events
      const movementEvents = await this.checkMarketMovementEvents(sessionId, currentTurn, marketData);
      triggeredEvents.push(...movementEvents);
      
      // 5. เปิดใช้งาน events ที่ถูก trigger
      for (const event of triggeredEvents) {
        await this.activateEvent(event);
      }
      
      // 6. อัปเดต active events และตรวจสอบ expiration
      await this.updateActiveEvents(sessionId, currentTurn);
      
      this.logger.log(`✅ ${triggeredEvents.length} events triggered in session ${sessionId}`);
      
      return triggeredEvents;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Event checking failed: ${errorMessage}`);
      return [];
    }
  }

  /**
   * สร้าง Market Event ใหม่
   */
  async createMarketEvent(
    sessionId: number,
    eventType: MarketEventType,
    currentTurn: number,
    customData?: Partial<MarketEvent>
  ): Promise<MarketEvent> {
    try {
      // ดึง template ของ event
      const template = this.eventTemplates.get(eventType);
      if (!template) {
        throw new Error(`Unknown event type: ${eventType}`);
      }
      
      // สร้าง event ID
      const eventId = this.generateEventId(sessionId, eventType, currentTurn);
      
      // คำนวณ affected assets
      const affectedAssets = await this.calculateAffectedAssets(sessionId, eventType);
      
      // คำนวณ price multipliers
      const priceMultipliers = this.calculatePriceMultipliers(eventType, affectedAssets, template.severity!);
      
      // สร้าง event object
      const marketEvent: MarketEvent = {
        id: eventId,
        sessionId,
        type: eventType,
        title: customData?.title || template.title || this.getDefaultEventTitle(eventType),
        description: customData?.description || template.description || this.getDefaultEventDescription(eventType),
        severity: customData?.severity || template.severity || EventSeverity.MODERATE,
        duration: customData?.duration || template.duration || this.getDefaultEventDuration(eventType),
        startTurn: currentTurn,
        endTurn: currentTurn + (customData?.duration || template.duration || this.getDefaultEventDuration(eventType)),
        affectedAssets,
        priceMultipliers,
        economicImpact: customData?.economicImpact || template.economicImpact || this.getDefaultEconomicImpact(eventType),
        triggerConditions: customData?.triggerConditions || template.triggerConditions,
        isActive: false, // จะ activate ทีหลัง
        createdAt: new Date()
      };
      
      this.logger.debug(`📰 Market event created: ${eventType} for session ${sessionId}`);
      
      return marketEvent;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to create market event: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * เปิดใช้งาน Market Event
   */
  async activateEvent(event: MarketEvent): Promise<void> {
    try {
      event.isActive = true;
      this.activeEvents.set(event.id, event);
      
      // บันทึกลง database
      await this.saveEventToDatabase(event);
      
      this.logger.log(`🚀 Event activated: ${event.type} (${event.title}) - Duration: ${event.duration} turns`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to activate event: ${errorMessage}`);
    }
  }

  /**
   * ปิดการใช้งาน Market Event
   */
  async deactivateEvent(eventId: string, reason: string = 'expired'): Promise<void> {
    try {
      const event = this.activeEvents.get(eventId);
      if (!event) {
        this.logger.warn(`⚠️ Attempted to deactivate non-existent event: ${eventId}`);
        return;
      }
      
      event.isActive = false;
      this.activeEvents.delete(eventId);
      
      // อัปเดต database
      await this.updateEventInDatabase(event);
      
      this.logger.log(`🏁 Event deactivated: ${event.type} (${reason})`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to deactivate event: ${errorMessage}`);
    }
  }

  // ========================================
  //  Event Trigger Checking Methods
  // ========================================

  /**
   * ตรวจสอบ Random Events
   */
  private async checkRandomEventTriggers(
    sessionId: number,
    currentTurn: number,
    economicIndicators: EconomicIndicators
  ): Promise<MarketEvent[]> {
    const events: MarketEvent[] = [];
    const baseEventProbability = 0.1; // 10% per turn
    
    // ปรับ probability ตาม economic conditions
    let adjustedProbability = baseEventProbability;
    
    // เพิ่ม probability ใน economic extremes
    if (Math.abs(economicIndicators.marketSentiment) > 0.7) {
      adjustedProbability *= 1.5;
    }
    
    if (economicIndicators.marketVolatility > 0.3) {
      adjustedProbability *= 1.3;
    }
    
    if (Math.random() < adjustedProbability) {
      // เลือก event type แบบสุ่ม (weighted by current conditions)
      const eventType = this.selectRandomEventType(economicIndicators);
      const event = await this.createMarketEvent(sessionId, eventType, currentTurn);
      events.push(event);
    }
    
    return events;
  }

  /**
   * ตรวจสอบ Condition-based Events
   */
  private async checkConditionBasedEvents(
    sessionId: number,
    currentTurn: number,
    marketData: MarketPriceData[],
    economicIndicators: EconomicIndicators
  ): Promise<MarketEvent[]> {
    const events: MarketEvent[] = [];
    
    // ตรวจสอบ Market Crash conditions
    const avgPriceChange = marketData.reduce((sum, asset) => sum + asset.priceChangePercentage, 0) / marketData.length;
    if (avgPriceChange < -10 && economicIndicators.marketSentiment < -0.5) {
      const event = await this.createMarketEvent(sessionId, MarketEventType.MARKET_CRASH, currentTurn);
      events.push(event);
    }
    
    // ตรวจสอบ Bull Market conditions
    if (avgPriceChange > 8 && economicIndicators.consumerConfidence > 70) {
      const event = await this.createMarketEvent(sessionId, MarketEventType.BULL_MARKET, currentTurn);
      events.push(event);
    }
    
    // ตรวจสอบ Recession conditions
    if (economicIndicators.gdpGrowth < -2 && economicIndicators.unemploymentRate > 8) {
      const event = await this.createMarketEvent(sessionId, MarketEventType.RECESSION, currentTurn);
      events.push(event);
    }
    
    return events;
  }

  /**
   * ตรวจสอบ Economic Threshold Events
   */
  private async checkEconomicThresholdEvents(
    sessionId: number,
    currentTurn: number,
    economicIndicators: EconomicIndicators
  ): Promise<MarketEvent[]> {
    const events: MarketEvent[] = [];
    
    // ตรวจสอบ Inflation Spike
    if (economicIndicators.inflationRate > 6) {
      const event = await this.createMarketEvent(sessionId, MarketEventType.INFLATION_SPIKE, currentTurn);
      events.push(event);
    }
    
    // ตรวจสอบ Interest Rate Change
    if (Math.abs(economicIndicators.interestRate - 3.5) > 2) {
      const event = await this.createMarketEvent(sessionId, MarketEventType.INTEREST_RATE_CHANGE, currentTurn);
      events.push(event);
    }
    
    return events;
  }

  /**
   * ตรวจสอบ Market Movement Events
   */
  private async checkMarketMovementEvents(
    sessionId: number,
    currentTurn: number,
    marketData: MarketPriceData[]
  ): Promise<MarketEvent[]> {
    const events: MarketEvent[] = [];
    
    // ตรวจสอบ Tech Bubble
    const techAssets = marketData.filter(asset => this.isTechAsset(asset.assetId));
    const avgTechGrowth = techAssets.reduce((sum, asset) => sum + asset.priceChangePercentage, 0) / techAssets.length;
    
    if (avgTechGrowth > 15 && techAssets.length > 0) {
      const event = await this.createMarketEvent(sessionId, MarketEventType.TECH_BUBBLE, currentTurn);
      events.push(event);
    }
    
    return events;
  }

  // ========================================
  //  Event Calculation Methods
  // ========================================

  /**
   * คำนวณสินทรัพย์ที่ได้รับผลกระทบ
   */
  private async calculateAffectedAssets(sessionId: number, eventType: MarketEventType): Promise<number[]> {
    // TODO: Query all assets in session from database
    const allAssets = [1, 2, 3, 4, 5]; // placeholder
    
    switch (eventType) {
      case MarketEventType.MARKET_CRASH:
      case MarketEventType.RECESSION:
      case MarketEventType.ECONOMIC_BOOM:
        return allAssets; // ส่งผลต่อทุกสินทรัพย์
        
      case MarketEventType.TECH_BUBBLE:
        return allAssets.filter(assetId => this.isTechAsset(assetId));
        
      case MarketEventType.INFLATION_SPIKE:
        return allAssets.filter(assetId => this.isInflationSensitive(assetId));
        
      case MarketEventType.INTEREST_RATE_CHANGE:
        return allAssets.filter(assetId => this.isInterestRateSensitive(assetId));
        
      default:
        // Random selection
        const count = Math.floor(allAssets.length * (0.3 + Math.random() * 0.4)); // 30-70%
        return this.shuffleArray([...allAssets]).slice(0, count);
    }
  }

  /**
   * คำนวณ Price Multipliers
   */
  private calculatePriceMultipliers(
    eventType: MarketEventType,
    affectedAssets: number[],
    severity: EventSeverity
  ): Record<number, number> {
    const multipliers: Record<number, number> = {};
    
    // คำนวณ base multiplier ตาม severity
    const severityMultipliers = {
      [EventSeverity.MINOR]: { min: 0.95, max: 1.05 },
      [EventSeverity.MODERATE]: { min: 0.85, max: 1.15 },
      [EventSeverity.MAJOR]: { min: 0.70, max: 1.30 },
      [EventSeverity.SEVERE]: { min: 0.50, max: 1.50 }
    };
    
    const range = severityMultipliers[severity];
    
    // คำนวณ multiplier แต่ละสินทรัพย์
    for (const assetId of affectedAssets) {
      let multiplier: number;
      
      switch (eventType) {
        case MarketEventType.MARKET_CRASH:
        case MarketEventType.RECESSION:
          multiplier = range.min + Math.random() * (1 - range.min); // Negative bias
          break;
          
        case MarketEventType.ECONOMIC_BOOM:
        case MarketEventType.BULL_MARKET:
          multiplier = 1 + Math.random() * (range.max - 1); // Positive bias
          break;
          
        case MarketEventType.TECH_BUBBLE:
          multiplier = this.isTechAsset(assetId) ? 
                      1 + Math.random() * (range.max - 1) : // Tech gains
                      range.min + Math.random() * (1 - range.min); // Others lose
          break;
          
        default:
          multiplier = range.min + Math.random() * (range.max - range.min); // Random
      }
      
      multipliers[assetId] = multiplier;
    }
    
    return multipliers;
  }

  /**
   * อัปเดต Active Events
   */
  private async updateActiveEvents(sessionId: number, currentTurn: number): Promise<void> {
    const expiredEventIds: string[] = [];
    
    for (const [eventId, event] of this.activeEvents.entries()) {
      if (event.sessionId !== sessionId) continue;
      
      // ตรวจสอบการหมดอายุ
      if (currentTurn >= event.endTurn) {
        expiredEventIds.push(eventId);
      }
    }
    
    // ปิด events ที่หมดอายุ
    for (const eventId of expiredEventIds) {
      await this.deactivateEvent(eventId, 'expired');
    }
  }

  // ========================================
  //  Event Templates & Defaults
  // ========================================

  /**
   * สร้าง Event Templates
   */
  private initializeEventTemplates(): void {
    // Economic Events
    this.eventTemplates.set(MarketEventType.ECONOMIC_BOOM, {
      severity: EventSeverity.MAJOR,
      duration: 5,
      economicImpact: { gdpImpact: 3, inflationImpact: 1, unemploymentImpact: -2, marketSentimentImpact: 0.5 }
    });
    
    this.eventTemplates.set(MarketEventType.RECESSION, {
      severity: EventSeverity.SEVERE,
      duration: 8,
      economicImpact: { gdpImpact: -4, inflationImpact: -1, unemploymentImpact: 3, marketSentimentImpact: -0.7 }
    });
    
    // Market Events
    this.eventTemplates.set(MarketEventType.MARKET_CRASH, {
      severity: EventSeverity.SEVERE,
      duration: 3,
      economicImpact: { gdpImpact: -2, inflationImpact: -0.5, unemploymentImpact: 1, marketSentimentImpact: -0.8 }
    });
    
    this.eventTemplates.set(MarketEventType.BULL_MARKET, {
      severity: EventSeverity.MAJOR,
      duration: 6,
      economicImpact: { gdpImpact: 2, inflationImpact: 0.5, unemploymentImpact: -1, marketSentimentImpact: 0.6 }
    });
    
    // Sector-specific Events
    this.eventTemplates.set(MarketEventType.TECH_BUBBLE, {
      severity: EventSeverity.MAJOR,
      duration: 4,
      economicImpact: { gdpImpact: 1, inflationImpact: 0, unemploymentImpact: -0.5, marketSentimentImpact: 0.3 }
    });
    
    // เพิ่ม templates อื่นๆ ตามต้องการ
    
    this.logger.debug(`📚 Initialized ${this.eventTemplates.size} event templates`);
  }

  private getDefaultEventTitle(eventType: MarketEventType): string {
    const titles = {
      [MarketEventType.ECONOMIC_BOOM]: 'Economic Boom',
      [MarketEventType.RECESSION]: 'Economic Recession',
      [MarketEventType.MARKET_CRASH]: 'Market Crash',
      [MarketEventType.BULL_MARKET]: 'Bull Market Rally',
      [MarketEventType.BEAR_MARKET]: 'Bear Market Decline',
      [MarketEventType.TECH_BUBBLE]: 'Technology Bubble',
      [MarketEventType.INFLATION_SPIKE]: 'Inflation Surge',
      [MarketEventType.INTEREST_RATE_CHANGE]: 'Interest Rate Adjustment',
      [MarketEventType.NATURAL_DISASTER]: 'Natural Disaster Impact',
      [MarketEventType.POLITICAL_UNREST]: 'Political Uncertainty',
      [MarketEventType.PANDEMIC]: 'Pandemic Effects',
      [MarketEventType.REGULATORY_CHANGE]: 'Regulatory Changes',
      [MarketEventType.COMPANY_NEWS]: 'Corporate News',
      [MarketEventType.SECTOR_ROTATION]: 'Sector Rotation',
      [MarketEventType.CURRENCY_CRISIS]: 'Currency Crisis',
      [MarketEventType.COMMODITY_SHOCK]: 'Commodity Price Shock'
    };
    
    return titles[eventType] || 'Market Event';
  }

  private getDefaultEventDescription(eventType: MarketEventType): string {
    const descriptions: Record<MarketEventType, string> = {
      [MarketEventType.ECONOMIC_BOOM]: 'Strong economic growth drives market optimism and asset prices higher.',
      [MarketEventType.RECESSION]: 'Economic contraction leads to widespread market decline and uncertainty.',
      [MarketEventType.MARKET_CRASH]: 'Sudden market crash causes panic selling across all asset classes.',
      [MarketEventType.BULL_MARKET]: 'Sustained market rally boosts investor confidence and asset values.',
      [MarketEventType.BEAR_MARKET]: 'Prolonged market decline creates pessimistic investor sentiment.',
      [MarketEventType.TECH_BUBBLE]: 'Technology sector experiences rapid price appreciation amid speculation.',
      [MarketEventType.INFLATION_SPIKE]: 'Rising inflation concerns impact market valuations and sentiment.',
      [MarketEventType.INTEREST_RATE_CHANGE]: 'Central bank policy changes affect investment decisions.',
      [MarketEventType.NATURAL_DISASTER]: 'Natural disasters disrupt markets and economic activity.',
      [MarketEventType.POLITICAL_UNREST]: 'Political uncertainty creates market volatility.',
      [MarketEventType.PANDEMIC]: 'Health crisis impacts global markets and supply chains.',
      [MarketEventType.REGULATORY_CHANGE]: 'New regulations reshape market dynamics.',
      [MarketEventType.COMPANY_NEWS]: 'Corporate announcements influence market sentiment.',
      [MarketEventType.SECTOR_ROTATION]: 'Investors shift focus between market sectors.',
      [MarketEventType.CURRENCY_CRISIS]: 'Currency instability affects international markets.',
      [MarketEventType.COMMODITY_SHOCK]: 'Commodity price changes impact related sectors.'
    };
    
    return descriptions[eventType] || 'A significant market event is affecting asset prices.';
  }

  private getDefaultEventDuration(eventType: MarketEventType): number {
    const durations: Record<MarketEventType, number> = {
      [MarketEventType.MARKET_CRASH]: 2,
      [MarketEventType.ECONOMIC_BOOM]: 6,
      [MarketEventType.RECESSION]: 8,
      [MarketEventType.BULL_MARKET]: 5,
      [MarketEventType.BEAR_MARKET]: 6,
      [MarketEventType.TECH_BUBBLE]: 4,
      [MarketEventType.INFLATION_SPIKE]: 3,
      [MarketEventType.INTEREST_RATE_CHANGE]: 2,
      [MarketEventType.NATURAL_DISASTER]: 1,
      [MarketEventType.POLITICAL_UNREST]: 4,
      [MarketEventType.PANDEMIC]: 10,
      [MarketEventType.REGULATORY_CHANGE]: 3,
      [MarketEventType.COMPANY_NEWS]: 1,
      [MarketEventType.SECTOR_ROTATION]: 3,
      [MarketEventType.CURRENCY_CRISIS]: 5,
      [MarketEventType.COMMODITY_SHOCK]: 2
    };
    
    return durations[eventType] || 3;
  }

  private getDefaultEconomicImpact(eventType: MarketEventType): EconomicImpact {
    return {
      gdpImpact: 0,
      inflationImpact: 0,
      unemploymentImpact: 0,
      marketSentimentImpact: 0
    };
  }

  // ========================================
  //  Helper Methods
  // ========================================

  private generateEventId(sessionId: number, eventType: MarketEventType, turn: number): string {
    return `event_${sessionId}_${eventType}_${turn}_${Date.now()}`;
  }

  private selectRandomEventType(economicIndicators: EconomicIndicators): MarketEventType {
    // Weight events based on current economic conditions
    const eventWeights = new Map<MarketEventType, number>();
    
    // Base weights
    eventWeights.set(MarketEventType.COMPANY_NEWS, 30);
    eventWeights.set(MarketEventType.REGULATORY_CHANGE, 20);
    eventWeights.set(MarketEventType.SECTOR_ROTATION, 15);
    
    // Economic condition influenced weights
    if (economicIndicators.marketSentiment < -0.5) {
      eventWeights.set(MarketEventType.BEAR_MARKET, 25);
      eventWeights.set(MarketEventType.MARKET_CRASH, 10);
    } else if (economicIndicators.marketSentiment > 0.5) {
      eventWeights.set(MarketEventType.BULL_MARKET, 25);
      eventWeights.set(MarketEventType.ECONOMIC_BOOM, 15);
    }
    
    if (economicIndicators.inflationRate > 5) {
      eventWeights.set(MarketEventType.INFLATION_SPIKE, 20);
    }
    
    // Select based on weights
    const totalWeight = Array.from(eventWeights.values()).reduce((sum, weight) => sum + weight, 0);
    const randomValue = Math.random() * totalWeight;
    
    let currentWeight = 0;
    for (const [eventType, weight] of eventWeights.entries()) {
      currentWeight += weight;
      if (randomValue <= currentWeight) {
        return eventType;
      }
    }
    
    return MarketEventType.COMPANY_NEWS; // fallback
  }

  private isTechAsset(assetId: number): boolean {
    // TODO: Implement asset type checking from database
    return assetId % 3 === 0; // placeholder logic
  }

  private isInflationSensitive(assetId: number): boolean {
    // TODO: Implement asset type checking
    return assetId % 2 === 0; // placeholder logic
  }

  private isInterestRateSensitive(assetId: number): boolean {
    // TODO: Implement asset type checking
    return assetId % 5 === 0; // placeholder logic
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private async saveEventToDatabase(event: MarketEvent): Promise<void> {
    // TODO: Save event to database
    this.logger.debug(`💾 Saved event to database: ${event.id}`);
  }

  private async updateEventInDatabase(event: MarketEvent): Promise<void> {
    // TODO: Update event in database
    this.logger.debug(`🔄 Updated event in database: ${event.id}`);
  }

  // ========================================
  //  Public Query Methods
  // ========================================

  /**
   * ดึง Active Events ของ session
   */
  getActiveEvents(sessionId: number): MarketEvent[] {
    return Array.from(this.activeEvents.values())
      .filter(event => event.sessionId === sessionId && event.isActive);
  }

  /**
   * ดึง Event โดย ID
   */
  getEvent(eventId: string): MarketEvent | null {
    return this.activeEvents.get(eventId) || null;
  }

  /**
   * ดึงสถิติ Events System
   */
  getEventsSystemStats() {
    const activeEventsByType = new Map<MarketEventType, number>();
    
    for (const event of this.activeEvents.values()) {
      if (event.isActive) {
        const count = activeEventsByType.get(event.type) || 0;
        activeEventsByType.set(event.type, count + 1);
      }
    }
    
    return {
      totalActiveEvents: Array.from(this.activeEvents.values()).filter(e => e.isActive).length,
      eventTemplates: this.eventTemplates.size,
      activeEventsByType: Object.fromEntries(activeEventsByType),
      lastEventTime: new Date()
    };
  }
}