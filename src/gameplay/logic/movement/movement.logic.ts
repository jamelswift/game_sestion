import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

// ============================================================================
// Movement Interfaces
// ============================================================================
export interface BoardSpace {
  id: number;
  position: number;
  type: 'start' | 'payday' | 'opportunity' | 'market' | 'life_event' | 'charity' | 'luxury' | 'invest_in_yourself';
  name: string;
  description?: string;
  data?: any;
}

export interface MovementResult {
  success: boolean;
  message: string;
  movement: {
    playerId: number;
    fromPosition: number;
    toPosition: number;
    steps: number;
    spacesPassed: BoardSpace[];
    specialEvents: SpaceEvent[];
  };
  spaceEffect?: SpaceEffect;
}

export interface SpaceEvent {
  type: 'payday' | 'bonus' | 'penalty' | 'milestone';
  description: string;
  effect?: any;
}

export interface SpaceEffect {
  spaceId: number;
  spaceName: string;
  spaceType: string;
  action: 'draw_card' | 'pay_fee' | 'collect_money' | 'choice' | 'none';
  data?: any;
  requiresUserAction: boolean;
}

export interface DiceRoll {
  value: number;
  playerId: number;
  sessionId: number;
  timestamp: Date;
}

// ============================================================================
// Movement Logic
// ============================================================================
@Injectable()
export class MovementLogic {
  private readonly BOARD_SIZE = 40; // จำนวนช่องบนกระดาน
  private readonly PAYDAY_POSITIONS = [0, 10, 20, 30]; // ตำแหน่ง Payday

  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // 🎲 Dice and Movement Methods
  // ========================================

