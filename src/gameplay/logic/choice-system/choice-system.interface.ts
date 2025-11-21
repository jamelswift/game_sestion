/**
 * Choice System Interfaces
 * ระบบจัดการตัวเลือกและการตัดสินใจของผู้เล่น
 * 
 * Features:
 * - Choice validation and queue management
 * - Timeout handling with automatic defaults
 * - Real-time choice broadcasting
 * - Multi-type choice support
 */

export interface ChoiceSession {
  id: string;
  sessionId: number;
  playerInSessionId: number;
  choiceType: ChoiceType;
  title: string;
  description: string;
  options: ChoiceOption[];
  timeoutSeconds: number;
  createdAt: Date;
  expiresAt: Date;
  status: ChoiceStatus;
  metadata?: any;
}

export interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
  value: any;
  cost?: number;
  requirements?: ChoiceRequirement[];
  consequences?: ChoiceConsequence[];
  isDefault?: boolean; // ใช้เมื่อ timeout
}

export interface ChoiceRequirement {
  type: 'cash' | 'asset' | 'score' | 'career' | 'level';
  value: any;
  operator: '>' | '<' | '=' | '>=' | '<=';
  message?: string;
}

export interface ChoiceConsequence {
  type: 'cash_change' | 'asset_gain' | 'asset_loss' | 'score_change' | 'card_draw';
  value: any;
  description?: string;
}

export enum ChoiceType {
  CARD_EFFECT = 'card_effect',          // ตัวเลือกจากการ์ด
  ASSET_PURCHASE = 'asset_purchase',    // ซื้อสินทรัพย์
  INVESTMENT = 'investment',            // การลงทุน
  CAREER_SELECTION = 'career_selection', // เลือกอาชีพ
  GOAL_SELECTION = 'goal_selection',    // เลือกเป้าหมาย
  MARKET_ACTION = 'market_action',      // การกระทำในตลาด
  CHARITY = 'charity',                  // การบริจาค
  LIFE_EVENT = 'life_event',            // เหตุการณ์ชีวิต
  BOARD_SPACE = 'board_space'           // ตัวเลือกช่องกระดาน
}

export enum ChoiceStatus {
  WAITING = 'waiting',       // รอการตัดสินใจ
  SUBMITTED = 'submitted',   // ส่งคำตอบแล้ว
  PROCESSED = 'processed',   // ประมวลผลแล้ว
  TIMEOUT = 'timeout',       // หมดเวลา
  CANCELLED = 'cancelled'    // ยกเลิก
}

export interface ChoiceResult {
  choiceSessionId: string;
  selectedOptionId: string;
  playerInSessionId: number;
  submittedAt: Date;
  processingResult?: any;
  status: ChoiceStatus;
}

export interface ChoiceValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  canProceed: boolean;
}

export interface ChoiceQueueItem {
  choiceSession: ChoiceSession;
  priority: number;
  retryCount: number;
  lastAttempt?: Date;
}

// WebSocket Events สำหรับ Choice System
export interface ChoiceWebSocketEvents {
  // Server -> Client
  choice_presented: ChoiceSession;
  choice_updated: Partial<ChoiceSession>;
  choice_timeout_warning: { choiceSessionId: string; secondsLeft: number };
  choice_processed: ChoiceResult;
  choice_cancelled: { choiceSessionId: string; reason: string };
  
  // Client -> Server  
  submit_choice: { choiceSessionId: string; selectedOptionId: string };
  request_choice_details: { choiceSessionId: string };
  cancel_choice: { choiceSessionId: string };
}

export interface ChoiceSystemConfig {
  defaultTimeoutSeconds: number;
  maxConcurrentChoices: number;
  retryAttempts: number;
  warningThresholdSeconds: number;
  enableAutoDefault: boolean;
  enableChoiceHistory: boolean;
}