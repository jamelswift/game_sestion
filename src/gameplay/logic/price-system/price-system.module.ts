import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';

// Core Price System Services
import { DynamicPriceEngine } from './dynamic-price-engine.logic';
import { MarketEventsSystem } from './market-events.logic';
import { PriceHistoryService } from './price-history.service';
import { PriceBroadcastingService } from './price-broadcasting.service';

/**
 * Market Price System Module
 * โมดูลหลักสำหรับระบบราคาตลาดและเหตุการณ์ทางเศรษฐกิจ
 * 
 * ส่วนประกอบหลัก:
 * 1. DynamicPriceEngine - คำนวณราคาแบบไดนามิก
 * 2. MarketEventsSystem - จัดการเหตุการณ์ตลาด
 * 3. PriceHistoryService - บันทึกและวิเคราะห์ประวัติราคา
 * 4. PriceBroadcastingService - WebSocket broadcasting
 * 
 * การทำงาน:
 * - Global Module ที่สามารถใช้ได้ทั่วทั้งแอป
 * - Integration กับ Prisma สำหรับ Database
 * - WebSocket Support สำหรับ Real-time updates
 * - Configuration Management
 * 
 * การใช้งาน:
 * 1. Import ใน GameplayModule
 * 2. Inject services ที่ต้องการ
 * 3. เรียกใช้ methods ตามความต้องการ
 */
@Global()
@Module({
  imports: [
    ConfigModule, // สำหรับการกำหนดค่าระบบ
    PrismaModule  // สำหรับการเชื่อมต่อฐานข้อมูล
  ],
  providers: [
    // Core Price System Logic
    DynamicPriceEngine,
    MarketEventsSystem,
    PriceHistoryService,
    
    // WebSocket Broadcasting
    PriceBroadcastingService,
    
    // Configuration and Utilities
    {
      provide: 'PRICE_SYSTEM_CONFIG',
      useFactory: () => ({
        // Core Configuration
        priceUpdateInterval: 1, // อัพเดทราคาทุกเทิร์น
        baseVolatility: 0.1, // ความผันผวนพื้นฐาน 10%
        maxPriceChangePerTurn: 0.25, // เปลี่ยนแปลงสูงสุด 25% ต่อเทิร์น
        
        // Event System
        eventProbabilityPerTurn: 0.15, // โอกาส 15% ต่อเทิร์น
        enableRandomEvents: true,
        enableEconomicCycles: true,
        
        // History and Analytics
        historicalDataRetention: 100, // เก็บข้อมูล 100 เทิร์น
        analysisUpdateInterval: 5, // วิเคราะห์ทุก 5 เทิร์น
        
        // Price Limits
        minimumAssetPrice: 1, // ราคาต่ำสุด 1 หน่วย
        maximumAssetPrice: 10000, // ราคาสูงสุด 10,000 หน่วย
        
        // Market Hours (ถ้าต้องการ)
        marketHours: {
          start: 1, // เทิร์นแรก
          end: 50   // เทิร์นสุดท้าย
        },
        
        // Broadcasting Configuration
        broadcastingConfig: {
          enableRealTimeUpdates: true,
          updateFrequency: 1000, // 1 วินาที
          maxSubscriptionsPerUser: 50,
          enablePriceAlerts: true,
          enableMarketAnalytics: true
        },
        
        // Economic Indicators
        economicIndicators: {
          baseSentiment: 0.5, // neutral sentiment
          baseInflation: 0.02, // 2% inflation
          baseInterestRate: 0.05, // 5% interest rate
          baseUnemployment: 0.05, // 5% unemployment
          baseGdpGrowth: 0.03 // 3% GDP growth
        }
      })
    }
  ],
  exports: [
    // Export ทุก service เพื่อให้โมดูลอื่นใช้งานได้
    DynamicPriceEngine,
    MarketEventsSystem,
    PriceHistoryService,
    PriceBroadcastingService,
    'PRICE_SYSTEM_CONFIG'
  ]
})
export class MarketPriceSystemModule {
  constructor() {
    console.log('💰 Market Price System Module loaded successfully');
  }
}