import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * กลยุทธ์การตรวจสอบ JWT
 * ทำหน้าที่ถอดรหัสและตรวจสอบ Token ที่ส่งมากับทุกคำขอ
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'finix-game-secret-key', // ใช้ fallback
    });
  }

  /**
   * เมื่อ Token ถูกตรวจสอบแล้ว Passport จะเรียกฟังก์ชันนี้
   * @param payload ข้อมูลที่ถูกฝังอยู่ใน Token
   * @returns ข้อมูลผู้ใช้ที่จะถูกแนบไปกับ Request object
   */
  async validate(payload: { sub: number; email: string }) {
    const user = await this.prisma.player.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException();
    }
    // เราไม่ส่งรหัสผ่านกลับไป
    const { password, ...result } = user;
    return result;
  }
}