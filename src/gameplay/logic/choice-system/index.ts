/**
 * Choice System Module Exports
 * ส่งออกทุกอย่างที่จำเป็นสำหรับ Choice System
 */

// Core Logic & Services
export { ChoiceSystemLogic } from './choice-system.logic';
export { ChoiceBroadcastingService } from './choice-broadcasting.service';

// Module
export { ChoiceSystemModule } from './choice-system.module';

// Interfaces & Types
export {
  ChoiceSession,
  ChoiceOption,
  ChoiceRequirement,
  ChoiceConsequence,
  ChoiceResult,
  ChoiceValidationResult,
  ChoiceQueueItem,
  ChoiceWebSocketEvents,
  ChoiceSystemConfig,
  ChoiceType,
  ChoiceStatus,
} from './choice-system.interface';

/**
 * Quick Import Guide:
 * 
 * ```typescript
 * // ใน Module
 * import { ChoiceSystemModule } from './choice-system';
 * 
 * // ใน Service
 * import { ChoiceSystemLogic, ChoiceType } from './choice-system';
 * 
 * // ใน Gateway  
 * import { ChoiceBroadcastingService, ChoiceWebSocketEvents } from './choice-system';
 * 
 * // ใน Interface/Types
 * import { ChoiceSession, ChoiceOption, ChoiceStatus } from './choice-system';
 * ```
 */