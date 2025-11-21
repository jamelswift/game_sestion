// ==================================================================
// Player Decision DTOs
// DTO สำหรับรับข้อมูลการตัดสินใจของผู้เล่น
// ==================================================================

import { IsNotEmpty, IsNumber, IsString, IsEnum, IsOptional } from 'class-validator';

// Enum สำหรับประเภทการตัดสินใจ
export enum DecisionType {
    ACCEPT = 'accept',
    REJECT = 'reject', 
    BUY = 'buy',
    SELL = 'sell',
    INVEST = 'invest'
}

/**
 * DTO สำหรับรับการตัดสินใจของผู้เล่น
 */
export class PlayerDecisionDto {
    @IsNotEmpty()
    @IsNumber()
    playerId: number;

    @IsNotEmpty()
    @IsString()
    cardId: string;

    @IsNotEmpty()
    @IsEnum(DecisionType)
    decision: DecisionType;

    @IsOptional()
    @IsNumber()
    amount?: number;

    @IsOptional()
    @IsNumber()
    quantity?: number;

    @IsOptional()
    @IsString()
    selectedOption?: string;
}

/**
 * DTO สำหรับผลลัพธ์ของการดำเนินการ
 */
export interface PlayerDecisionResult {
    success: boolean;
    message: string;
    playerStateChanges: {
        cashChange?: number;
        savingsChange?: number;
        passiveIncomeChange?: number;
        statsChange?: {
            skillLevel?: number;
            connectionLevel?: number;
            happinessLevel?: number;
            healthLevel?: number;
        };
        newAssets?: any[];
        newLoans?: any[];
    };
    financialSummary?: {
        newCash: number;
        newNetWorth: number;
        newMonthlyCashFlow: number;
    };
    playerSummary?: any; // สำหรับส่งข้อมูลผู้เล่นที่อัปเดตแล้ว
}
