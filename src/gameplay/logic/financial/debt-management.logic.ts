import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// Debt Management Interfaces
// ============================================================================
export interface LoanApplication {
  playerInSessionId: number;
  loanType: 'personal' | 'business' | 'investment' | 'emergency';
  amount: number;
  purpose: string;
  collateralAssetId?: number; // สำหรับกู้เงินโดยใช้สินทรัพย์เป็นหลักประกัน
  requestedTerms?: number; // จำนวนเดือนที่ต้องการผ่อน
}

export interface LoanApproval {
  approved: boolean;
  message: string;
  terms?: {
    loanId: number;
    amount: number;
    interestRate: number;
    monthlyPayment: number;
    totalPayments: number;
    totalInterest: number;
    dueDate: Date;
  };
  reason?: string;
}

export interface PaymentRequest {
  playerInSessionId: number;
  debtId: number;
  amount: number;
  paymentType: 'minimum' | 'extra' | 'full';
  fromAccount: 'cash' | 'savings';
}

export interface PaymentResult {
  success: boolean;
  message: string;
  payment?: {
    principalPaid: number;
    interestPaid: number;
    remainingBalance: number;
    newMonthlyPayment: number;
    newCashBalance: number;
    earlyPayoffSavings?: number;
  };
  error?: string;
}

export interface DebtSummary {
  totalDebt: number;
  totalMonthlyPayments: number;
  averageInterestRate: number;
  debtToIncomeRatio: number;
  creditUtilization: number;
  payoffTimelineMonths: number;
  totalInterestRemaining: number;
  debtsByType: DebtTypeBreakdown[];
  upcomingPayments: UpcomingPayment[];
  recommendations: DebtRecommendation[];
}

export interface DebtTypeBreakdown {
  type: string;
  count: number;
  totalBalance: number;
  totalMonthlyPayment: number;
  averageRate: number;
  allocation: number; // % ของหนี้ทั้งหมด
}

export interface UpcomingPayment {
  debtId: number;
  debtName: string;
  dueDate: Date;
  minimumPayment: number;
  currentBalance: number;
  isOverdue: boolean;
  daysPastDue?: number;
}

export interface DebtRecommendation {
  type: 'consolidation' | 'payoff_strategy' | 'emergency_fund' | 'income_boost';
  title: string;
  description: string;
  potentialSavings?: number;
  priority: 'high' | 'medium' | 'low';
}

export interface CreditScore {
  score: number;
  rating: 'excellent' | 'good' | 'fair' | 'poor';
  factors: CreditFactor[];
  improvementTips: string[];
}

export interface CreditFactor {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number; // % ของคะแนนรวม
  description: string;
}

// ============================================================================
// Debt Management Logic
// ============================================================================
export class DebtManagementLogic {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // 💰 Loan Management Methods
  // ========================================

