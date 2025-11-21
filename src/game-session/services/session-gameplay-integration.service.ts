// ==================================================================
// Session Gameplay Integration Service
// เชื่อมต่อ Game Session Management กับ existing Gameplay system
// ==================================================================

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
// import { GameplayService } from '../../gameplay/gameplay.service'; // Temporarily disabled
import { GameStateService } from '../services/game-state.service';
import { TurnManagementService } from '../services/turn-management.service';
import { PlayerReadyService } from '../services/player-ready.service';
import { Server } from 'socket.io';

export interface SessionGameplayBridge {
  sessionId: number;
  gameplayActive: boolean;
  turnSystemActive: boolean;
  lastActivity: Date;
}

@Injectable()
export class SessionGameplayIntegrationService {
  private readonly logger = new Logger(SessionGameplayIntegrationService.name);
  
  // Active bridges สำหรับ sessions ที่เล่นอยู่
  private activeBridges = new Map<number, SessionGameplayBridge>();

  constructor(
    private prisma: PrismaService,
    // private gameplayService: GameplayService, // Temporarily disabled
    private gameStateService: GameStateService,
    private turnManagementService: TurnManagementService,
    private playerReadyService: PlayerReadyService
  ) {}

  // ==================== INTEGRATION MANAGEMENT ====================

  /**
   * เริ่มต้น integration bridge สำหรับ session
   */
  async initializeSessionGameplay(
    sessionId: number,
    socketServer: Server
  ): Promise<SessionGameplayBridge> {
    try {
      // ตรวจสอบ session status
      const session = await this.prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: {
          players: {
            include: { player: true },
            orderBy: { turnOrder: 'asc' }
          }
        }
      });

      if (!session) {
        throw new NotFoundException(`Session ${sessionId} not found`);
      }

      if (session.status !== 'in_progress') {
        throw new Error(`Session ${sessionId} is not in progress`);
      }

      // เริ่มต้น turn system
      await this.turnManagementService.initializeTurnSystem(sessionId, socketServer);

      // สร้าง bridge
      const bridge: SessionGameplayBridge = {
        sessionId,
        gameplayActive: true,
        turnSystemActive: true,
        lastActivity: new Date()
      };

      this.activeBridges.set(sessionId, bridge);

      // บันทึก activity
      await this.gameStateService.logActivity(
        sessionId,
        session.players[0].id,
        'GAMEPLAY_STARTED',
        'Session gameplay integration initialized'
      );

      this.logger.log(`🔗 Session ${sessionId} gameplay integration initialized`);
      
