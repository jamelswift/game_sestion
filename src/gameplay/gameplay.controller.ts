import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseFilters,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { GameplayService } from './gameplay.service';

// Import DTOs
import {
  RollDiceDto,
  ExecuteCardEffectDto,
  PlayerChoiceDto,
  MarketDataRequestDto,
  BaseResponseDto,
  DiceRollResultDto,
  GameStateDto,
  PlayerDataDto,
  MarketDataDto,
} from './dto/api.dto';

// Import Exception Filter
import { GameplayExceptionFilter } from './filters/gameplay-exception.filter';

// Import Choice System
import { ChoiceSystemLogic } from './logic/choice-system';

// Import Market Price System
import { DynamicPriceEngine, PriceHistoryService } from './logic/price-system';

/**
 * Gameplay REST API Controller
 * ให้บริการ REST endpoints สำหรับ Frontend ในการเชื่อมต่อกับระบบเกม
 * 
 * หน้าที่หลัก:
 * 1. Game Actions - การทอยเต๋า, การดำเนินการการ์ด
 * 2. Game State - ข้อมูลสถานะเกม, ผู้เล่น
 * 3. Market Data - ข้อมูลตลาด, ราคาสินทรัพย์
 * 4. Player Choices - การตัดสินใจของผู้เล่น
 * 5. Debug Endpoints - สำหรับการ debug และ monitoring
 */
@Controller('api/gameplay')
@UseFilters(GameplayExceptionFilter)
export class GameplayController {
  private readonly logger = new Logger(GameplayController.name);

  constructor(
    private readonly gameplayService: GameplayService,
    private readonly choiceSystem: ChoiceSystemLogic,
    private readonly priceEngine: DynamicPriceEngine,
    private readonly priceHistory: PriceHistoryService,
  ) {
    this.logger.log('🎮 Gameplay REST API Controller initialized');
  }

  // ========================================
  //  Game Actions Endpoints
  // ========================================

