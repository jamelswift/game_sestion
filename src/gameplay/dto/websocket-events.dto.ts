// ==================================================================
// WebSocket Event DTOs
// Data Transfer Objects สำหรับ WebSocket Events ใน GameplayGateway
// ==================================================================

// import { DiceAnimationConfig } from '../logic/roll-dice/dice.service'; // Temporarily disabled
// import { PlayerDecision } from '../logic/event/CardEventHandler'; // Temporarily disabled

// Temporary type definitions
export interface DiceAnimationConfig {
  duration?: number;
  style?: string;
}

export interface PlayerDecision {
  choice: string;
  amount?: number;
}

// ==================== DICE EVENTS ====================

export interface RollDiceRequest {
  playerInSessionId: number;
  sessionId: string;
  forcedResult?: number;
  animationConfig?: DiceAnimationConfig;
}

export interface DiceHistoryRequest {
  playerId: string;
}

export interface DiceStatisticsRequest {
  playerId: string;
}

// ==================== CARD EVENTS ====================

export interface DrawCardRequest {
  sessionId: string;
  cardType: string;
  playerId: string;
}

export interface ExecuteCardEventRequest {
  sessionId: string;
  decision: PlayerDecision;
}

// ==================== FINANCIAL EVENTS ====================

export interface SaveMoneyRequest {
  sessionId: string;
  playerId: string;
  amount: number;
}

export interface WithdrawSavingsRequest {
  sessionId: string;
  playerId: string;
  amount: number;
}

export interface PlayerSavingsInfoRequest {
  playerId: string;
}

// ==================== WIN CONDITION EVENTS ====================

export interface CheckWinConditionRequest {
  sessionId: string;
  playerId: string;
}

export interface ProgressPercentageRequest {
  playerId: string;
}

export interface CheckAllWinConditionsRequest {
  sessionId: string;
}

// ==================== PLAYER EVENTS ====================

export interface PlayerInfoRequest {
  playerId: number;
}

// ==================== RESPONSE TYPES ====================

export interface WebSocketErrorResponse {
  event: string;
  message: string;
  timestamp: string;
}

export interface GameStateUpdateResponse {
  diceResult?: any;
  player?: any;
  landedSpace?: any;
  newPosition?: number;
  winCondition?: any;
  timestamp: string;
}

export interface CardDrawnResponse {
  playerId: string;
  card: any;
  timestamp: string;
}

export interface CardEventExecutedResponse {
  decision: PlayerDecision;
  result: any;
  timestamp: string;
}

export interface MoneyTransactionResponse {
  type: 'save' | 'withdraw';
  playerId: string;
  result: any;
  timestamp: string;
}

export interface GameWonResponse {
  winner: any;
  gameEndTime: string;
}

export interface NotificationResponse {
  message: string;
  type: 'info' | 'warning' | 'error';
  timestamp: string;
}

export interface ProgressPercentageResponse {
  playerId: string;
  progress: number;
}