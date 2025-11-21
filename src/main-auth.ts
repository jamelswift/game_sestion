import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModuleAuth } from './app-auth.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModuleAuth);
  
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors();

  await app.listen(3000, '0.0.0.0');
  console.log('🚀 Authentication Server running on http://localhost:3000');
  console.log('🔑 Available endpoints:');
  console.log('  POST /auth/register - Register new user');
  console.log('  POST /auth/login - Login user');
  console.log('  GET /profile - Get user profile (protected)');
  console.log('  GET /health - Health check');
}
bootstrap();