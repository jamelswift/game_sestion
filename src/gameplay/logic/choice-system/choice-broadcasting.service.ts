import { Injectable, Logger } from '@nestjs/common';
import { ChoiceSession, ChoiceResult, ChoiceWebSocketEvents } from './choice-system.interface';

/**
 * Choice Broadcasting Service
 * ระบบส่งข้อมูล Choice แบบ Real-time ผ่าน WebSocket
 * 
 * ความรับผิดชอบ:
 * 1. ส่งตัวเลือกใหม่ให้ผู้เล่น
 * 2. ส่งคำเตือน timeout
 * 3. แจ้งผลลัพธ์การตัดสินใจ
 * 4. ซิงค์สถานะกับ frontend
 * 
 * การใช้งาน:
 * - เชื่อมต่อกับ GameplayGateway หรือ GameSessionGateway
 * - ส่งข้อมูลแบบ room-based (sessionId)
 * - รองรับการส่งแบบ broadcast และ unicast
 */
@Injectable()
export class ChoiceBroadcastingService {
  private readonly logger = new Logger(ChoiceBroadcastingService.name);
  private webSocketGateway: any; // จะ inject ภายหลัง

  constructor() {
    this.logger.log('📡 Choice Broadcasting Service initialized');
  }

  /**
   * Set WebSocket Gateway reference
   * เรียกจาก Gateway constructor หรือ module
   */
  setWebSocketGateway(gateway: any): void {
    this.webSocketGateway = gateway;
    this.logger.debug('🔗 WebSocket Gateway connected to Choice Broadcasting');
  }

  // ========================================
  //  Core Broadcasting Methods
  // ========================================

  /**
   * ส่งตัวเลือกใหม่ให้ผู้เล่น
   * เรียกใช้เมื่อสร้าง ChoiceSession ใหม่
   */
  async broadcastChoicePresented(choiceSession: ChoiceSession): Promise<void> {
    try {
      if (!this.webSocketGateway) {
        this.logger.warn('❌ WebSocket Gateway not available for choice broadcasting');
        return;
      }

      // ส่งให้ผู้เล่นคนนั้น (unicast)
      await this.sendToPlayer(
        choiceSession.sessionId,
        choiceSession.playerInSessionId,
        'choice_presented',
        choiceSession
      );

      // ส่งให้คนอื่นๆ ในเกมว่ามีคนต้องตัดสินใจ (broadcast)
      await this.sendToSession(
        choiceSession.sessionId,
        'player_choice_waiting',
        {
          playerInSessionId: choiceSession.playerInSessionId,
          choiceType: choiceSession.choiceType,
          title: choiceSession.title,
          timeoutSeconds: choiceSession.timeoutSeconds
        },
        [choiceSession.playerInSessionId] // exclude ตัวผู้เล่นเอง
      );

      this.logger.debug(`📤 Choice presented broadcasted: ${choiceSession.id} to player ${choiceSession.playerInSessionId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to broadcast choice presented: ${errorMessage}`);
    }
  }

