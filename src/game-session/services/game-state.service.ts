// ==================================================================
// Game State Management Service
// จัดการสถานะเกมแบบ real-time และ sync กับ Game Session Management
// ==================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompleteGameState, PlayerTurnData, PlayerFinancialSummary } from '../../entities/game-state.entity';
import { Server } from 'socket.io';

// Simplified interface สำหรับ complete game state
export interface SimplifiedFinancialSummary {
  totalNetWorth: number;
  totalAssets: number;
  totalDebts: number;
  monthlyIncome: number;
  liquidCash: number;
}

export interface GameStateUpdate {
  sessionId: number;
  currentTurnPlayerId?: number;
  gamePhase: 'setup' | 'in_progress' | 'finished';
  turnNumber: number;
  lastActivity: any;
  updatedAt: Date;
}

export interface PlayerStateUpdate {
  playerInSessionId: number;
  boardPosition?: number;
  cash?: number;
  savings?: number;
  passiveIncome?: number;
  scores?: {
    happiness?: number;
    health?: number;
    learning?: number;
    relationship?: number;
  };
  lastAction?: string;
  updatedAt: Date;
}

@Injectable()
export class GameStateService {
  private readonly logger = new Logger(GameStateService.name);
  
  // In-memory cache สำหรับ performance
  private gameStatesCache = new Map<number, CompleteGameState>();
  private activeGameSessions = new Set<number>();

  constructor(private prisma: PrismaService) {}

  // ==================== GAME STATE MANAGEMENT ====================

  /**
   * ดึงสถานะเกมแบบ complete จากฐานข้อมูล
   */
  async getCompleteGameState(sessionId: number): Promise<CompleteGameState | null> {
    try {
      const session = await this.prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: {
          host: true,
          currentTurnPlayer: true,
          players: {
            include: {
              player: true,
              career: true,
              goal: true,
              assets: {
                include: {
                  asset: true
                }
              },
              debts: {
                include: {
                  debt: true
                }
              }
            }
          },
          assetStates: {
            include: {
              asset: true
            }
          },
          activities: {
            orderBy: { timestamp: 'desc' },
            take: 10,
            include: {
              playerInSession: {
                include: {
                  player: true
                }
              },
              card: true
            }
          }
        }
      });

      if (!session) return null;

      // รวบรวมข้อมูล catalog ทั้งหมด
      const [careers, goals, assets, debts, cards, boardSpaces] = await Promise.all([
        this.prisma.career.findMany(),
        this.prisma.goal.findMany(),
        this.prisma.asset.findMany(),
        this.prisma.debt.findMany(),
        this.prisma.card.findMany(),
        this.prisma.boardSpace.findMany({ orderBy: { position: 'asc' } })
      ]);

      const completeState: CompleteGameState = {
        session: session as any,
        players: session.players.map(player => ({
          ...player,
          player: {
            id: player.player.id,
            displayName: player.player.displayName,
            email: player.player.email
          },
          career: player.career,
          goal: player.goal,
          assets: player.assets,
          debts: player.debts,
          financialSummary: {
            totalNetWorth: Number(player.cash) + Number(player.savings) + 
              player.assets.reduce((sum, asset) => sum + Number(asset.purchasePrice), 0) -
              player.debts.reduce((sum, debt) => sum + Number(debt.remainingPrincipal), 0),
            totalAssets: player.assets.reduce((sum, asset) => sum + Number(asset.purchasePrice), 0),
            totalDebts: player.debts.reduce((sum, debt) => sum + Number(debt.remainingPrincipal), 0),
            monthlyIncome: Number(player.passiveIncome),
            liquidCash: Number(player.cash)
          } as SimplifiedFinancialSummary
        })) as any,
        assetStates: session.assetStates as any,
        recentActivities: session.activities as any,
        catalog: {
          careers: careers as any,
          goals: goals as any,
          assets: assets as any,
          debts: debts as any,
          cards: cards as any,
          boardSpaces
        }
      };

      // อัพเดท cache
      this.gameStatesCache.set(sessionId, completeState);
      this.activeGameSessions.add(sessionId);

