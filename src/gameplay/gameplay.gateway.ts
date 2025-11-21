import { 
  WebSocketGateway, 
  SubscribeMessage, 
  MessageBody, 
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { GameplayService } from './gameplay.service';

// Import Choice System
import { ChoiceBroadcastingService } from './logic/choice-system';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class GameplayGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(GameplayGateway.name);

  constructor(
    private readonly gameplayService: GameplayService,
    private readonly choiceBroadcasting: ChoiceBroadcastingService,
  ) {
    // 🔗 เชื่อมต่อ Choice Broadcasting กับ Gateway
    this.choiceBroadcasting.setWebSocketGateway(this);
  }

  handleConnection(client: Socket) {
    this.logger.log(`🔌 Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`🔌 Client disconnected: ${client.id}`);
  }

  // ==================== GAME EVENTS ====================

  @SubscribeMessage('rollDice')
  async handleRollDice(client: Socket, data: { playerInSessionId: number; sessionId: string }) {
    try {
      this.logger.log(`🎲 Player ${data.playerInSessionId} rolling dice`);
      
      const gameResult = await this.gameplayService.handlePlayerRollDice(data.playerInSessionId);

      // Broadcast to all players in session
      this.server.to(data.sessionId).emit('gameStateUpdate', {
        type: 'dice_rolled',
        data: gameResult,
        timestamp: new Date().toISOString(),
      });

      return { success: true, data: gameResult };
    } catch (error) {
      this.logger.error(`❌ Error in rollDice:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  @SubscribeMessage('executeCardEffect')
  async handleExecuteCardEffect(client: Socket, data: { cardId: number; playerId: number; effectData: any; sessionId: string }) {
    try {
      this.logger.log(`🃏 Executing card effect for player ${data.playerId}`);
      
      const result = await this.gameplayService.executeCardEffect(
        data.cardId, 
        data.playerId, 
        data.effectData
      );

      // Broadcast card effect to session
      this.server.to(data.sessionId).emit('cardEffectExecuted', {
        playerId: data.playerId,
        result,
        timestamp: new Date().toISOString(),
      });

      return { success: true, data: result };
    } catch (error) {
      this.logger.error(`❌ Error executing card effect:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  @SubscribeMessage('processDonation')
  async handleProcessDonation(client: Socket, data: { playerId: number; charityId: number; amount: number; sessionId: string }) {
    try {
      this.logger.log(`💝 Processing donation from player ${data.playerId}`);
      
      const result = await this.gameplayService.processDonation(
        data.playerId, 
        data.charityId, 
        data.amount
      );

      // Broadcast donation to session
      this.server.to(data.sessionId).emit('donationProcessed', {
        playerId: data.playerId,
        charityId: data.charityId,
        amount: data.amount,
        result,
        timestamp: new Date().toISOString(),
      });

      return { success: true, data: result };
    } catch (error) {
      this.logger.error(`❌ Error processing donation:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  @SubscribeMessage('getGameState')
  async handleGetGameState(client: Socket, data: { sessionId: number }) {
    try {
      const gameState = await this.gameplayService.getSessionGameState(data.sessionId);
      return { success: true, data: gameState };
    } catch (error) {
      this.logger.error(`❌ Error getting game state:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  @SubscribeMessage('getPlayerState')
  async handleGetPlayerState(client: Socket, data: { playerId: number }) {
    try {
      const playerState = await this.gameplayService.getPlayerState(data.playerId);
      return { success: true, data: playerState };
    } catch (error) {
      this.logger.error(`❌ Error getting player state:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Broadcast message to all players in a session
   */
  broadcastToSession(sessionId: string, event: string, data: any) {
    this.server.to(sessionId).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send notification to specific player
   */
  notifyPlayer(playerId: string, message: string, type: 'info' | 'warning' | 'error' = 'info') {
    this.server.to(playerId).emit('notification', {
      type,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast game state update to session
   */
  broadcastGameUpdate(sessionId: string, updateData: any) {
    this.server.to(sessionId).emit('gameStateUpdate', {
      ...updateData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send notification to entire session
   */
  broadcastNotification(sessionId: string, message: string, type: 'info' | 'warning' | 'error' = 'info') {
    this.server.to(sessionId).emit('notification', {
      message,
      type,
      timestamp: new Date().toISOString(),
    });
  }

  // ========================================
  //  🎯 Choice System WebSocket Handlers
  // ========================================

  /**
   * ส่งข้อมูลให้ผู้เล่นคนหนึ่ง (สำหรับ Choice Broadcasting)
   */
  async sendToPlayer(sessionId: number, playerInSessionId: number, event: string, data: any): Promise<void> {
    try {
      // หา socket ของผู้เล่น (ต้องมีระบบ map client socket กับ playerInSessionId)
      this.server.to(`session_${sessionId}`).emit(event, {
        ...data,
        targetPlayer: playerInSessionId,
        timestamp: new Date().toISOString(),
      });
      
      this.logger.debug(`📤 Sent to player ${playerInSessionId} in session ${sessionId}: ${event}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send to player: ${error}`);
    }
  }

  /**
   * ส่งข้อมูลให้ทุกคนใน session (สำหรับ Choice Broadcasting)
   */
  async sendToSession(sessionId: number, event: string, data: any, excludePlayers: number[] = []): Promise<void> {
    try {
      this.server.to(`session_${sessionId}`).emit(event, {
        ...data,
        excludePlayers,
        timestamp: new Date().toISOString(),
      });
      
      this.logger.debug(`📡 Broadcasted to session ${sessionId}: ${event}`);
    } catch (error) {
      this.logger.error(`❌ Failed to broadcast to session: ${error}`);
    }
  }

  /**
   * รับการส่งคำตอบ Choice จาก client
   */
  @SubscribeMessage('submit_choice')
  async handleSubmitChoice(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { choiceSessionId: string; selectedOptionId: string; playerInSessionId: number }
  ) {
    try {
      this.logger.log(`🎯 Choice submission received: ${data.choiceSessionId} -> ${data.selectedOptionId}`);
      
      // จะต้องเชื่อมต่อกับ ChoiceSystemLogic ใน GameplayService
      const result = await this.gameplayService.submitPlayerChoice(
        data.choiceSessionId,
        data.selectedOptionId,
        data.playerInSessionId
      );

      // ส่งผลลัพธ์กลับ
      client.emit('choice_submission_result', {
        success: true,
        result,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`✅ Choice processed successfully: ${data.choiceSessionId}`);

    } catch (error) {
      this.logger.error(`❌ Choice submission failed: ${error}`);
      
      client.emit('choice_submission_result', {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * รับการยกเลิก Choice จาก client
   */
  @SubscribeMessage('cancel_choice')
  async handleCancelChoice(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { choiceSessionId: string }
  ) {
    try {
      this.logger.log(`🚫 Choice cancellation received: ${data.choiceSessionId}`);
      
      await this.gameplayService.cancelPlayerChoice(data.choiceSessionId, 'player_request');

      client.emit('choice_cancellation_result', {
        success: true,
        choiceSessionId: data.choiceSessionId,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      this.logger.error(`❌ Choice cancellation failed: ${error}`);
      
      client.emit('choice_cancellation_result', {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * ดึงรายการ choices ที่ active ของผู้เล่น
   */
  @SubscribeMessage('get_active_choices')
  async handleGetActiveChoices(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { playerInSessionId: number }
  ) {
    try {
      const activeChoices = await this.gameplayService.getPlayerActiveChoices(data.playerInSessionId);

      client.emit('active_choices_result', {
        success: true,
        choices: activeChoices,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      this.logger.error(`❌ Get active choices failed: ${error}`);
      
      client.emit('active_choices_result', {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }
}