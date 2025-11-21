import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  MaxLength,
  MinLength,
  Min,
  Max,
} from 'class-validator';

export enum SessionAccess {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

export enum SessionStatus {
  WAITING = 'waiting',
  IN_PROGRESS = 'in_progress',
  FINISHED = 'finished',
}

export enum EconomicStatus {
  PROSPERITY = 'prosperity',
  RECESSION = 'recession',
  NORMAL = 'normal',
}

export enum GameDuration {
  FIVE_YEARS = '5 years',
  TEN_YEARS = '10 years',
  UNLIMITED = 'No Limit',
}

export class CreateSessionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  roomName: string;

  @IsInt()
  @Min(2)
  @Max(6)
  maxPlayers: number;

  @IsEnum(SessionAccess)
  access: SessionAccess;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(8)
  code?: string;

  @IsEnum(EconomicStatus)
  @IsOptional()
  economicStatus?: EconomicStatus = EconomicStatus.PROSPERITY;

  @IsEnum(GameDuration)
  @IsOptional()
  duration?: GameDuration = GameDuration.FIVE_YEARS;

  @IsInt()
  hostPlayerId: number; // ✔ ต้องมีแน่นอนตาม schema.prisma
}