      return completeState;
    } catch (error) {
      this.logger.error(`Error getting complete game state for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * อัพเดทสถานะเกมและ broadcast ให้ทุกคน
   */
  async updateGameState(
    sessionId: number, 
    updates: Partial<GameStateUpdate>,
    socketServer?: Server
  ): Promise<void> {
    try {
      // อัพเดทในฐานข้อมูล
      const updatedSession = await this.prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          ...(updates.currentTurnPlayerId && { currentTurnPlayerId: updates.currentTurnPlayerId }),
          ...(updates.gamePhase && { status: updates.gamePhase })
        }
      });

      // อัพเดท cache
      this.gameStatesCache.delete(sessionId);

      // Broadcast update ถ้ามี socket server
      if (socketServer) {
        const completeState = await this.getCompleteGameState(sessionId);
        socketServer.to(sessionId.toString()).emit('gameStateUpdated', {
          sessionId,
          gameState: completeState,
          updateType: 'game_state',
          timestamp: new Date().toISOString()
        });
      }

      this.logger.log(`🔄 Game state updated for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Error updating game state for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * อัพเดทสถานะผู้เล่นและ broadcast
   */
  async updatePlayerState(
    playerInSessionId: number,
    updates: Partial<PlayerStateUpdate>,
    socketServer?: Server
  ): Promise<void> {
    try {
      // ดึงข้อมูล session ID
      const playerInSession = await this.prisma.playerInSession.findUnique({
        where: { id: playerInSessionId },
        select: { sessionId: true }
      });

      if (!playerInSession) {
        throw new Error(`Player in session ${playerInSessionId} not found`);
      }

      // อัพเดทในฐานข้อมูล
      const updateData: any = {
        ...(updates.boardPosition !== undefined && { boardPosition: updates.boardPosition }),
        ...(updates.cash !== undefined && { cash: updates.cash }),
        ...(updates.savings !== undefined && { savings: updates.savings }),
        ...(updates.passiveIncome !== undefined && { passiveIncome: updates.passiveIncome }),
        ...(updates.scores?.happiness !== undefined && { happinessScore: updates.scores.happiness }),
        ...(updates.scores?.health !== undefined && { healthScore: updates.scores.health }),
        ...(updates.scores?.learning !== undefined && { learningScore: updates.scores.learning }),
        ...(updates.scores?.relationship !== undefined && { relationshipScore: updates.scores.relationship })
      };

      await this.prisma.playerInSession.update({
        where: { id: playerInSessionId },
        data: updateData
      });

      // ล็อกกิจกรรม
      if (updates.lastAction) {
        await this.logActivity(
          playerInSession.sessionId,
          playerInSessionId,
          'PLAYER_UPDATE',
          updates.lastAction,
          { updates }
        );
      }

      // อัพเดท cache
      this.gameStatesCache.delete(playerInSession.sessionId);

      // Broadcast update
      if (socketServer) {
        const completeState = await this.getCompleteGameState(playerInSession.sessionId);
        socketServer.to(playerInSession.sessionId.toString()).emit('playerStateUpdated', {
          sessionId: playerInSession.sessionId,
          playerInSessionId,
          gameState: completeState,
          updateType: 'player_state',
          timestamp: new Date().toISOString()
        });
      }

      this.logger.log(`👤 Player state updated for player ${playerInSessionId}`);
    } catch (error) {
      this.logger.error(`Error updating player state for player ${playerInSessionId}:`, error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลเทิร์นปัจจุบันของผู้เล่น
   */
  async getCurrentPlayerTurnData(playerInSessionId: number): Promise<PlayerTurnData | null> {
    try {
      const playerInSession = await this.prisma.playerInSession.findUnique({
        where: { id: playerInSessionId },
        include: {
          player: true,
          career: true,
          goal: true,
          session: true,
          assets: { include: { asset: true } },
          debts: { include: { debt: true } }
        }
      });

      if (!playerInSession) return null;

      // ดึงข้อมูล board space ปัจจุบัน
      const currentBoardSpace = await this.prisma.boardSpace.findUnique({
        where: { position: playerInSession.boardPosition }
      });

      // คำนวณ financial summary
      const totalAssetValue = playerInSession.assets.reduce((sum, asset) => sum + Number(asset.purchasePrice), 0);
      const totalAssetCost = playerInSession.assets.reduce((sum, asset) => sum + Number(asset.purchasePrice), 0);
      const totalDebtBalance = playerInSession.debts.reduce((sum, debt) => sum + Number(debt.remainingPrincipal), 0);
      const monthlyDebtPayments = playerInSession.debts.reduce((sum, debt) => sum + Number(debt.monthlyPayment), 0);

      const financialSummary = {
        playerId: playerInSession.playerId,
        sessionId: playerInSession.sessionId,
        cash: Number(playerInSession.cash),
        savings: Number(playerInSession.savings),
        totalAssetValue,
        totalAssetCost,
        portfolioGainLoss: totalAssetValue - totalAssetCost,
        monthlyPassiveIncome: Number(playerInSession.passiveIncome),
        totalDebtBalance,
        monthlyDebtPayments,
        netWorth: Number(playerInSession.cash) + Number(playerInSession.savings) + totalAssetValue - totalDebtBalance,
        monthlyCashFlow: Number(playerInSession.passiveIncome) - monthlyDebtPayments,
        assetsByType: [], // TODO: implement asset categorization
        debtsByType: playerInSession.debts.map(debt => ({
          name: debt.name,
          balance: Number(debt.remainingPrincipal),
          monthlyPayment: Number(debt.monthlyPayment)
        }))
      };

      // ดึงราคาสินทรัพย์ปัจจุบัน
      const assetStates = await this.prisma.sessionAssetState.findMany({
        where: { sessionId: playerInSession.sessionId },
        include: { asset: true }
      });

      return {
        playerInSession: playerInSession as any,
        financialSummary: financialSummary as any,
        currentBoardSpace: currentBoardSpace || { id: 0, position: 0, type: 'unknown' },
        availableActions: this.getAvailableActions(playerInSession, currentBoardSpace),
        marketConditions: {
          economicStatus: playerInSession.session.economicStatus as any,
          assetPrices: assetStates as any
        }
      };
    } catch (error) {
      this.logger.error(`Error getting player turn data for player ${playerInSessionId}:`, error);
      throw error;
    }
  }

  /**
   * บันทึกกิจกรรมลงฐานข้อมูล
   */
  async logActivity(
    sessionId: number,
    playerInSessionId: number,
    type: string,
    description: string,
    dataPayload: any = {},
    cardId?: number
  ): Promise<void> {
    try {
      // ดึง turn number ปัจจุบัน
      const currentActivities = await this.prisma.activity.count({
        where: { sessionId }
      });

      await this.prisma.activity.create({
        data: {
          sessionId,
          playerInSessionId,
          type,
          description,
          dataPayload,
          turnNumber: Math.floor(currentActivities / 4) + 1, // สมมุติ 4 คนเล่น
          timestamp: new Date(),
          ...(cardId && { cardId })
        }
      });

      this.logger.log(`📝 Activity logged: ${type} - ${description}`);
    } catch (error) {
      this.logger.error('Error logging activity:', error);
    }
  }

  /**
   * ล้าง cache สำหรับ session ที่เสร็จสิ้นแล้ว
   */
  clearSessionCache(sessionId: number): void {
    this.gameStatesCache.delete(sessionId);
    this.activeGameSessions.delete(sessionId);
    this.logger.log(`🗑️ Cache cleared for session ${sessionId}`);
  }

  /**
   * ดึงรายการ available actions สำหรับผู้เล่น
   */
  private getAvailableActions(playerInSession: any, boardSpace: any): string[] {
    const actions = ['roll_dice'];

    // เพิ่ม actions ตามประเภทช่อง
    if (boardSpace?.type === 'opportunity') {
      actions.push('draw_opportunity_card');
    } else if (boardSpace?.type === 'market') {
      actions.push('draw_market_card');
    } else if (boardSpace?.type === 'life-event') {
      actions.push('draw_life_event_card');
    }

    // เพิ่ม financial actions
    if (playerInSession.cash > 0) {
      actions.push('save_money');
    }
    
    if (playerInSession.savings > 0) {
      actions.push('withdraw_savings');
    }

    return actions;
  }

  /**
   * ดึงสถิติการเล่นของ session
   */
  async getSessionStatistics(sessionId: number) {
    try {
      const [totalActivities, totalTurns, playerCount] = await Promise.all([
        this.prisma.activity.count({ where: { sessionId } }),
        this.prisma.activity.findFirst({
          where: { sessionId },
          orderBy: { turnNumber: 'desc' },
          select: { turnNumber: true }
        }),
        this.prisma.playerInSession.count({ where: { sessionId } })
      ]);

      return {
        totalActivities,
        currentTurn: totalTurns?.turnNumber || 0,
        totalPlayers: playerCount,
        averageActivitiesPerPlayer: totalActivities / playerCount
      };
    } catch (error) {
      this.logger.error(`Error getting session statistics for ${sessionId}:`, error);
      return null;
    }
  }
}