import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { ChoiceSystemLogic } from './choice-system.logic';
import { ChoiceBroadcastingService } from './choice-broadcasting.service';

/**
 * Choice System Module
 * ระบบจัดการตัวเลือกและการตัดสินใจของผู้เล่น
 * 
 * คุณสมบัติหลัก:
 * 1. ✅ Choice Validation System - ตรวจสอบตัวเลือกผู้เล่น
 * 2. ✅ Input Queue Management - คิวคำตอบจากผู้เล่น  
 * 3. ✅ Timeout Handling - จัดการเมื่อไม่มีการตอบ
 * 4. ✅ Choice Broadcasting - แจ้งตัวเลือกแก่ผู้เล่น
 * 
 * การใช้งาน:
 * - Import ใน GameplayModule หรือ GameSessionModule
 * - Inject ChoiceSystemLogic ใน Controllers/Services
 * - เชื่อมต่อ ChoiceBroadcastingService กับ WebSocket Gateway
 * 
 * ตัวอย่างการใช้งาน:
 * ```typescript
 * // ใน GameplayService
 * constructor(private choiceSystem: ChoiceSystemLogic) {}
 * 
 * // สร้าง choice session
 * const choice = await this.choiceSystem.createChoiceSession(
 *   sessionId, playerInSessionId, ChoiceType.CARD_EFFECT,
 *   'Choose your card effect', 'Select one option:', options
 * );
 * 
 * // ส่งคำตอบ
 * const result = await this.choiceSystem.submitChoice(
 *   choiceId, selectedOptionId, playerInSessionId
 * );
 * ```
 * 
 * การ Debug:
 * - เช็ค logs ใน console: [ChoiceSystemLogic], [ChoiceBroadcastingService]
 * - ใช้ getChoiceSystemStats() เพื่อดูสถิติ
 * - ทดสอบ WebSocket ด้วย testConnection()
 */
@Global() // ทำให้ใช้ได้ทั่วทั้งแอป
@Module({
  imports: [
    PrismaModule, // สำหรับ database operations
  ],
  providers: [
    ChoiceSystemLogic,
    ChoiceBroadcastingService,
  ],
  exports: [
    ChoiceSystemLogic,
    ChoiceBroadcastingService,
  ],
})
export class ChoiceSystemModule {
  constructor(
    private readonly choiceSystemLogic: ChoiceSystemLogic,
    private readonly broadcastingService: ChoiceBroadcastingService,
  ) {
    // Log module initialization
    console.log(`
🎯 Choice System Module Initialized!

Features Enabled:
├── ✅ Choice Validation System
├── ✅ Input Queue Management  
├── ✅ Timeout Handling (${this.choiceSystemLogic.getChoiceSystemStats().config.defaultTimeoutSeconds}s default)
├── ✅ Choice Broadcasting
└── ✅ Real-time WebSocket Support

Configuration:
├── Max Concurrent Choices: ${this.choiceSystemLogic.getChoiceSystemStats().config.maxConcurrentChoices}
├── Auto Default Enabled: ${this.choiceSystemLogic.getChoiceSystemStats().config.enableAutoDefault}
├── Choice History: ${this.choiceSystemLogic.getChoiceSystemStats().config.enableChoiceHistory}
└── Timeout Warning: ${this.choiceSystemLogic.getChoiceSystemStats().config.warningThresholdSeconds}s

Ready for integration! 🚀
    `);
  }
}

/**
 * TODO List สำหรับการ Integration:
 * 
 * 1. ✅ เชื่อมต่อกับ GameplayModule
 *    - เพิ่ม ChoiceSystemModule ใน imports
 *    - Inject ChoiceSystemLogic ใน GameplayService
 * 
 * 2. ⚠️ เชื่อมต่อกับ WebSocket Gateway
 *    - เรียก broadcastingService.setWebSocketGateway(this) ใน Gateway constructor
 *    - เพิ่ม Choice-related WebSocket handlers
 * 
 * 3. ⚠️ Integration กับ Card System
 *    - แก้ไข effect.card.logic.ts ให้ใช้ ChoiceSystemLogic
 *    - เชื่อมต่อ processChoiceEffect() กับ createChoiceSession()
 * 
 * 4. ⚠️ Integration กับ Movement System  
 *    - แก้ไข movement.logic.ts ให้ใช้ Choice System
 *    - เปลี่ยน requiresPlayerChoice เป็น Choice Session
 * 
 * 5. ❌ Database Schema Update
 *    - เพิ่ม choice_sessions table ใน Prisma schema
 *    - เพิ่ม choice_results table สำหรับ history
 * 
 * 6. ❌ API Controllers
 *    - สร้าง ChoiceController สำหรับ REST API
 *    - เพิ่ม choice endpoints ใน GameplayController
 */