/**
 * Gameplay DTOs Export Index
 * รวมการ export ทุก DTOs สำหรับการใช้งานง่าย
 */

// Export all API DTOs
export * from './api.dto';

// Export existing DTOs
export * from './player-decision.dto';
export * from './savings.dto';
export * from './space-event.dto';
export * from './space-event-response.dto';
export * from './websocket-events.dto';

/**
 * การใช้งาน:
 * 
 * // Import specific DTOs
 * import { RollDiceDto, BaseResponseDto, PlayerDataDto } from './dto';
 * 
 * // Import all DTOs
 * import * as GameplayDto from './dto';
 */