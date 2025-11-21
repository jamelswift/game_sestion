import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlayerReadyService } from './services/player-ready.service';
import { 
  CreateSessionDto, 
  JoinSessionDto, 
  JoinByCodeDto,
  UpdateSessionSettingsDto,
  SessionResponseDto,
  SessionStatus,
  SessionAccess,
  EconomicStatus,
  GameDuration
} from './dto';
import { UpdatePlayerReadyDto } from './dto/update-player-ready.dto';

@Injectable()
export class GameSessionService {
  constructor(
    private prisma: PrismaService,
    private playerReadyService: PlayerReadyService
  ) {}

  /**
   * สร้างห้องเกมใหม่
   */
  async createSession(hostPlayerId: number, createSessionDto: CreateSessionDto): Promise<SessionResponseDto> {
    // สร้าง session code สำหรับ private rooms
    const sessionCode = createSessionDto.access === SessionAccess.PRIVATE 
      ? createSessionDto.code || this.generateSessionCode()
      : null;

    const session = await this.prisma.gameSession.create({
      data: {
        roomName: createSessionDto.roomName,
        maxPlayers: createSessionDto.maxPlayers,
        duration: createSessionDto.duration || GameDuration.FIVE_YEARS,
        access: createSessionDto.access,
        code: sessionCode,
        status: SessionStatus.WAITING,
        economicStatus: createSessionDto.economicStatus || EconomicStatus.PROSPERITY,
        hostPlayerId,
      },
      include: {
        host: {
          select: { id: true, displayName: true }
        },
        players: {
          include: {
            player: {
              select: { id: true, displayName: true }
            }
          }
        }
      }
    });

    return this.formatSessionResponse(session);
  }

