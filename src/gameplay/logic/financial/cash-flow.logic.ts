import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// Cash Flow Interfaces
// ============================================================================
export interface CashFlowRequest {
  playerInSessionId: number;
  transactionType: 'income' | 'expense' | 'investment' | 'debt_payment' | 'transfer';
  amount: number;
  category: string;
  description: string;
  fromAccount?: 'cash' | 'savings';
  toAccount?: 'cash' | 'savings';
  isRecurring?: boolean;
  frequency?: 'monthly' | 'quarterly' | 'annually';
}

export interface TransferRequest {
  playerInSessionId: number;
  fromAccount: 'cash' | 'savings';
  toAccount: 'cash' | 'savings';
  amount: number;
  description?: string;
}

export interface BudgetAllocation {
  playerInSessionId: number;
  categories: BudgetCategory[];
  totalBudget: number;
  period: 'monthly' | 'quarterly' | 'annually';
}

export interface BudgetCategory {
  category: string;
  allocatedAmount: number;
  spentAmount?: number;
  priority: 'high' | 'medium' | 'low';
  isFixed: boolean; // ค่าใช้จ่ายคงที่หรือไม่
}

export interface CashFlowStatement {
  period: {
    startDate: Date;
    endDate: Date;
    type: 'monthly' | 'quarterly' | 'annually';
  };
  operatingActivities: {
    totalIncome: number;
    totalExpenses: number;
    netOperatingCashFlow: number;
    breakdown: CategoryBreakdown[];
  };
  investingActivities: {
    assetPurchases: number;
    assetSales: number;
    netInvestingCashFlow: number;
  };
  financingActivities: {
    newLoans: number;
    loanPayments: number;
    netFinancingCashFlow: number;
  };
  netCashFlow: number;
  cashAtBeginning: number;
  cashAtEnd: number;
  freeShackFlow: number; // เงินสดคงเหลือหลังจ่ายค่าใช้จ่ายจำเป็น
}

export interface CategoryBreakdown {
  category: string;
  type: 'income' | 'expense';
  amount: number;
  percentage: number;
  transactions: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface CashFlowProjection {
  timeframe: 'next_month' | 'next_quarter' | 'next_year';
  projections: MonthlyProjection[];
  summary: {
    totalProjectedIncome: number;
    totalProjectedExpenses: number;
    netProjectedCashFlow: number;
    expectedCashPosition: number;
    riskFactors: string[];
    opportunities: string[];
  };
}

export interface MonthlyProjection {
  month: number;
  year: number;
  projectedIncome: number;
  projectedExpenses: number;
  netCashFlow: number;
  endingCash: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface EmergencyFundAnalysis {
  currentAmount: number;
  recommendedAmount: number;
  monthsCovered: number;
  monthlyExpenses: number;
  adequacyLevel: 'insufficient' | 'minimal' | 'adequate' | 'excellent';
  timeToTarget: number; // เดือน
  suggestedMonthlyContribution: number;
}

export interface CashFlowAlert {
  type: 'low_balance' | 'overspending' | 'unusual_expense' | 'budget_exceeded' | 'opportunity';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  suggestedAction?: string;
  amount?: number;
  category?: string;
}

// ============================================================================
// Cash Flow Logic
// ============================================================================
export class CashFlowLogic {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // 💰 Transaction Management
  // ========================================

