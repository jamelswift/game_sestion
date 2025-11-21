export interface SessionPlayerDto {
  id: number;
  displayName: string;
  isReady: boolean;
  joinedAt: Date;
}

export interface SessionHostDto {
  id: number;
  displayName: string;
}

export interface SessionResponseDto {
  id: number;
  roomName: string;
  maxPlayers: number;
  currentPlayerCount: number;
  access: string;
  code?: string | null;
  status: string;
  economicStatus?: string;
  createdAt: Date;
  host: SessionHostDto;
  players: SessionPlayerDto[];
}
