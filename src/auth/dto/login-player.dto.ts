import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO สำหรับการเข้าสู่ระบบ
 */
export class LoginPlayerDto {
  @IsEmail({}, { message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  @IsNotEmpty({ message: 'กรุณากรอกอีเมล' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกรหัสผ่าน' })
  password: string;
} 