// ==================================================================
// Player Ready Management Service
// จัดการสถานะความพร้อมของผู้เล่นและการเริ่มเกม
// ==================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Server } from 'socket.io';
import { PlayerReadyStatus } from '../dto/update-player-ready.dto';

export interface PlayerReadyState {
  playerInSessionId: number;
  playerId: number;
  displayName: string;
  readyStatus: PlayerReadyStatus;
  selectedCareer?: number;
  selectedGoal?: number;
  readyAt?: Date;
}

export interface SessionReadyState {
  sessionId: number;
  totalPlayers: number;
  readyPlayers: number;
  allPlayersReady: boolean;
  canStartGame: boolean;
  playerStates: PlayerReadyState[];
}

@Injectable()
export class PlayerReadyService {
  private readonly logger = new Logger(PlayerReadyService.name);
  
  // In-memory cache สำหรับ ready states
  private sessionReadyStates = new Map<number, SessionReadyState>();

  constructor(private prisma: PrismaService) {}

  // ==================== READY STATE MANAGEMENT ====================

  /**
   * อัพเดทสถานะความพร้อมของผู้เล่น
   */
  async updatePlayerReadyStatus(
    sessionId: number,
    playerInSessionId: number,
    readyStatus: PlayerReadyStatus,
    selections?: { careerId?: number; goalId?: number },
    socketServer?: Server
  ): Promise<SessionReadyState> {
    try {
      // ตรวจสอบว่า session อยู่ในสถานะ waiting
      const session = await this.prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: {
          players: {
            include: { player: true }
          }
        }
      });

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      if (session.status !== 'waiting') {
        throw new Error(`Cannot update ready status - game already started`);
      }

      // หา player ที่ต้องการอัพเดท
      const playerInSession = session.players.find(p => p.id === playerInSessionId);
      if (!playerInSession) {
        throw new Error(`Player ${playerInSessionId} not found in session`);
      }

      // อัพเดทสถานะในฐานข้อมูล
      const updateData: any = {
        readyStatus: readyStatus
      };

      // ถ้าเลือก career และ goal
      if (selections?.careerId) {
        updateData.careerId = selections.careerId;
      }
      if (selections?.goalId) {
        updateData.goalId = selections.goalId;
      }

      await this.prisma.playerInSession.update({
        where: { id: playerInSessionId },
        data: updateData
      });

      // อัพเดท ready state
      const sessionReadyState = await this.calculateSessionReadyState(sessionId);
      this.sessionReadyStates.set(sessionId, sessionReadyState);

      // บันทึก activity
      await this.logReadyActivity(
        sessionId,
        playerInSessionId,
        readyStatus,
        selections
      );

      // Broadcast ready state update
      if (socketServer) {
        socketServer.to(sessionId.toString()).emit('playerReadyStatusUpdated', {
          sessionId,
          playerInSessionId,
          readyStatus,
          selections,
          sessionReadyState,
          timestamp: new Date().toISOString()
        });

        // ถ้าทุกคนพร้อมแล้ว ส่งสัญญาณว่าสามารถเริ่มเกมได้
        if (sessionReadyState.canStartGame) {
          socketServer.to(sessionId.toString()).emit('allPlayersReady', {
            sessionId,
            sessionReadyState,
            timestamp: new Date().toISOString()
          });
        }
      }

      this.logger.log(`🎯 Player ${playerInSession.player.displayName} updated ready status to ${readyStatus} in session ${sessionId}`);
      