  /**
   * ยื่นขอกู้เงิน
   */
  async applyForLoan(application: LoanApplication): Promise<LoanApproval> {
    try {
      // ตรวจสอบคุณสมบัติ
      const eligibility = await this.checkLoanEligibility(application);
      if (!eligibility.eligible) {
        return {
          approved: false,
          message: eligibility.reason!,
          reason: eligibility.reason
        };
      }

      // คำนวณเงื่อนไขกู้เงิน
      const terms = await this.calculateLoanTerms(application);
      
      // สร้างสัญญาหนี้
      const debt = await this.createDebtRecord(application, terms);

      // เพิ่มเงินให้ผู้เล่น
      await this.addFundsToPlayer(application.playerInSessionId, application.amount);

      // อัปเดตสถิติ
      await this.updateCreditHistory(application.playerInSessionId, 'loan_approved', application.amount);

      return {
        approved: true,
        message: `อนุมัติเงินกู้ ${application.amount.toLocaleString()} บาท สำเร็จ`,
        terms: {
          loanId: debt.id,
          amount: application.amount,
          interestRate: terms.interestRate,
          monthlyPayment: terms.monthlyPayment,
          totalPayments: terms.totalPayments,
          totalInterest: terms.totalInterest,
          dueDate: terms.dueDate
        }
      };
    } catch (error) {
      console.error('Error applying for loan:', error);
      return { 
        approved: false, 
        message: 'เกิดข้อผิดพลาดในการยื่นขอเงินกู้', 
        reason: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ชำระหนี้
   */
  async makePayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      // ตรวจสอบหนี้
      const debt = await this.prisma.playerDebt.findUnique({
        where: { id: request.debtId },
        include: { playerInSession: true }
      });

      if (!debt || debt.playerInSessionId !== request.playerInSessionId) {
        return { success: false, message: 'ไม่พบหนี้ที่ต้องการชำระ' };
      }

      if (debt.isPaidOff) {
        return { success: false, message: 'หนี้นี้ชำระเสร็จสิ้นแล้ว' };
      }

      // ตรวจสอบเงินทุน
      const player = debt.playerInSession;
      const availableFunds = request.fromAccount === 'cash' ? 
        Number(player.cash) : Number(player.savings);

      if (availableFunds < request.amount) {
        return { 
          success: false, 
          message: `เงินไม่เพียงพอ มีอยู่ ${availableFunds.toLocaleString()} บาท` 
        };
      }

      // คำนวณการชำระ
      const paymentBreakdown = await this.calculatePayment(debt, request.amount);
      
      // ดำเนินการชำระ
      const result = await this.processPayment(request, debt, paymentBreakdown);

      // อัปเดตสถิติ
      await this.updateCreditHistory(request.playerInSessionId, 'payment_made', request.amount);

      return {
        success: true,
        message: `ชำระหนี้ ${request.amount.toLocaleString()} บาท สำเร็จ`,
        payment: {
          principalPaid: paymentBreakdown.principal,
          interestPaid: paymentBreakdown.interest,
          remainingBalance: result.newBalance,
          newMonthlyPayment: result.newMonthlyPayment,
          newCashBalance: result.newAccountBalance,
          earlyPayoffSavings: paymentBreakdown.earlySavings
        }
      };
    } catch (error) {
      console.error('Error making payment:', error);
      return { 
        success: false, 
        message: 'เกิดข้อผิดพลาดในการชำระหนี้', 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ========================================
  // 📊 Debt Analysis Methods
  // ========================================

  /**
   * ดึงสรุปหนี้สิน
   */
  async getDebtSummary(playerInSessionId: number): Promise<DebtSummary | null> {
    try {
      const debts = await this.prisma.playerDebt.findMany({
        where: { 
          playerInSessionId,
          isPaidOff: false 
        }
      });

      if (debts.length === 0) {
        return this.getEmptyDebtSummary();
      }

      const player = await this.prisma.playerInSession.findUnique({
        where: { id: playerInSessionId }
      });

      if (!player) return null;

      let totalDebt = 0;
      let totalMonthlyPayments = 0;
      let totalInterestRemaining = 0;
      const debtTypeMap = new Map<string, DebtTypeBreakdown>();

      for (const debt of debts) {
        const balance = Number(debt.currentBalance);
        const monthlyPayment = Number(debt.monthlyPayment);
        const interestRate = Number(debt.interestRate);
        
        totalDebt += balance;
        totalMonthlyPayments += monthlyPayment;

        // คำนวณดอกเบี้ยที่เหลือ
        const remainingInterest = this.calculateRemainingInterest(debt);
        totalInterestRemaining += remainingInterest;

        // จัดกลุ่มตามประเภท
        const type = debt.type;
        if (!debtTypeMap.has(type)) {
          debtTypeMap.set(type, {
            type,
            count: 0,
            totalBalance: 0,
            totalMonthlyPayment: 0,
            averageRate: 0,
            allocation: 0
          });
        }

        const typeData = debtTypeMap.get(type)!;
        typeData.count += 1;
        typeData.totalBalance += balance;
        typeData.totalMonthlyPayment += monthlyPayment;
        typeData.averageRate = (typeData.averageRate * (typeData.count - 1) + interestRate) / typeData.count;
      }

      // คำนวณอัตราส่วนต่างๆ
      const monthlyIncome = Number(player.salary) + Number(player.passiveIncome);
      const debtToIncomeRatio = monthlyIncome > 0 ? (totalMonthlyPayments / monthlyIncome) * 100 : 0;
      
      // คำนวณ allocation สำหรับแต่ละประเภท
      debtTypeMap.forEach(typeData => {
        typeData.allocation = totalDebt > 0 ? (typeData.totalBalance / totalDebt) * 100 : 0;
      });

      const averageInterestRate = debts.length > 0 ? 
        debts.reduce((sum, debt) => sum + Number(debt.interestRate), 0) / debts.length : 0;

      const payoffTimelineMonths = this.calculatePayoffTimeline(debts);
      
      return {
        totalDebt,
        totalMonthlyPayments,
        averageInterestRate,
        debtToIncomeRatio,
        creditUtilization: 0, // TODO: คำนวณ credit utilization
        payoffTimelineMonths,
        totalInterestRemaining,
        debtsByType: Array.from(debtTypeMap.values()),
        upcomingPayments: await this.getUpcomingPayments(playerInSessionId),
        recommendations: await this.getDebtRecommendations(playerInSessionId, totalDebt, monthlyIncome)
      };
    } catch (error) {
      console.error('Error getting debt summary:', error);
      return null;
    }
  }

  /**
   * คำนวณคะแนนเครดิต
   */
  async calculateCreditScore(playerInSessionId: number): Promise<CreditScore> {
    try {
      let baseScore = 750; // เริ่มต้นที่ 750
      const factors: CreditFactor[] = [];

      const debts = await this.prisma.playerDebt.findMany({
        where: { playerInSessionId }
      });

      const player = await this.prisma.playerInSession.findUnique({
        where: { id: playerInSessionId }
      });

      if (!player) {
        return {
          score: 300,
          rating: 'poor',
          factors: [],
          improvementTips: ['ไม่พบข้อมูลผู้เล่น']
        };
      }

      // Payment History (35%)
      const onTimePayments = debts.filter(debt => !debt.isOverdue).length;
      const totalDebts = debts.length;
      
      if (totalDebts > 0) {
        const paymentHistoryRatio = onTimePayments / totalDebts;
        const paymentImpact = (paymentHistoryRatio - 0.95) * 200; // -200 to +10
        baseScore += paymentImpact;
        
        factors.push({
          factor: 'ประวัติการชำระหนี้',
          impact: paymentHistoryRatio >= 0.95 ? 'positive' : 'negative',
          weight: 35,
          description: `ชำระตรงเวลา ${onTimePayments}/${totalDebts} รายการ`
        });
      }

      // Credit Utilization (30%)
      const activeDebts = debts.filter(debt => !debt.isPaidOff);
      const totalDebt = activeDebts.reduce((sum, debt) => sum + Number(debt.currentBalance), 0);
      const monthlyIncome = Number(player.salary) + Number(player.passiveIncome);
      
      if (totalDebt > 0) {
        const utilizationRatio = totalDebt / (monthlyIncome * 12); // debt-to-income annually
        const utilizationImpact = Math.max(-150, (0.3 - utilizationRatio) * 100);
        baseScore += utilizationImpact;
        
        factors.push({
          factor: 'การใช้สินเชื่อ',
          impact: utilizationRatio <= 0.3 ? 'positive' : 'negative',
          weight: 30,
          description: `ใช้สินเชื่อ ${(utilizationRatio * 100).toFixed(1)}% ของรายได้`
        });
      }

      // Length of Credit History (15%)
      // TODO: ใช้ข้อมูลจากประวัติการใช้สินเชื่อ
      factors.push({
        factor: 'ระยะเวลาใช้สินเชื่อ',
        impact: 'neutral',
        weight: 15,
        description: 'ข้อมูลไม่เพียงพอ'
      });

      // Types of Credit (10%)
      const debtTypes = new Set(debts.map(debt => debt.type));
      const diversityBonus = Math.min(30, debtTypes.size * 10);
      baseScore += diversityBonus;
      
      factors.push({
        factor: 'ประเภทสินเชื่อ',
        impact: debtTypes.size >= 2 ? 'positive' : 'neutral',
        weight: 10,
        description: `มีสินเชื่อ ${debtTypes.size} ประเภท`
      });

      // New Credit (10%)
      const recentDebts = debts.filter(debt => {
        const createdAt = new Date(debt.createdAt);
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        return createdAt > sixMonthsAgo;
      });
      
      if (recentDebts.length > 2) {
        baseScore -= 20;
        factors.push({
          factor: 'สินเชื่อใหม่',
          impact: 'negative',
          weight: 10,
          description: `เปิดสินเชื่อใหม่ ${recentDebts.length} รายการใน 6 เดือน`
        });
      } else {
        factors.push({
          factor: 'สินเชื่อใหม่',
          impact: 'positive',
          weight: 10,
          description: 'ไม่เปิดสินเชื่อใหม่บ่อยเกินไป'
        });
      }

      // จำกัดคะแนนระหว่าง 300-850
      const finalScore = Math.max(300, Math.min(850, Math.round(baseScore)));

      // กำหนดเกรด
      let rating: 'excellent' | 'good' | 'fair' | 'poor';
      if (finalScore >= 750) rating = 'excellent';
      else if (finalScore >= 650) rating = 'good';
      else if (finalScore >= 550) rating = 'fair';
      else rating = 'poor';

      const improvementTips = this.getCreditImprovementTips(factors, finalScore);

      return {
        score: finalScore,
        rating,
        factors,
        improvementTips
      };
    } catch (error) {
      console.error('Error calculating credit score:', error);
      return {
        score: 300,
        rating: 'poor',
        factors: [],
        improvementTips: ['เกิดข้อผิดพลาดในการคำนวณคะแนน']
      };
    }
  }

  /**
   * ดึงรายการหนี้
   */
  async getPlayerDebts(playerInSessionId: number) {
    try {
      return await this.prisma.playerDebt.findMany({
        where: { playerInSessionId },
        orderBy: { dueDate: 'asc' }
      });
    } catch (error) {
      console.error('Error getting player debts:', error);
      return [];
    }
  }

  /**
   * คำนวณกลยุทธ์การจ่ายหนี้
   */
  async calculatePayoffStrategy(playerInSessionId: number): Promise<{
    snowball: { order: any[]; totalTime: number; totalInterest: number; };
    avalanche: { order: any[]; totalTime: number; totalInterest: number; };
    recommended: 'snowball' | 'avalanche';
    explanation: string;
  }> {
    try {
      const debts = await this.prisma.playerDebt.findMany({
        where: { 
          playerInSessionId,
          isPaidOff: false 
        }
      });

      if (debts.length === 0) {
        return {
          snowball: { order: [], totalTime: 0, totalInterest: 0 },
          avalanche: { order: [], totalTime: 0, totalInterest: 0 },
          recommended: 'snowball',
          explanation: 'ไม่มีหนี้ที่ต้องชำระ'
        };
      }

      // Debt Snowball (เรียงตามยอดหนี้น้อยไปมาก)
      const snowballOrder = [...debts].sort((a, b) => 
        Number(a.currentBalance) - Number(b.currentBalance)
      );

      // Debt Avalanche (เรียงตามอัตราดอกเบี้ยสูงไปต่ำ)
      const avalancheOrder = [...debts].sort((a, b) => 
        Number(b.interestRate) - Number(a.interestRate)
      );

      const snowballResult = this.simulatePayoffStrategy(snowballOrder);
      const avalancheResult = this.simulatePayoffStrategy(avalancheOrder);

      // แนะนำกลยุทธ์
      const interestSavings = snowballResult.totalInterest - avalancheResult.totalInterest;
      const timeDifference = snowballResult.totalTime - avalancheResult.totalTime;

      let recommended: 'snowball' | 'avalanche' = 'avalanche';
      let explanation = 'แนะนำ Debt Avalanche เพื่อประหยัดดอกเบี้ย';

      if (interestSavings < 10000 && debts.length > 3) {
        recommended = 'snowball';
        explanation = 'แนะนำ Debt Snowball เพื่อสร้างแรงจูงใจในการจ่ายหนี้';
      }

      return {
        snowball: snowballResult,
        avalanche: avalancheResult,
        recommended,
        explanation
      };
    } catch (error) {
      console.error('Error calculating payoff strategy:', error);
      return {
        snowball: { order: [], totalTime: 0, totalInterest: 0 },
        avalanche: { order: [], totalTime: 0, totalInterest: 0 },
        recommended: 'snowball',
        explanation: 'เกิดข้อผิดพลาดในการคำนวณ'
      };
    }
  }

  // ========================================
  // 🔧 Private Helper Methods
  // ========================================

  private async checkLoanEligibility(application: LoanApplication) {
    // ตรวจสอบผู้เล่น
    const player = await this.prisma.playerInSession.findUnique({
      where: { id: application.playerInSessionId }
    });

    if (!player) {
      return { eligible: false, reason: 'ไม่พบข้อมูลผู้เล่น' };
    }

    // ตรวจสอบรายได้
    const monthlyIncome = Number(player.salary) + Number(player.passiveIncome);
    if (monthlyIncome < 10000) {
      return { eligible: false, reason: 'รายได้ไม่เพียงพอสำหรับการกู้เงิน' };
    }

    // ตรวจสอบหนี้เดิม
    const existingDebts = await this.prisma.playerDebt.findMany({
      where: { 
        playerInSessionId: application.playerInSessionId,
        isPaidOff: false 
      }
    });

    const totalMonthlyPayments = existingDebts.reduce(
      (sum, debt) => sum + Number(debt.monthlyPayment), 0
    );

    const debtToIncomeRatio = monthlyIncome > 0 ? (totalMonthlyPayments / monthlyIncome) : 0;
    
    if (debtToIncomeRatio > 0.4) { // DTI > 40%
      return { eligible: false, reason: 'อัตราส่วนหนี้ต่อรายได้สูงเกินไป' };
    }

    // ตรวจสอบจำนวนเงินกู้
    const maxLoanAmount = monthlyIncome * 12 * 3; // กู้ได้สูงสุด 3 เท่าของรายได้ต่อปี
    if (application.amount > maxLoanAmount) {
      return { 
        eligible: false, 
        reason: `จำนวนเงินกู้เกินกว่าที่อนุมัติได้ (สูงสุด ${maxLoanAmount.toLocaleString()} บาท)` 
      };
    }

    return { eligible: true };
  }

  private async calculateLoanTerms(application: LoanApplication) {
    // อัตราดอกเบี้ยตามประเภทเงินกู้
    const interestRates = {
      personal: 12.0,
      business: 8.5,
      investment: 10.0,
      emergency: 15.0
    };

    const interestRate = interestRates[application.loanType] || 12.0;
    const monthlyRate = interestRate / 100 / 12;
    const termMonths = application.requestedTerms || 60; // default 5 years

    // คำนวณยอดผ่อนรายเดือน
    const monthlyPayment = application.amount * 
      (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
      (Math.pow(1 + monthlyRate, termMonths) - 1);

    const totalPayments = monthlyPayment * termMonths;
    const totalInterest = totalPayments - application.amount;

    // กำหนดวันครบกำหนด
    const dueDate = new Date();
    dueDate.setDate(1); // วันที่ 1 ของเดือน
    dueDate.setMonth(dueDate.getMonth() + 1); // เดือนหน้า

    return {
      interestRate,
      monthlyPayment: Math.round(monthlyPayment),
      totalPayments: Math.round(totalPayments),
      totalInterest: Math.round(totalInterest),
      termMonths,
      dueDate
    };
  }

  private async createDebtRecord(application: LoanApplication, terms: any) {
    return await this.prisma.playerDebt.create({
      data: {
        playerInSessionId: application.playerInSessionId,
        type: application.loanType,
        originalAmount: new Decimal(application.amount),
        currentBalance: new Decimal(application.amount),
        interestRate: new Decimal(terms.interestRate),
        monthlyPayment: new Decimal(terms.monthlyPayment),
        dueDate: terms.dueDate,
        termMonths: terms.termMonths,
        description: application.purpose
      }
    });
  }

  private async addFundsToPlayer(playerInSessionId: number, amount: number) {
    await this.prisma.playerInSession.update({
      where: { id: playerInSessionId },
      data: {
        cash: {
          increment: amount
        }
      }
    });
  }

  private async updateCreditHistory(playerInSessionId: number, action: string, amount: number) {
    // TODO: บันทึกประวัติเครดิต
    console.log(`💡 Credit history updated for player ${playerInSessionId}: ${action} ${amount}`);
  }

  private async calculatePayment(debt: any, amount: number) {
    const currentBalance = Number(debt.currentBalance);
    const monthlyRate = Number(debt.interestRate) / 100 / 12;
    
    // ดอกเบี้ยสำหรับเดือนปัจจุบัน
    const monthlyInterest = currentBalance * monthlyRate;
    
    let interestPaid = 0;
    let principalPaid = 0;
    let earlySavings = 0;

    if (amount >= currentBalance) {
      // ชำระหมด
      interestPaid = monthlyInterest;
      principalPaid = currentBalance - monthlyInterest;
      
      // คำนวณการประหยัด
      const remainingInterest = this.calculateRemainingInterest(debt);
      earlySavings = remainingInterest - monthlyInterest;
    } else {
      // ชำระบางส่วน
      if (amount > monthlyInterest) {
        interestPaid = monthlyInterest;
        principalPaid = amount - monthlyInterest;
      } else {
        interestPaid = amount;
        principalPaid = 0;
      }
    }

    return {
      interest: Math.round(interestPaid),
      principal: Math.round(principalPaid),
      earlySavings: Math.round(earlySavings)
    };
  }

  private async processPayment(request: PaymentRequest, debt: any, paymentBreakdown: any) {
    return await this.prisma.$transaction(async (prisma) => {
      const newBalance = Number(debt.currentBalance) - paymentBreakdown.principal;
      const isPaidOff = newBalance <= 0;

      // อัปเดตหนี้
      await prisma.playerDebt.update({
        where: { id: request.debtId },
        data: {
          currentBalance: Math.max(0, newBalance),
          isPaidOff,
          lastPaymentDate: new Date()
        }
      });

      // หักเงินจากบัญชี
      const player = await prisma.playerInSession.findUnique({
        where: { id: request.playerInSessionId }
      });

      if (!player) throw new Error('Player not found');

      const updateData: any = {};
      if (request.fromAccount === 'cash') {
        updateData.cash = Number(player.cash) - request.amount;
      } else {
        updateData.savings = Number(player.savings) - request.amount;
      }

      await prisma.playerInSession.update({
        where: { id: request.playerInSessionId },
        data: updateData
      });

      // คำนวณยอดผ่อนใหม่ (ถ้าไม่ชำระหมด)
      let newMonthlyPayment = Number(debt.monthlyPayment);
      if (!isPaidOff && paymentBreakdown.principal > 0) {
        // ลดยอดผ่อนตามสัดส่วน (optional)
        // newMonthlyPayment = ... คำนวณใหม่
      }

      return {
        newBalance: Math.max(0, newBalance),
        newMonthlyPayment,
        newAccountBalance: request.fromAccount === 'cash' ? updateData.cash : updateData.savings
      };
    });
  }

  private calculateRemainingInterest(debt: any): number {
    const balance = Number(debt.currentBalance);
    const monthlyPayment = Number(debt.monthlyPayment);
    const monthlyRate = Number(debt.interestRate) / 100 / 12;
    
    let totalInterest = 0;
    let currentBalance = balance;
    let months = 0;
    
    while (currentBalance > 0 && months < 360) { // ป้องกัน infinite loop
      const interestPayment = currentBalance * monthlyRate;
      const principalPayment = Math.min(monthlyPayment - interestPayment, currentBalance);
      
      totalInterest += interestPayment;
      currentBalance -= principalPayment;
      months++;
      
      if (principalPayment <= 0) break; // ป้องกันกรณีดอกเบี้ยสูงกว่ายอดผ่อน
    }
    
    return totalInterest;
  }

  private getEmptyDebtSummary(): DebtSummary {
    return {
      totalDebt: 0,
      totalMonthlyPayments: 0,
      averageInterestRate: 0,
      debtToIncomeRatio: 0,
      creditUtilization: 0,
      payoffTimelineMonths: 0,
      totalInterestRemaining: 0,
      debtsByType: [],
      upcomingPayments: [],
      recommendations: [
        {
          type: 'emergency_fund',
          title: 'สร้างกองทุนฉุกเฉิน',
          description: 'เก็บเงินฉุกเฉิน 3-6 เดือนของค่าใช้จ่าย',
          priority: 'high'
        }
      ]
    };
  }

  private calculatePayoffTimeline(debts: any[]): number {
    if (debts.length === 0) return 0;
    
    // หาเวลาที่นานที่สุดในการชำระหนี้
    return Math.max(...debts.map(debt => {
      const balance = Number(debt.currentBalance);
      const monthlyPayment = Number(debt.monthlyPayment);
      const monthlyRate = Number(debt.interestRate) / 100 / 12;
      
      if (monthlyPayment <= balance * monthlyRate) {
        return 360; // ถ้าจ่ายแค่ดอกเบี้ย จะไม่จบ
      }
      
      // คำนวณจำนวนเดือนที่ต้องจ่าย
      const months = Math.log(1 + (balance * monthlyRate) / (monthlyPayment - balance * monthlyRate)) / 
                    Math.log(1 + monthlyRate);
      
      return Math.ceil(months);
    }));
  }

  private async getUpcomingPayments(playerInSessionId: number): Promise<UpcomingPayment[]> {
    const debts = await this.prisma.playerDebt.findMany({
      where: { 
        playerInSessionId,
        isPaidOff: false 
      },
      orderBy: { dueDate: 'asc' }
    });

    const now = new Date();
    return debts.map(debt => {
      const isOverdue = debt.dueDate < now;
      const daysPastDue = isOverdue ? 
        Math.floor((now.getTime() - debt.dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 
        undefined;

      return {
        debtId: debt.id,
        debtName: `${debt.type} loan`,
        dueDate: debt.dueDate,
        minimumPayment: Number(debt.monthlyPayment),
        currentBalance: Number(debt.currentBalance),
        isOverdue,
        daysPastDue
      };
    });
  }

  private async getDebtRecommendations(
    playerInSessionId: number, 
    totalDebt: number, 
    monthlyIncome: number
  ): Promise<DebtRecommendation[]> {
    const recommendations: DebtRecommendation[] = [];

    // High debt-to-income ratio
    const dti = monthlyIncome > 0 ? (totalDebt / (monthlyIncome * 12)) : 0;
    if (dti > 0.4) {
      recommendations.push({
        type: 'payoff_strategy',
        title: 'ลดอัตราส่วนหนี้ต่อรายได้',
        description: 'อัตราส่วนหนี้ต่อรายได้สูง ควรเร่งชำระหนี้หรือเพิ่มรายได้',
        priority: 'high'
      });
    }

    // Multiple high-interest debts
    const debts = await this.prisma.playerDebt.findMany({
      where: { playerInSessionId, isPaidOff: false }
    });
    
    const highInterestDebts = debts.filter(debt => Number(debt.interestRate) > 12);
    if (highInterestDebts.length > 1) {
      recommendations.push({
        type: 'consolidation',
        title: 'รวมหนี้ดอกเบี้ยสูง',
        description: 'ควรพิจารณารวมหนี้เพื่อลดอัตราดอกเบี้ย',
        potentialSavings: 5000,
        priority: 'medium'
      });
    }

    // Low emergency fund
    const player = await this.prisma.playerInSession.findUnique({
      where: { id: playerInSessionId }
    });
    
    if (player && Number(player.savings) < monthlyIncome * 3) {
      recommendations.push({
        type: 'emergency_fund',
        title: 'เพิ่มกองทุนฉุกเฉิน',
        description: 'กองทุนฉุกเฉินไม่เพียงพอ ควรมี 3-6 เดือนของรายจ่าย',
        priority: 'medium'
      });
    }

    return recommendations;
  }

  private getCreditImprovementTips(factors: CreditFactor[], score: number): string[] {
    const tips: string[] = [];

    // ดูจาก factors ที่มีผลกระทบเชิงลบ
    const negativeFactors = factors.filter(f => f.impact === 'negative');
    
    for (const factor of negativeFactors) {
      switch (factor.factor) {
        case 'ประวัติการชำระหนี้':
          tips.push('🎯 ชำระหนี้ให้ตรงเวลาทุกครั้งเพื่อสร้างประวัติที่ดี');
          break;
        case 'การใช้สินเชื่อ':
          tips.push('💳 ลดการใช้สินเชื่อให้ต่ำกว่า 30% ของวงเงิน');
          break;
        case 'สินเชื่อใหม่':
          tips.push('⏸️ หลีกเลี่ยงการเปิดสินเชื่อใหม่ในช่วง 6 เดือนนี้');
          break;
      }
    }

    // คำแนะนำทั่วไปตามคะแนน
    if (score < 550) {
      tips.push('🔧 พิจารณาใช้บัตรเครดิตแบบประกัน (Secured Credit Card)');
      tips.push('💰 ชำระหนี้ให้หมดก่อนครบกำหนด');
    } else if (score < 650) {
      tips.push('📈 ติดตามคะแนนเครดิตอย่างสม่ำเสมอ');
      tips.push('🎯 ตั้งเป้าชำระหนี้ให้หมดภายใน 2 ปี');
    }

    if (tips.length === 0) {
      tips.push('✅ คะแนนเครดิตของคุณอยู่ในเกณฑ์ดี ควรรักษาระดับปัจจุบัน');
    }

    return tips;
  }

  private simulatePayoffStrategy(debts: any[]): { order: any[]; totalTime: number; totalInterest: number; } {
    // Simplified simulation - ในความเป็นจริงต้องคำนวณซับซ้อนกว่านี้
    const totalDebt = debts.reduce((sum, debt) => sum + Number(debt.currentBalance), 0);
    const totalMonthlyPayment = debts.reduce((sum, debt) => sum + Number(debt.monthlyPayment), 0);
    
    // ประมาณการเวลาและดอกเบี้ย
    const estimatedMonths = totalMonthlyPayment > 0 ? Math.ceil(totalDebt / totalMonthlyPayment) : 0;
    const estimatedInterest = totalDebt * 0.1; // ประมาณ 10% ของยอดหนี้

    return {
      order: debts.map(debt => ({
        id: debt.id,
        type: debt.type,
        balance: Number(debt.currentBalance),
        monthlyPayment: Number(debt.monthlyPayment),
        interestRate: Number(debt.interestRate)
      })),
      totalTime: estimatedMonths,
      totalInterest: estimatedInterest
    };
  }
}