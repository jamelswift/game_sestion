/**
 * Market Price System - Main Export Index
 * ระบบราคาตลาดและเหตุการณ์ทางเศรษฐกิจ
 * 
 * นำเข้าและส่งออกทุก components ของ Market Price System
 * เพื่อให้สามารถ import ได้ง่ายจากโมดูลอื่น
 */

// Main Module
export { MarketPriceSystemModule } from './price-system.module';

// Core Services
export { DynamicPriceEngine } from './dynamic-price-engine.logic';
export { MarketEventsSystem } from './market-events.logic';
export { PriceHistoryService } from './price-history.service';
export { PriceBroadcastingService } from './price-broadcasting.service';

// Interfaces and Types
export * from './price-system.interface';

/**
 * การใช้งาน:
 * 
 * // Import ทั้ง module
 * import { MarketPriceSystemModule } from './logic/price-system';
 * 
 * // Import services เฉพาะ
 * import { 
 *   DynamicPriceEngine, 
 *   MarketEventsSystem,
 *   PriceHistoryService 
 * } from './logic/price-system';
 * 
 * // Import interfaces
 * import { 
 *   MarketPriceData, 
 *   MarketEvent, 
 *   MarketAnalysis 
 * } from './logic/price-system';
 */