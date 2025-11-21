import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginPlayerDto } from './dto/login-player.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * LOGIN ONLY
   * user ต้องมีอยู่ในระบบอยู่แล้ว (สร้างจาก admin)
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginPlayerDto) {
    return this.authService.login(loginDto);
  }

  /**
   * PROFILE (Protected)
   * ใช้ทดสอบ Token ถูกต้องหรือไม่
   */
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return {
      message: 'User profile fetched successfully',
      user: req.user,
    };
  }
}