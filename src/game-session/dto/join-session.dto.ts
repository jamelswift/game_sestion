import {
  IsString,
  IsInt,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';

export class JoinSessionDto {
  @IsInt()
  sessionId: number;

  @IsInt()
  playerId: number;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(8)
  code?: string; // สำหรับ private rooms
}

export class JoinByCodeDto {
  @IsString()
  @MinLength(4)
  @MaxLength(8)
  code: string;

  @IsInt()
  playerId: number;
}
