// ==================================================================
// Game Board Service
// จัดการการเคลื่อนที่บนกระดานเกม
// ==================================================================

export class GameBoardService {
    
    /**
     * ย้ายตำแหน่งบนกระดาน
     */
    static movePosition(currentPosition: number, steps: number, boardSize: number = 40): number {
        const newPosition = currentPosition + steps;
        
        // ถ้าเกิน boardSize ให้วนรอบ
        if (newPosition >= boardSize) {
            return newPosition % boardSize;
        }
        
        return newPosition;
    }
    
    /**
     * ย้ายไปตำแหน่งที่กำหนด
     */
    static moveToPosition(targetPosition: number, boardSize: number = 40): number {
        if (targetPosition < 0) return 0;
        if (targetPosition >= boardSize) return targetPosition % boardSize;
        return targetPosition;
    }
    
    /**
     * คำนวณระยะทางระหว่างตำแหน่ง
     */
    static calculateDistance(
        fromPosition: number, 
        toPosition: number, 
        boardSize: number = 40
    ): number {
        const directDistance = Math.abs(toPosition - fromPosition);
        const wrapDistance = boardSize - directDistance;
        
        return Math.min(directDistance, wrapDistance);
    }
    
    /**
     * ตรวจสอบว่าผ่านจุดเริ่มต้นหรือไม่ (สำหรับให้เงินเดือน)
     */
    static passedStartPosition(
        oldPosition: number, 
        newPosition: number, 
        boardSize: number = 40
    ): boolean {
        // ถ้าตำแหน่งใหม่น้อยกว่าตำแหน่งเก่า แปลว่าได้วนรอบแล้ว
        return newPosition < oldPosition || (oldPosition + (newPosition - oldPosition)) >= boardSize;
    }
    
    /**
     * คำนวณจำนวนรอบที่ผ่าน
     */
    static calculateLapsCompleted(
        oldPosition: number, 
        newPosition: number, 
        boardSize: number = 40
    ): number {
        if (newPosition >= oldPosition) {
            return 0; // ยังไม่วนรอบ
        } else {
            return Math.floor((oldPosition + (boardSize - oldPosition) + newPosition) / boardSize);
        }
    }
    
    /**
     * ตรวจสอบประเภทช่องบนกระดาน
     */
    static getSpaceType(position: number): string {
        // สามารถปรับแต่งตามการออกแบบกระดาน
        const specialSpaces: Record<number, string> = {
            0: 'start',
            10: 'opportunity',
            20: 'market',
            30: 'life-event'
        };
        
        return specialSpaces[position] || 'normal';
    }
    
    /**
     * ตรวจสอบว่าอยู่ในโซนใด
     */
    static getCurrentZone(position: number, boardSize: number = 40): string {
        const quarter = boardSize / 4;
        
        if (position < quarter) return 'Zone A';
        if (position < quarter * 2) return 'Zone B';
        if (position < quarter * 3) return 'Zone C';
        return 'Zone D';
    }
}
