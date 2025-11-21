export interface WinCondition {
  id: string;
  name: string;
  description: string;
  type: 'financial_freedom' | 'goal_achievement' | 'time_limit' | 'custom';
  requirements: WinRequirement[];
}

export interface WinRequirement {
  type: 'net_worth' | 'monthly_cash_flow' | 'asset_value' | 'passive_income' | 'goal_specific';
  operator: '>=' | '<=' | '==' | '>';
  value: number;
  description: string;
}

export interface WinCheckResult {
  hasWon: boolean;
  winCondition?: WinCondition;
  progress: WinProgress[];
  nextRequirement?: WinRequirement;
}

export interface WinProgress {
  requirement: WinRequirement;
  currentValue: number;
  targetValue: number;
  isCompleted: boolean;
  progressPercentage: number;
}

export interface SessionWinSummary {
  sessionId: number;
  winners: WinnerInfo[];
  gameEndTime: Date;
  totalTurns: number;
  gameEndReason: 'winner_found' | 'time_limit' | 'manual_end';
}

export interface WinnerInfo {
  playerInSessionId: number;
  playerId: number;
  displayName: string;
  winCondition: WinCondition;
  finalStats: {
    netWorth: number;
    monthlyCashFlow: number;
    totalAssetValue: number;
    totalDebt: number;
  };
  achievementTime: Date;
}