      return bridge;
    } catch (error) {
      this.logger.error(`Error initializing session gameplay for ${sessionId}:`, error);
      throw error;
    }
  }

  // ==================== ADAPTED GAMEPLAY METHODS ====================

  /**
   * ทอยเต๋าสำหรับ session (ใช้ playerInSessionId แทน playerId)
   */
  async rollDiceInSession(
    sessionId: number,
    playerInSessionId: number,
    forcedResult?: number,
    socketServer?: Server
  ) {
    try {
      // ตรวจสอบว่าเป็นเทิร์นของผู้เล่นหรือไม่
      if (!this.turnManagementService.isPlayerTurn(sessionId, playerInSessionId)) {
        throw new Error('ไม่ใช่เทิร์นของคุณ');
      }

      // ทอยเต๋าผ่าน gameplay service (temporarily disabled)
      // const result = await this.gameplayService.handlePlayerRollDice(
      //   playerInSessionId,
      //   forcedResult
      // );
      
      // Temporary mock result
      const result = {
        success: true,
        diceResult: {
          value: forcedResult || Math.floor(Math.random() * 6) + 1
        },
        newPosition: Math.floor(Math.random() * 40),
        landedSpace: {
          type: 'normal',
          index: Math.floor(Math.random() * 40)
        },
        message: 'Move completed (gameplay service disabled)'
      };

      // บันทึก turn action
      await this.turnManagementService.recordPlayerAction(
        sessionId,
        playerInSessionId,
        {
          playerInSessionId,
          actionType: 'roll_dice',
          actionData: {
            diceValue: result.diceResult.value,
            newPosition: result.newPosition,
            landedSpace: result.landedSpace
          },
          timestamp: new Date()
        }
      );

      // อัพเดท game state
      await this.gameStateService.updatePlayerState(
        playerInSessionId,
        {
          boardPosition: result.newPosition,
          lastAction: `Rolled ${result.diceResult.value}, moved to position ${result.newPosition}`,
          updatedAt: new Date()
        },
        socketServer
      );

      // อัพเดท bridge activity
      this.updateBridgeActivity(sessionId);

      return result;
    } catch (error) {
      this.logger.error(`Error rolling dice in session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * จั่วการ์ดสำหรับ session
   */
  async drawCardInSession(
    sessionId: number,
    playerInSessionId: number,
    cardType: string,
    socketServer?: Server
  ) {
    try {
      // ตรวจสอบเทิร์น
      if (!this.turnManagementService.isPlayerTurn(sessionId, playerInSessionId)) {
        throw new Error('ไม่ใช่เทิร์นของคุณ');
      }

      // จั่วการ์ด (temporarily disabled)
      // const card = this.gameplayService.drawRandomCard(cardType);
      
      // Temporary mock card
      const card = {
        id: 1,
        type: cardType,
        title: 'Mock Card',
        description: 'This is a temporary mock card (gameplay service disabled)',
        effects: []
      };
      
      if (!card) {
        throw new Error(`No cards available for type ${cardType}`);
      }

      // บันทึก turn action
      await this.turnManagementService.recordPlayerAction(
        sessionId,
        playerInSessionId,
        {
          playerInSessionId,
          actionType: 'draw_card',
          actionData: {
            cardType,
            cardId: card.id,
            cardTitle: card.title
          },
          timestamp: new Date()
        }
      );

      // บันทึก activity
      await this.gameStateService.logActivity(
        sessionId,
        playerInSessionId,
        'CARD_DRAWN',
        `Drew ${cardType} card: ${card.title}`,
        { card },
        parseInt((card as any).id?.toString() || '0')
      );

      // อัพเดท bridge activity
      this.updateBridgeActivity(sessionId);

      return card;
    } catch (error) {
      this.logger.error(`Error drawing card in session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * จบเทิร์นในเซสชัน
   */
  async endTurnInSession(
    sessionId: number,
    playerInSessionId: number,
    socketServer?: Server
  ) {
    try {
      // ตรวจสอบเทิร์น
      if (!this.turnManagementService.isPlayerTurn(sessionId, playerInSessionId)) {
        throw new Error('ไม่ใช่เทิร์นของคุณ');
      }

      // จบเทิร์น
      const newTurnState = await this.turnManagementService.nextTurn(
        sessionId,
        'completed',
        socketServer
      );

      // อัพเดท bridge activity
      this.updateBridgeActivity(sessionId);

      return newTurnState;
    } catch (error) {
      this.logger.error(`Error ending turn in session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * ออมเงินในเซสชัน
   */
  async saveMoneyInSession(
    sessionId: number,
    playerInSessionId: number,
    amount: number,
    socketServer?: Server
  ) {
    try {
      // หา player state
      const playerState = await this.gameStateService.getCurrentPlayerTurnData(playerInSessionId);
      
      if (!playerState) {
        throw new Error('Player state not found');
      }

      // ออมเงิน (temporarily disabled)
      // const result = await this.gameplayService.saveMoney(
      //   playerState.playerInSession.playerId.toString(),
      //   amount
      // );
      
      // Temporary mock result
      const result = {
        success: true,
        message: `Saved ${amount} successfully (gameplay service disabled)`,
        newCash: 0,
        newSavings: amount,
        totalAssets: amount
      };

      // อัพเดท player state
      await this.gameStateService.updatePlayerState(
        playerInSessionId,
        {
          cash: playerState.playerInSession.cash - amount,
          savings: playerState.playerInSession.savings + amount,
          lastAction: `Saved ${amount} to savings`,
          updatedAt: new Date()
        },
        socketServer
      );

      // บันทึก turn action
      await this.turnManagementService.recordPlayerAction(
        sessionId,
        playerInSessionId,
        {
          playerInSessionId,
          actionType: 'save_money',
          actionData: { amount, result },
          timestamp: new Date()
        }
      );

      this.updateBridgeActivity(sessionId);

      return result;
    } catch (error) {
      this.logger.error(`Error saving money in session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * ถอนเงินออมในเซสชัน
   */
  async withdrawSavingsInSession(
    sessionId: number,
    playerInSessionId: number,
    amount: number,
    socketServer?: Server
  ) {
    try {
      // หา player state
      const playerState = await this.gameStateService.getCurrentPlayerTurnData(playerInSessionId);
      
      if (!playerState) {
        throw new Error('Player state not found');
      }

      // ถอนเงินออม (temporarily disabled)
      // const result = await this.gameplayService.withdrawSavings(
      //   playerState.playerInSession.playerId.toString(),
      //   amount
      // );
      
      // Temporary mock result
      const result = {
        success: true,
        message: `Withdrew ${amount} successfully (gameplay service disabled)`,
        newCash: amount,
        newSavings: 0,
        totalAssets: amount
      };

      // อัพเดท player state
      await this.gameStateService.updatePlayerState(
        playerInSessionId,
        {
          cash: playerState.playerInSession.cash + amount,
          savings: playerState.playerInSession.savings - amount,
          lastAction: `Withdrew ${amount} from savings`,
          updatedAt: new Date()
        },
        socketServer
      );

      // บันทึก turn action
      await this.turnManagementService.recordPlayerAction(
        sessionId,
        playerInSessionId,
        {
          playerInSessionId,
          actionType: 'withdraw_savings',
          actionData: { amount, result },
          timestamp: new Date()
        }
      );

      this.updateBridgeActivity(sessionId);

      return result;
    } catch (error) {
      this.logger.error(`Error withdrawing savings in session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * ตรวจสอบเงื่อนไขชนะในเซสชัน
   */
  async checkWinConditionInSession(
    sessionId: number,
    playerInSessionId: number,
    socketServer?: Server
  ) {
    try {
      // หา player state
      const playerState = await this.gameStateService.getCurrentPlayerTurnData(playerInSessionId);
      
      if (!playerState) {
        throw new Error('Player state not found');
      }

      // ตรวจสอบเงื่อนไขชนะ (temporarily disabled)
      // const winResult = await this.gameplayService.checkWinCondition(
      //   playerState.playerInSession.playerId.toString()
      // );
      
      // Temporary mock result
      const winResult = {
        hasWon: false,
        message: 'Win condition check disabled (gameplay service disabled)',
        finalScore: 0
      };

      // ถ้าชนะ - จบเกม
      if (winResult.hasWon) {
        await this.endGameplay(sessionId, socketServer);
        
        // อัพเดท session status
        await this.prisma.gameSession.update({
          where: { id: sessionId },
          data: { status: 'finished' }
        });
      }

      return winResult;
    } catch (error) {
      this.logger.error(`Error checking win condition in session ${sessionId}:`, error);
      throw error;
    }
  }

  // ==================== SESSION QUERIES ====================

  /**
   * ดึงสถานะเกมแบบ complete สำหรับ session
   */
  async getSessionGameState(sessionId: number) {
    return this.gameStateService.getCompleteGameState(sessionId);
  }

  /**
   * ดึงข้อมูลเทิร์นปัจจุบัน
   */
  async getCurrentTurnInfo(sessionId: number) {
    return this.turnManagementService.getCurrentTurnState(sessionId);
  }

  /**
   * ดึงข้อมูลผู้เล่นที่เล่นอยู่
   */
  async getPlayerTurnData(playerInSessionId: number) {
    return this.gameStateService.getCurrentPlayerTurnData(playerInSessionId);
  }

  // ==================== LIFECYCLE MANAGEMENT ====================

  /**
   * จบ gameplay integration
   */
  async endGameplay(sessionId: number, socketServer?: Server): Promise<void> {
    try {
      // จบ turn system
      await this.turnManagementService.endTurnSystem(sessionId, socketServer);

      // ล้าง states
      this.gameStateService.clearSessionCache(sessionId);
      this.playerReadyService.clearSessionReadyState(sessionId);

      // ลบ bridge
      this.activeBridges.delete(sessionId);

      this.logger.log(`🏁 Session ${sessionId} gameplay ended`);
    } catch (error) {
      this.logger.error(`Error ending gameplay for session ${sessionId}:`, error);
    }
  }

  /**
   * pause gameplay
   */
  async pauseGameplay(sessionId: number, socketServer?: Server): Promise<void> {
    await this.turnManagementService.pauseTurnSystem(sessionId, socketServer);
    
    const bridge = this.activeBridges.get(sessionId);
    if (bridge) {
      bridge.gameplayActive = false;
      bridge.turnSystemActive = false;
    }
  }

  /**
   * resume gameplay
   */
  async resumeGameplay(sessionId: number, socketServer: Server): Promise<void> {
    await this.turnManagementService.resumeTurnSystem(sessionId, socketServer);
    
    const bridge = this.activeBridges.get(sessionId);
    if (bridge) {
      bridge.gameplayActive = true;
      bridge.turnSystemActive = true;
      bridge.lastActivity = new Date();
    }
  }

  // ==================== HELPERS ====================

  /**
   * อัพเดท bridge activity timestamp
   */
  private updateBridgeActivity(sessionId: number): void {
    const bridge = this.activeBridges.get(sessionId);
    if (bridge) {
      bridge.lastActivity = new Date();
    }
  }

  /**
   * ตรวจสอบว่า session มี bridge อยู่หรือไม่
   */
  isSessionActive(sessionId: number): boolean {
    return this.activeBridges.has(sessionId);
  }

  /**
   * ดึงข้อมูล bridge
   */
  getBridgeInfo(sessionId: number): SessionGameplayBridge | null {
    return this.activeBridges.get(sessionId) || null;
  }

  /**
   * ดึงสถิติการเล่นของ session
   */
  async getSessionGameplayStatistics(sessionId: number) {
    try {
      const [gameState, turnStats, bridge] = await Promise.all([
        this.gameStateService.getSessionStatistics(sessionId),
        this.turnManagementService.getTurnStatistics(sessionId),
        this.getBridgeInfo(sessionId)
      ]);

      return {
        gameState,
        turnStats,
        bridge,
        isActive: this.isSessionActive(sessionId)
      };
    } catch (error) {
      this.logger.error(`Error getting session statistics for ${sessionId}:`, error);
      return null;
    }
  }
}
