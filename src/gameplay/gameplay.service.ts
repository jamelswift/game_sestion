import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as DiceLogic from './logic/rolldice/dice.logic';
import { level1Layout } from '../board/board-layout-level1';

// Clean imports with dependency injection
import { CardsLogic } from './logic/cards/cards.logic';
import { CardEffectLogic } from './logic/cards/effect.card.logic';
import { PlayerLogic } from './logic/player/player.logic';

const TOTAL_BOARD_SPACES = level1Layout.length;

@Injectable()
export class GameplayService {
  constructor(
    private readonly prisma: PrismaService,
    // Inject logic services instead of creating new instances
    private readonly cardsLogic: CardsLogic,
    private readonly cardEffectLogic: CardEffectLogic,
    private readonly playerLogic: PlayerLogic,
  ) {}

  async handlePlayerRollDice(playerInSessionId: number) {
    // 1. ทอยเต๋า
    const diceRoll = DiceLogic.rollStandardDice();

    // 2. ดึงข้อมูลผู้เล่นปัจจุบันจากฐานข้อมูล
    const player = await this.prisma.playerInSession.findUnique({
      where: { id: playerInSessionId },
      include: { player: true, session: true },
    });

    if (!player) {
      throw new NotFoundException(`Player in session with ID ${playerInSessionId} not found`);
    }

    // 3. คำนวณตำแหน่งใหม่บนกระดาน
    const newPosition = (player.boardPosition + diceRoll) % TOTAL_BOARD_SPACES;

    // 4. อัปเดตตำแหน่งผู้เล่นในฐานข้อมูล
    const updatedPlayer = await this.prisma.playerInSession.update({
      where: { id: playerInSessionId },
      data: { boardPosition: newPosition },
      include: { player: true, session: true },
    });

    // ใช้ level1Layout แทน database query
    const spaceType = level1Layout[newPosition];
    const boardSpace = {
      position: newPosition,
      type: spaceType,
      name: spaceType
    };

    console.log(`Player ${player.player.displayName} rolled a ${diceRoll} and moved to position ${newPosition} (${spaceType})`);

    // เรียก handleSpaceEvent และส่งผลลัพธ์
    const spaceEvent = await this.handleSpaceEvent(updatedPlayer, boardSpace);

    return {
      diceRoll,
      newPosition,
      boardSpace,
      player: updatedPlayer,
      spaceEvent,
    };
  }

  // แก้ชื่อฟังก์ชันและเพิ่ม async
  async handleSpaceEvent(player: any, boardSpace: any) {
    if (!boardSpace) {
      console.warn(`No board space found at position ${player.boardPosition}`);
      return { type: 'none', message: 'No event occurred' };
    }

    console.log(`Processing space event: ${boardSpace.type}`);

    switch (boardSpace.type) {
      case 'Opportunity':
        return await this.handleOpportunitySpace(player);
      case 'Market':
        return await this.handleMarketSpace(player);
      case 'Invest in Yourself':
        return await this.handleInvestInYourselfSpace(player);
      case 'Life Event':
        return await this.handleLifeEventSpace(player);
      case 'Luxury':
        return await this.handleLuxurySpace(player);
      case 'Charity':
        return await this.handleCharitySpace(player);
      case 'Payday':
        return await this.handlePaydaySpace(player);
      default:
        console.warn(`Unknown board space type: ${boardSpace.type}`);
        return { type: 'unknown', message: `Landed on ${boardSpace.type}` };
    }
  }

  // ใช้ CardsLogic สำหรับแต่ละการ์ด
  private async handleOpportunitySpace(player: any) {
    console.log(`${player.player.displayName} landed on OPPORTUNITY`);
    
    const card = await this.cardsLogic.drawCardForSession('Opportunity', player.sessionId);
    return this.cardsLogic.processOpportunityCard(card);
  }

  private async handleMarketSpace(player: any) {
    console.log(` ${player.player.displayName} landed on MARKET`);
    
    const card = await this.cardsLogic.drawCardForSession('Market', player.sessionId);
    return this.cardsLogic.processMarketCard(card);
  }

  private async handleInvestInYourselfSpace(player: any) {
    console.log(` ${player.player.displayName} landed on INVEST IN YOURSELF`);
    
    const card = await this.cardsLogic.drawCardForSession('Invest in Yourself', player.sessionId);
    return this.cardsLogic.processInvestInYourselfCard(card);
  }

  private async handleLifeEventSpace(player: any) {
    console.log(` ${player.player.displayName} landed on LIFE EVENT`);
    
    const card = await this.cardsLogic.drawCardForSession('Life Event', player.sessionId);
    return this.cardsLogic.processLifeEventCard(card);
  }

  private async handleLuxurySpace(player: any) {
    console.log(` ${player.player.displayName} landed on LUXURY`);
    
    const card = await this.cardsLogic.drawCardForSession('Luxury', player.sessionId);
    return this.cardsLogic.processLuxuryCard(card);
  }

  //  ใช้ CardEffectLogic สำหรับ Charity
  // ค่อยกลับมาเป็น object ที่มี options ให้เลือกบริจาค ทีหลัง
  private async handleCharitySpace(player: any) {
    console.log(` ${player.player.displayName} landed on CHARITY`);
    
    const charityOptions = [
      { id: 1, name: 'Education Fund', amount: 1000, description: 'Help children get better education' },
      { id: 2, name: 'Health Care', amount: 1500, description: 'Support healthcare for the needy' },
      { id: 3, name: 'Environment', amount: 800, description: 'Protect our planet' }
    ];
    
    return {
      type: 'charity',
      message: 'Choose a charity to donate to',
      requiresChoice: true,
      options: charityOptions
    };
  }

  // ใช้ CardEffectLogic สำหรับ Payday
  private async handlePaydaySpace(player: any) {
    console.log(` ${player.player.displayName} landed on PAYDAY`);
    
    return await this.cardEffectLogic.processPaydayEffect(player.id, player.careerId);
  }

  //  เพิ่ม methods สำหรับประมวลผล effects และ game state
  async executeCardEffect(cardId: number, playerId: number, effectData: any) {
    return await this.cardEffectLogic.executeCardEffect(cardId, playerId, effectData);
  }

  async processDonation(playerId: number, charityId: number, amount: number) {
    return await this.cardEffectLogic.processCharityDonation(playerId, charityId, amount);
  }

  // เพิ่ม player management methods
  async getPlayerState(playerId: number) {
    return await this.playerLogic.getPlayerState(playerId);
  }

  async updatePlayerFinancials(playerId: number, updates: any) {
    return await this.playerLogic.updatePlayerFinancials(playerId, updates);
  }

  // เพิ่ม utility methods
  async getSessionGameState(sessionId: number) {
    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          players: {
            include: { player: true }
          }
        }
      });

      if (!session) {
        throw new NotFoundException(`Session ${sessionId} not found`);
      }

      return {
        sessionId,
        status: session.status,
        currentTurn: session.currentTurn,
        currentPlayer: session.currentTurnPlayerId,
        players: session.players.map(p => ({
          id: p.id,
          name: p.player.displayName,
          position: p.boardPosition,
          cash: p.cash,
          happiness: p.happinessScore
        }))
      };
    } catch (error) {
      console.error('Error getting game state:', error);
      throw error;
    }
  }
}