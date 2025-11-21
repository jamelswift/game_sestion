import { IsEnum, IsOptional } from 'class-validator';

export enum PlayerReadyStatus {
  NOT_READY = 'not_ready',
  READY = 'ready',
  IN_GAME = 'in_game',
}

export class UpdatePlayerReadyDto {
  @IsEnum(PlayerReadyStatus)
  readyStatus: PlayerReadyStatus;

  @IsOptional()
  selectedCareer?: number; // careerId

  @IsOptional()
  selectedGoal?: number; // goalId
}
