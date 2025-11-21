import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ChoiceSession,
  ChoiceOption,
  ChoiceResult,
  ChoiceType,
  ChoiceStatus,
  ChoiceValidationResult,
  ChoiceQueueItem,
  ChoiceSystemConfig
} from './choice-system.interface';

/**
 * Choice System Logic Service
 * ระบบจัดการตัวเลือกและการตัดสินใจของผู้เล่น
 * 
 * ความรับผิดชอบหลัก:
 * 1. สร้างและจัดการ Choice Sessions
 * 2. ตรวจสอบความถูกต้องของตัวเลือก
 * 3. จัดการคิวการตัดสินใจ
 * 4. ประมวลผลและจัดเก็บผลลัพธ์
 * 
 * การทำงาน:
 * - สร้าง ChoiceSession เมื่อผู้เล่นต้องตัดสินใจ
 * - ตรวจสอบ requirements และ validate ตัวเลือก
 * - จัดการ timeout และ default choices
 * - บันทึกประวัติการตัดสินใจ
 */
@Injectable()
export class ChoiceSystemLogic {
  private readonly logger = new Logger(ChoiceSystemLogic.name);
  private readonly choiceQueue: Map<string, ChoiceQueueItem> = new Map();
  private readonly activeChoices: Map<number, ChoiceSession[]> = new Map(); // playerInSessionId -> choices[]
  
  private readonly config: ChoiceSystemConfig = {
    defaultTimeoutSeconds: 30,
    maxConcurrentChoices: 3,
    retryAttempts: 3,
    warningThresholdSeconds: 10,
    enableAutoDefault: true,
    enableChoiceHistory: true
  };

  constructor(private readonly prisma: PrismaService) {
    this.logger.log('🎯 Choice System Logic initialized');
    this.startTimeoutMonitor();
  }

  // ========================================
  //  Core Choice Session Management
  // ========================================