  /**
   * บันทึกรายรับ-รายจ่าย
   */
  async recordTransaction(request: CashFlowRequest): Promise<{
    success: boolean;
    message: string;
    transaction?: any;
    newBalance?: { cash: number; savings: number };
    error?: string;
  }> {
    try {
      // ตรวจสอบข้อมูลพื้นฐาน
      const player = await this.prisma.playerInSession.findUnique({
        where: { id: request.playerInSessionId }
      });

      if (!player) {
        return { success: false, message: 'ไม่พบข้อมูลผู้เล่น' };
      }

      // ตรวจสอบจำนวนเงิน
      if (request.amount <= 0) {
        return { success: false, message: 'จำนวนเงินต้องมากกว่า 0' };
      }

      // ตรวจสอบเงินคงเหลือสำหรับรายจ่าย
      if (request.transactionType === 'expense' || 
          request.transactionType === 'debt_payment' ||
          request.transactionType === 'investment') {
        
        const account = request.fromAccount || 'cash';
        const availableBalance = account === 'cash' ? 
          Number(player.cash) : Number(player.savings);

        if (availableBalance < request.amount) {
          return { 
            success: false, 
            message: `เงินไม่เพียงพอ มีอยู่ ${availableBalance.toLocaleString()} บาท` 
          };
        }
      }

      // ดำเนินการตามประเภท
      const result = await this.processTransaction(request, player);

      // บันทึกประวัติ
      await this.logTransactionHistory(request, result.transactionId);

      // ตรวจสอบการแจ้งเตือน
      const alerts = await this.checkCashFlowAlerts(request.playerInSessionId);

      return {
        success: true,
        message: `บันทึก${this.getTransactionTypeLabel(request.transactionType)}สำเร็จ`,
        transaction: {
          id: result.transactionId,
          type: request.transactionType,
          amount: request.amount,
          category: request.category,
          description: request.description
        },
        newBalance: result.newBalance
      };
    } catch (error) {
      console.error('Error recording transaction:', error);
      return { 
        success: false, 
        message: 'เกิดข้อผิดพลาดในการบันทึกรายการ', 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * โอนเงินระหว่างบัญชี
   */
  async transferFunds(request: TransferRequest): Promise<{
    success: boolean;
    message: string;
    newBalance?: { cash: number; savings: number };
    error?: string;
  }> {
    try {
      if (request.fromAccount === request.toAccount) {
        return { success: false, message: 'ไม่สามารถโอนเงินภายในบัญชีเดียวกันได้' };
      }

      const player = await this.prisma.playerInSession.findUnique({
        where: { id: request.playerInSessionId }
      });

      if (!player) {
        return { success: false, message: 'ไม่พบข้อมูลผู้เล่น' };
      }

      // ตรวจสอบยอดเงิน
      const fromBalance = request.fromAccount === 'cash' ? 
        Number(player.cash) : Number(player.savings);

      if (fromBalance < request.amount) {
        return { 
          success: false, 
          message: `เงินไม่เพียงพอ มีอยู่ ${fromBalance.toLocaleString()} บาท` 
        };
      }

      // ดำเนินการโอน
      const newBalance = await this.processTransfer(request, player);

      // บันทึกประวัติ
      await this.logTransferHistory(request);

      return {
        success: true,
        message: `โอนเงิน ${request.amount.toLocaleString()} บาท สำเร็จ`,
        newBalance
      };
    } catch (error) {
      console.error('Error transferring funds:', error);
      return { 
        success: false, 
        message: 'เกิดข้อผิดพลาดในการโอนเงิน', 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ========================================
  // 📊 Cash Flow Analysis
  // ========================================

  /**
   * ดึงรายงานกระแสเงินสด
   */
  async getCashFlowStatement(
    playerInSessionId: number, 
    period: 'monthly' | 'quarterly' | 'annually'
  ): Promise<CashFlowStatement | null> {
    try {
      const dateRange = this.getDateRange(period);
      
      // TODO: ดึงข้อมูลจาก transaction history
      // ตอนนี้ใช้ข้อมูลจำลอง
      const mockStatement: CashFlowStatement = {
        period: {
          startDate: dateRange.start,
          endDate: dateRange.end,
          type: period
        },
        operatingActivities: {
          totalIncome: 50000,
          totalExpenses: 35000,
          netOperatingCashFlow: 15000,
          breakdown: [
            {
              category: 'เงินเดือน',
              type: 'income',
              amount: 40000,
              percentage: 80,
              transactions: 1,
              trend: 'stable'
            },
            {
              category: 'รายได้เสริม',
              type: 'income',
              amount: 10000,
              percentage: 20,
              transactions: 5,
              trend: 'increasing'
            },
            {
              category: 'ค่าใช้จ่ายประจำ',
              type: 'expense',
              amount: 25000,
              percentage: 71.4,
              transactions: 30,
              trend: 'stable'
            },
            {
              category: 'ค่าอาหาร',
              type: 'expense',
              amount: 10000,
              percentage: 28.6,
              transactions: 90,
              trend: 'increasing'
            }
          ]
        },
        investingActivities: {
          assetPurchases: 20000,
          assetSales: 5000,
          netInvestingCashFlow: -15000
        },
        financingActivities: {
          newLoans: 0,
          loanPayments: 5000,
          netFinancingCashFlow: -5000
        },
        netCashFlow: -5000,
        cashAtBeginning: 50000,
        cashAtEnd: 45000,
        freeShackFlow: 10000
      };

      return mockStatement;
    } catch (error) {
      console.error('Error getting cash flow statement:', error);
      return null;
    }
  }

  /**
   * วิเคราะห์และคาดการณ์กระแสเงินสด
   */
  async projectCashFlow(
    playerInSessionId: number, 
    timeframe: 'next_month' | 'next_quarter' | 'next_year'
  ): Promise<CashFlowProjection | null> {
    try {
      const player = await this.prisma.playerInSession.findUnique({
        where: { id: playerInSessionId }
      });

      if (!player) return null;

      // คำนวณรายได้-รายจ่ายเฉลี่ย
      const monthlyIncome = Number(player.passiveIncome); // TODO: Add base salary when available
      const estimatedExpenses = monthlyIncome * 0.7; // สมมติใช้จ่าย 70%

      const months = timeframe === 'next_month' ? 1 : 
                   timeframe === 'next_quarter' ? 3 : 12;

      const projections: MonthlyProjection[] = [];
      let currentCash = Number(player.cash);

      for (let i = 1; i <= months; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() + i);

        // เพิ่มความไม่แน่นอนเล็กน้อย
        const incomeVariation = 1 + (Math.random() - 0.5) * 0.1; // ±5%
        const expenseVariation = 1 + (Math.random() - 0.5) * 0.2; // ±10%

        const projectedIncome = monthlyIncome * incomeVariation;
        const projectedExpenses = estimatedExpenses * expenseVariation;
        const netCashFlow = projectedIncome - projectedExpenses;

        currentCash += netCashFlow;

        projections.push({
          month: date.getMonth() + 1,
          year: date.getFullYear(),
          projectedIncome: Math.round(projectedIncome),
          projectedExpenses: Math.round(projectedExpenses),
          netCashFlow: Math.round(netCashFlow),
          endingCash: Math.round(currentCash),
          confidence: i <= 3 ? 'high' : i <= 6 ? 'medium' : 'low'
        });
      }

      const totalIncome = projections.reduce((sum, p) => sum + p.projectedIncome, 0);
      const totalExpenses = projections.reduce((sum, p) => sum + p.projectedExpenses, 0);

      return {
        timeframe,
        projections,
        summary: {
          totalProjectedIncome: totalIncome,
          totalProjectedExpenses: totalExpenses,
          netProjectedCashFlow: totalIncome - totalExpenses,
          expectedCashPosition: currentCash,
          riskFactors: this.identifyRiskFactors(projections),
          opportunities: this.identifyOpportunities(projections, player)
        }
      };
    } catch (error) {
      console.error('Error projecting cash flow:', error);
      return null;
    }
  }

  /**
   * วิเคราะห์กองทุนฉุกเฉิน
   */
  async analyzeEmergencyFund(playerInSessionId: number): Promise<EmergencyFundAnalysis | null> {
    try {
      const player = await this.prisma.playerInSession.findUnique({
        where: { id: playerInSessionId }
      });

      if (!player) return null;

      const currentAmount = Number(player.savings);
      const monthlyIncome = Number(player.passiveIncome); // TODO: Add base salary when available
      const monthlyExpenses = monthlyIncome * 0.7; // สมมติใช้จ่าย 70%
      const recommendedAmount = monthlyExpenses * 6; // 6 เดือน

      const monthsCovered = monthlyExpenses > 0 ? currentAmount / monthlyExpenses : 0;
      
      let adequacyLevel: 'insufficient' | 'minimal' | 'adequate' | 'excellent';
      if (monthsCovered < 1) adequacyLevel = 'insufficient';
      else if (monthsCovered < 3) adequacyLevel = 'minimal';
      else if (monthsCovered < 6) adequacyLevel = 'adequate';
      else adequacyLevel = 'excellent';

      const shortfall = Math.max(0, recommendedAmount - currentAmount);
      const suggestedContribution = shortfall > 0 ? Math.min(shortfall / 12, monthlyIncome * 0.1) : 0;
      const timeToTarget = suggestedContribution > 0 ? Math.ceil(shortfall / suggestedContribution) : 0;

      return {
        currentAmount,
        recommendedAmount,
        monthsCovered: Number(monthsCovered.toFixed(1)),
        monthlyExpenses,
        adequacyLevel,
        timeToTarget,
        suggestedMonthlyContribution: Math.round(suggestedContribution)
      };
    } catch (error) {
      console.error('Error analyzing emergency fund:', error);
      return null;
    }
  }

  /**
   * ตรวจสอบการแจ้งเตือนกระแสเงินสด
   */
  async checkCashFlowAlerts(playerInSessionId: number): Promise<CashFlowAlert[]> {
    try {
      const alerts: CashFlowAlert[] = [];
      
      const player = await this.prisma.playerInSession.findUnique({
        where: { id: playerInSessionId }
      });

      if (!player) return alerts;

      const cash = Number(player.cash);
      const savings = Number(player.savings);
      const monthlyIncome = Number(player.passiveIncome); // TODO: Add base salary when available

      // เงินสดต่ำ
      if (cash < monthlyIncome * 0.1) {
        alerts.push({
          type: 'low_balance',
          severity: 'critical',
          title: 'เงินสดใกล้หมด',
          message: `เงินสดเหลือ ${cash.toLocaleString()} บาท (น้อยกว่า 10% ของรายได้)`,
          suggestedAction: 'โอนเงินจากบัญชีออมทรัพย์หรือลดค่าใช้จ่าย',
          amount: cash
        });
      } else if (cash < monthlyIncome * 0.2) {
        alerts.push({
          type: 'low_balance',
          severity: 'warning',
          title: 'เงินสดต่ำ',
          message: `เงินสดเหลือ ${cash.toLocaleString()} บาท`,
          suggestedAction: 'พิจารณาโอนเงินจากบัญชีออมทรัพย์',
          amount: cash
        });
      }

      // กองทุนฉุกเฉินไม่เพียงพอ
      const emergencyAnalysis = await this.analyzeEmergencyFund(playerInSessionId);
      if (emergencyAnalysis && emergencyAnalysis.adequacyLevel === 'insufficient') {
        alerts.push({
          type: 'low_balance',
          severity: 'warning',
          title: 'กองทุนฉุกเฉินไม่เพียงพอ',
          message: `ควรมีกองทุนฉุกเฉิน ${emergencyAnalysis.recommendedAmount.toLocaleString()} บาท`,
          suggestedAction: `เก็บเงิน ${emergencyAnalysis.suggestedMonthlyContribution.toLocaleString()} บาทต่อเดือน`,
          amount: emergencyAnalysis.currentAmount
        });
      }

      // โอกาสในการลงทุน
      if (cash > monthlyIncome * 2) {
        alerts.push({
          type: 'opportunity',
          severity: 'info',
          title: 'โอกาสลงทุน',
          message: `มีเงินสดเหลือ ${cash.toLocaleString()} บาท เหมาะสำหรับการลงทุน`,
          suggestedAction: 'พิจารณาลงทุนในสินทรัพย์ที่ให้ผลตอบแทนสูงกว่า',
          amount: cash
        });
      }

      return alerts;
    } catch (error) {
      console.error('Error checking cash flow alerts:', error);
      return [];
    }
  }

  /**
   * ดึงสรุปสถานะการเงิน
   */
  async getFinancialSnapshot(playerInSessionId: number): Promise<{
    cash: number;
    savings: number;
    totalLiquid: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    netWorth: number;
    burnRate: number; // เดือนที่เงินจะหมดถ้าไม่มีรายได้
    liquidityRatio: number;
  } | null> {
    try {
      const player = await this.prisma.playerInSession.findUnique({
        where: { id: playerInSessionId }
      });

      if (!player) return null;

      const cash = Number(player.cash);
      const savings = Number(player.savings);
      const totalLiquid = cash + savings;
      const monthlyIncome = Number(player.passiveIncome); // TODO: Add base salary when available
      const monthlyExpenses = monthlyIncome * 0.7; // สมมติ

      // คำนวณ net worth (เงินสด + สินทรัพย์ - หนี้)
      // TODO: ดึงข้อมูลจริงจากฐานข้อมูล
      const netWorth = totalLiquid; // simplified

      const burnRate = monthlyExpenses > 0 ? totalLiquid / monthlyExpenses : 999;
      const liquidityRatio = monthlyExpenses > 0 ? totalLiquid / monthlyExpenses : 999;

      return {
        cash,
        savings,
        totalLiquid,
        monthlyIncome,
        monthlyExpenses,
        netWorth,
        burnRate: Number(burnRate.toFixed(1)),
        liquidityRatio: Number(liquidityRatio.toFixed(1))
      };
    } catch (error) {
      console.error('Error getting financial snapshot:', error);
      return null;
    }
  }

  // ========================================
  // 🔧 Private Helper Methods
  // ========================================

  private async processTransaction(request: CashFlowRequest, player: any) {
    return await this.prisma.$transaction(async (prisma) => {
      let newCash = Number(player.cash);
      let newSavings = Number(player.savings);

      switch (request.transactionType) {
        case 'income':
          // เพิ่มรายได้
          const targetAccount = request.toAccount || 'cash';
          if (targetAccount === 'cash') {
            newCash += request.amount;
          } else {
            newSavings += request.amount;
          }
          break;

        case 'expense':
        case 'debt_payment':
        case 'investment':
          // หักรายจ่าย
          const sourceAccount = request.fromAccount || 'cash';
          if (sourceAccount === 'cash') {
            newCash -= request.amount;
          } else {
            newSavings -= request.amount;
          }
          break;

        case 'transfer':
          // โอนเงิน (จัดการแยกใน transferFunds)
          break;
      }

      // อัปเดตข้อมูลผู้เล่น
      await prisma.playerInSession.update({
        where: { id: request.playerInSessionId },
        data: {
          cash: newCash,
          savings: newSavings
        }
      });

      // TODO: บันทึกรายการใน transaction table
      const transactionId = Date.now(); // ใช้ timestamp ชั่วคราว

      return {
        transactionId,
        newBalance: { cash: newCash, savings: newSavings }
      };
    });
  }

  private async processTransfer(request: TransferRequest, player: any) {
    return await this.prisma.$transaction(async (prisma) => {
      let newCash = Number(player.cash);
      let newSavings = Number(player.savings);

      if (request.fromAccount === 'cash') {
        newCash -= request.amount;
        newSavings += request.amount;
      } else {
        newSavings -= request.amount;
        newCash += request.amount;
      }

      await prisma.playerInSession.update({
        where: { id: request.playerInSessionId },
        data: {
          cash: newCash,
          savings: newSavings
        }
      });

      return { cash: newCash, savings: newSavings };
    });
  }

  private async logTransactionHistory(request: CashFlowRequest, transactionId: number) {
    // TODO: บันทึกลงตาราง transaction_history
    console.log(`💡 Transaction logged: ${transactionId} - ${request.transactionType} ${request.amount}`);
  }

  private async logTransferHistory(request: TransferRequest) {
    // TODO: บันทึกลงตาราง transfer_history
    console.log(`💡 Transfer logged: ${request.fromAccount} -> ${request.toAccount} ${request.amount}`);
  }

  private getTransactionTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      income: 'รายได้',
      expense: 'รายจ่าย',
      investment: 'การลงทุน',
      debt_payment: 'ชำระหนี้',
      transfer: 'โอนเงิน'
    };
    return labels[type] || type;
  }

  private getDateRange(period: 'monthly' | 'quarterly' | 'annually') {
    const end = new Date();
    const start = new Date();

    switch (period) {
      case 'monthly':
        start.setMonth(start.getMonth() - 1);
        break;
      case 'quarterly':
        start.setMonth(start.getMonth() - 3);
        break;
      case 'annually':
        start.setFullYear(start.getFullYear() - 1);
        break;
    }

    return { start, end };
  }

  private identifyRiskFactors(projections: MonthlyProjection[]): string[] {
    const risks: string[] = [];

    // ตรวจสอบเงินสดติดลบ
    const negativeMonths = projections.filter(p => p.endingCash < 0);
    if (negativeMonths.length > 0) {
      risks.push(`เงินสดอาจติดลบใน ${negativeMonths.length} เดือน`);
    }

    // ตรวจสอบความผันผวนของรายได้
    const incomeVariations = projections.map(p => p.projectedIncome);
    const avgIncome = incomeVariations.reduce((a, b) => a + b, 0) / incomeVariations.length;
    const volatility = Math.sqrt(
      incomeVariations.reduce((sum, income) => sum + Math.pow(income - avgIncome, 2), 0) / 
      incomeVariations.length
    ) / avgIncome;

    if (volatility > 0.2) {
      risks.push('รายได้มีความผันผวนสูง');
    }

    // ตรวจสอบแนวโน้มรายจ่าย
    const firstHalf = projections.slice(0, Math.floor(projections.length / 2));
    const secondHalf = projections.slice(Math.floor(projections.length / 2));
    
    const avgExpenseFirst = firstHalf.reduce((sum, p) => sum + p.projectedExpenses, 0) / firstHalf.length;
    const avgExpenseSecond = secondHalf.reduce((sum, p) => sum + p.projectedExpenses, 0) / secondHalf.length;
    
    if (avgExpenseSecond > avgExpenseFirst * 1.1) {
      risks.push('รายจ่ายมีแนวโน้มเพิ่มขึ้น');
    }

    return risks;
  }

  private identifyOpportunities(projections: MonthlyProjection[], player: any): string[] {
    const opportunities: string[] = [];

    // ตรวจสอบเงินสดส่วนเกิน
    const avgCash = projections.reduce((sum, p) => sum + p.endingCash, 0) / projections.length;
    const monthlyIncome = Number(player.passiveIncome); // TODO: Add base salary when available
    
    if (avgCash > monthlyIncome * 2) {
      opportunities.push('มีเงินสดส่วนเกินเหมาะสำหรับการลงทุน');
    }

    // ตรวจสอบความสม่ำเสมอของกระแสเงินสด
    const positiveMonths = projections.filter(p => p.netCashFlow > 0);
    if (positiveMonths.length >= projections.length * 0.8) {
      opportunities.push('กระแสเงินสดมีเสถียรภาพดี เหมาะสำหรับการวางแผนการลงทุนระยะยาว');
    }

    // ตรวจสอบการเติบโตของรายได้
    if (projections.length >= 6) {
      const firstQuarter = projections.slice(0, 3);
      const lastQuarter = projections.slice(-3);
      
      const avgIncomeFirst = firstQuarter.reduce((sum, p) => sum + p.projectedIncome, 0) / 3;
      const avgIncomeLast = lastQuarter.reduce((sum, p) => sum + p.projectedIncome, 0) / 3;
      
      if (avgIncomeLast > avgIncomeFirst * 1.05) {
        opportunities.push('รายได้มีแนวโน้มเติบโต ควรพิจารณาเพิ่มการลงทุน');
      }
    }

    return opportunities;
  }
}