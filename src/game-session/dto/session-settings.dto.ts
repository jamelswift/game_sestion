import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import {
  SessionAccess,
  EconomicStatus,
  GameDuration,
} from './create-session.dto';

export class UpdateSessionSettingsDto {
  @IsOptional()
  @IsString()
  roomName?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(6)
  maxPlayers?: number;

  @IsOptional()
  @IsEnum(SessionAccess)
  access?: SessionAccess;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(EconomicStatus)
  economicStatus?: EconomicStatus;

  @IsOptional()
  @IsEnum(GameDuration)
  duration?: GameDuration;
}