      return sessionReadyState;
    } catch (error) {
      this.logger.error(`Error updating player ready status:`, error);
      throw error;
    }
  }

  /**
   * เริ่มเกมเมื่อทุกคนพร้อม
   */
  async startGameWhenReady(
    sessionId: number,
    socketServer: Server
  ): Promise<boolean> {
    try {
      const readyState = await this.getSessionReadyState(sessionId);
      
      if (!readyState.canStartGame) {
        throw new Error('Cannot start game - not all players are ready or missing selections');
      }

      // กำหนด turn order แบบสุ่ม
      const turnOrders = this.generateRandomTurnOrder(readyState.totalPlayers);
      
      // อัพเดทฐานข้อมูล
      await Promise.all([
        // อัพเดท session status
        this.prisma.gameSession.update({
          where: { id: sessionId },
          data: { status: 'in_progress' }
        }),
        
        // อัพเดท player statuses และ turn orders
        ...readyState.playerStates.map((player, index) =>
          this.prisma.playerInSession.update({
            where: { id: player.playerInSessionId },
            data: {
              readyStatus: PlayerReadyStatus.IN_GAME,
              turnOrder: turnOrders[index]
            }
          })
        )
      ]);

      // ล้าง ready state cache
      this.sessionReadyStates.delete(sessionId);

      // บันทึก game start activity
      await this.prisma.activity.create({
        data: {
          sessionId,
          playerInSessionId: readyState.playerStates[0].playerInSessionId,
          type: 'GAME_START',
          description: 'Game started - all players ready',
          dataPayload: { 
            turnOrder: turnOrders,
            startedAt: new Date()
          },
          turnNumber: 0,
          timestamp: new Date()
        }
      });

      // Broadcast game start
      socketServer.to(sessionId.toString()).emit('gameStarted', {
        sessionId,
        playerStates: readyState.playerStates,
        turnOrders,
        startedAt: new Date().toISOString()
      });

      this.logger.log(`🚀 Game started for session ${sessionId} with ${readyState.totalPlayers} players`);
      
      return true;
    } catch (error) {
      this.logger.error(`Error starting game for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * รีเซ็ตสถานะความพร้อมของผู้เล่นทั้งหมด
   */
  async resetAllPlayersReady(
    sessionId: number,
    socketServer?: Server
  ): Promise<SessionReadyState> {
    try {
      // รีเซ็ตทุกคนเป็น not_ready
      await this.prisma.playerInSession.updateMany({
        where: { sessionId },
        data: {
          readyStatus: PlayerReadyStatus.NOT_READY,
          careerId: null,
          goalId: null,
          turnOrder: null
        }
      });

      // อัพเดท ready state
      const sessionReadyState = await this.calculateSessionReadyState(sessionId);
      this.sessionReadyStates.set(sessionId, sessionReadyState);

      // Broadcast reset
      if (socketServer) {
        socketServer.to(sessionId.toString()).emit('playersReadyReset', {
          sessionId,
          sessionReadyState,
          timestamp: new Date().toISOString()
        });
      }

      this.logger.log(`🔄 Reset all players ready status for session ${sessionId}`);
      
      return sessionReadyState;
    } catch (error) {
      this.logger.error(`Error resetting players ready for session ${sessionId}:`, error);
      throw error;
    }
  }

  // ==================== STATE QUERIES ====================

  /**
   * ดึงสถานะความพร้อมของ session
   */
  async getSessionReadyState(sessionId: number): Promise<SessionReadyState> {
    // ลองดึงจาก cache ก่อน
    const cached = this.sessionReadyStates.get(sessionId);
    if (cached) {
      return cached;
    }

    // คำนวณใหม่
    const sessionReadyState = await this.calculateSessionReadyState(sessionId);
    this.sessionReadyStates.set(sessionId, sessionReadyState);
    
    return sessionReadyState;
  }

  /**
   * ตรวจสอบว่าผู้เล่นพร้อมหรือไม่
   */
  async isPlayerReady(sessionId: number, playerInSessionId: number): Promise<boolean> {
    const readyState = await this.getSessionReadyState(sessionId);
    const playerState = readyState.playerStates.find(p => p.playerInSessionId === playerInSessionId);
    
    return playerState?.readyStatus === PlayerReadyStatus.READY &&
           playerState?.selectedCareer !== undefined &&
           playerState?.selectedGoal !== undefined;
  }

  /**
   * ตรวจสอบว่าทุกคนพร้อมหรือไม่
   */
  async areAllPlayersReady(sessionId: number): Promise<boolean> {
    const readyState = await this.getSessionReadyState(sessionId);
    return readyState.canStartGame;
  }

  // ==================== HELPERS ====================

  /**
   * คำนวณสถานะความพร้อมของ session
   */
  private async calculateSessionReadyState(sessionId: number): Promise<SessionReadyState> {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        players: {
          include: { player: true },
          orderBy: { id: 'asc' }
        }
      }
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const playerStates: PlayerReadyState[] = session.players.map(player => ({
      playerInSessionId: player.id,
      playerId: player.playerId,
      displayName: player.player.displayName,
      readyStatus: (player.readyStatus as PlayerReadyStatus) || PlayerReadyStatus.NOT_READY,
      selectedCareer: player.careerId || undefined,
      selectedGoal: player.goalId || undefined,
      readyAt: (player.readyStatus === PlayerReadyStatus.READY) ? new Date() : undefined
    }));

    const readyPlayers = playerStates.filter(p => 
      p.readyStatus === PlayerReadyStatus.READY &&
      p.selectedCareer !== undefined &&
      p.selectedGoal !== undefined
    ).length;

    const allPlayersReady = readyPlayers === session.players.length && session.players.length >= 2;
    const canStartGame = allPlayersReady && session.status === 'waiting';

    return {
      sessionId,
      totalPlayers: session.players.length,
      readyPlayers,
      allPlayersReady,
      canStartGame,
      playerStates
    };
  }

  /**
   * สร้าง turn order แบบสุ่ม
   */
  private generateRandomTurnOrder(playerCount: number): number[] {
    const orders = Array.from({ length: playerCount }, (_, i) => i + 1);
    
    // Fisher-Yates shuffle
    for (let i = orders.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [orders[i], orders[j]] = [orders[j], orders[i]];
    }
    
    return orders;
  }

  /**
   * บันทึก ready activity
   */
  private async logReadyActivity(
    sessionId: number,
    playerInSessionId: number,
    readyStatus: PlayerReadyStatus,
    selections?: { careerId?: number; goalId?: number }
  ): Promise<void> {
    try {
      await this.prisma.activity.create({
        data: {
          sessionId,
          playerInSessionId,
          type: 'PLAYER_READY_UPDATE',
          description: `Player updated ready status to ${readyStatus}`,
          dataPayload: {
            readyStatus,
            selections,
            timestamp: new Date()
          },
          turnNumber: 0,
          timestamp: new Date()
        }
      });
    } catch (error) {
      this.logger.error('Error logging ready activity:', error);
    }
  }

  /**
   * ทำความสะอาดเมื่อ session จบ
   */
  clearSessionReadyState(sessionId: number): void {
    this.sessionReadyStates.delete(sessionId);
    this.logger.log(`🗑️ Cleared ready state for session ${sessionId}`);
  }

  /**
   * ดึงสถิติการพร้อมของ session
   */
  async getReadyStatistics(sessionId: number) {
    try {
      const activities = await this.prisma.activity.findMany({
        where: { 
          sessionId,
          type: 'PLAYER_READY_UPDATE'
        },
        orderBy: { timestamp: 'asc' }
      });

      const readyTimes = activities
        .filter(a => (a.dataPayload as any)?.readyStatus === PlayerReadyStatus.READY)
        .map(a => a.timestamp);

      const avgReadyTime = readyTimes.length > 0 ? 
        readyTimes.reduce((sum, time, index) => {
          if (index === 0) return 0;
          return sum + (time.getTime() - readyTimes[0].getTime());
        }, 0) / Math.max(readyTimes.length - 1, 1) / 1000 : 0;

      return {
        totalReadyUpdates: activities.length,
        averageReadyTime: avgReadyTime,
        firstReadyAt: readyTimes[0],
        lastReadyAt: readyTimes[readyTimes.length - 1]
      };
    } catch (error) {
      this.logger.error(`Error getting ready statistics for session ${sessionId}:`, error);
      return null;
    }
  }
}