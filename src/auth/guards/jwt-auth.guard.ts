import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT Authentication Guard สำหรับป้องกันเส้นทาง
 * ใช้ตรวจสอบ JWT token ใน Authorization header
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  
  /**
   * ตรวจสอบว่า request มี JWT token ที่ถูกต้องหรือไม่
   * @param context ExecutionContext ของ request
   * @returns Promise<boolean> true ถ้า token ถูกต้อง
   */
  canActivate(context: ExecutionContext) {
    // เรียกใช้ JWT strategy ที่เราสร้างไว้
    return super.canActivate(context);
  }

  /**
   * จัดการ request ที่ผ่านการตรวจสอบแล้ว
   * @param err ข้อผิดพลาด (ถ้ามี)
   * @param user ข้อมูลผู้ใช้จาก JWT token
   * @param info ข้อมูลเพิ่มเติม
   * @returns ข้อมูลผู้ใช้ที่จะถูกแนบไปกับ req.user
   */
  handleRequest(err: any, user: any, info: any) {
    // ถ้ามี error หรือไม่มี user จะ throw UnauthorizedException
    if (err || !user) {
      throw err || new Error('Unauthorized');
    }
    return user;
  }
}