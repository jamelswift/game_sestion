import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors();

  await app.listen(3000, '0.0.0.0');
  console.log('🚀 Full Finix Game Server running on http://localhost:3000');
  console.log('🎮 Available modules:');
  console.log('  🔑 Authentication: /auth/*');
  console.log('  🎯 Game Sessions: /game-session/*');
  console.log('  🏥 Health Check: /health');
  console.log('  👤 Profile: /profile/*');
}
bootstrap();