  /**
   * ทอยลูกเต๋า
   */
  async rollDice(sessionId: number, playerId: number): Promise<{
    success: boolean;
    message: string;
    diceValue?: number;
    canMove?: boolean;
  }> {
    try {
      // ตรวจสอบว่าเป็นเทิร์นของผู้เล่นหรือไม่
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId }
      });

      if (!session || session.currentTurnPlayerId !== playerId) {
        return {
          success: false,
          message: 'Not your turn'
        };
      }

      // สุ่มลูกเต๋า (1-6)
      const diceValue = Math.floor(Math.random() * 6) + 1;

      // บันทึกการทอยลูกเต๋า
      await this.logDiceRoll(sessionId, playerId, diceValue);

      console.log(`🎲 Player ${playerId} rolled ${diceValue}`);

      return {
        success: true,
        message: `Rolled ${diceValue}`,
        diceValue,
        canMove: true
      };
    } catch (error) {
      console.error('Error rolling dice:', error);
      return {
        success: false,
        message: 'Error rolling dice'
      };
    }
  }

  /**
   * เคลื่อนที่ผู้เล่น
   */
  async movePlayer(sessionId: number, playerId: number, steps: number): Promise<MovementResult> {
    try {
      console.log(`🚶 Moving player ${playerId} by ${steps} steps`);

      // ดึงตำแหน่งปัจจุบันของผู้เล่น
      const player = await this.prisma.playerInSession.findUnique({
        where: { id: playerId }
      });

      if (!player) {
        return {
          success: false,
          message: 'Player not found',
          movement: {
            playerId,
            fromPosition: 0,
            toPosition: 0,
            steps: 0,
            spacesPassed: [],
            specialEvents: []
          }
        };
      }

      const fromPosition = player.boardPosition;
      const toPosition = (fromPosition + steps) % this.BOARD_SIZE;

      // ดึงข้อมูลช่องที่ผ่าน
      const spacesPassed = await this.getSpacesPassed(fromPosition, toPosition, steps);
      
      // ตรวจสอบ special events (เช่น ผ่าน Payday)
      const specialEvents = this.checkSpecialEvents(fromPosition, toPosition, steps);

      // อัปเดตตำแหน่งผู้เล่น
      await this.prisma.playerInSession.update({
        where: { id: playerId },
        data: { boardPosition: toPosition }
      });

      // ประมวลผล special events
      await this.processSpecialEvents(playerId, specialEvents);

      // ดึงข้อมูลช่องที่ไปหยุด
      const landedSpace = await this.getBoardSpace(toPosition);
      const spaceEffect = await this.getSpaceEffect(landedSpace);

      // บันทึกกิจกรรม
      await this.logMovement(sessionId, playerId, fromPosition, toPosition, steps);

      return {
        success: true,
        message: `Moved from position ${fromPosition} to ${toPosition}`,
        movement: {
          playerId,
          fromPosition,
          toPosition,
          steps,
          spacesPassed,
          specialEvents
        },
        spaceEffect
      };
    } catch (error) {
      console.error('Error moving player:', error);
      return {
        success: false,
        message: 'Error moving player',
        movement: {
          playerId,
          fromPosition: 0,
          toPosition: 0,
          steps: 0,
          spacesPassed: [],
          specialEvents: []
        }
      };
    }
  }

  /**
   * เคลื่อนที่ไปยังตำแหน่งเฉพาะ
   */
  async moveToPosition(sessionId: number, playerId: number, targetPosition: number): Promise<MovementResult> {
    try {
      const player = await this.prisma.playerInSession.findUnique({
        where: { id: playerId }
      });

      if (!player) {
        throw new Error('Player not found');
      }

      const fromPosition = player.boardPosition;
      let steps = targetPosition - fromPosition;

      // จัดการกรณีที่ต้องเดินผ่านจุดเริ่มต้น
      if (steps < 0) {
        steps += this.BOARD_SIZE;
      }

      return await this.movePlayer(sessionId, playerId, steps);
    } catch (error) {
      console.error('Error moving to position:', error);
      return {
        success: false,
        message: 'Error moving to position',
        movement: {
          playerId,
          fromPosition: 0,
          toPosition: 0,
          steps: 0,
          spacesPassed: [],
          specialEvents: []
        }
      };
    }
  }

  // ========================================
  // 🏪 Board Space Methods
  // ========================================

  /**
   * ดึงข้อมูลช่องบนกระดาน
   */
  async getBoardSpace(position: number): Promise<BoardSpace> {
    // TODO: ดึงจากฐานข้อมูลจริง
    // ตอนนี้ใช้ข้อมูลแบบ hardcode
    const spaceTypes: { [key: number]: Partial<BoardSpace> } = {
      0: { type: 'start', name: 'Start', description: 'Starting position' },
      5: { type: 'opportunity', name: 'Opportunity', description: 'Draw an opportunity card' },
      10: { type: 'payday', name: 'Payday', description: 'Collect your salary' },
      15: { type: 'market', name: 'Stock Market', description: 'Market fluctuation' },
      20: { type: 'payday', name: 'Payday', description: 'Collect your salary' },
      25: { type: 'life_event', name: 'Life Event', description: 'Life happens' },
      30: { type: 'payday', name: 'Payday', description: 'Collect your salary' },
      35: { type: 'charity', name: 'Charity', description: 'Give back to society' }
    };

    const spaceData = spaceTypes[position];
    
    return {
      id: position,
      position,
      type: spaceData?.type || 'opportunity',
      name: spaceData?.name || `Space ${position}`,
      description: spaceData?.description,
      data: spaceData?.data
    };
  }

  /**
   * ดึงรายการช่องที่ผู้เล่นผ่าน
   */
  private async getSpacesPassed(fromPosition: number, toPosition: number, steps: number): Promise<BoardSpace[]> {
    const spacesPassed: BoardSpace[] = [];
    
    for (let i = 1; i <= steps; i++) {
      const position = (fromPosition + i) % this.BOARD_SIZE;
      const space = await this.getBoardSpace(position);
      spacesPassed.push(space);
    }

    return spacesPassed;
  }

  /**
   * กำหนดเอฟเฟกต์ของช่อง
   */
  private async getSpaceEffect(space: BoardSpace): Promise<SpaceEffect> {
    const baseEffect: SpaceEffect = {
      spaceId: space.id,
      spaceName: space.name,
      spaceType: space.type,
      action: 'none',
      requiresUserAction: false
    };

    switch (space.type) {
      case 'start':
        return {
          ...baseEffect,
          action: 'collect_money',
          data: { amount: 200 },
          requiresUserAction: false
        };

      case 'payday':
        return {
          ...baseEffect,
          action: 'collect_money',
          data: { type: 'salary' },
          requiresUserAction: false
        };

      case 'opportunity':
        return {
          ...baseEffect,
          action: 'draw_card',
          data: { cardType: 'opportunity' },
          requiresUserAction: true
        };

      case 'market':
        return {
          ...baseEffect,
          action: 'draw_card',
          data: { cardType: 'market' },
          requiresUserAction: true
        };

      case 'life_event':
        return {
          ...baseEffect,
          action: 'draw_card',
          data: { cardType: 'life_event' },
          requiresUserAction: true
        };

      case 'charity':
        return {
          ...baseEffect,
          action: 'choice',
          data: { type: 'charity_donation' },
          requiresUserAction: true
        };

      case 'luxury':
        return {
          ...baseEffect,
          action: 'draw_card',
          data: { cardType: 'luxury' },
          requiresUserAction: true
        };

      case 'invest_in_yourself':
        return {
          ...baseEffect,
          action: 'draw_card',
          data: { cardType: 'invest_in_yourself' },
          requiresUserAction: true
        };

      default:
        return baseEffect;
    }
  }

  // ========================================
  // 🎉 Special Events Methods
  // ========================================

  /**
   * ตรวจสอบ special events ระหว่างการเดิน
   */
  private checkSpecialEvents(fromPosition: number, toPosition: number, steps: number): SpaceEvent[] {
    const events: SpaceEvent[] = [];

    // ตรวจสอบการผ่าน Payday
    const passedPayday = this.checkPassedPayday(fromPosition, toPosition, steps);
    if (passedPayday) {
      events.push({
        type: 'payday',
        description: 'Passed Payday - Collect salary!',
        effect: { type: 'collect_salary' }
      });
    }

    // ตรวจสอบการครบรอบ (ผ่านจุดเริ่มต้น)
    const completedLap = this.checkCompletedLap(fromPosition, toPosition, steps);
    if (completedLap) {
      events.push({
        type: 'milestone',
        description: 'Completed a lap around the board!',
        effect: { type: 'lap_bonus', amount: 500 }
      });
    }

    return events;
  }

  /**
   * ตรวจสอบการผ่าน Payday
   */
  private checkPassedPayday(fromPosition: number, toPosition: number, steps: number): boolean {
    for (let i = 1; i <= steps; i++) {
      const position = (fromPosition + i) % this.BOARD_SIZE;
      if (this.PAYDAY_POSITIONS.includes(position) && position !== toPosition) {
        return true;
      }
    }
    return false;
  }

  /**
   * ตรวจสอบการครบรอบ
   */
  private checkCompletedLap(fromPosition: number, toPosition: number, steps: number): boolean {
    return fromPosition + steps >= this.BOARD_SIZE;
  }

  /**
   * ประมวลผล special events
   */
  private async processSpecialEvents(playerId: number, events: SpaceEvent[]) {
    for (const event of events) {
      console.log(`🎉 Processing special event for player ${playerId}:`, event);

      if (event.effect) {
        switch (event.effect.type) {
          case 'collect_salary':
            await this.processSalaryCollection(playerId);
            break;
          case 'lap_bonus':
            await this.processLapBonus(playerId, event.effect.amount);
            break;
        }
      }
    }
  }

  /**
   * ประมวลผลการเก็บเงินเดือน
   */
  private async processSalaryCollection(playerId: number) {
    try {
      const player = await this.prisma.playerInSession.findUnique({
        where: { id: playerId },
        include: { career: true }
      });

      if (player && player.career) {
        const salary = Number(player.career.baseSalary);
        
        await this.prisma.playerInSession.update({
          where: { id: playerId },
          data: {
            cash: {
              increment: salary
            }
          }
        });

        console.log(`💰 Player ${playerId} collected salary: $${salary}`);
      }
    } catch (error) {
      console.error('Error processing salary collection:', error);
    }
  }

  /**
   * ประมวลผลโบนัสครบรอบ
   */
  private async processLapBonus(playerId: number, amount: number) {
    try {
      await this.prisma.playerInSession.update({
        where: { id: playerId },
        data: {
          cash: {
            increment: amount
          }
        }
      });

      console.log(`🏆 Player ${playerId} received lap bonus: $${amount}`);
    } catch (error) {
      console.error('Error processing lap bonus:', error);
    }
  }

  // ========================================
  // 📊 Utility Methods
  // ========================================

  /**
   * คำนวณระยะทางระหว่างตำแหน่ง
   */
  calculateDistance(fromPosition: number, toPosition: number): number {
    if (toPosition >= fromPosition) {
      return toPosition - fromPosition;
    } else {
      return (this.BOARD_SIZE - fromPosition) + toPosition;
    }
  }

  /**
   * ดึงตำแหน่งของผู้เล่นทุกคน
   */
  async getAllPlayerPositions(sessionId: number): Promise<{ [playerId: number]: number }> {
    try {
      const players = await this.prisma.playerInSession.findMany({
        where: { sessionId }
      });

      const positions: { [playerId: number]: number } = {};
      players.forEach(player => {
        positions[player.id] = player.boardPosition;
      });

      return positions;
    } catch (error) {
      console.error('Error getting player positions:', error);
      return {};
    }
  }

  /**
   * ตรวจสอบการชนกันของผู้เล่น
   */
  async checkPlayerCollisions(sessionId: number): Promise<{ position: number; playerIds: number[] }[]> {
    try {
      const positions = await this.getAllPlayerPositions(sessionId);
      const collisions: { [position: number]: number[] } = {};

      // จัดกลุ่มผู้เล่นตามตำแหน่ง
      Object.entries(positions).forEach(([playerId, position]) => {
        if (!collisions[position]) {
          collisions[position] = [];
        }
        collisions[position].push(parseInt(playerId));
      });

      // ส่งคืนเฉพาะตำแหน่งที่มีผู้เล่นมากกว่า 1 คน
      return Object.entries(collisions)
        .filter(([_, playerIds]) => playerIds.length > 1)
        .map(([position, playerIds]) => ({
          position: parseInt(position),
          playerIds
        }));
    } catch (error) {
      console.error('Error checking player collisions:', error);
      return [];
    }
  }

  // ========================================
  // 📝 Logging Methods
  // ========================================

  private async logDiceRoll(sessionId: number, playerId: number, value: number) {
    await this.prisma.activity.create({
      data: {
        sessionId,
        playerId,
        action: 'roll_dice',
        data: { diceValue: value } as any
      }
    });
  }

  private async logMovement(sessionId: number, playerId: number, fromPosition: number, toPosition: number, steps: number) {
    await this.prisma.activity.create({
      data: {
        sessionId,
        playerId,
        action: 'move_player',
        data: {
          fromPosition,
          toPosition,
          steps
        } as any
      }
    });
  }
}