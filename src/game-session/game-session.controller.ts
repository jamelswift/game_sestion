import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query,
  ParseIntPipe,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GameSessionService } from './game-session.service';
import {
  CreateSessionDto,
  JoinSessionDto, 
  JoinByCodeDto,
  UpdateSessionSettingsDto,
  SessionResponseDto
} from './dto';
import { UpdatePlayerReadyDto } from './dto/update-player-ready.dto';

@Controller('game-session')
@UseGuards(JwtAuthGuard)
export class GameSessionController {
  constructor(private readonly gameSessionService: GameSessionService) {}

  /**
   * สร้างห้องเกมใหม่
   * POST /game-session/create
   */
  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  async createSession(
    @Request() req,
    @Body() createSessionDto: CreateSessionDto
  ): Promise<SessionResponseDto> {
    const hostPlayerId = req.user.sub; // ได้จาก JWT payload
    return this.gameSessionService.createSession(hostPlayerId, createSessionDto);
  }

  /**
   * เข้าร่วมห้องเกมด้วย Session ID
   * POST /game-session/join
   */
  @Post('join')
  @HttpCode(HttpStatus.OK)
  async joinSession(
    @Request() req,
    @Body() joinSessionDto: JoinSessionDto
  ): Promise<SessionResponseDto> {
    const playerId = req.user.sub;
    return this.gameSessionService.joinSession(playerId, joinSessionDto);
  }

  /**
   * เข้าร่วมห้องเกมด้วย Room Code
   * POST /game-session/join-by-code
   */
  @Post('join-by-code')
  @HttpCode(HttpStatus.OK)
  async joinByCode(
    @Request() req,
    @Body() joinByCodeDto: JoinByCodeDto
  ): Promise<SessionResponseDto> {
    const playerId = req.user.sub;
    return this.gameSessionService.joinSessionByCode(playerId, joinByCodeDto);
  }

  /**
   * ออกจากห้องเกม
   * DELETE /game-session/:id/leave
   */
  @Delete(':id/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leaveSession(
    @Request() req,
    @Param('id', ParseIntPipe) sessionId: number
  ): Promise<void> {
    const playerId = req.user.sub;
    await this.gameSessionService.leaveSession(playerId, sessionId);
  }

  /**
   * ดึงข้อมูลห้องเกม
   * GET /game-session/:id
   */
  @Get(':id')
  async getSession(
    @Param('id', ParseIntPipe) sessionId: number
  ): Promise<SessionResponseDto> {
    return this.gameSessionService.getSession(sessionId);
  }

  /**
   * ดึงรายการห้องเกม public ทั้งหมด
   * GET /game-session/public?page=1&limit=10
   */
  @Get('public/list')
  async getPublicSessions(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10'
  ) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    return this.gameSessionService.getPublicSessions(pageNum, limitNum);
  }

  /**
   * ดึงห้องเกมของผู้เล่น
   * GET /game-session/my-sessions
   */
  @Get('my/sessions')
  async getMySessionions(@Request() req): Promise<SessionResponseDto[]> {
    const playerId = req.user.sub;
    return this.gameSessionService.getPlayerSessions(playerId);
  }

  /**
   * เริ่มเกม (เฉพาะ host)
   * PUT /game-session/:id/start
   */
  @Put(':id/start')
  async startSession(
    @Request() req,
    @Param('id', ParseIntPipe) sessionId: number
  ): Promise<SessionResponseDto> {
    const hostPlayerId = req.user.sub;
    return this.gameSessionService.startSession(hostPlayerId, sessionId);
  }

  /**
   * อัพเดทการตั้งค่าห้องเกม (เฉพาะ host)
   * PUT /game-session/:id/settings
   */
  @Put(':id/settings')
  async updateSettings(
    @Request() req,
    @Param('id', ParseIntPipe) sessionId: number,
    @Body() updateSettingsDto: UpdateSessionSettingsDto
  ): Promise<SessionResponseDto> {
    // TODO: Implement update settings logic
    // ต้องตรวจสอบว่าเป็น host และสามารถอัพเดทได้
    throw new Error('Feature not implemented yet');
  }

  /**
   * Health check สำหรับ game session service
   * GET /game-session/health
   */
  @Get('health/check')
  async healthCheck() {
    return {
      status: 'ok',
      service: 'game-session',
      timestamp: new Date().toISOString(),
      message: 'Game Session service is running'
    };
  }

  /**
   * อัพเดทสถานะความพร้อมของผู้เล่น
   * PUT /game-session/:id/ready
   */
  @Put(':id/ready')
  async updatePlayerReady(
    @Request() req,
    @Param('id', ParseIntPipe) sessionId: number,
    @Body() updateReadyDto: UpdatePlayerReadyDto
  ) {
    const playerId = req.user.sub;
    return this.gameSessionService.updatePlayerReadyStatus(
      sessionId, 
      playerId, 
      updateReadyDto
    );
  }

  /**
   * ดึงสถานะความพร้อมของ session
   * GET /game-session/:id/ready-state
   */
  @Get(':id/ready-state')
  async getSessionReadyState(
    @Param('id', ParseIntPipe) sessionId: number
  ) {
    return this.gameSessionService.getSessionReadyState(sessionId);
  }

  /**
   * เริ่มเกมเมื่อทุกคนพร้อม (เฉพาะ host)
   * POST /game-session/:id/start-when-ready
   */
  @Post(':id/start-when-ready')
  async startGameWhenReady(
    @Request() req,
    @Param('id', ParseIntPipe) sessionId: number
  ) {
    const hostPlayerId = req.user.sub;
    return this.gameSessionService.startGameWhenReady(hostPlayerId, sessionId);
  }

  /**
   * รีเซ็ตสถานะความพร้อมของผู้เล่นทั้งหมด (เฉพาะ host)
   * POST /game-session/:id/reset-ready
   */
  @Post(':id/reset-ready')
  async resetAllPlayersReady(
    @Request() req,
    @Param('id', ParseIntPipe) sessionId: number
  ) {
    const hostPlayerId = req.user.sub;
    return this.gameSessionService.resetAllPlayersReady(hostPlayerId, sessionId);
  }
}
