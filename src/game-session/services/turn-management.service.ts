// ==================================================================
// Turn Management Service
// จัดการลำดับการเล่น, turn timer, และ turn transitions
// ==================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Server } from 'socket.io';

export interface TurnState {
  sessionId: number;
  currentTurnPlayerId: number;
  turnNumber: number;
  turnStartTime: Date;
  turnTimeLimit: number; // seconds
  timeRemaining: number; // seconds
  isActive: boolean;
}

export interface TurnTransition {
  fromPlayerId: number;
  toPlayerId: number;
  sessionId: number;
  turnNumber: number;
  reason: 'completed' | 'timeout' | 'forced' | 'player_disconnected';
  timestamp: Date;
}

export interface PlayerTurnAction {
  playerInSessionId: number;
  actionType: 'roll_dice' | 'draw_card' | 'use_card' | 'save_money' | 'withdraw_savings' | 'end_turn';
  actionData?: any;
  timestamp: Date;
}

@Injectable()
export class TurnManagementService {
  private readonly logger = new Logger(TurnManagementService.name);
  
  // In-memory turn states สำหรับ active sessions
  private activeTurnStates = new Map<number, TurnState>();
  private turnTimers = new Map<number, NodeJS.Timeout>();
  
  constructor(private prisma: PrismaService) {}

  // ==================== TURN INITIALIZATION ====================

  /**
   * เริ่มต้น turn system สำหรับ session ใหม่
   */
  async initializeTurnSystem(sessionId: number, socketServer: Server): Promise<TurnState> {
    try {
      // ดึงข้อมูล session และ players
      const session = await this.prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: {
          players: {
            orderBy: { turnOrder: 'asc' },
            include: { player: true }
          }
        }
      });

      if (!session || session.players.length === 0) {
        throw new Error(`Session ${sessionId} not found or has no players`);
      }

      // หา player แรกที่จะเล่น (turnOrder = 1)
      const firstPlayer = session.players.find(p => p.turnOrder === 1);
      if (!firstPlayer) {
        throw new Error(`No first player found for session ${sessionId}`);
      }

      // สร้าง turn state
      const turnState: TurnState = {
        sessionId,
        currentTurnPlayerId: firstPlayer.id,
        turnNumber: 1,
        turnStartTime: new Date(),
        turnTimeLimit: 60, // 1 นาที default
        timeRemaining: 60,
        isActive: true
      };

