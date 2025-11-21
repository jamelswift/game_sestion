// ==================================================================
// Game Flow Orchestration Service
// ควบคุม workflow ทั้งหมดตั้งแต่ session creation → game end
// ==================================================================

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GameSessionService } from '../game-session.service';
import { PlayerReadyService, SessionReadyState } from './player-ready.service';
import { TurnManagementService, TurnState } from './turn-management.service';
import { SessionGameplayIntegrationService } from './session-gameplay-integration.service';
import { GameStateService } from './game-state.service';
import { Server } from 'socket.io';

export enum GameFlowPhase {
  SESSION_CREATION = 'session_creation',
  WAITING_FOR_PLAYERS = 'waiting_for_players',
  PLAYER_SETUP = 'player_setup',
  ALL_PLAYERS_READY = 'all_players_ready',
  GAME_STARTING = 'game_starting',
  GAMEPLAY_ACTIVE = 'gameplay_active',
  GAME_ENDING = 'game_ending',
  GAME_FINISHED = 'game_finished'
}

export interface GameFlowState {
  sessionId: number;
  currentPhase: GameFlowPhase;
  phaseStartTime: Date;
  totalPlayers: number;
  readyPlayers: number;
  gameStartTime?: Date;
  gameEndTime?: Date;
  winner?: {
    playerId: number;
    displayName: string;
    winCondition: any;
  };
  metadata: {
    sessionCreatedAt: Date;
    hostPlayerId: number;
    expectedDuration: string;
    economicStatus: string;
  };
}

@Injectable()
export class GameFlowService {
  private readonly logger = new Logger(GameFlowService.name);
  
  // Active game flows
  private activeGameFlows = new Map<number, GameFlowState>();

  constructor(
    private prisma: PrismaService,
    private gameSessionService: GameSessionService,
    private playerReadyService: PlayerReadyService,
    private turnManagementService: TurnManagementService,
    private sessionGameplayService: SessionGameplayIntegrationService,
    private gameStateService: GameStateService
  ) {}

  // ==================== FLOW INITIALIZATION ====================

  /**
   * เริ่มต้น game flow สำหรับ session ใหม่
   */
  async initializeGameFlow(sessionId: number): Promise<GameFlowState> {
    try {
      const session = await this.prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: {
          host: true,
          players: { include: { player: true } }
        }
      });

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const gameFlow: GameFlowState = {
        sessionId,
        currentPhase: GameFlowPhase.SESSION_CREATION,
        phaseStartTime: new Date(),
        totalPlayers: session.players.length,
        readyPlayers: 0,
        metadata: {
          sessionCreatedAt: session.createdAt,
          hostPlayerId: session.hostPlayerId,
          expectedDuration: session.duration,
          economicStatus: session.economicStatus
        }
      };

      this.activeGameFlows.set(sessionId, gameFlow);

      // ไปยัง phase ถัดไป
      await this.transitionToPhase(sessionId, GameFlowPhase.WAITING_FOR_PLAYERS);

      this.logger.log(`🎮 Game flow initialized for session ${sessionId}`);
      
