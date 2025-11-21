import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // เปิด CORS สำหรับ Frontend - รองรับ production และ development
  const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [
        'http://localhost:5173',         // Vite dev server
        'http://localhost:3000',         // Alternative local port
        'https://zippy-sawine-c0cab2.netlify.app', // Netlify production domain
        'https://finix-game.netlify.app' // Potential custom domain
      ];

  app.enableCors({
    origin: process.env.NODE_ENV === 'production' ? allowedOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });
  
  // เพิ่ม global prefix (ถ้าต้องการ)
  // app.setGlobalPrefix('api');
  
  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Full Finix Game Server running on port ${port}`);
  console.log(`🎮 Available modules:`);
  console.log(`  🔑 Authentication: /auth/*`);
  console.log(`  🎯 Game Sessions: /game-session/*`);
  console.log(`  🏥 Health Check: /health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Allowed origins: ${allowedOrigins.join(', ')}`);
}
bootstrap();