  /**
   * ส่งคำเตือน timeout
   * เรียกใช้เมื่อใกล้หมดเวลา
   */
  async broadcastTimeoutWarning(choiceSessionId: string, secondsLeft: number, sessionId: number, playerInSessionId: number): Promise<void> {
    try {
      if (!this.webSocketGateway) return;

      const warningData = {
        choiceSessionId,
        secondsLeft,
        urgency: secondsLeft <= 5 ? 'critical' : 'warning'
      };

      // ส่งให้ผู้เล่นที่ต้องตัดสินใจ
      await this.sendToPlayer(
        sessionId,
        playerInSessionId,
        'choice_timeout_warning',
        warningData
      );

      // ส่งให้คนอื่นๆ ว่าใกล้หมดเวลา
      await this.sendToSession(
        sessionId,
        'player_choice_timeout_warning',
        {
          playerInSessionId,
          secondsLeft,
          choiceSessionId
        },
        [playerInSessionId]
      );

      this.logger.debug(`⚠️ Timeout warning broadcasted: ${choiceSessionId} (${secondsLeft}s left)`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to broadcast timeout warning: ${errorMessage}`);
    }
  }

  /**
   * ส่งผลลัพธ์การตัดสินใจ
   * เรียกใช้เมื่อประมวลผลเสร็จ
   */
  async broadcastChoiceProcessed(choiceResult: ChoiceResult, sessionId: number): Promise<void> {
    try {
      if (!this.webSocketGateway) return;

      // ส่งให้ผู้เล่นที่ตัดสินใจ
      await this.sendToPlayer(
        sessionId,
        choiceResult.playerInSessionId,
        'choice_processed',
        choiceResult
      );

      // ส่งให้คนอื่นๆ ในเกม (สำหรับ UI update)
      await this.sendToSession(
        sessionId,
        'player_choice_completed',
        {
          playerInSessionId: choiceResult.playerInSessionId,
          choiceSessionId: choiceResult.choiceSessionId,
          selectedOptionId: choiceResult.selectedOptionId,
          processingResult: choiceResult.processingResult
        },
        [choiceResult.playerInSessionId]
      );

      this.logger.debug(`✅ Choice result broadcasted: ${choiceResult.choiceSessionId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to broadcast choice result: ${errorMessage}`);
    }
  }

  /**
   * ส่งการยกเลิก choice
   */
  async broadcastChoiceCancelled(choiceSessionId: string, sessionId: number, playerInSessionId: number, reason: string): Promise<void> {
    try {
      if (!this.webSocketGateway) return;

      const cancelData = {
        choiceSessionId,
        reason,
        timestamp: new Date()
      };

      // ส่งให้ผู้เล่น
      await this.sendToPlayer(
        sessionId,
        playerInSessionId,
        'choice_cancelled',
        cancelData
      );

      // ส่งให้คนอื่นๆ
      await this.sendToSession(
        sessionId,
        'player_choice_cancelled',
        {
          playerInSessionId,
          choiceSessionId,
          reason
        },
        [playerInSessionId]
      );

      this.logger.debug(`🚫 Choice cancellation broadcasted: ${choiceSessionId} (${reason})`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to broadcast choice cancellation: ${errorMessage}`);
    }
  }

  /**
   * อัปเดตสถานะ choice
   */
  async broadcastChoiceUpdated(choiceSession: ChoiceSession): Promise<void> {
    try {
      if (!this.webSocketGateway) return;

      await this.sendToPlayer(
        choiceSession.sessionId,
        choiceSession.playerInSessionId,
        'choice_updated',
        {
          id: choiceSession.id,
          status: choiceSession.status,
          expiresAt: choiceSession.expiresAt,
          timeLeft: choiceSession.expiresAt.getTime() - Date.now()
        }
      );

      this.logger.debug(`🔄 Choice update broadcasted: ${choiceSession.id}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to broadcast choice update: ${errorMessage}`);
    }
  }

  // ========================================
  //  Game State Broadcasting  
  // ========================================

  /**
   * ส่งสถานะ choices ทั้งหมดของ session
   */
  async broadcastSessionChoicesState(sessionId: number, activeChoices: ChoiceSession[]): Promise<void> {
    try {
      if (!this.webSocketGateway) return;

      const choicesState = {
        sessionId,
        totalActiveChoices: activeChoices.length,
        choicesByPlayer: this.groupChoicesByPlayer(activeChoices),
        timestamp: new Date()
      };

      await this.sendToSession(sessionId, 'session_choices_state', choicesState);

      this.logger.debug(`📊 Session choices state broadcasted: ${sessionId} (${activeChoices.length} active)`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to broadcast session choices state: ${errorMessage}`);
    }
  }

  // ========================================
  //  Helper Methods
  // ========================================

  /**
   * ส่งข้อมูลให้ผู้เล่นคนหนึ่ง
   */
  private async sendToPlayer(sessionId: number, playerInSessionId: number, event: string, data: any): Promise<void> {
    if (!this.webSocketGateway?.sendToPlayer) {
      this.logger.warn('❌ sendToPlayer method not available in WebSocket Gateway');
      return;
    }

    try {
      await this.webSocketGateway.sendToPlayer(sessionId, playerInSessionId, event, data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to send to player ${playerInSessionId}: ${errorMessage}`);
    }
  }

  /**
   * ส่งข้อมูลให้ทุกคนใน session
   */
  private async sendToSession(sessionId: number, event: string, data: any, excludePlayers: number[] = []): Promise<void> {
    if (!this.webSocketGateway?.sendToSession) {
      this.logger.warn('❌ sendToSession method not available in WebSocket Gateway');
      return;
    }

    try {
      await this.webSocketGateway.sendToSession(sessionId, event, data, excludePlayers);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Failed to send to session ${sessionId}: ${errorMessage}`);
    }
  }

  /**
   * จัดกลุ่ม choices ตาม player
   */
  private groupChoicesByPlayer(choices: ChoiceSession[]): Record<number, ChoiceSession[]> {
    const grouped: Record<number, ChoiceSession[]> = {};
    
    for (const choice of choices) {
      if (!grouped[choice.playerInSessionId]) {
        grouped[choice.playerInSessionId] = [];
      }
      grouped[choice.playerInSessionId].push(choice);
    }
    
    return grouped;
  }

  // ========================================
  //  Debug & Monitoring
  // ========================================

  /**
   * ทดสอบการเชื่อมต่อ WebSocket
   */
  async testConnection(sessionId: number): Promise<boolean> {
    try {
      if (!this.webSocketGateway) {
        this.logger.warn('❌ WebSocket Gateway not available for testing');
        return false;
      }

      await this.sendToSession(sessionId, 'choice_system_test', {
        message: 'Choice system test message',
        timestamp: new Date()
      });

      this.logger.debug(`🧪 Connection test sent to session ${sessionId}`);
      return true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Connection test failed: ${errorMessage}`);
      return false;
    }
  }

  /**
   * ดึงสถิติการส่งข้อมูล
   */
  getBroadcastingStats() {
    return {
      hasWebSocketGateway: !!this.webSocketGateway,
      lastBroadcast: new Date(),
      status: 'active'
    };
  }
}