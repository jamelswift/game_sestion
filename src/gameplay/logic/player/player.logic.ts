import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { PlayerInSession } from "@prisma/client";

import {
  PlayerState,
  PlayerStatsUpdate,
  PlayerFinancialUpdate,
  PlayerWinCondition,
  PlayerInSessionWithRelations
} from "./player.state.interface";

@Injectable()
export class PlayerLogic {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  //  Core Player Data Methods
  // ========================================

  //ดึงข้อมูล Player State แบบเต็ม (รวมการคำนวณ)
  async getPlayerState(playerInSessionId: number): Promise<PlayerState> {
    try {
      const playerData = await this.getBasicPlayerInfo(playerInSessionId);
      if (!playerData) {
        throw new NotFoundException(`Player in session with ID ${playerInSessionId} not found`);
      }

      // คำนวณ financial metrics
      const netWorth = await this.calculateNetWorth(playerInSessionId);
      const monthlyCashFlow = await this.calculateMonthlyCashFlow(playerInSessionId);
      const totalAssetValue = await this.calculateTotalAssetValue(playerInSessionId);
      const totalDebtBalance = await this.calculateTotalDebt(playerInSessionId);

      return {
        // Basic Info
        id: playerData.id,
        sessionId: playerData.sessionId,
        playerId: playerData.playerId,
        displayName: playerData.player.displayName,
        boardPosition: playerData.boardPosition,
        turnOrder: playerData.turnOrder,
        readyStatus: playerData.readyStatus,
        
        // Career & Goals
        careerId: playerData.careerId,
        careerName: playerData.career?.name || null,
        goalId: playerData.goalId,
        goalName: playerData.goal?.name || null,
        
        // Liquid Assets
        cash: Number(playerData.cash),
        savings: Number(playerData.savings),
        passiveIncome: Number(playerData.passiveIncome),
        
        // Personal Stats
        happinessScore: playerData.happinessScore,
        healthScore: playerData.healthScore,
        learningScore: playerData.learningScore,
        relationshipScore: playerData.relationshipScore,
        
        // Financial Skills
        riskScore: playerData.riskScore,
        creditScore: playerData.creditScore,
        savingScore: playerData.savingScore,
        investingScore: playerData.investingScore,
        debtMgmtScore: playerData.debtMgmtScore,
        spendingScore: playerData.spendingScore,
        incomeMgmtScore: playerData.incomeMgmtScore,
        
        // Calculated Metrics
        netWorth,
        monthlyCashFlow,
        totalAssetValue,
        totalDebtBalance
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error getting player state:', error);
      throw new Error('Failed to get player state');
    }
  }


  async getBasicPlayerInfo(playerInSessionId: number): Promise<PlayerInSessionWithRelations | null> {
    try {
      const playerState = await this.prisma.playerInSession.findUnique({
        where: { id: playerInSessionId },
        include: {
          player: true,
          career: true,
          goal: true,
          session: true,
          assets: {
            include: { 
              asset: true 
            },
          },
          debts: {
            include: { 
              debt: true 
            },
          },
          activities: true,
        },
      });

      return playerState;
    } catch (error) {
      console.error('Error getting basic player info:', error);
      return null;
    }
  }

  // ========================================
  // Financial Update Methods
  // ========================================

  async updateFinancials(playerInSessionId: number, updates: PlayerFinancialUpdate): Promise<boolean> {
    try {
      const updateData: any = {};

      if (updates.cash !== undefined) {
        updateData.cash = { increment: updates.cash };
      }
      if (updates.savings !== undefined) {
        updateData.savings = { increment: updates.savings };
      }
      if (updates.passiveIncome !== undefined) {
        updateData.passiveIncome = { increment: updates.passiveIncome };
      }

      await this.prisma.playerInSession.update({
        where: { id: playerInSessionId },
        data: updateData
      });

      console.log(` Player ${playerInSessionId} financials updated:`, updates);
      return true;
    } catch (error) {
      console.error('Error updating player financials:', error);
      return false;
    }
  }


  async updateCash(playerInSessionId: number, amount: number, reason?: string): Promise<boolean> {
    try {
      await this.prisma.playerInSession.update({
        where: { id: playerInSessionId },
        data: { cash: { increment: amount } }
      });

      console.log(` Player ${playerInSessionId} cash updated by ${amount} (${reason || 'No reason'})`);
      return true;
    } catch (error) {
      console.error('Error updating player cash:', error);
      return false;
    }
  }


  async updateSavings(playerInSessionId: number, amount: number, reason?: string): Promise<boolean> {
    try {
      await this.prisma.playerInSession.update({
        where: { id: playerInSessionId },
        data: { savings: { increment: amount } }
      });

      console.log(` Player ${playerInSessionId} savings updated by ${amount} (${reason || 'No reason'})`);
      return true;
    } catch (error) {
      console.error('Error updating player savings:', error);
      return false;
    }
  }


  async updatePassiveIncome(playerInSessionId: number, amount: number): Promise<boolean> {
    try {
      await this.prisma.playerInSession.update({
        where: { id: playerInSessionId },
        data: { passiveIncome: { increment: amount } }
      });

      console.log(` Player ${playerInSessionId} passive income updated by ${amount}`);
      return true;
    } catch (error) {
      console.error('Error updating passive income:', error);
      return false;
    }
  }

  // ========================================
  //  Stats Update Methods
  // ========================================

  async updatePersonalStats(playerInSessionId: number, changes: PlayerStatsUpdate): Promise<boolean> {
    try {
      const currentPlayer = await this.prisma.playerInSession.findUnique({
        where: { id: playerInSessionId }
      });

      if (!currentPlayer) return false;

      const updateData: any = {};
      
      if (changes.happiness !== undefined) {
        updateData.happinessScore = this.clampValue(currentPlayer.happinessScore + changes.happiness);
      }
      if (changes.health !== undefined) {
        updateData.healthScore = this.clampValue(currentPlayer.healthScore + changes.health);
      }
      if (changes.learning !== undefined) {
        updateData.learningScore = this.clampValue(currentPlayer.learningScore + changes.learning);
      }
      if (changes.relationship !== undefined) {
        updateData.relationshipScore = this.clampValue(currentPlayer.relationshipScore + changes.relationship);
      }

      await this.prisma.playerInSession.update({
        where: { id: playerInSessionId },
        data: updateData
      });

      console.log(` Player ${playerInSessionId} personal stats updated:`, changes);
      return true;
    } catch (error) {
      console.error('Error updating personal stats:', error);
      return false;
    }
  }


  async updateFinancialStats(playerInSessionId: number, changes: PlayerFinancialUpdate): Promise<boolean> {
    try {
      const currentPlayer = await this.prisma.playerInSession.findUnique({
        where: { id: playerInSessionId }
      });

      if (!currentPlayer) return false;

      const updateData: any = {};
      
      if (changes.risk !== undefined) {
        updateData.riskScore = this.clampValue(currentPlayer.riskScore + changes.risk);
      }
      if (changes.credit !== undefined) {
        updateData.creditScore = this.clampValue(currentPlayer.creditScore + changes.credit);
      }
      if (changes.saving !== undefined) {
        updateData.savingScore = this.clampValue(currentPlayer.savingScore + changes.saving);
      }
      if (changes.investing !== undefined) {
        updateData.investingScore = this.clampValue(currentPlayer.investingScore + changes.investing);
      }
      if (changes.debtMgmt !== undefined) {
        updateData.debtMgmtScore = this.clampValue(currentPlayer.debtMgmtScore + changes.debtMgmt);
      }
      if (changes.spending !== undefined) {
        updateData.spendingScore = this.clampValue(currentPlayer.spendingScore + changes.spending);
      }
      if (changes.incomeMgmt !== undefined) {
        updateData.incomeMgmtScore = this.clampValue(currentPlayer.incomeMgmtScore + changes.incomeMgmt);
      }

      await this.prisma.playerInSession.update({
        where: { id: playerInSessionId },
        data: updateData
      });

      console.log(` Player ${playerInSessionId} financial stats updated:`, changes);
      return true;
    } catch (error) {
      console.error('Error updating financial stats:', error);
      return false;
    }
  }

  /**
   * รีเซ็ตสถิติเป็นค่าเริ่มต้น
   */
  async resetStats(playerInSessionId: number): Promise<boolean> {
    try {
      const defaultStats = {
        happinessScore: 0,
        healthScore: 0,
        learningScore: 0,
        relationshipScore: 0,
        riskScore: 0,
        creditScore: 0,
        savingScore: 0,
        investingScore: 0,
        debtMgmtScore: 0,
        spendingScore: 0,
        incomeMgmtScore: 0
      };
      
      await this.prisma.playerInSession.update({
        where: { id: playerInSessionId },
        data: defaultStats
      });

      console.log(` Player ${playerInSessionId} stats reset to default`);
      return true;
    } catch (error) {
      console.error('Error resetting player stats:', error);
      return false;
    }
  }

  // ========================================
  //  Game State Methods
  // ========================================

 // อัปเดตตำแหน่งบนกระดาน
  async updateBoardPosition(playerInSessionId: number, newPosition: number): Promise<boolean> {
    try {
      await this.prisma.playerInSession.update({
        where: { id: playerInSessionId },
        data: { boardPosition: newPosition }
      });

      console.log(` Player ${playerInSessionId} moved to position ${newPosition}`);
      return true;
    } catch (error) {
      console.error('Error updating board position:', error);
      return false;
    }
  }

  // อัปเดตสถานะพร้อมเล่น
  async updateReadyStatus(playerInSessionId: number, status: string): Promise<boolean> {
    try {
      await this.prisma.playerInSession.update({
        where: { id: playerInSessionId },
        data: { readyStatus: status }
      });

      console.log(` Player ${playerInSessionId} ready status: ${status}`);
      return true;
    } catch (error) {
      console.error('Error updating ready status:', error);
      return false;
    }
  }

  async setGoal(playerInSessionId: number, goalId: number): Promise<boolean> {
    try {
      await this.prisma.playerInSession.update({
        where: { id: playerInSessionId },
        data: { goalId }
      });

      console.log(` Player ${playerInSessionId} set goal: ${goalId}`);
      return true;
    } catch (error) {
      console.error('Error setting goal:', error);
      return false;
    }
  }


  async setCareer(playerInSessionId: number, careerId: number): Promise<boolean> {
    try {
      // อัปเดต careerId และข้อมูลเริ่มต้น
      const career = await this.prisma.career.findUnique({
        where: { id: careerId }
      });

      if (!career) {
        throw new Error(`Career with ID ${careerId} not found`);
      }

      await this.prisma.playerInSession.update({
        where: { id: playerInSessionId },
        data: { 
          careerId,
          cash: career.startingCash,
          savings: career.startingSavings
        }
      });

      console.log(` Player ${playerInSessionId} set career: ${career.name}`);
      return true;
    } catch (error) {
      console.error('Error setting career:', error);
      return false;
    }
  }

  // ========================================
  // Calculation Methods
  // ========================================

  // คำนวณมูลค่าสุทธิ (Net Worth)
  async calculateNetWorth(playerInSessionId: number): Promise<number> {
    try {
      const player = await this.getBasicPlayerInfo(playerInSessionId);
      if (!player) return 0;

      const cash = Number(player.cash);
      const savings = Number(player.savings);
      const totalAssetValue = await this.calculateTotalAssetValue(playerInSessionId);
      const totalDebt = await this.calculateTotalDebt(playerInSessionId);

      return cash + savings + totalAssetValue - totalDebt;
    } catch (error) {
      console.error('Error calculating net worth:', error);
      return 0;
    }
  }

  // คำนวณกระแสเงินสดรายเดือน (Monthly Cash Flow)
  async calculateMonthlyCashFlow(playerInSessionId: number): Promise<number> {
    try {
      const player = await this.getBasicPlayerInfo(playerInSessionId);
      if (!player) return 0;

      const baseSalary = Number(player.career?.baseSalary || 0);
      const passiveIncome = Number(player.passiveIncome);
      
      // คำนวณรายได้จาก assets
      const assetIncome = player.assets?.reduce((total: number, playerAsset: any) => {
        return total + (Number(playerAsset.asset.cashFlow) * playerAsset.quantity);
      }, 0) || 0;

      // คำนวณการชำระหนี้
      const debtPayments = player.debts?.reduce((total: number, playerDebt: any) => {
        return total + Number(playerDebt.monthlyPayment);
      }, 0) || 0;

      // คำนวณค่าใช้จ่ายจากอาชีพ (ถ้ามี)
      const careerExpenses = await this.calculateCareerExpenses(player.careerId);

      return baseSalary + passiveIncome + assetIncome - debtPayments - careerExpenses;
    } catch (error) {
      console.error('Error calculating monthly cash flow:', error);
      return 0;
    }
  }

  // คำนวณมูลค่าสินทรัพย์รวม (Total Asset Value)  
  async calculateTotalAssetValue(playerInSessionId: number): Promise<number> {
    try {
      const player = await this.getBasicPlayerInfo(playerInSessionId);
      if (!player?.assets) return 0;

      let totalValue = 0;
      for (const playerAsset of player.assets as any[]) {
        // ตรวจสอบราคาปัจจุบันจาก SessionAssetState
        const currentPrice = await this.getCurrentAssetPrice(playerAsset.assetId, player.sessionId);
        totalValue += currentPrice * playerAsset.quantity;
      }

      return totalValue;
    } catch (error) {
      console.error('Error calculating total asset value:', error);
      return 0;
    }
  }

  // คำนวณยอดหนี้รวม
  async calculateTotalDebt(playerInSessionId: number): Promise<number> {
    try {
      const player = await this.getBasicPlayerInfo(playerInSessionId);
      if (!player?.debts) return 0;

      return player.debts.reduce((total: number, playerDebt: any) => {
        return total + Number(playerDebt.remainingPrincipal);
      }, 0);
    } catch (error) {
      console.error('Error calculating total debt:', error);
      return 0;
    }
  }

  // ========================================
  //  Win Condition Methods
  // ========================================

  //ตรวจสอบเงื่อนไขชน
  async checkWinCondition(playerInSessionId: number): Promise<PlayerWinCondition> {
    try {
      const playerState = await this.getPlayerState(playerInSessionId);
      
      // เงื่อนไขชนะพื้นฐาน: Net Worth >= 1M และ Monthly Cash Flow >= 20K
      const netWorthTarget = 1000000;
      const cashFlowTarget = 20000;

      if (playerState.netWorth >= netWorthTarget && playerState.monthlyCashFlow >= cashFlowTarget) {
        return {
          hasWon: true,
          winType: 'financial_freedom',
          details: {
            netWorthTarget,
            cashFlowTarget,
            currentNetWorth: playerState.netWorth,
            currentCashFlow: playerState.monthlyCashFlow
          }
        };
      }

      // ตรวจสอบเงื่อนไขชนะจากเป้าหมาย (ถ้ามี)
      if (playerState.goalId) {
        const goalWin = await this.checkGoalWinCondition(playerInSessionId, playerState);
        if (goalWin.hasWon) {
          return goalWin;
        }
      }

      return { hasWon: false };
    } catch (error) {
      console.error('Error checking win condition:', error);
      return { hasWon: false };
    }
  }

  //ตรวจสอบเงื่อนไขชนะจากเป้าหมาย
  private async checkGoalWinCondition(playerInSessionId: number, playerState: PlayerState): Promise<PlayerWinCondition> {
    try {
      // TODO: Implement goal-specific win conditions
      return { hasWon: false };
    } catch (error) {
      console.error('Error checking goal win condition:', error);
      return { hasWon: false };
    }
  }

  // ========================================
  //  Helper Methods
  // ========================================

  //จำกัดค่าให้อยู่ในช่วง 0-100
  private clampValue(value: number): number {
    return Math.min(100, Math.max(0, Math.round(value)));
  }

  // ดึงราคาปัจจุบันของสินทรัพย์
  private async getCurrentAssetPrice(assetId: number, sessionId: number): Promise<number> {
    try {
      // ตรวจสอบราคาใน session ก่อน
      const sessionPrice = await this.prisma.sessionAssetState.findUnique({
        where: { sessionId_assetId: { sessionId, assetId } }
      });

      if (sessionPrice) {
        return Number(sessionPrice.currentPrice);
      }

      // ถ้าไม่มี ใช้ราคาเริ่มต้น
      const asset = await this.prisma.asset.findUnique({
        where: { id: assetId }
      });

      return asset ? Number(asset.cost) : 0;
    } catch (error) {
      console.error('Error getting current asset price:', error);
      return 0;
    }
  }

  // คำนวณค่าใช้จ่ายจากอาชีพ
  private async calculateCareerExpenses(careerId: number | null): Promise<number> {
    if (!careerId) return 0;

    try {
      const careerExpenses = await this.prisma.careerExpense.findMany({
        where: { careerId }
      });

      return careerExpenses.reduce((total, expense) => {
        return total + Number(expense.amount);
      }, 0);
    } catch (error) {
      console.error('Error calculating career expenses:', error);
      return 0;
    }
  }
}

// ============================================================================
// Helper Functions (เก็บไว้เพื่อ backward compatibility)
// ============================================================================

/**
 * ดึงสถานะปัจจุบันของผู้เล่นในเซสชัน (เดิม)
 * @deprecated ใช้ PlayerLogic.getBasicPlayerInfo() แทน
 */
export async function getPlayerState(prisma: PrismaService, playerInSessionId: number): Promise<PlayerInSession> {
  const playerLogic = new PlayerLogic(prisma);
  const playerState = await playerLogic.getBasicPlayerInfo(playerInSessionId);
  
  if (!playerState) {
    throw new NotFoundException(`Player in session with ID ${playerInSessionId} not found`);
  }
  
  return playerState;
}

/**
 * อัปเดตสถิติ (เดิม)
 */
export function updateStats(
  currentStats: { happinessScore: number; healthScore: number; learningScore: number; relationshipScore: number },
  changes: { happiness?: number; health?: number; learning?: number; relationship?: number }
): { happinessScore: number; healthScore: number; learningScore: number; relationshipScore: number } {
  const newStats = { ...currentStats };

  if (changes.happiness) {
    newStats.happinessScore = Math.min(100, Math.max(0, newStats.happinessScore + changes.happiness));
  }
  if (changes.health) {
    newStats.healthScore = Math.min(100, Math.max(0, newStats.healthScore + changes.health));
  }
  if (changes.learning) {
    newStats.learningScore = Math.min(100, Math.max(0, newStats.learningScore + changes.learning));
  }
  if (changes.relationship) {
    newStats.relationshipScore = Math.min(100, Math.max(0, newStats.relationshipScore + changes.relationship));  
  }
  return newStats;
}

// คำนวณเมตริกส์ทางการเงิน
export function calculateFinancialMetrics(playerState: any) {
  const cash = Number(playerState.cash || 0);
  const savings = Number(playerState.savings || 0);
  
  // คำนวณมูลค่าสินทรัพย์รวม
  const totalAssetValue = playerState.assets?.reduce((total: number, playerAsset: any) => {
    const quantity = playerAsset.quantity || 0;
    const currentValue = playerAsset.asset?.cost || playerAsset.purchasePrice || 0;
    return total + (quantity * Number(currentValue));
  }, 0) || 0;

  // คำนวณยอดหนี้รวม
  const totalDebt = playerState.debts?.reduce((total: number, playerDebt: any) => {
    return total + Number(playerDebt.remainingPrincipal || 0);
  }, 0) || 0;

  // คำนวณรายได้เฉื่อยรายเดือน
  const monthlyPassiveIncome = playerState.assets?.reduce((total: number, playerAsset: any) => {
    const quantity = playerAsset.quantity || 0;
    const monthlyCashFlow = playerAsset.asset?.cashFlow || 0;
    return total + (quantity * Number(monthlyCashFlow));
  }, 0) || 0;

  // คำนวณการชำระหนี้รายเดือน
  const monthlyDebtPayments = playerState.debts?.reduce((total: number, playerDebt: any) => {
    return total + Number(playerDebt.monthlyPayment || 0);
  }, 0) || 0;

  const baseSalary = Number(playerState.career?.baseSalary || 0);

  return {
    cash,
    savings,
    totalAssetValue,
    totalDebt,
    netWorth: cash + savings + totalAssetValue - totalDebt,
    monthlyPassiveIncome,
    monthlyDebtPayments,
    monthlyCashFlow: baseSalary + monthlyPassiveIncome - monthlyDebtPayments,
    baseSalary
  };
}