      return gameFlow;
    } catch (error) {
      this.logger.error(`Error initializing game flow for session ${sessionId}:`, error);
      throw error;
    }
  }

  // ==================== PHASE MANAGEMENT ====================

  /**
   * เปลี่ยน phase ของ game flow
   */
  async transitionToPhase(
    sessionId: number, 
    newPhase: GameFlowPhase,
    socketServer?: Server,
    additionalData?: any
  ): Promise<GameFlowState> {
    try {
      const gameFlow = this.activeGameFlows.get(sessionId);
      if (!gameFlow) {
        throw new Error(`No active game flow for session ${sessionId}`);
      }

      const previousPhase = gameFlow.currentPhase;

      // อัพเดท phase
      gameFlow.currentPhase = newPhase;
      gameFlow.phaseStartTime = new Date();

      // ดำเนินการตาม phase ใหม่
      await this.executePhaseActions(sessionId, newPhase, socketServer, additionalData);

      // บันทึก phase transition
      await this.logPhaseTransition(sessionId, previousPhase, newPhase);

      // Broadcast phase change
      if (socketServer) {
        socketServer.to(sessionId.toString()).emit('gameFlowPhaseChanged', {
          sessionId,
          previousPhase,
          currentPhase: newPhase,
          gameFlowState: gameFlow,
          timestamp: new Date().toISOString()
        });
      }

      this.logger.log(`🔄 Session ${sessionId}: ${previousPhase} → ${newPhase}`);
      
      return gameFlow;
    } catch (error) {
      this.logger.error(`Error transitioning to phase ${newPhase} for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * ดำเนินการตาม phase
   */
  private async executePhaseActions(
    sessionId: number,
    phase: GameFlowPhase,
    socketServer?: Server,
    additionalData?: any
  ): Promise<void> {
    switch (phase) {
      case GameFlowPhase.WAITING_FOR_PLAYERS:
        await this.handleWaitingForPlayers(sessionId);
        break;

      case GameFlowPhase.PLAYER_SETUP:
        await this.handlePlayerSetup(sessionId, socketServer);
        break;

      case GameFlowPhase.ALL_PLAYERS_READY:
        await this.handleAllPlayersReady(sessionId, socketServer);
        break;

      case GameFlowPhase.GAME_STARTING:
        await this.handleGameStarting(sessionId, socketServer);
        break;

      case GameFlowPhase.GAMEPLAY_ACTIVE:
        await this.handleGameplayActive(sessionId, socketServer);
        break;

      case GameFlowPhase.GAME_ENDING:
        await this.handleGameEnding(sessionId, socketServer, additionalData);
        break;

      case GameFlowPhase.GAME_FINISHED:
        await this.handleGameFinished(sessionId, socketServer);
        break;
    }
  }

  // ==================== PHASE HANDLERS ====================

  /**
   * รอผู้เล่นเข้าร่วม
   */
  private async handleWaitingForPlayers(sessionId: number): Promise<void> {
    // อัพเดท session status ถ้าจำเป็น
    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: 'waiting' }
    });
  }

  /**
   * ผู้เล่นตั้งค่า career และ goal
   */
  private async handlePlayerSetup(sessionId: number, socketServer?: Server): Promise<void> {
    // รีเซ็ต ready status ทุกคน
    await this.playerReadyService.resetAllPlayersReady(sessionId, socketServer);
  }

  /**
   * ทุกคนพร้อมแล้ว
   */
  private async handleAllPlayersReady(sessionId: number, socketServer?: Server): Promise<void> {
    // รอ host กด start game
    if (socketServer) {
      socketServer.to(sessionId.toString()).emit('readyToStartGame', {
        sessionId,
        message: 'All players are ready! Host can start the game.',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * เริ่มต้นเกม
   */
  private async handleGameStarting(sessionId: number, socketServer?: Server): Promise<void> {
    const gameFlow = this.activeGameFlows.get(sessionId);
    if (gameFlow) {
      gameFlow.gameStartTime = new Date();
    }

    // เริ่ม gameplay integration
    await this.sessionGameplayService.initializeSessionGameplay(sessionId, socketServer!);

    // ไปยัง gameplay phase
    setTimeout(() => {
      this.transitionToPhase(sessionId, GameFlowPhase.GAMEPLAY_ACTIVE, socketServer);
    }, 2000); // รอ 2 วินาทีให้ initialization เสร็จ
  }

  /**
   * เกมกำลังเล่น
   */
  private async handleGameplayActive(sessionId: number, socketServer?: Server): Promise<void> {
    // เกมเริ่มแล้ว - ไม่ต้องทำอะไรพิเศษ
    // Turn management จะจัดการเอง
  }

  /**
   * เกมกำลังจะจบ
   */
  private async handleGameEnding(sessionId: number, socketServer?: Server, winnerData?: any): Promise<void> {
    const gameFlow = this.activeGameFlows.get(sessionId);
    if (gameFlow && winnerData) {
      gameFlow.winner = winnerData;
      gameFlow.gameEndTime = new Date();
    }

    // หยุด gameplay
    await this.sessionGameplayService.endGameplay(sessionId, socketServer);

    // ไปยัง finished phase
    setTimeout(() => {
      this.transitionToPhase(sessionId, GameFlowPhase.GAME_FINISHED, socketServer);
    }, 3000); // รอ 3 วินาทีให้ cleanup เสร็จ
  }

  /**
   * เกมจบแล้ว
   */
  private async handleGameFinished(sessionId: number, socketServer?: Server): Promise<void> {
    // อัพเดท session status
    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: 'finished' }
    });

    // สร้าง match history
    await this.createMatchHistory(sessionId);

    // ล้าง game flow
    setTimeout(() => {
      this.cleanupGameFlow(sessionId);
    }, 60000); // ล้างหลัง 1 นาที
  }

  // ==================== EVENT HANDLERS ====================

  /**
   * เมื่อมีผู้เล่นเข้าร่วม
   */
  async onPlayerJoined(sessionId: number, socketServer?: Server): Promise<void> {
    const gameFlow = this.activeGameFlows.get(sessionId);
    if (!gameFlow) return;

    // อัพเดทจำนวนผู้เล่น
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { players: true }
    });

    if (session) {
      gameFlow.totalPlayers = session.players.length;

      // ถ้ามีผู้เล่นครบตามที่ host ต้องการ → ไป setup phase
      if (gameFlow.currentPhase === GameFlowPhase.WAITING_FOR_PLAYERS && 
          session.players.length >= 2) {
        await this.transitionToPhase(sessionId, GameFlowPhase.PLAYER_SETUP, socketServer);
      }
    }
  }

  /**
   * เมื่อผู้เล่นออกจากห้อง
   */
  async onPlayerLeft(sessionId: number, socketServer?: Server): Promise<void> {
    const gameFlow = this.activeGameFlows.get(sessionId);
    if (!gameFlow) return;

    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { players: true }
    });

    if (session) {
      gameFlow.totalPlayers = session.players.length;

      // ถ้าผู้เล่นน้อยเกินไป → กลับไป waiting phase
      if (session.players.length < 2 && 
          gameFlow.currentPhase !== GameFlowPhase.WAITING_FOR_PLAYERS) {
        await this.transitionToPhase(sessionId, GameFlowPhase.WAITING_FOR_PLAYERS, socketServer);
      }
    }
  }

  /**
   * เมื่อผู้เล่นพร้อม
   */
  async onPlayerReady(sessionId: number, socketServer?: Server): Promise<void> {
    const gameFlow = this.activeGameFlows.get(sessionId);
    if (!gameFlow) return;

    const readyState = await this.playerReadyService.getSessionReadyState(sessionId);
    gameFlow.readyPlayers = readyState.readyPlayers;

    // ถ้าทุกคนพร้อม → ไป all ready phase
    if (readyState.canStartGame && gameFlow.currentPhase === GameFlowPhase.PLAYER_SETUP) {
      await this.transitionToPhase(sessionId, GameFlowPhase.ALL_PLAYERS_READY, socketServer);
    }
  }

  /**
   * เมื่อ host เริ่มเกม
   */
  async onGameStartRequested(sessionId: number, socketServer?: Server): Promise<void> {
    const gameFlow = this.activeGameFlows.get(sessionId);
    if (!gameFlow) return;

    if (gameFlow.currentPhase === GameFlowPhase.ALL_PLAYERS_READY) {
      await this.transitionToPhase(sessionId, GameFlowPhase.GAME_STARTING, socketServer);
    }
  }

  /**
   * เมื่อมีผู้เล่นชนะ
   */
  async onPlayerWon(sessionId: number, winnerData: any, socketServer?: Server): Promise<void> {
    const gameFlow = this.activeGameFlows.get(sessionId);
    if (!gameFlow) return;

    if (gameFlow.currentPhase === GameFlowPhase.GAMEPLAY_ACTIVE) {
      await this.transitionToPhase(sessionId, GameFlowPhase.GAME_ENDING, socketServer, winnerData);
    }
  }

  // ==================== QUERIES ====================

  /**
   * ดึงสถานะ game flow
   */
  getGameFlowState(sessionId: number): GameFlowState | null {
    return this.activeGameFlows.get(sessionId) || null;
  }

  /**
   * ตรวจสอบว่า session อยู่ใน phase ไหน
   */
  getCurrentPhase(sessionId: number): GameFlowPhase | null {
    const gameFlow = this.activeGameFlows.get(sessionId);
    return gameFlow?.currentPhase || null;
  }

  /**
   * ตรวจสอบว่าสามารถทำ action ได้หรือไม่
   */
  canPerformAction(sessionId: number, action: string): boolean {
    const gameFlow = this.activeGameFlows.get(sessionId);
    if (!gameFlow) return false;

    const actionPermissions: Record<string, GameFlowPhase[]> = {
      'join_session': [GameFlowPhase.SESSION_CREATION, GameFlowPhase.WAITING_FOR_PLAYERS],
      'leave_session': [GameFlowPhase.WAITING_FOR_PLAYERS, GameFlowPhase.PLAYER_SETUP],
      'update_ready': [GameFlowPhase.PLAYER_SETUP],
      'start_game': [GameFlowPhase.ALL_PLAYERS_READY],
      'gameplay_action': [GameFlowPhase.GAMEPLAY_ACTIVE],
      'end_game': [GameFlowPhase.GAMEPLAY_ACTIVE, GameFlowPhase.GAME_ENDING]
    };

    const allowedPhases = actionPermissions[action];
    return allowedPhases ? allowedPhases.includes(gameFlow.currentPhase) : false;
  }

  // ==================== HELPERS ====================

  /**
   * บันทึก phase transition
   */
  private async logPhaseTransition(
    sessionId: number,
    fromPhase: GameFlowPhase,
    toPhase: GameFlowPhase
  ): Promise<void> {
    try {
      // หา player in session แรก
      const firstPlayer = await this.prisma.playerInSession.findFirst({
        where: { sessionId }
      });

      if (firstPlayer) {
        await this.gameStateService.logActivity(
          sessionId,
          firstPlayer.id,
          'FLOW_PHASE_TRANSITION',
          `Game flow transitioned from ${fromPhase} to ${toPhase}`,
          { fromPhase, toPhase, timestamp: new Date() }
        );
      }
    } catch (error) {
      this.logger.error('Error logging phase transition:', error);
    }
  }

  /**
   * สร้าง match history เมื่อเกมจบ
   */
  private async createMatchHistory(sessionId: number): Promise<void> {
    try {
      const gameFlow = this.activeGameFlows.get(sessionId);
      if (!gameFlow) return;

      const session = await this.prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: {
          players: { include: { player: true } }
        }
      });

      if (!session) return;

      const duration = gameFlow.gameEndTime && gameFlow.gameStartTime ? 
        gameFlow.gameEndTime.getTime() - gameFlow.gameStartTime.getTime() : 0;

      await this.prisma.matchHistory.create({
        data: {
          sessionId,
          endTimestamp: gameFlow.gameEndTime!,
          totalTurns: gameFlow.totalPlayers * 10, // Estimate turn count
          winnerPlayerId: gameFlow.winner!.playerId
        }
      });

      this.logger.log(`📊 Match history created for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Error creating match history for session ${sessionId}:`, error);
    }
  }

  /**
   * ล้าง game flow
   */
  private cleanupGameFlow(sessionId: number): void {
    this.activeGameFlows.delete(sessionId);
    this.gameStateService.clearSessionCache(sessionId);
    this.playerReadyService.clearSessionReadyState(sessionId);
    
    this.logger.log(`🗑️ Game flow cleaned up for session ${sessionId}`);
  }

  /**
   * ดึงสถิติ game flow
   */
  async getGameFlowStatistics(sessionId: number) {
    try {
      const gameFlow = this.activeGameFlows.get(sessionId);
      if (!gameFlow) return null;

      const duration = gameFlow.gameEndTime && gameFlow.gameStartTime ?
        gameFlow.gameEndTime.getTime() - gameFlow.gameStartTime.getTime() : 
        Date.now() - gameFlow.gameStartTime!.getTime();

      return {
        sessionId,
        currentPhase: gameFlow.currentPhase,
        totalDuration: Math.floor(duration / 60000), // minutes
        setupDuration: gameFlow.gameStartTime ? 
          Math.floor((gameFlow.gameStartTime.getTime() - gameFlow.metadata.sessionCreatedAt.getTime()) / 60000) : 0,
        gameplayDuration: gameFlow.gameEndTime && gameFlow.gameStartTime ?
          Math.floor((gameFlow.gameEndTime.getTime() - gameFlow.gameStartTime.getTime()) / 60000) : 0,
        totalPlayers: gameFlow.totalPlayers,
        winner: gameFlow.winner
      };
    } catch (error) {
      this.logger.error(`Error getting game flow statistics for session ${sessionId}:`, error);
      return null;
    }
  }
}