  /**
   * POST /api/gameplay/dice/roll
   * ทอยเต๋าและเลื่อนผู้เล่น
   */
  @Post('dice/roll')
  async rollDice(@Body() rollDiceDto: RollDiceDto): Promise<BaseResponseDto<DiceRollResultDto>> {
    try {
      this.logger.log(`🎲 Rolling dice for player ${rollDiceDto.playerInSessionId}`);

      const result = await this.gameplayService.handlePlayerRollDice(rollDiceDto.playerInSessionId);

      // Transform result to DTO format
      const diceRollResult: DiceRollResultDto = {
        diceRoll: result.diceRoll,
        newPosition: result.newPosition,
        boardSpace: {
          position: result.boardSpace.position,
          type: result.boardSpace.type,
          name: result.boardSpace.name,
        },
        player: this.transformPlayerData(result.player),
        spaceEvent: result.spaceEvent,
      };

      return {
        success: true,
        message: `Player rolled ${result.diceRoll} and moved to position ${result.newPosition}`,
        data: diceRollResult,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Error rolling dice: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new HttpException(
        `Failed to roll dice: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /api/gameplay/card/execute
   * ดำเนินการเอฟเฟกต์การ์ด
   */
  @Post('card/execute')
  async executeCardEffect(@Body() executeCardDto: ExecuteCardEffectDto): Promise<BaseResponseDto<any>> {
    try {
      this.logger.log(`🃏 Executing card effect ${executeCardDto.cardId} for player ${executeCardDto.playerId}`);

      const result = await this.gameplayService.executeCardEffect(
        executeCardDto.cardId,
        executeCardDto.playerId,
        executeCardDto.effectData,
      );

      return {
        success: true,
        message: 'Card effect executed successfully',
        data: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Error executing card effect: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new HttpException(
        `Failed to execute card effect: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /api/gameplay/choice/submit
   * ส่งการตัดสินใจของผู้เล่น
   */
  @Post('choice/submit')
  async submitPlayerChoice(@Body() choiceDto: PlayerChoiceDto): Promise<BaseResponseDto<any>> {
    try {
      this.logger.log(`🎯 Submitting choice ${choiceDto.choiceId} for player ${choiceDto.playerInSessionId}`);

      // ใช้ Choice System แบบง่าย
      const result = await this.choiceSystem.createPlayerChoice(
        choiceDto.playerInSessionId,
        'manual_choice',
        [choiceDto.selectedOption],
        60, // timeout 60 seconds
        { amount: choiceDto.amount, ...choiceDto.additionalData }
      );

      return {
        success: true,
        message: 'Player choice processed successfully',
        data: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Error processing choice: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new HttpException(
        `Failed to process choice: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ========================================
  //  Game State Endpoints
  // ========================================

  /**
   * GET /api/gameplay/session/:sessionId/state
   * ดึงสถานะเกมปัจจุบัน
   */
  @Get('session/:sessionId/state')
  async getGameState(@Param('sessionId') sessionId: string): Promise<BaseResponseDto<GameStateDto>> {
    try {
      const sessionIdNum = parseInt(sessionId, 10);
      this.logger.log(`📊 Getting game state for session ${sessionIdNum}`);

      // สร้าง mock game state data (ควรดึงจากฐานข้อมูลจริง)
      const gameState: GameStateDto = {
        sessionId: sessionIdNum,
        currentTurn: 1,
        gamePhase: 'active',
        players: [], // TODO: ดึงข้อมูลผู้เล่นจริงจากฐานข้อมูล
        marketData: undefined,
        activeEvents: [],
        lastUpdated: new Date().toISOString(),
      };

      return {
        success: true,
        message: 'Game state retrieved successfully',
        data: gameState,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Error getting game state: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new HttpException(
        `Failed to get game state: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /api/gameplay/player/:playerInSessionId
   * ดึงข้อมูลผู้เล่น
   */
  @Get('player/:playerInSessionId')
  async getPlayerData(@Param('playerInSessionId') playerInSessionId: string): Promise<BaseResponseDto<PlayerDataDto>> {
    try {
      const playerId = parseInt(playerInSessionId, 10);
      this.logger.log(`👤 Getting player data for ${playerId}`);

      // Mock data สำหรับตอนนี้
      const playerData: PlayerDataDto = {
        id: playerId,
        displayName: `Player ${playerId}`,
        boardPosition: 0,
        cash: 1000,
        income: 500,
        expenses: 300,
        assets: 2000,
        liabilities: 500,
        netWorth: 2700,
        isActive: true,
        lastUpdated: new Date().toISOString(),
      };

      return {
        success: true,
        message: 'Player data retrieved successfully',
        data: playerData,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Error getting player data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new HttpException(
        `Failed to get player data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ========================================
  //  Market Data Endpoints
  // ========================================

  /**
   * GET /api/gameplay/market/:sessionId
   * ดึงข้อมูลตลาดปัจจุบัน
   */
  @Get('market/:sessionId')
  async getMarketData(
    @Param('sessionId') sessionId: string,
    @Query() query: any,
  ): Promise<BaseResponseDto<MarketDataDto[]>> {
    try {
      const sessionIdNum = parseInt(sessionId, 10);
      this.logger.log(`📈 Getting market data for session ${sessionIdNum}`);

      // ดึงข้อมูลตลาดจาก Price Engine
      const marketSnapshot = await this.priceEngine.getMarketSnapshot(sessionIdNum);

      // Transform ข้อมูลเป็น DTO format
      const marketData: MarketDataDto[] = marketSnapshot.assetPrices.map(price => ({
        assetId: price.assetId,
        assetName: `Asset ${price.assetId}`, // TODO: ดึงชื่อจริงจากฐานข้อมูล
        currentPrice: price.currentPrice,
        previousPrice: price.previousPrice,
        priceChange: price.priceChange,
        priceChangePercentage: price.priceChangePercentage,
        volume: price.volume,
        volatility: price.volatility,
        marketTrend: price.marketTrend,
        lastUpdated: price.lastUpdated.toISOString(),
      }));

      return {
        success: true,
        message: 'Market data retrieved successfully',
        data: marketData,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Error getting market data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new HttpException(
        `Failed to get market data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /api/gameplay/market/:sessionId/history/:assetId
   * ดึงประวัติราคาของสินทรัพย์
   */
  @Get('market/:sessionId/history/:assetId')
  async getAssetPriceHistory(
    @Param('sessionId') sessionId: string,
    @Param('assetId') assetId: string,
    @Query('turns') turns?: string,
  ): Promise<BaseResponseDto<any[]>> {
    try {
      const sessionIdNum = parseInt(sessionId, 10);
      const assetIdNum = parseInt(assetId, 10);
      this.logger.log(`📊 Getting price history for asset ${assetIdNum} in session ${sessionIdNum}`);

      const turnsLimit = turns ? parseInt(turns, 10) : undefined;
      const history = await this.priceHistory.getPriceHistory(sessionIdNum, assetIdNum, turnsLimit);

      return {
        success: true,
        message: `Price history for asset ${assetIdNum} retrieved successfully`,
        data: history,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Error getting price history: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new HttpException(
        `Failed to get price history: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ========================================
  //  Choice System Endpoints
  // ========================================

  /**
   * GET /api/gameplay/choices/:playerInSessionId
   * ดึงตัวเลือกที่พร้อมใช้งานสำหรับผู้เล่น
   */
  @Get('choices/:playerInSessionId')
  async getAvailableChoices(@Param('playerInSessionId') playerInSessionId: string): Promise<BaseResponseDto<any[]>> {
    try {
      const playerId = parseInt(playerInSessionId, 10);
      this.logger.log(`🎯 Getting available choices for player ${playerId}`);

      const choices = await this.choiceSystem.getPlayerChoices(playerId);

      return {
        success: true,
        message: 'Available choices retrieved successfully',
        data: choices,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Error getting choices: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new HttpException(
        `Failed to get choices: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ========================================
  //  Debug & Monitoring Endpoints
  // ========================================

  /**
   * GET /api/gameplay/health
   * Health check endpoint
   */
  @Get('health')
  async healthCheck(): Promise<BaseResponseDto<any>> {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          gameplayService: 'ok',
          choiceSystem: 'ok',
          priceEngine: 'ok',
          priceHistory: 'ok',
        },
      };

      return {
        success: true,
        message: 'Gameplay services are healthy',
        data: health,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new HttpException(
        `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /api/gameplay/debug/stats
   * ดึงสถิติระบบสำหรับ debugging
   */
  @Get('debug/stats')
  async getSystemStats(): Promise<BaseResponseDto<any>> {
    try {
      this.logger.log('📊 Getting system statistics for debugging');

      const stats = {
        choiceSystem: this.choiceSystem.getSystemStats(),
        priceHistory: this.priceHistory.getHistorySystemStats(),
        timestamp: new Date().toISOString(),
      };

      return {
        success: true,
        message: 'System statistics retrieved successfully',
        data: stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Error getting system stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new HttpException(
        `Failed to get system stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ========================================
  //  Helper Methods
  // ========================================

  /**
   * Transform player data จากฐานข้อมูลเป็น DTO
   */
  private transformPlayerData(player: any): PlayerDataDto {
    return {
      id: player.id,
      displayName: player.player?.displayName || `Player ${player.id}`,
      boardPosition: player.boardPosition || 0,
      cash: player.cash || 0,
      income: player.income || 0,
      expenses: player.expenses || 0,
      assets: player.assets || 0,
      liabilities: player.liabilities || 0,
      netWorth: (player.assets || 0) - (player.liabilities || 0),
      isActive: player.isActive !== false,
      lastUpdated: new Date().toISOString(),
    };
  }
}