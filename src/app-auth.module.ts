import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileController } from './auth/examples/profile.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  controllers: [
    HealthController,
    ProfileController,
  ],
  providers: [],
})
export class AppModuleAuth {}