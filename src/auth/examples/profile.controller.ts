import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

/**
 * ตัวอย่าง Controller ที่ใช้ JWT Authentication
 * แสดงวิธีการป้องกันเส้นทางด้วย JWT token
 */
@Controller('profile')
export class ProfileController {

  /**
   * ดึงข้อมูลโปรไฟล์ของผู้ใช้ที่เข้าสู่ระบบ
   * ต้องมี JWT token ใน Authorization header
   * @param req Request object ที่มี user data จาก JWT
   * @returns ข้อมูลผู้ใช้
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  getProfile(@Request() req) {
    // req.user จะมีข้อมูลผู้ใช้จาก JWT token
    return {
      message: 'ข้อมูลโปรไฟล์ของคุณ',
      user: req.user,
    };
  }

  /**
   * ตัวอย่าง endpoint ที่ต้องการ authentication
   * @param req Request object ที่มี user data
   * @returns ข้อมูลเกม
   */
  @UseGuards(JwtAuthGuard)
  @Get('game-data')
  getGameData(@Request() req) {
    return {
      message: 'ข้อมูลเกมของผู้เล่น',
      playerId: req.user.id,
      playerName: req.user.displayName,
      // ที่นี่สามารถเรียกใช้ service อื่นๆ เพื่อดึงข้อมูลเกมได้
    };
  }
}