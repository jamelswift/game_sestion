export interface SpaceEventResponse {
  success: boolean;
  spaceIndex: number;
  spaceType: string;
  message: string;
  timestamp: Date;
  cardData?: {
    cardId: number;
    cardType: string;
    title: string;
    description: string;
    cost?: number;
    financialTip?: string;
    rawCardData?: any; // ข้อมูลการ์ดดิบสำหรับการประมวลผลขั้นสูง
  };
  playerEffects?: {
    cashChange?: number;
    savingsChange?: number;
    assetsChange?: string[];
    positionChange?: number;
  };
}

export interface DiceRollResponse {
  success: boolean;
  playerId: string;
  result: number;
  timestamp: Date;
  animationConfig?: {
    duration: number;
    bounceHeight: number;
    rotations: number;
  };
  statistics?: {
    rollCount: number;
    average: number;
    distribution: Record<number, number>;
  };
}

export interface PlayerActionResponse {
  success: boolean;
  action: string;
  message: string;
  timestamp: Date;
  playerState?: {
    id: string;
    position: number;
    cash: number;
    savings: number;
    totalAssets: number;
  };
  gameEffects?: {
    cardDrawn?: boolean;
    moneyChanged?: number;
    positionChanged?: number;
  };
}
