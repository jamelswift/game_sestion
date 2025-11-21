export interface SimplifiedFinancialSummary {
  totalNetWorth: number;
  totalAssets: number;
  totalDebts: number;
  monthlyIncome: number;
  liquidCash: number;
}

export interface PlayerFinancialSummary {
  playerId?: number;
  sessionId?: number;
  cash?: number;
  savings?: number;
  totalAssetValue?: number;
  totalAssetCost?: number;
  portfolioGainLoss?: number;
  monthlyPassiveIncome?: number;
  totalDebtBalance?: number;
  monthlyDebtPayments?: number;
  netWorth?: number;
  monthlyCashFlow?: number;
  assetsByType?: any[];
  debtsByType?: any[];
}

export interface PlayerTurnData {
  playerInSession: any;
  financialSummary: PlayerFinancialSummary;
  currentBoardSpace: any;
  availableActions: string[];
  marketConditions: any;
}

export interface CompleteGameState {
  session: any;
  players: Array<any & { financialSummary?: SimplifiedFinancialSummary }>;
  assetStates: any[];
  recentActivities: any[];
  catalog: {
    careers: any[];
    goals: any[];
    assets: any[];
    debts: any[];
    cards: any[];
    boardSpaces: any[];
  };
}
