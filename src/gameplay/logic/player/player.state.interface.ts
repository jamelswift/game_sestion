import { PlayerInSession, Player, Career, Goal, PlayerAsset, PlayerDebt, Activity } from '@prisma/client';

// Extended PlayerInSession with relationships
export interface PlayerInSessionWithRelations extends PlayerInSession {
  player: Player;
  career?: Career | null;
  goal?: Goal | null;
  assets: (PlayerAsset & { asset: any })[];
  debts: (PlayerDebt & { debt: any })[];
  activities: Activity[];
}

export interface PlayerState {
    // Basic Info
    id: number;
    sessionId: number;
    playerId: number;
    displayName: string;
    boardPosition: number;
    turnOrder: number | null;
    readyStatus:string;

    // career & financials
    careerId?: number | null;
    careerName: string | null;
    goalId: number | null;
    goalName: string | null;

    // Liquid Assets
    cash: number;
    savings: number;
    passiveIncome: number;

    // Personal Stats
    happinessScore: number;
    healthScore: number;
    learningScore: number;
    relationshipScore: number;

    // Financial Skills Scores
    riskScore: number;
    creditScore: number;
    savingScore: number;
    investingScore: number;
    debtMgmtScore: number;
    spendingScore: number;
    incomeMgmtScore: number;

    // Calculated Metrics
    netWorth: number;
    monthlyCashFlow: number;
    totalAssetValue: number;
    totalDebtBalance: number;
}

// additional player Interfaces
export interface PlayerStatsUpdate {
    // Personal Stats
    happiness?: number;
    health?: number;
    learning?: number;
    relationship?: number;
}

export interface PlayerFinancialUpdate {
    // Liquid Assets
    cash?: number;
    savings?: number;
    passiveIncome?: number;
    
    // Financial Skills
    risk?: number;
    credit?: number;
    saving?: number;
    investing?: number;
    debtMgmt?: number;
    spending?: number;
    incomeMgmt?: number;
}

export interface PlayerWinCondition {
  hasWon: boolean;
  winType?: string; // ชนิดของการชนะ ยังไม่ได้ใช้
  winTimestamp?: string; // เวลาที่ชนะ
  details?: {
    netWorthTarget?: number;
    cashFlowTarget?: number;
    currentNetWorth?: number;
    currentCashFlow?: number;
    goalName?: string;
  };
}