import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginPlayerDto } from './dto/login-player.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * LOGIN WORKFLOW
   * Step 4–6:
   *  - หา user จากอีเมล
   *  - ตรวจสอบรหัสผ่าน
   *  - ออก Token
   *  - return token + user
   */
  async login(loginDto: LoginPlayerDto) {
    const { email, password } = loginDto;

    // Step 6.1: หา user จากอีเมล
    const user = await this.prisma.player.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    // Step 6.2: ตรวจสอบรหัสผ่าน
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    // Step 6.3: ออก Token
    const token = await this.generateToken(user.id, user.email);

    const { password: _, ...userWithoutPassword } = user;

    // Step 6.4: ส่ง token + user กลับไป
    return {
      message: 'เข้าสู่ระบบสำเร็จ',
      user: userWithoutPassword,
      token,
    };
  }

  /**
   * JWT Token Generator
   */
  private async generateToken(userId: number, email: string) {
    const payload = {
      sub: userId,
      email,
      iat: Math.floor(Date.now() / 1000),
    };

    return this.jwtService.signAsync(payload);
  }

  /**
   * สำหรับ Step 10:
   * ตรวจสอบผู้ใช้ในฐานข้อมูลเมื่อ JwtStrategy ถอด Token สำเร็จ
   */
  async validateUser(userId: number) {
    const user = await this.prisma.player.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
      }
    });

    if (!user) {
      throw new UnauthorizedException('ผู้ใช้ไม่มีอยู่ในระบบ');
    }

    return user;
  }
}