import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { GameSessionService } from './game-session.service';

interface AuthenticatedSocket extends Socket {
  userId?: number;
  sessionId?: number;
}

@WebSocketGateway({
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : false)
      : "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  namespace: '/game-session'
})
export class GameSessionGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameSessionGateway.name);
  private connectedClients = new Map<string, AuthenticatedSocket>();

  constructor(
    private readonly gameSessionService: GameSessionService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit(server: Server) {
    this.logger.log(' WebSocket Gateway initialized for Game Sessions');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // ดึง JWT token จาก query หรือ handshake auth
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      
      if (!token) {
        this.logger.warn(` Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      // ตรวจสอบ JWT token
      const payload = this.jwtService.verify(token);
      client.userId = payload.sub;

      this.connectedClients.set(client.id, client);
      this.logger.log(` User ${client.userId} connected (${client.id})`);

      // ส่งข้อความต้อนรับ
      client.emit('connected', {
        message: 'เชื่อมต่อเซิร์ฟเวอร์สำเร็จ',
        userId: client.userId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error(`❌ Authentication failed for client ${client.id}:`, error.message);
      client.emit('error', { message: 'การยืนยันตัวตนล้มเหลว' });
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.connectedClients.delete(client.id);
    
    if (client.sessionId) {
      // แจ้งผู้เล่นในห้องว่ามีคนออก
      client.to(`session-${client.sessionId}`).emit('player-disconnected', {
        userId: client.userId,
        timestamp: new Date().toISOString()
      });
    }

    this.logger.log(`👋 User ${client.userId} disconnected (${client.id})`);
  }

  /**
   * เข้าร่วม Room สำหรับ Session
   */
  @SubscribeMessage('join-session-room')
  async handleJoinSessionRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { sessionId: number }
  ) {
    try {
      // ตรวจสอบว่าผู้เล่นอยู่ในห้องเกมนี้หรือไม่
      const session = await this.gameSessionService.getSession(data.sessionId);
      const isPlayerInSession = session.players.some(p => p.id === client.userId) || 
                                session.host.id === client.userId;

      if (!isPlayerInSession) {
        client.emit('error', { message: 'คุณไม่ได้อยู่ในห้องเกมนี้' });
        return;
      }

      // ออกจาก session room เก่า (ถ้ามี)
      if (client.sessionId) {
        client.leave(`session-${client.sessionId}`);
      }

      // เข้าร่วม session room ใหม่
      client.sessionId = data.sessionId;
      client.join(`session-${data.sessionId}`);

      // แจ้งผู้เล่นในห้องว่ามีคนเข้ามา
      client.to(`session-${data.sessionId}`).emit('player-connected', {
        userId: client.userId,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString()
      });

      // ส่งข้อมูลห้องปัจจุบันให้ผู้เล่น
      client.emit('session-joined', {
        sessionId: data.sessionId,
        session: session,
        message: 'เข้าร่วมห้องเกมสำเร็จ'
      });

      this.logger.log(`👥 User ${client.userId} joined session room ${data.sessionId}`);

    } catch (error) {
      this.logger.error('Error joining session room:', error);
      client.emit('error', { message: 'ไม่สามารถเข้าร่วมห้องเกมได้' });
    }
  }

  /**
   * ออกจาก Session Room
   */
  @SubscribeMessage('leave-session-room')
  async handleLeaveSessionRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { sessionId: number }
  ) {
    try {
      if (client.sessionId === data.sessionId) {
        client.leave(`session-${data.sessionId}`);
        client.sessionId = undefined;

        // แจ้งผู้เล่นในห้องว่ามีคนออก
        client.to(`session-${data.sessionId}`).emit('player-left-room', {
          userId: client.userId,
          sessionId: data.sessionId,
          timestamp: new Date().toISOString()
        });

        client.emit('session-left', {
          sessionId: data.sessionId,
          message: 'ออกจากห้องเกมแล้ว'
        });

        this.logger.log(` User ${client.userId} left session room ${data.sessionId}`);
      }
    } catch (error) {
      this.logger.error('Error leaving session room:', error);
      client.emit('error', { message: 'ไม่สามารถออกจากห้องเกมได้' });
    }
  }

  /**
   * อัพเดทสถานะความพร้อม
   */
  @SubscribeMessage('player-ready')
  async handlePlayerReady(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { sessionId: number, isReady: boolean }
  ) {
    try {
      // TODO: อัพเดทสถานะ ready ในฐานข้อมูล
      
      // แจ้งผู้เล่นอื่นในห้อง
      client.to(`session-${data.sessionId}`).emit('player-ready-updated', {
        userId: client.userId,
        sessionId: data.sessionId,
        isReady: data.isReady,
        timestamp: new Date().toISOString()
      });

      client.emit('ready-status-updated', {
        isReady: data.isReady,
        message: data.isReady ? 'คุณพร้อมแล้ว' : 'คุณยังไม่พร้อม'
      });

      this.logger.log(`🎮 User ${client.userId} ready status: ${data.isReady} in session ${data.sessionId}`);

    } catch (error) {
      this.logger.error('Error updating ready status:', error);
      client.emit('error', { message: 'ไม่สามารถอัพเดทสถานะได้' });
    }
  }

  /**
   * ส่งข้อความแชทในห้อง
   */
  @SubscribeMessage('session-chat')
  async handleSessionChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { sessionId: number, message: string }
  ) {
    try {
      if (!client.sessionId || client.sessionId !== data.sessionId) {
        client.emit('error', { message: 'คุณไม่ได้อยู่ในห้องเกมนี้' });
        return;
      }

      const chatMessage = {
        userId: client.userId,
        sessionId: data.sessionId,
        message: data.message,
        timestamp: new Date().toISOString()
      };

      // ส่งข้อความให้ทุกคนในห้อง (รวมตัวเอง)
      this.server.to(`session-${data.sessionId}`).emit('session-chat-message', chatMessage);

      this.logger.log(`💬 Chat message from user ${client.userId} in session ${data.sessionId}`);

    } catch (error) {
      this.logger.error('Error sending chat message:', error);
      client.emit('error', { message: 'ไม่สามารถส่งข้อความได้' });
    }
  }

  /**
   * Broadcast ข้อมูลอัพเดทให้ทุกคนในห้อง
   */
  async broadcastSessionUpdate(sessionId: number, updateData: any) {
    try {
      this.server.to(`session-${sessionId}`).emit('session-updated', {
        sessionId,
        ...updateData,
        timestamp: new Date().toISOString()
      });
      
      this.logger.log(`📡 Broadcasted session update for session ${sessionId}`);
    } catch (error) {
      this.logger.error('Error broadcasting session update:', error);
    }
  }

  /**
   * แจ้งเมื่อเกมเริ่ม
   */
  async broadcastGameStart(sessionId: number, gameData: any) {
    try {
      this.server.to(`session-${sessionId}`).emit('game-started', {
        sessionId,
        gameData,
        message: 'เกมเริ่มแล้ว!',
        timestamp: new Date().toISOString()
      });
      
      this.logger.log(`🎮 Broadcasted game start for session ${sessionId}`);
    } catch (error) {
      this.logger.error('Error broadcasting game start:', error);
    }
  }

  /**
   * ดึงจำนวนผู้เล่นออนไลน์ในห้อง
   */
  @SubscribeMessage('get-online-players')
  async handleGetOnlinePlayers(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { sessionId: number }
  ) {
    try {
      const room = this.server.sockets.adapter.rooms.get(`session-${data.sessionId}`);
      const onlineCount = room ? room.size : 0;

      client.emit('online-players-count', {
        sessionId: data.sessionId,
        onlineCount,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Error getting online players:', error);
      client.emit('error', { message: 'ไม่สามารถดึงข้อมูลผู้เล่นออนไลน์ได้' });
    }
  }
}