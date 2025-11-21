/**
 * DTO สำหรับคำขอออมเงิน
 */
export interface SaveMoneyRequestDto {
    playerId: string;
    amount: number; // จำนวนเงินที่ต้องการออม
}

/**
 * DTO สำหรับคำขอถอนเงินออม
 */
export interface WithdrawSavingsRequestDto {
    playerId: string;
    amount: number; // จำนวนเงินที่ต้องการถอน
}

/**
 * DTO สำหรับการตอบกลับการทำธุรกรรมออมเงิน
 */
export interface SavingsTransactionResult {
    success: boolean;
    message: string;
    playerId: string;
    transactionType: 'save' | 'withdraw';
    amount: number;
    newCashBalance: number;
    newSavingsBalance: number;
    totalAssets: number; // เงินรวมทั้งหมด (cash + savings + assets)
    timestamp: string;
}

/**
 * DTO สำหรับดึงข้อมูลเงินออมของผู้เล่น
 */
export interface PlayerSavingsInfoDto {
    playerId: string;
    cash: number;
    savings: number;
    totalLiquidAssets: number; // เงินสด + เงินออม
    savingsPercentage: number; // เปอร์เซ็นต์ของเงินออมเทียบกับเงินทั้งหมด
}
