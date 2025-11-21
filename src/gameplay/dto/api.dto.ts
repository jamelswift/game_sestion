import { IsNotEmpty, IsNumber, IsString, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// ===================================================================
// API Request DTOs - สำหรับรับข้อมูลจาก Frontend
// ===================================================================

/**
 * DTO สำหรับการทอยเต๋า
 */
export class RollDiceDto {
  @IsNotEmpty()
  @IsNumber()
  playerInSessionId!: number;

  @IsNotEmpty()
  @IsString()
  sessionId!: string;
}

/**
 * DTO สำหรับการดำเนินการเอฟเฟกต์การ์ด
 */
export class ExecuteCardEffectDto {
  @IsNotEmpty()
  @IsNumber()
  cardId!: number;

  @IsNotEmpty()
  @IsNumber()
  playerId!: number;

  @IsOptional()
  effectData?: any;

  @IsNotEmpty()
  @IsString()
  sessionId!: string;
}

/**
 * DTO สำหรับการตัดสินใจของผู้เล่น (Enhanced)
 */
export class PlayerChoiceDto {
  @IsNotEmpty()
  @IsNumber()
  playerInSessionId!: number;

  @IsNotEmpty()
  @IsString()
  choiceId!: string;

  @IsNotEmpty()
  @IsString()
  selectedOption!: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  additionalData?: any;
}

/**
 * DTO สำหรับขอข้อมูลตลาด
 */
export class MarketDataRequestDto {
  @IsNotEmpty()
  @IsNumber()
  sessionId!: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  assetIds?: number[];

  @IsOptional()
  @IsBoolean()
  includeAnalysis?: boolean;
}

// ===================================================================
// API Response DTOs - สำหรับส่งข้อมูลไปยัง Frontend
// ===================================================================

/**
 * Base Response DTO
 */
export class BaseResponseDto<T = any> {
  success!: boolean;
  message?: string;
  data?: T;
  error?: string;
  timestamp!: string;
}

/**
 * DTO สำหรับข้อมูลผู้เล่น
 */
export class PlayerDataDto {
  id!: number;
  displayName!: string;
  boardPosition!: number;
  cash!: number;
  income!: number;
  expenses!: number;
  assets!: number;
  liabilities!: number;
  netWorth?: number;
  isActive!: boolean;
  lastUpdated!: string;
}

/**
 * DTO สำหรับข้อมูลพื้นที่กระดาน
 */
export class BoardSpaceDto {
  position!: number;
  type!: string;
  name!: string;
  description?: string;
}

/**
 * DTO สำหรับผลลัพธ์การทอยเต๋า
 */
export class DiceRollResultDto {
  diceRoll!: number;
  newPosition!: number;
  
  @ValidateNested()
  @Type(() => BoardSpaceDto)
  boardSpace!: BoardSpaceDto;

  @ValidateNested()
  @Type(() => PlayerDataDto)
  player!: PlayerDataDto;

  spaceEvent?: any;
}

/**
 * DTO สำหรับข้อมูลการ์ด
 */
export class CardDataDto {
  id!: number;
  type!: string;
  title!: string;
  description!: string;
  effectData?: any;
  isActive!: boolean;
}

/**
 * DTO สำหรับข้อมูลตลาด
 */
export class MarketDataDto {
  assetId!: number;
  assetName!: string;
  currentPrice!: number;
  previousPrice!: number;
  priceChange!: number;
  priceChangePercentage!: number;
  volume!: number;
  volatility!: number;
  marketTrend!: string;
  lastUpdated!: string;
  analysis?: {
    trend: string;
    momentum: number;
    support: number;
    resistance: number;
    rsi: number;
    recommendation: string;
  };
}

/**
 * DTO สำหรับสถานะเกม
 */
export class GameStateDto {
  sessionId!: number;
  currentTurn!: number;
  gamePhase!: string;
  
  @ValidateNested({ each: true })
  @Type(() => PlayerDataDto)
  players!: PlayerDataDto[];

  @ValidateNested({ each: true })
  @Type(() => MarketDataDto)
  marketData?: MarketDataDto[];

  activeEvents?: any[];
  lastUpdated!: string;
}

/**
 * DTO สำหรับข้อผิดพลาด API
 */
export class ApiErrorDto {
  statusCode!: number;
  message!: string;
  error?: string;
  details?: any;
  timestamp!: string;
  path!: string;
}