  /**
   * เข้าร่วมห้องเกมด้วย Session ID
   */
  async joinSession(playerId: number, joinSessionDto: JoinSessionDto): Promise<SessionResponseDto> {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: joinSessionDto.sessionId },
      include: {
        host: true,
        players: { include: { player: true } }
      }
    });

    if (!session) {
      throw new NotFoundException('ไม่พบห้องเกมที่ระบุ');
    }

    return this.joinSessionCommon(playerId, session, joinSessionDto.code);
  }

  /**
   * เข้าร่วมห้องเกมด้วย Session Code
   */
  async joinSessionByCode(playerId: number, joinByCodeDto: JoinByCodeDto): Promise<SessionResponseDto> {
    const session = await this.prisma.gameSession.findFirst({
      where: { code: joinByCodeDto.code },
      include: {
        host: true,
        players: { include: { player: true } }
      }
    });

    if (!session) {
      throw new NotFoundException('ไม่พบห้องเกมด้วยรหัสที่ระบุ');
    }

    return this.joinSessionCommon(playerId, session);
  }

  /**
   * Logic ร่วมสำหรับการเข้าร่วมห้องเกม
   */
  private async joinSessionCommon(playerId: number, session: any, code?: string): Promise<SessionResponseDto> {
    // ตรวจสอบสถานะห้อง
    if (session.status !== SessionStatus.WAITING) {
      throw new BadRequestException('ห้องเกมนี้ไม่เปิดรับผู้เล่นแล้ว');
    }

    // ตรวจสอบจำนวนผู้เล่น
    if (session.players.length >= session.maxPlayers) {
      throw new BadRequestException('ห้องเกมเต็มแล้ว');
    }

    // ตรวจสอบผู้เล่นไม่ได้อยู่ในห้องอยู่แล้ว
    const existingPlayer = session.players.find(p => p.playerId === playerId);
    if (existingPlayer) {
      throw new BadRequestException('คุณอยู่ในห้องเกมนี้อยู่แล้ว');
    }

    // ตรวจสอบรหัสห้องสำหรับ private rooms
    if (session.access === SessionAccess.PRIVATE && session.code !== code) {
      throw new ForbiddenException('รหัสห้องไม่ถูกต้อง');
    }

    // เข้าร่วมห้องเกม (ยังไม่ต้องมี career และ goal ในขั้นตอนนี้)
    await this.prisma.playerInSession.create({
      data: {
        playerId,
        sessionId: session.id,
        // ค่าเริ่มต้นชั่วคราว - จะถูกตั้งค่าเมื่อเริ่มเกม
        careerId: 1, // default career
        goalId: 1,   // default goal
        cash: 0,
        savings: 0,
        passiveIncome: 0,
        happinessScore: 50,
        healthScore: 50,
        learningScore: 50,
        relationshipScore: 50,
        boardPosition: 0,
        turnOrder: session.players.length + 1,
      }
    });

    // ดึงข้อมูลห้องเกมใหม่
    const updatedSession = await this.prisma.gameSession.findUnique({
      where: { id: session.id },
      include: {
        host: { select: { id: true, displayName: true } },
        players: {
          include: {
            player: { select: { id: true, displayName: true } }
          }
        }
      }
    });

    return this.formatSessionResponse(updatedSession);
  }

  /**
   * ออกจากห้องเกม
   */
  async leaveSession(playerId: number, sessionId: number): Promise<void> {
    const playerInSession = await this.prisma.playerInSession.findFirst({
      where: {
        playerId,
        sessionId,
      },
      include: { session: true }
    });

    if (!playerInSession) {
      throw new NotFoundException('คุณไม่ได้อยู่ในห้องเกมนี้');
    }

    // ลบผู้เล่นออกจากห้อง
    await this.prisma.playerInSession.delete({
      where: { id: playerInSession.id }
    });

    // ถ้าเป็น host และยังมีผู้เล่นคนอื่นอยู่ ให้ย้าย host
    if (playerInSession.session.hostPlayerId === playerId) {
      const remainingPlayers = await this.prisma.playerInSession.findMany({
        where: { sessionId },
        take: 1
      });

      if (remainingPlayers.length > 0) {
        await this.prisma.gameSession.update({
          where: { id: sessionId },
          data: { hostPlayerId: remainingPlayers[0].playerId }
        });
      } else {
        // ถ้าไม่มีผู้เล่นเหลือ ลบห้องเกม
        await this.prisma.gameSession.delete({
          where: { id: sessionId }
        });
      }
    }
  }

  /**
   * ดึงข้อมูลห้องเกม
   */
  async getSession(sessionId: number): Promise<SessionResponseDto> {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        host: { select: { id: true, displayName: true } },
        players: {
          include: {
            player: { select: { id: true, displayName: true } }
          }
        }
      }
    });

    if (!session) {
      throw new NotFoundException('ไม่พบห้องเกมที่ระบุ');
    }

    return this.formatSessionResponse(session);
  }

  /**
   * ดึงรายการห้องเกมทั้งหมด (สำหรับ public rooms)
   */
  async getPublicSessions(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this.prisma.gameSession.findMany({
        where: {
          access: SessionAccess.PUBLIC,
          status: SessionStatus.WAITING
        },
        include: {
          host: { select: { id: true, displayName: true } },
          players: {
            include: {
              player: { select: { id: true, displayName: true } }
            }
          }
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.gameSession.count({
        where: {
          access: SessionAccess.PUBLIC,
          status: SessionStatus.WAITING
        }
      })
    ]);

    return {
      sessions: sessions.map(session => this.formatSessionResponse(session)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * ดึงห้องเกมของผู้เล่น
   */
  async getPlayerSessions(playerId: number) {
    const sessions = await this.prisma.gameSession.findMany({
      where: {
        OR: [
          { hostPlayerId: playerId },
          { players: { some: { playerId } } }
        ]
      },
      include: {
        host: { select: { id: true, displayName: true } },
        players: {
          include: {
            player: { select: { id: true, displayName: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return sessions.map(session => this.formatSessionResponse(session));
  }

  /**
   * เริ่มเกม
   */
  async startSession(hostPlayerId: number, sessionId: number): Promise<SessionResponseDto> {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { players: true }
    });

    if (!session) {
      throw new NotFoundException('ไม่พบห้องเกมที่ระบุ');
    }

    if (session.hostPlayerId !== hostPlayerId) {
      throw new ForbiddenException('เฉพาะเจ้าของห้องเท่านั้นที่สามารถเริ่มเกมได้');
    }

    if (session.players.length < 2) {
      throw new BadRequestException('ต้องมีผู้เล่นอย่างน้อย 2 คนเพื่อเริ่มเกม');
    }

    if (session.status !== SessionStatus.WAITING) {
      throw new BadRequestException('ไม่สามารถเริ่มเกมได้ในสถานะปัจจุบัน');
    }

    // อัพเดทสถานะเป็น in_progress
    const updatedSession = await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: { 
        status: SessionStatus.IN_PROGRESS,
        currentTurnPlayerId: session.players[0].playerId // เริ่มจากผู้เล่นคนแรก
      },
      include: {
        host: { select: { id: true, displayName: true } },
        players: {
          include: {
            player: { select: { id: true, displayName: true } }
          }
        }
      }
    });

    return this.formatSessionResponse(updatedSession);
  }

  /**
   * สร้างรหัสห้องแบบสุ่ม
   */
  private generateSessionCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // ==================== PLAYER READY METHODS ====================

  /**
   * อัพเดทสถานะความพร้อมของผู้เล่น
   */
  async updatePlayerReadyStatus(
    sessionId: number,
    playerId: number,
    updateReadyDto: UpdatePlayerReadyDto
  ) {
    // หา playerInSessionId
    const playerInSession = await this.prisma.playerInSession.findFirst({
      where: { 
        sessionId,
        playerId
      }
    });

    if (!playerInSession) {
      throw new NotFoundException('ผู้เล่นไม่อยู่ในห้องนี้');
    }

    return this.playerReadyService.updatePlayerReadyStatus(
      sessionId,
      playerInSession.id,
      updateReadyDto.readyStatus,
      {
        careerId: updateReadyDto.selectedCareer,
        goalId: updateReadyDto.selectedGoal
      }
    );
  }

  /**
   * ดึงสถานะความพร้อมของ session
   */
  async getSessionReadyState(sessionId: number) {
    return this.playerReadyService.getSessionReadyState(sessionId);
  }

  /**
   * เริ่มเกมเมื่อทุกคนพร้อม (เฉพาะ host)
   */
  async startGameWhenReady(hostPlayerId: number, sessionId: number) {
    // ตรวจสอบว่าเป็น host
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      throw new NotFoundException('ไม่พบห้องเกม');
    }

    if (session.hostPlayerId !== hostPlayerId) {
      throw new ForbiddenException('เฉพาะ host เท่านั้นที่สามารถเริ่มเกมได้');
    }

    return this.playerReadyService.startGameWhenReady(sessionId, {} as any);
  }

  /**
   * รีเซ็ตสถานะความพร้อมของผู้เล่นทั้งหมด (เฉพาะ host)
   */
  async resetAllPlayersReady(hostPlayerId: number, sessionId: number) {
    // ตรวจสอบว่าเป็น host
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      throw new NotFoundException('ไม่พบห้องเกม');
    }

    if (session.hostPlayerId !== hostPlayerId) {
      throw new ForbiddenException('เฉพาะ host เท่านั้นที่สามารถรีเซ็ตสถานะได้');
    }

    return this.playerReadyService.resetAllPlayersReady(sessionId);
  }

  /**
   * แปลงข้อมูล session ให้เป็นรูปแบบ response
   */
  private formatSessionResponse(session: any): SessionResponseDto {
    return {
      id: session.id,
      roomName: session.roomName,
      maxPlayers: session.maxPlayers,
      currentPlayerCount: session.players.length,
      access: session.access,
      code: session.code,
      status: session.status,
      economicStatus: session.economicStatus,
      createdAt: session.createdAt,
      host: {
        id: session.host.id,
        displayName: session.host.displayName
      },
      players: session.players.map(p => ({
        id: p.player.id,
        displayName: p.player.displayName,
        isReady: false, // จะเพิ่มฟีเจอร์ ready status ในอนาคต
        joinedAt: p.createdAt || new Date()
      }))
    };
  }
}
