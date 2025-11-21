import { PrismaService } from '../../../prisma/prisma.service';
import { AssetManagementLogic } from '../financial/asset-management.logic';
import { DebtManagementLogic } from '../financial/debt-management.logic';
import { CashFlowLogic } from '../financial/cash-flow.logic';

// ============================================================================
// Win Condition Interfaces
// ============================================================================
export interface WinCondition {
  type: 'cash' | 'networth' | 'passive_income' | 'happiness' | 'goals' | 'hybrid';
  targetValue: number;
  description: string;
  priority: number; // 1 = primary, 2 = secondary
}

export interface PlayerProgress {
  playerInSessionId: number;
  playerName: string;
  currentValues: {
    cash: number;
    netWorth: number;
    passiveIncome: number;
    happiness: number;
    completedGoals: number;
  };
  progressToWin: {
    condition: WinCondition;
    currentValue: number;
    targetValue: number;
    percentage: number;
    isAchieved: boolean;
  }[];
  overallProgress: number; // 0-100%
  ranking: number;
  estimatedTurnsToWin?: number;
}

export interface GameEndResult {
  isGameEnded: boolean;
  winner?: {
    playerInSessionId: number;
    playerName: string;
    winCondition: WinCondition;
    finalStats: any;
  };
  rankings: PlayerProgress[];
  gameEndReason: 'win_condition_met' | 'max_turns_reached' | 'forfeit' | 'timeout';
  endedAt: Date;
}

export interface SessionWinSettings {
  sessionId: number;
  winConditions: WinCondition[];
  maxTurns?: number;
  timeLimit?: number; // minutes
  allowEarlyWin: boolean;
}

// ============================================================================
// Win Condition Logic
// ============================================================================
export class WinConditionLogic {
  private assetLogic: AssetManagementLogic;
  private debtLogic: DebtManagementLogic;
  private cashFlowLogic: CashFlowLogic;

  constructor(private readonly prisma: PrismaService) {
    this.assetLogic = new AssetManagementLogic(prisma);
    this.debtLogic = new DebtManagementLogic(prisma);
    this.cashFlowLogic = new CashFlowLogic(prisma);
  }

  // ========================================
  // 🏆 Win Condition Checking
  // ========================================

