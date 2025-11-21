import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * DTO (Data Transfer Object) สำหรับการสมัครสมาชิก
 * กำหนดโครงสร้างและกฎของข้อมูลที่รับเข้ามา
 */
export class RegisterPlayerDto {
  @IsEmail({}, { message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  @IsNotEmpty({ message: 'กรุณากรอกอีเมล' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกรหัสผ่าน' })
  @MinLength(6, { message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกชื่อที่ใช้แสดง' })
  displayName: string;
}