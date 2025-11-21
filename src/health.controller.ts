import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'OK',
      message: 'Finix Game Backend is running!',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  @Get('health')
  getHealthCheck() {
    return {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}