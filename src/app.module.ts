import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileController } from './auth/examples/profile.controller';
import { GameSessionModule } from './game-session/game-session.module';

@Module({
  imports: [
    PrismaModule, // ฐานข้อมูล PostgreSQL
    AuthModule,   // ระบบ Authentication
    GameSessionModule, // ระบบ Game Session Management
  ],
  controllers: [
    HealthController,
    ProfileController, // ตัวอย่าง protected endpoints
  ],
  providers: [],
})
export class AppModule {}
