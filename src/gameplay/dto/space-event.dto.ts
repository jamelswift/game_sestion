// Import Card Interfaces จาก entities
import { Card } from '../../entities/card.entity';

// Interface สำหรับ Request Body
export interface HandleSpaceEventDto {
    spaceIndex: number;
    playerId?: string;
}

// Interface สำหรับ Response
export interface SpaceEventResult {
    spaceType: string;
    drawnCard: Card | null;
    success: boolean;
    message?: string;
}
