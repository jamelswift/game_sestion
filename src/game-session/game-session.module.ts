import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GameSessionController } from './game-session.controller';
import { GameSessionService } from './game-session.service';
import { GameSessionGateway } from './game-session.gateway';
import { PlayerReadyService } from './services/player-ready.service';
import { GameStateService } from './services/game-state.service';
import { TurnManagementService } from './services/turn-management.service';
import { SessionGameplayIntegrationService } from './services/session-gameplay-integration.service';
import { GameFlowService } from './services/game-flow.service';
import { PrismaModule } from '../prisma/prisma.module';
// import { GameplayModule } from '../gameplay/gameplay.module'; // Temporarily disabled

@Module({
  imports: [
    PrismaModule,
    // GameplayModule, // Temporarily disabled
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'finix-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [GameSessionController],
  providers: [
    GameSessionService, 
    GameSessionGateway,
    PlayerReadyService,
    GameStateService,
    TurnManagementService,
    SessionGameplayIntegrationService,
    GameFlowService
  ],
  exports: [
    GameSessionService, 
    GameSessionGateway,
    PlayerReadyService,
    GameStateService,
    TurnManagementService,
    SessionGameplayIntegrationService,
    GameFlowService
  ],
})
export class GameSessionModule {}