      // อัพเดทฐานข้อมูล
      await this.prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          currentTurnPlayerId: firstPlayer.playerId,
          status: 'in_progress'
        }
      });

      // บันทึก activity
      await this.logTurnActivity(sessionId, firstPlayer.id, 'TURN_START', 'Game started - first turn');

      // เก็บ state ใน memory
      this.activeTurnStates.set(sessionId, turnState);

      // เริ่ม timer
      this.startTurnTimer(sessionId, socketServer);

      // Broadcast turn start
      socketServer.to(sessionId.toString()).emit('turnStarted', {
        sessionId,
        currentPlayer: firstPlayer,
        turnNumber: 1,
        timeLimit: 60,
        timestamp: new Date().toISOString()
      });

      this.logger.log(`🎮 Turn system initialized for session ${sessionId} - Player ${firstPlayer.player.displayName} starts`);
      
      return turnState;
    } catch (error) {
      this.logger.error(`Error initializing turn system for session ${sessionId}:`, error);
      throw error;
    }
  }

  // ==================== TURN MANAGEMENT ====================

  /**
   * ข้ามไปเทิร์นถัดไป
   */
  async nextTurn(
    sessionId: number, 
    reason: 'completed' | 'timeout' | 'forced' = 'completed',
    socketServer?: Server
  ): Promise<TurnState | null> {
    try {
      const currentTurnState = this.activeTurnStates.get(sessionId);
      if (!currentTurnState) {
        throw new Error(`No active turn state for session ${sessionId}`);
      }

      // ดึงข้อมูล players ในลำดับ
      const session = await this.prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: {
          players: {
            orderBy: { turnOrder: 'asc' },
            include: { player: true }
          }
        }
      });

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // หา player ปัจจุบันและ player ถัดไป
      const currentPlayerIndex = session.players.findIndex(
        p => p.id === currentTurnState.currentTurnPlayerId
      );
      
      const nextPlayerIndex = (currentPlayerIndex + 1) % session.players.length;
      const nextPlayer = session.players[nextPlayerIndex];

      // บันทึก turn transition
      const transition: TurnTransition = {
        fromPlayerId: currentTurnState.currentTurnPlayerId,
        toPlayerId: nextPlayer.id,
        sessionId,
        turnNumber: currentTurnState.turnNumber,
        reason,
        timestamp: new Date()
      };

      // อัพเดท turn state
      const newTurnNumber = nextPlayerIndex === 0 ? 
        currentTurnState.turnNumber + 1 : currentTurnState.turnNumber;

      const newTurnState: TurnState = {
        ...currentTurnState,
        currentTurnPlayerId: nextPlayer.id,
        turnNumber: newTurnNumber,
        turnStartTime: new Date(),
        timeRemaining: currentTurnState.turnTimeLimit,
        isActive: true
      };

      // อัพเดทฐานข้อมูล
      await this.prisma.gameSession.update({
        where: { id: sessionId },
        data: { currentTurnPlayerId: nextPlayer.playerId }
      });

      // บันทึก activities
      await this.logTurnActivity(
        sessionId, 
        currentTurnState.currentTurnPlayerId, 
        'TURN_END', 
        `Turn ended - ${reason}`
      );
      
      await this.logTurnActivity(
        sessionId, 
        nextPlayer.id, 
        'TURN_START', 
        `Turn started - Turn ${newTurnNumber}`
      );

      // อัพเดท memory state
      this.activeTurnStates.set(sessionId, newTurnState);

      // Reset timer
      this.clearTurnTimer(sessionId);
      if (socketServer) {
        this.startTurnTimer(sessionId, socketServer);
      }

      // Broadcast turn change
      if (socketServer) {
        socketServer.to(sessionId.toString()).emit('turnChanged', {
          sessionId,
          transition,
          newCurrentPlayer: nextPlayer,
          turnNumber: newTurnNumber,
          timeLimit: newTurnState.turnTimeLimit,
          timestamp: new Date().toISOString()
        });
      }

      this.logger.log(`🔄 Turn changed in session ${sessionId}: ${session.players[currentPlayerIndex].player.displayName} → ${nextPlayer.player.displayName}`);
      
      return newTurnState;
    } catch (error) {
      this.logger.error(`Error changing turn for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * บังคับจบเทิร์นปัจจุบัน
   */
  async forceTurnEnd(sessionId: number, socketServer?: Server): Promise<TurnState | null> {
    return this.nextTurn(sessionId, 'forced', socketServer);
  }

  /**
   * หยุด turn system ชั่วคราว (pause game)
   */
  async pauseTurnSystem(sessionId: number, socketServer?: Server): Promise<void> {
    const turnState = this.activeTurnStates.get(sessionId);
    if (turnState) {
      turnState.isActive = false;
      this.clearTurnTimer(sessionId);
      
      if (socketServer) {
        socketServer.to(sessionId.toString()).emit('gamePaused', {
          sessionId,
          pausedAt: new Date().toISOString()
        });
      }

      this.logger.log(`⏸️ Turn system paused for session ${sessionId}`);
    }
  }

  /**
   * เริ่มต้น turn system ใหม่หลัง pause
   */
  async resumeTurnSystem(sessionId: number, socketServer: Server): Promise<void> {
    const turnState = this.activeTurnStates.get(sessionId);
    if (turnState && !turnState.isActive) {
      turnState.isActive = true;
      turnState.turnStartTime = new Date();
      turnState.timeRemaining = turnState.turnTimeLimit;
      
      this.startTurnTimer(sessionId, socketServer);
      
      socketServer.to(sessionId.toString()).emit('gameResumed', {
        sessionId,
        resumedAt: new Date().toISOString(),
        currentTurnPlayer: turnState.currentTurnPlayerId
      });

      this.logger.log(`▶️ Turn system resumed for session ${sessionId}`);
    }
  }

  // ==================== TIMER MANAGEMENT ====================

  /**
   * เริ่มต้น turn timer
   */
  private startTurnTimer(sessionId: number, socketServer: Server): void {
    const turnState = this.activeTurnStates.get(sessionId);
    if (!turnState) return;

    this.clearTurnTimer(sessionId);

    const timer = setInterval(() => {
      const currentState = this.activeTurnStates.get(sessionId);
      if (!currentState || !currentState.isActive) {
        this.clearTurnTimer(sessionId);
        return;
      }

      currentState.timeRemaining -= 1;

      // Broadcast time update ทุก 10 วินาที
      if (currentState.timeRemaining % 10 === 0 || currentState.timeRemaining <= 10) {
        socketServer.to(sessionId.toString()).emit('turnTimeUpdate', {
          sessionId,
          timeRemaining: currentState.timeRemaining,
          timestamp: new Date().toISOString()
        });
      }

      // เวลาหมด -> จบเทิร์น
      if (currentState.timeRemaining <= 0) {
        this.clearTurnTimer(sessionId);
        this.nextTurn(sessionId, 'timeout', socketServer);
      }
    }, 1000);

    this.turnTimers.set(sessionId, timer);
  }

  /**
   * ล้าง turn timer
   */
  private clearTurnTimer(sessionId: number): void {
    const timer = this.turnTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.turnTimers.delete(sessionId);
    }
  }

  // ==================== PLAYER ACTIONS ====================

  /**
   * บันทึก action ของผู้เล่นในเทิร์น
   */
  async recordPlayerAction(
    sessionId: number,
    playerInSessionId: number,
    action: PlayerTurnAction
  ): Promise<void> {
    try {
      const turnState = this.activeTurnStates.get(sessionId);
      if (!turnState) {
        throw new Error(`No active turn for session ${sessionId}`);
      }

      if (turnState.currentTurnPlayerId !== playerInSessionId) {
        throw new Error(`It's not player ${playerInSessionId}'s turn`);
      }

      // บันทึก activity
      await this.logTurnActivity(
        sessionId,
        playerInSessionId,
        action.actionType.toUpperCase(),
        `Player performed ${action.actionType}`,
        action.actionData
      );

      this.logger.log(`🎯 Player ${playerInSessionId} performed ${action.actionType} in session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Error recording player action:`, error);
      throw error;
    }
  }

  /**
   * ตรวจสอบว่าเป็นเทิร์นของผู้เล่นหรือไม่
   */
  isPlayerTurn(sessionId: number, playerInSessionId: number): boolean {
    const turnState = this.activeTurnStates.get(sessionId);
    return turnState?.currentTurnPlayerId === playerInSessionId && turnState?.isActive === true;
  }

  /**
   * ดึงข้อมูล turn state ปัจจุบัน
   */
  getCurrentTurnState(sessionId: number): TurnState | null {
    return this.activeTurnStates.get(sessionId) || null;
  }

  // ==================== CLEANUP ====================

  /**
   * ทำความสะอาดเมื่อ session จบ
   */
  async endTurnSystem(sessionId: number, socketServer?: Server): Promise<void> {
    try {
      // ล้าง timers
      this.clearTurnTimer(sessionId);
      
      // ลบ state
      this.activeTurnStates.delete(sessionId);

      // อัพเดทฐานข้อมูล
      await this.prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          status: 'finished',
          currentTurnPlayerId: null
        }
      });

      // Broadcast game end
      if (socketServer) {
        socketServer.to(sessionId.toString()).emit('gameEnded', {
          sessionId,
          endedAt: new Date().toISOString()
        });
      }

      this.logger.log(`🏁 Turn system ended for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Error ending turn system for session ${sessionId}:`, error);
    }
  }

  // ==================== HELPERS ====================

  /**
   * บันทึก turn activity
   */
  private async logTurnActivity(
    sessionId: number,
    playerInSessionId: number,
    type: string,
    description: string,
    dataPayload: any = {}
  ): Promise<void> {
    try {
      const turnState = this.activeTurnStates.get(sessionId);
      
      await this.prisma.activity.create({
        data: {
          sessionId,
          playerInSessionId,
          type,
          description,
          dataPayload,
          turnNumber: turnState?.turnNumber || 0,
          timestamp: new Date()
        }
      });
    } catch (error) {
      this.logger.error('Error logging turn activity:', error);
    }
  }

  /**
   * ดึงสถิติ turn ของ session
   */
  async getTurnStatistics(sessionId: number) {
    try {
      const activities = await this.prisma.activity.findMany({
        where: { 
          sessionId,
          type: { in: ['TURN_START', 'TURN_END'] }
        },
        orderBy: { timestamp: 'asc' }
      });

      const turnCount = activities.filter(a => a.type === 'TURN_START').length;
      const totalPlayers = await this.prisma.playerInSession.count({
        where: { sessionId }
      });

      return {
        totalTurns: turnCount,
        averageTurnDuration: this.calculateAverageTurnDuration(activities),
        turnsPerPlayer: Math.floor(turnCount / totalPlayers),
        currentTurnNumber: this.activeTurnStates.get(sessionId)?.turnNumber || 0
      };
    } catch (error) {
      this.logger.error(`Error getting turn statistics for session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * คำนวณเวลาเฉลี่ยต่อเทิร์น
   */
  private calculateAverageTurnDuration(activities: any[]): number {
    const turnPairs: { start: Date; end?: Date }[] = [];
    
    for (const activity of activities) {
      if (activity.type === 'TURN_START') {
        turnPairs.push({ start: activity.timestamp });
      } else if (activity.type === 'TURN_END' && turnPairs.length > 0) {
        const lastTurn = turnPairs[turnPairs.length - 1];
        if (!lastTurn.end) {
          lastTurn.end = activity.timestamp;
        }
      }
    }

    const durations = turnPairs
      .filter(pair => pair.end)
      .map(pair => (pair.end!.getTime() - pair.start.getTime()) / 1000);

    return durations.length > 0 ? 
      durations.reduce((sum, duration) => sum + duration, 0) / durations.length : 0;
  }
}