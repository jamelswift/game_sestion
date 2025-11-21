import { PrismaService } from '../../../prisma/prisma.service';

// ============================================================================
// Turn Management Interfaces
// ============================================================================
export interface TurnState {
  sessionId: number;
  currentTurn: number;
  currentPlayerId: number;
  phase: 'start' | 'roll_dice' | 'move' | 'space_event' | 'card_draw' | 'end';
  timeStarted: Date;
  timeRemaining?: number; // seconds
  actions: TurnAction[];
}

export interface TurnAction {
  action: string;
  playerId: number;
  data: any;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
}

export interface PlayerTurnOrder {
  playerId: number;
  turnOrder: number;
  isActive: boolean;
  hasSkippedTurn: boolean;
}

export interface TurnResult {
  success: boolean;
  message: string;
  newTurnState?: TurnState;
  gameEvents?: any[];
  nextActions?: string[];
}

// ============================================================================
// Turn Management Logic
// ============================================================================
export class TurnManagementLogic {
  private readonly TURN_TIME_LIMIT = 120; // 2 minutes per turn

  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // 🎮 Turn Control Methods
  // ========================================

  /**
   * เริ่มเทิร์นใหม่
   */
  async startNewTurn(sessionId: number): Promise<TurnResult> {
    try {
      console.log(`🎮 Starting new turn for session ${sessionId}`);

      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          players: {
            orderBy: { turnOrder: 'asc' }
          }
        }
      });

      if (!session) {
        return {
          success: false,
          message: 'Session not found'
        };
      }

      if (session.status !== 'active') {
        return {
          success: false,
          message: 'Session is not active'
        };
      }

      // คำนวณผู้เล่นคนต่อไป
      const nextPlayer = await this.getNextPlayer(sessionId);
      if (!nextPlayer) {
        return {
          success: false,
          message: 'No next player found'
        };
      }

      // อัปเดตเทิร์นในฐานข้อมูล
      const newTurn = Number(session.currentTurn || 0) + 1;
      
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          currentTurn: newTurn,
          currentTurnPlayerId: nextPlayer.id,
          updatedAt: new Date()
        }
      });

      // สร้าง TurnState
      const turnState: TurnState = {
        sessionId,
        currentTurn: newTurn,
        currentPlayerId: nextPlayer.id,
        phase: 'start',
        timeStarted: new Date(),
        timeRemaining: this.TURN_TIME_LIMIT,
        actions: []
      };

      // บันทึกกิจกรรม
      await this.logTurnActivity(sessionId, nextPlayer.id, 'turn_started', {
        turn: newTurn,
        player: nextPlayer.player.username
      });

      return {
        success: true,
        message: `Turn ${newTurn} started for ${nextPlayer.player.username}`,
        newTurnState: turnState,
        nextActions: ['roll_dice']
      };
    } catch (error) {
      console.error('Error starting new turn:', error);
      return {
        success: false,
        message: 'Error starting new turn'
      };
    }
  }

  /**
   * ดำเนินการในเทิร์น
   */
  async executeTurnAction(sessionId: number, playerId: number, action: string, data: any): Promise<TurnResult> {
    try {
      console.log(`🎯 Executing turn action: ${action} for player ${playerId}`);

      // ตรวจสอบว่าเป็นเทิร์นของผู้เล่นหรือไม่
      const isValidTurn = await this.validatePlayerTurn(sessionId, playerId);
      if (!isValidTurn) {
        return {
          success: false,
          message: 'Not your turn'
        };
      }

      // ดำเนินการตามประเภท action
      let result: TurnResult;
      
      switch (action) {
        case 'roll_dice':
          result = await this.handleRollDice(sessionId, playerId, data);
          break;
        case 'move_player':
          result = await this.handleMovePlayer(sessionId, playerId, data);
          break;
        case 'draw_card':
          result = await this.handleDrawCard(sessionId, playerId, data);
          break;
        case 'end_turn':
          result = await this.handleEndTurn(sessionId, playerId, data);
          break;
        case 'skip_turn':
          result = await this.handleSkipTurn(sessionId, playerId, data);
          break;
        default:
          result = {
            success: false,
            message: `Unknown action: ${action}`
          };
      }

      // บันทึกกิจกรรม
      if (result.success) {
        await this.logTurnActivity(sessionId, playerId, action, data);
      }

      return result;
    } catch (error) {
      console.error('Error executing turn action:', error);
      return {
        success: false,
        message: 'Error executing action'
      };
    }
  }

  /**
   * ดึงสถานะเทิร์นปัจจุบัน
   */
  async getCurrentTurnState(sessionId: number): Promise<TurnState | null> {
    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          currentTurnPlayer: {
            include: { player: true }
          }
        }
      });

      if (!session || !session.currentTurnPlayer) {
        return null;
      }

      // ดึงกิจกรรมในเทิร์นปัจจุบัน
      const activities = await this.prisma.activity.findMany({
        where: {
          sessionId,
          turn: session.currentTurn
        },
        orderBy: { createdAt: 'asc' }
      });

      const actions: TurnAction[] = activities.map(activity => ({
        action: activity.action,
        playerId: activity.playerId || 0,
        data: activity.data as any,
        timestamp: activity.createdAt,
        status: 'completed'
      }));

      // คำนวณเวลาที่เหลือ
      const timeElapsed = Date.now() - session.updatedAt.getTime();
      const timeRemaining = Math.max(0, this.TURN_TIME_LIMIT - Math.floor(timeElapsed / 1000));

      // กำหนด phase ปัจจุบันจากกิจกรรม
      const currentPhase = this.determineCurrentPhase(actions);

      return {
        sessionId,
        currentTurn: Number(session.currentTurn || 0),
        currentPlayerId: session.currentTurnPlayer.id,
        phase: currentPhase,
        timeStarted: session.updatedAt,
        timeRemaining,
        actions
      };
    } catch (error) {
      console.error('Error getting current turn state:', error);
      return null;
    }
  }

  /**
   * ข้ามเทิร์น (timeout หรือ skip)
   */
  async skipTurn(sessionId: number, playerId: number, reason: 'timeout' | 'manual'): Promise<TurnResult> {
    try {
      console.log(`⏭️ Skipping turn for player ${playerId}, reason: ${reason}`);

      // บันทึกการข้ามเทิร์น
      await this.logTurnActivity(sessionId, playerId, 'turn_skipped', { reason });

      // เริ่มเทิร์นใหม่
      return await this.startNewTurn(sessionId);
    } catch (error) {
      console.error('Error skipping turn:', error);
      return {
        success: false,
        message: 'Error skipping turn'
      };
    }
  }

  // ========================================
  // 🎲 Turn Action Handlers
  // ========================================

  private async handleRollDice(sessionId: number, playerId: number, data: any): Promise<TurnResult> {
    // สุ่มลูกเต๋า
    const diceValue = Math.floor(Math.random() * 6) + 1;
    
    // อัปเดต phase
    await this.updateTurnPhase(sessionId, 'move');

    return {
      success: true,
      message: `Rolled ${diceValue}`,
      gameEvents: [{
        type: 'dice_rolled',
        value: diceValue,
        playerId
      }],
      nextActions: ['move_player']
    };
  }

  private async handleMovePlayer(sessionId: number, playerId: number, data: any): Promise<TurnResult> {
    const { steps } = data;
    
    // อัปเดตตำแหน่งผู้เล่น
    const player = await this.prisma.playerInSession.findUnique({
      where: { id: playerId }
    });

    if (!player) {
      return {
        success: false,
        message: 'Player not found'
      };
    }

    const newPosition = (player.boardPosition + steps) % 40; // สมมติกระดาน 40 ช่อง

    await this.prisma.playerInSession.update({
      where: { id: playerId },
      data: { boardPosition: newPosition }
    });

    // อัปเดต phase
    await this.updateTurnPhase(sessionId, 'space_event');

    return {
      success: true,
      message: `Moved to position ${newPosition}`,
      gameEvents: [{
        type: 'player_moved',
        oldPosition: player.boardPosition,
        newPosition,
        playerId
      }],
      nextActions: ['handle_space_event']
    };
  }

  private async handleDrawCard(sessionId: number, playerId: number, data: any): Promise<TurnResult> {
    // TODO: เชื่อมต่อกับ CardsLogic
    console.log(`Drawing card for player ${playerId}`);

    // อัปเดต phase
    await this.updateTurnPhase(sessionId, 'end');

    return {
      success: true,
      message: 'Card drawn',
      gameEvents: [{
        type: 'card_drawn',
        playerId
      }],
      nextActions: ['end_turn']
    };
  }

  private async handleEndTurn(sessionId: number, playerId: number, data: any): Promise<TurnResult> {
    console.log(`Ending turn for player ${playerId}`);

    // บันทึกการจบเทิร์น
    await this.logTurnActivity(sessionId, playerId, 'turn_ended', {});

    // เริ่มเทิร์นใหม่
    return await this.startNewTurn(sessionId);
  }

  private async handleSkipTurn(sessionId: number, playerId: number, data: any): Promise<TurnResult> {
    return await this.skipTurn(sessionId, playerId, 'manual');
  }

  // ========================================
  // 🔧 Helper Methods
  // ========================================

  private async getNextPlayer(sessionId: number) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        players: {
          include: { player: true },
          orderBy: { turnOrder: 'asc' }
        }
      }
    });

    if (!session || session.players.length === 0) {
      return null;
    }

    // หาผู้เล่นคนต่อไป
    const currentPlayerIndex = session.players.findIndex(p => p.id === session.currentTurnPlayerId);
    const nextIndex = (currentPlayerIndex + 1) % session.players.length;
    
    return session.players[nextIndex];
  }

  private async validatePlayerTurn(sessionId: number, playerId: number): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId }
    });

    return session?.currentTurnPlayerId === playerId;
  }

  private async logTurnActivity(sessionId: number, playerId: number, action: string, data: any) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId }
    });

    await this.prisma.activity.create({
      data: {
        sessionId,
        playerId: playerId,
        action,
        data: data as any,
        turn: session?.currentTurn || 0
      }
    });
  }

  private async updateTurnPhase(sessionId: number, phase: string) {
    // TODO: อัปเดต phase ในฐานข้อมูล
    console.log(`Updating turn phase to: ${phase}`);
  }

  private determineCurrentPhase(actions: TurnAction[]): TurnState['phase'] {
    if (actions.length === 0) return 'start';
    
    const lastAction = actions[actions.length - 1];
    
    switch (lastAction.action) {
      case 'turn_started':
        return 'roll_dice';
      case 'roll_dice':
        return 'move';
      case 'move_player':
        return 'space_event';
      case 'handle_space_event':
        return 'card_draw';
      case 'card_drawn':
        return 'end';
      default:
        return 'start';
    }
  }

  /**
   * ตั้งค่าลำดับผู้เล่น
   */
  async setTurnOrder(sessionId: number, playerIds: number[]): Promise<boolean> {
    try {
      for (let i = 0; i < playerIds.length; i++) {
        await this.prisma.playerInSession.update({
          where: { id: playerIds[i] },
          data: { turnOrder: i + 1 }
        });
      }

      return true;
    } catch (error) {
      console.error('Error setting turn order:', error);
      return false;
    }
  }

  /**
   * สุ่มลำดับผู้เล่น
   */
  async randomizeTurnOrder(sessionId: number): Promise<boolean> {
    try {
      const players = await this.prisma.playerInSession.findMany({
        where: { sessionId }
      });

      // สุ่มลำดับ
      const shuffled = [...players].sort(() => Math.random() - 0.5);
      const playerIds = shuffled.map(p => p.id);

      return await this.setTurnOrder(sessionId, playerIds);
    } catch (error) {
      console.error('Error randomizing turn order:', error);
      return false;
    }
  }
}