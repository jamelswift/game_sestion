import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,

    // ใช้ JWT Strategy เป็น default
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // JWT Config
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'finix-game-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
  ],
  exports: [
    AuthService,
  ],
})
export class AuthModule {}