  /**
   * ตรวจสอบเงื่อนไขชนะของเซสชัน
   */
  async checkWinConditions(sessionId: number): Promise<GameEndResult> {
    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          players: {
            include: {
              player: true
            }
          }
        }
      });

      if (!session) {
        throw new Error('Session not found');
      }

      // ดึงการตั้งค่าเงื่อนไขชนะ
      const winSettings = await this.getWinSettings(sessionId);
      
      // ตรวจสอบความคืบหน้าของผู้เล่นแต่ละคน
      const playersProgress = await this.getAllPlayersProgress(sessionId, winSettings.winConditions);
      
      // ตรวจสอบว่ามีผู้เล่นชนะหรือไม่
      const winner = await this.findWinner(playersProgress, winSettings);
      
      // ตรวจสอบเงื่อนไขอื่นๆ ที่จบเกม
      const gameEndCheck = await this.checkGameEndConditions(sessionId, winSettings);

      return {
        isGameEnded: winner !== null || gameEndCheck.shouldEnd,
        winner: winner,
        rankings: playersProgress.sort((a, b) => b.overallProgress - a.overallProgress),
        gameEndReason: winner ? 'win_condition_met' : gameEndCheck.reason,
        endedAt: new Date()
      };
    } catch (error) {
      console.error('Error checking win conditions:', error);
      return {
        isGameEnded: false,
        rankings: [],
        gameEndReason: 'timeout',
        endedAt: new Date()
      };
    }
  }

  /**
   * ตรวจสอบความคืบหน้าของผู้เล่นคนเดียว
   */
  async checkPlayerProgress(playerInSessionId: number): Promise<PlayerProgress | null> {
    try {
      const player = await this.prisma.playerInSession.findUnique({
        where: { id: playerInSessionId },
        include: {
          player: true,
          session: true
        }
      });

      if (!player) return null;

      // ดึงการตั้งค่าเงื่อนไขชนะ
      const winSettings = await this.getWinSettings(player.sessionId);
      
      // คำนวณค่าปัจจุบันของผู้เล่น
      const currentValues = await this.calculatePlayerValues(playerInSessionId);
      
      // ตรวจสอบความคืบหน้าต่อเงื่อนไขแต่ละข้อ
      const progressToWin = [];
      let totalProgress = 0;

      for (const condition of winSettings.winConditions) {
        const progress = this.calculateConditionProgress(currentValues, condition);
        progressToWin.push(progress);
        totalProgress += progress.percentage * (condition.priority === 1 ? 0.7 : 0.3);
      }

      const overallProgress = Math.min(100, totalProgress);
      
      // ประมาณการเทิร์นที่เหลือ
      const estimatedTurns = this.estimateTurnsToWin(currentValues, winSettings.winConditions, overallProgress);

      return {
        playerInSessionId: player.id,
        playerName: player.player.username,
        currentValues,
        progressToWin,
        overallProgress,
        ranking: 0, // จะอัปเดตภายหลัง
        estimatedTurnsToWin: estimatedTurns
      };
    } catch (error) {
      console.error('Error checking player progress:', error);
      return null;
    }
  }

  /**
   * อัปเดตเงื่อนไขชนะของเซสชัน
   */
  async updateWinSettings(sessionId: number, settings: SessionWinSettings): Promise<boolean> {
    try {
      // TODO: บันทึกการตั้งค่าลงฐานข้อมูล
      console.log(`Updating win settings for session ${sessionId}:`, settings);
      
      return true;
    } catch (error) {
      console.error('Error updating win settings:', error);
      return false;
    }
  }

  /**
   * จบเกมด้วยตนเอง (admin)
   */
  async forceEndGame(sessionId: number, reason: string): Promise<GameEndResult> {
    try {
      const playersProgress = await this.getAllPlayersProgress(sessionId, []);
      
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'completed',
          endedAt: new Date()
        }
      });

      return {
        isGameEnded: true,
        rankings: playersProgress.sort((a, b) => b.overallProgress - a.overallProgress),
        gameEndReason: 'forfeit',
        endedAt: new Date()
      };
    } catch (error) {
      console.error('Error forcing game end:', error);
      throw error;
    }
  }

  // ========================================
  // 📊 Analytics and Reporting
  // ========================================

  /**
   * ดึงสถิติการแข่งขัน
   */
  async getGameStats(sessionId: number): Promise<{
    totalTurns: number;
    averageProgress: number;
    leadingPlayer: any;
    competitiveness: number; // ความใกล้เคียงกันของคะแนน
    projectedWinner: any;
  }> {
    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        throw new Error('Session not found');
      }

      const playersProgress = await this.getAllPlayersProgress(sessionId, []);
      
      if (playersProgress.length === 0) {
        return {
          totalTurns: 0,
          averageProgress: 0,
          leadingPlayer: null,
          competitiveness: 0,
          projectedWinner: null
        };
      }

      const averageProgress = playersProgress.reduce((sum, p) => sum + p.overallProgress, 0) / playersProgress.length;
      const leadingPlayer = playersProgress.reduce((max, p) => p.overallProgress > max.overallProgress ? p : max);
      
      // คำนวณความใกล้เคียงกัน (ยิ่งต่ำยิ่งใกล้เคียงกัน)
      const progressVariance = playersProgress.reduce((sum, p) => 
        sum + Math.pow(p.overallProgress - averageProgress, 2), 0) / playersProgress.length;
      const competitiveness = 100 - Math.min(100, Math.sqrt(progressVariance));

      // คาดการณ์ผู้ชนะ
      const projectedWinner = playersProgress.find(p => 
        p.estimatedTurnsToWin && p.estimatedTurnsToWin < 10
      ) || leadingPlayer;

      return {
        totalTurns: Number(session.currentTurn) || 0,
        averageProgress,
        leadingPlayer,
        competitiveness,
        projectedWinner
      };
    } catch (error) {
      console.error('Error getting game stats:', error);
      return {
        totalTurns: 0,
        averageProgress: 0,
        leadingPlayer: null,
        competitiveness: 0,
        projectedWinner: null
      };
    }
  }

  // ========================================
  // 🔧 Private Helper Methods
  // ========================================

  private async getWinSettings(sessionId: number): Promise<SessionWinSettings> {
    // TODO: ดึงจากฐานข้อมูลจริง
    // ตอนนี้ใช้ค่าเริ่มต้น
    return {
      sessionId,
      winConditions: [
        {
          type: 'networth',
          targetValue: 1000000, // $1M net worth
          description: 'Reach $1,000,000 net worth',
          priority: 1
        },
        {
          type: 'passive_income',
          targetValue: 20000, // $20k monthly passive income
          description: 'Achieve $20,000 monthly passive income',
          priority: 1
        },
        {
          type: 'happiness',
          targetValue: 100,
          description: 'Reach 100 happiness points',
          priority: 2
        }
      ],
      maxTurns: 50,
      allowEarlyWin: true
    };
  }

  private async calculatePlayerValues(playerInSessionId: number) {
    const player = await this.prisma.playerInSession.findUnique({
      where: { id: playerInSessionId }
    });

    if (!player) {
      throw new Error('Player not found');
    }

    // ดึงข้อมูลทางการเงิน
    const portfolio = await this.assetLogic.getPortfolioSummary(playerInSessionId);
    const debtSummary = await this.debtLogic.getDebtSummary(playerInSessionId);
    
    const cash = Number(player.cash);
    const savings = Number(player.savings);
    const assetValue = portfolio?.totalValue || 0;
    const totalDebt = debtSummary?.totalDebt || 0;
    const passiveIncome = Number(player.passiveIncome) + (portfolio?.monthlyPassiveIncome || 0);

    return {
      cash,
      netWorth: cash + savings + assetValue - totalDebt,
      passiveIncome,
      happiness: player.happinessScore,
      completedGoals: 0 // TODO: count completed goals
    };
  }

  private calculateConditionProgress(currentValues: any, condition: WinCondition) {
    let currentValue = 0;

    switch (condition.type) {
      case 'cash':
        currentValue = currentValues.cash;
        break;
      case 'networth':
        currentValue = currentValues.netWorth;
        break;
      case 'passive_income':
        currentValue = currentValues.passiveIncome;
        break;
      case 'happiness':
        currentValue = currentValues.happiness;
        break;
      case 'goals':
        currentValue = currentValues.completedGoals;
        break;
    }

    const percentage = Math.min(100, (currentValue / condition.targetValue) * 100);
    const isAchieved = currentValue >= condition.targetValue;

    return {
      condition,
      currentValue,
      targetValue: condition.targetValue,
      percentage,
      isAchieved
    };
  }

  private async getAllPlayersProgress(sessionId: number, winConditions: WinCondition[]): Promise<PlayerProgress[]> {
    const players = await this.prisma.playerInSession.findMany({
      where: { sessionId },
      include: { player: true }
    });

    const progressList = [];
    
    for (const player of players) {
      const progress = await this.checkPlayerProgress(player.id);
      if (progress) {
        progressList.push(progress);
      }
    }

    // อัปเดต ranking
    progressList.sort((a, b) => b.overallProgress - a.overallProgress);
    progressList.forEach((progress, index) => {
      progress.ranking = index + 1;
    });

    return progressList;
  }

  private async findWinner(playersProgress: PlayerProgress[], winSettings: SessionWinSettings) {
    // ตรวจสอบว่ามีผู้เล่นที่ทำเงื่อนไขหลักสำเร็จ
    for (const player of playersProgress) {
      const primaryConditions = player.progressToWin.filter(p => p.condition.priority === 1);
      
      // ต้องทำเงื่อนไขหลักอย่างน้อย 1 ข้อสำเร็จ
      const achievedPrimary = primaryConditions.some(p => p.isAchieved);
      
      if (achievedPrimary && winSettings.allowEarlyWin) {
        const winCondition = primaryConditions.find(p => p.isAchieved)?.condition;
        const finalStats = await this.calculatePlayerValues(player.playerInSessionId);
        
        return {
          playerInSessionId: player.playerInSessionId,
          playerName: player.playerName,
          winCondition: winCondition!,
          finalStats
        };
      }
    }

    return null;
  }

  private async checkGameEndConditions(sessionId: number, winSettings: SessionWinSettings) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      return { shouldEnd: false, reason: 'timeout' as const };
    }

    // ตรวจสอบเทิร์นสูงสุด
    if (winSettings.maxTurns && Number(session.currentTurn) >= winSettings.maxTurns) {
      return { shouldEnd: true, reason: 'max_turns_reached' as const };
    }

    // ตรวจสอบเวลาสูงสุด (TODO: implement time limit)

    return { shouldEnd: false, reason: 'timeout' as const };
  }

  private estimateTurnsToWin(currentValues: any, winConditions: WinCondition[], currentProgress: number): number {
    if (currentProgress >= 100) return 0;
    
    // ประมาณการจากอัตราความก้าวหน้าปัจจุบัน
    const progressPerTurn = currentProgress / 10; // สมมติว่าเล่นมา 10 เทิร์น
    
    if (progressPerTurn <= 0) return 999;
    
    const remainingProgress = 100 - currentProgress;
    return Math.ceil(remainingProgress / progressPerTurn);
  }
}