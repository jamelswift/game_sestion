export interface TurnState {
  sessionId: number;
  currentTurn: number;
  currentPlayerId: number;
  currentPlayerInSessionId: number;
  turnOrder: PlayerTurnOrder[];
  turnStartTime: Date;
  turnTimeLimit?: number; // seconds
  isGameActive: boolean;
}

export interface PlayerTurnOrder {
  playerInSessionId: number;
  playerId: number;
  displayName: string;
  orderPosition: number;
  isActive: boolean;
  hasFinishedTurn: boolean;
}

export interface TurnAction {
  actionType: 'move' | 'draw_card' | 'buy_asset' | 'sell_asset' | 'pay_debt' | 'end_turn';
  playerId: number;
  timestamp: Date;
  actionData?: any;
}

export interface TurnSummary {
  turnNumber: number;
  playerId: number;
  actions: TurnAction[];
  turnDuration: number; // seconds
  financialChanges: {
    cashBefore: number;
    cashAfter: number;
    netWorthBefore: number;
    netWorthAfter: number;
  };
}

export interface SessionTurnInfo {
  sessionId: number;
  totalTurns: number;
  averageTurnDuration: number;
  gameStartTime: Date;
  estimatedEndTime?: Date;
  turnHistory: TurnSummary[];
}