  /**
   * สร้าง Choice Session ใหม่
   * เรียกใช้เมื่อผู้เล่นต้องทำการตัดสินใจ
   */
  async createChoiceSession(
    sessionId: number,
    playerInSessionId: number,
    choiceType: ChoiceType,
    title: string,
    description: string,
    options: ChoiceOption[],
    timeoutSeconds?: number,
    metadata?: any
  ): Promise<ChoiceSession> {
    try {
      this.logger.debug(`Creating choice session for player ${playerInSessionId}: ${title}`);
      
      // ตรวจสอบจำนวน choices ที่ active
      await this.validateConcurrentChoices(playerInSessionId);
      
      // สร้าง Choice Session
      const choiceSessionId = this.generateChoiceId();
      const timeout = timeoutSeconds || this.config.defaultTimeoutSeconds;
      const expiresAt = new Date(Date.now() + timeout * 1000);
      
      const choiceSession: ChoiceSession = {
        id: choiceSessionId,
        sessionId,
        playerInSessionId,
        choiceType,
        title,
        description,
        options: await this.validateOptions(playerInSessionId, options),
        timeoutSeconds: timeout,
        createdAt: new Date(),
        expiresAt,
        status: ChoiceStatus.WAITING,
        metadata
      };
      
      // เพิ่มเข้า active choices
      this.addToActiveChoices(playerInSessionId, choiceSession);
      
      // เพิ่มเข้าคิว
      this.choiceQueue.set(choiceSessionId, {
        choiceSession,
        priority: this.getChoicePriority(choiceType),
        retryCount: 0
      });
      
      this.logger.log(`✅ Choice session created: ${choiceSessionId} (${title}) - expires in ${timeout}s`);
      return choiceSession;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`❌ Failed to create choice session: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * ส่งคำตอบ Choice
   */
  async submitChoice(
    choiceSessionId: string,
    selectedOptionId: string,
    playerInSessionId: number
  ): Promise<ChoiceResult> {
    try {
      this.logger.debug(`Processing choice submission: ${choiceSessionId} -> ${selectedOptionId}`);
      
      // ดึง Choice Session
      const queueItem = this.choiceQueue.get(choiceSessionId);
      if (!queueItem) {
        throw new NotFoundException(`Choice session ${choiceSessionId} not found`);
      }
      
      const choiceSession = queueItem.choiceSession;
      
      // ตรวจสอบสถานะ
      if (choiceSession.status !== ChoiceStatus.WAITING) {
        throw new Error(`Choice session ${choiceSessionId} is not waiting for input (status: ${choiceSession.status})`);
      }
      
      // ตรวจสอบ player
      if (choiceSession.playerInSessionId !== playerInSessionId) {
        throw new Error(`Choice session ${choiceSessionId} belongs to different player`);
      }
      
      // ตรวจสอบ timeout
      if (new Date() > choiceSession.expiresAt) {
        await this.handleChoiceTimeout(choiceSessionId);
        throw new Error(`Choice session ${choiceSessionId} has expired`);
      }
      
      // ตรวจสอบ option
      const selectedOption = choiceSession.options.find(opt => opt.id === selectedOptionId);
      if (!selectedOption) {
        throw new Error(`Invalid option ID: ${selectedOptionId}`);
      }
      
      // Validate choice requirements
      const validation = await this.validateChoice(playerInSessionId, selectedOption);
      if (!validation.isValid) {
        throw new Error(`Choice validation failed: ${validation.errors.join(', ')}`);
      }
      
      // สร้าง result
      const result: ChoiceResult = {
        choiceSessionId,
        selectedOptionId,
        playerInSessionId,
        submittedAt: new Date(),
        status: ChoiceStatus.SUBMITTED
      };
      
      // อัปเดตสถานะ
      choiceSession.status = ChoiceStatus.SUBMITTED;
      
      // ประมวลผลตัวเลือก
      result.processingResult = await this.processChoiceConsequences(playerInSessionId, selectedOption);
      choiceSession.status = ChoiceStatus.PROCESSED;
      
      // ลบออกจาก active choices
      this.removeFromActiveChoices(playerInSessionId, choiceSessionId);
      this.choiceQueue.delete(choiceSessionId);
      
      // บันทึกประวัติ (ถ้าเปิดใช้)
      if (this.config.enableChoiceHistory) {
        await this.saveChoiceHistory(choiceSession, result);
      }
      
      this.logger.log(`✅ Choice processed: ${choiceSessionId} -> ${selectedOption.label}`);
      return result;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`❌ Failed to submit choice: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * ยกเลิก Choice Session
   */
  async cancelChoice(choiceSessionId: string, reason: string = 'manual'): Promise<void> {
    try {
      const queueItem = this.choiceQueue.get(choiceSessionId);
      if (!queueItem) {
        this.logger.warn(`Choice session ${choiceSessionId} not found for cancellation`);
        return;
      }
      
      const choiceSession = queueItem.choiceSession;
      choiceSession.status = ChoiceStatus.CANCELLED;
      
      this.removeFromActiveChoices(choiceSession.playerInSessionId, choiceSessionId);
      this.choiceQueue.delete(choiceSessionId);
      
      this.logger.log(`🚫 Choice session cancelled: ${choiceSessionId} (${reason})`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`❌ Failed to cancel choice: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  // ========================================
  //  Choice Validation System
  // ========================================

  /**
   * ตรวจสอบความถูกต้องของตัวเลือก
   */
  async validateChoice(playerInSessionId: number, option: ChoiceOption): Promise<ChoiceValidationResult> {
    try {
      const errors: string[] = [];
      const warnings: string[] = [];
      
      if (!option.requirements || option.requirements.length === 0) {
        return { isValid: true, errors, warnings, canProceed: true };
      }
      
      // ดึงข้อมูลผู้เล่น
      const playerData = await this.prisma.playerInSession.findUnique({
        where: { id: playerInSessionId },
        include: {
          assets: { include: { asset: true } },
          debts: { include: { debt: true } },
          career: true
        }
      });
      
      if (!playerData) {
        errors.push(`Player ${playerInSessionId} not found`);
        return { isValid: false, errors, warnings, canProceed: false };
      }
      
      // ตรวจสอบ requirements
      for (const req of option.requirements) {
        const checkResult = await this.checkRequirement(playerData, req);
        if (!checkResult.passed) {
          errors.push(checkResult.message || `Requirement not met: ${req.type}`);
        }
      }
      
      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        canProceed: errors.length === 0
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`❌ Choice validation error: ${errorMessage}`, errorStack);
      return {
        isValid: false,
        errors: ['Validation error occurred'],
        warnings: [],
        canProceed: false
      };
    }
  }

  // ========================================
  //  Timeout Management
  // ========================================

  /**
   * เริ่มต้นระบบ monitor timeout
   */
  private startTimeoutMonitor(): void {
    setInterval(() => {
      this.checkTimeouts();
    }, 5000); // เช็คทุก 5 วินาที
    
    this.logger.debug('🕐 Timeout monitor started (check every 5s)');
  }

  /**
   * ตรวจสอบและจัดการ timeout choices
   */
  private async checkTimeouts(): Promise<void> {
    const now = new Date();
    
    for (const [choiceSessionId, queueItem] of this.choiceQueue.entries()) {
      const choiceSession = queueItem.choiceSession;
      
      if (choiceSession.status !== ChoiceStatus.WAITING) {
        continue;
      }
      
      const timeLeft = choiceSession.expiresAt.getTime() - now.getTime();
      
      // ส่งคำเตือน timeout
      if (timeLeft <= this.config.warningThresholdSeconds * 1000 && timeLeft > 0) {
        // จะส่งผ่าน WebSocket Gateway (implement ใน gateway)
        this.logger.debug(`⚠️ Timeout warning: ${choiceSessionId} (${Math.ceil(timeLeft / 1000)}s left)`);
      }
      
      // จัดการ timeout
      if (timeLeft <= 0) {
        await this.handleChoiceTimeout(choiceSessionId);
      }
    }
  }

  /**
   * จัดการเมื่อ choice หมดเวลา
   */
  private async handleChoiceTimeout(choiceSessionId: string): Promise<void> {
    try {
      const queueItem = this.choiceQueue.get(choiceSessionId);
      if (!queueItem) return;
      
      const choiceSession = queueItem.choiceSession;
      choiceSession.status = ChoiceStatus.TIMEOUT;
      
      this.logger.warn(`⏰ Choice session timeout: ${choiceSessionId}`);
      
      // ใช้ default option (ถ้ามี)
      if (this.config.enableAutoDefault) {
        const defaultOption = choiceSession.options.find(opt => opt.isDefault);
        if (defaultOption) {
          this.logger.log(`🔄 Auto-applying default choice: ${defaultOption.label}`);
          await this.processChoiceConsequences(choiceSession.playerInSessionId, defaultOption);
        }
      }
      
      // ลบออกจาก active choices
      this.removeFromActiveChoices(choiceSession.playerInSessionId, choiceSessionId);
      this.choiceQueue.delete(choiceSessionId);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`❌ Error handling timeout: ${errorMessage}`, errorStack);
    }
  }

  // ========================================
  //  Helper Methods
  // ========================================

  private generateChoiceId(): string {
    return `choice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getChoicePriority(choiceType: ChoiceType): number {
    const priorities = {
      [ChoiceType.LIFE_EVENT]: 10,
      [ChoiceType.CARD_EFFECT]: 8,
      [ChoiceType.MARKET_ACTION]: 6,
      [ChoiceType.ASSET_PURCHASE]: 5,
      [ChoiceType.INVESTMENT]: 5,
      [ChoiceType.CHARITY]: 3,
      [ChoiceType.CAREER_SELECTION]: 2,
      [ChoiceType.GOAL_SELECTION]: 2,
      [ChoiceType.BOARD_SPACE]: 1
    };
    return priorities[choiceType] || 1;
  }

  private addToActiveChoices(playerInSessionId: number, choiceSession: ChoiceSession): void {
    if (!this.activeChoices.has(playerInSessionId)) {
      this.activeChoices.set(playerInSessionId, []);
    }
    this.activeChoices.get(playerInSessionId)!.push(choiceSession);
  }

  private removeFromActiveChoices(playerInSessionId: number, choiceSessionId: string): void {
    const playerChoices = this.activeChoices.get(playerInSessionId);
    if (playerChoices) {
      const index = playerChoices.findIndex(choice => choice.id === choiceSessionId);
      if (index !== -1) {
        playerChoices.splice(index, 1);
      }
      if (playerChoices.length === 0) {
        this.activeChoices.delete(playerInSessionId);
      }
    }
  }

  private async validateConcurrentChoices(playerInSessionId: number): Promise<void> {
    const activeChoices = this.activeChoices.get(playerInSessionId) || [];
    if (activeChoices.length >= this.config.maxConcurrentChoices) {
      throw new Error(`Player ${playerInSessionId} has too many active choices (${activeChoices.length}/${this.config.maxConcurrentChoices})`);
    }
  }

  private async validateOptions(playerInSessionId: number, options: ChoiceOption[]): Promise<ChoiceOption[]> {
    // ตรวจสอบและกรองตัวเลือกที่ player สามารถเลือกได้
    return options; // สำหรับตอนนี้ return ทั้งหมด
  }

  private async checkRequirement(playerData: any, requirement: any): Promise<{ passed: boolean; message?: string }> {
    // TODO: Implement requirement checking logic
    return { passed: true };
  }

  private async processChoiceConsequences(playerInSessionId: number, option: ChoiceOption): Promise<any> {
    // TODO: Implement consequence processing
    return { processed: true, option: option.label };
  }

  private async saveChoiceHistory(choiceSession: ChoiceSession, result: ChoiceResult): Promise<void> {
    // TODO: Save to database history table
    this.logger.debug(`💾 Choice history saved: ${choiceSession.id}`);
  }

  // ========================================
  //  Public Query Methods
  // ========================================

  /**
   * ดึง active choices ของผู้เล่น
   */
  getActiveChoices(playerInSessionId: number): ChoiceSession[] {
    return this.activeChoices.get(playerInSessionId) || [];
  }

  /**
   * ดึง choice session โดย ID
   */
  getChoiceSession(choiceSessionId: string): ChoiceSession | null {
    const queueItem = this.choiceQueue.get(choiceSessionId);
    return queueItem ? queueItem.choiceSession : null;
  }

  /**
   * ดึงสถิติ choice system
   */
  getChoiceSystemStats() {
    return {
      totalActiveChoices: this.choiceQueue.size,
      playersWithChoices: this.activeChoices.size,
      config: this.config
    };
  }
}