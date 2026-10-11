import { type PowerWashMatch, type WashInput } from './powerwash';

export const COLORS = ['#bef264', '#ff6b6b', '#60a5fa', '#c084fc', '#fbbf24', '#2dd4bf', '#fb923c', '#f472b6'];

export type Input = {
  left: boolean;
  right: boolean;
  gas: boolean;
  brake: boolean;
  drift: boolean;
  item: boolean;
  respawn: boolean;
};

export const neutral = (): Input => ({
  left: false,
  right: false,
  gas: false,
  brake: false,
  drift: false,
  item: false,
  respawn: false,
});

export type Item = 'boost' | 'shield' | 'pulse';

export type Kart = {
  id: string;
  name: string;
  color: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  vx: number;
  vz: number;
  lap: number;
  next: number;
  progress: number;
  finished: number | null;
  connected: boolean;
  disconnectedAt?: number;
  item: Item | null;
  boost: number;
  shield: number;
  slow: number;
  respawnAt: number;
  itemHeld: boolean;
  respawnHeld: boolean;
  impact: number;
};

export type Race = {
  phase: 'countdown' | 'racing' | 'paused' | 'results';
  time: number;
  countdown: number;
  karts: Kart[];
  pickups: { theta: number; availableAt: number }[];
  finishOrder: string[];
  pausedFrom?: 'countdown' | 'racing';
};

export type Player = {
  id: string;
  name: string;
  color: string;
  ready: boolean;
  connected: boolean;
  pairedControllerConnected?: boolean;
};

export type SplitConsentRequest = {
  id: string;
  fromPlayerId: string;
  fromName: string;
  targetPlayerIds: string[];
  createdAt: number;
};

export type SerializedWashMatch = Omit<PowerWashMatch, 'dirtGrids'> & {
  packedGrids?: Record<string, number[]>;
};

export type RoomPhase = 'lobby' | 'countdown' | 'racing' | 'playing' | 'paused' | 'results';

export type RoomState = {
  code: string;
  mode: 'lan' | 'online';
  gameId: string;
  phase: RoomPhase;
  players: Player[];
  race: Race | null;
  wash: SerializedWashMatch | null;
  joinUrl: string;
  screenUrl: string;
  controllerUrl: string;
  hostConnected: boolean;
  splitRequests: SplitConsentRequest[];
};

export type SessionRole = 'host' | 'player' | 'screen' | 'controller';

export type ServerMessage =
  | {
      type: 'session';
      token: string;
      role: SessionRole;
      playerId?: string;
      code: string;
      pairedPlayerId?: string;
    }
  | { type: 'state'; room: RoomState }
  | { type: 'error'; message: string }
  | { type: 'pong'; sent: number }
  | { type: 'split_request'; request: SplitConsentRequest }
  | { type: 'split_decision'; requestId: string; accepted: boolean; fromPlayerId: string };
