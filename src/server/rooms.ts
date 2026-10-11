import { randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';
import { type WebSocket } from 'ws';
import {
  COLORS,
  neutral,
  type Input,
  type Player,
  type Race,
  type RoomState,
  type SplitConsentRequest,
  type SerializedWashMatch,
} from '../shared/types';
import { kartPlugin, type GamePlugin } from '../shared/simulation';
import {
  createPowerWashMatch,
  stepPowerWash,
  packDirtGrids,
  type PowerWashMatch,
  type WashInput,
  neutralWashInput,
} from '../shared/powerwash';
import { games } from '../shared/registry';

const inputSchema = z
  .object({
    left: z.boolean(),
    right: z.boolean(),
    gas: z.boolean(),
    brake: z.boolean(),
    drift: z.boolean(),
    item: z.boolean(),
    respawn: z.boolean(),
  })
  .strict();

const washInputSchema = z
  .object({
    moveX: z.number().finite(),
    moveZ: z.number().finite(),
    yaw: z.number().finite(),
    pitch: z.number().finite(),
    spray: z.boolean(),
    nozzle: z.number().int().min(0).max(3),
    highlight: z.boolean(),
  })
  .strict();

const identity = {
  name: z.string().trim().min(1).max(20),
  color: z.enum(COLORS as [string, ...string[]]),
};

export const messageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create'),
    mode: z.enum(['lan', 'online']),
    origin: z.string().url(),
    gameId: z.string().optional(),
  }),
  z.object({
    type: z.literal('join'),
    code: z.string().regex(/^[A-Z2-9]{6}$/),
    ...identity,
    screen: z.boolean().optional(),
    role: z.enum(['player', 'screen', 'controller']).optional(),
    pairWithPlayerId: z.string().optional(),
  }),
  z.object({
    type: z.literal('pair_controller'),
    code: z.string().regex(/^[A-Z2-9]{6}$/),
    playerId: z.string(),
  }),
  z.object({
    type: z.literal('resume'),
    code: z.string(),
    token: z.string().length(48),
  }),
  z.object({
    type: z.literal('keyboard'),
    ...identity,
  }),
  z.object({
    type: z.literal('ready'),
    ready: z.boolean(),
  }),
  z.object({
    type: z.literal('input'),
    input: inputSchema,
  }),
  z.object({
    type: z.literal('wash_input'),
    input: washInputSchema,
  }),
  z.object({
    type: z.literal('split_request'),
    targetPlayerIds: z.array(z.string()).min(1).max(4),
  }),
  z.object({
    type: z.literal('split_response'),
    requestId: z.string(),
    accept: z.boolean(),
  }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('lobby') }),
  z.object({ type: z.literal('game'), id: z.string() }),
  z.object({ type: z.literal('remove'), id: z.string() }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('ping'), sent: z.number().finite() }),
]);

export type Session = {
  token: string;
  role: 'host' | 'player' | 'screen' | 'controller';
  playerId?: string;
  socket: WebSocket | null;
};

export type Room = {
  code: string;
  mode: 'lan' | 'online';
  origin: string;
  sessions: Map<string, Session>;
  players: Player[];
  race: Race | null;
  wash: PowerWashMatch | null;
  gameId: string;
  lastActivity: number;
  hostGone: number | null;
  inputs: Map<string, { value: Input; at: number }>;
  washInputs: Map<string, { value: WashInput; at: number }>;
  splitRequests: SplitConsentRequest[];
  lastSplitRequestAt: Map<string, number>;
};

type Binding = { room: Room; session: Session };

export class RoomManager {
  rooms = new Map<string, Room>();
  bindings = new Map<WebSocket, Binding>();
  plugin: GamePlugin = kartPlugin;

  constructor(public config: { mode: 'lan' | 'online'; origin?: string; ttl?: number }) {}

  send(s: WebSocket, message: unknown) {
    if (s.readyState === 1 && s.bufferedAmount < 256000) {
      s.send(JSON.stringify(message));
    }
  }

  error(s: WebSocket, message: string) {
    this.send(s, { type: 'error', message });
  }

  serializeWash(wash: PowerWashMatch | null): SerializedWashMatch | null {
    if (!wash) return null;
    const { dirtGrids, ...rest } = wash;
    return {
      ...rest,
      packedGrids: packDirtGrids(dirtGrids),
    };
  }

  state(r: Room): RoomState {
    const phase = r.race
      ? r.race.phase
      : r.wash
      ? r.wash.phase
      : 'lobby';

    return {
      code: r.code,
      mode: r.mode,
      gameId: r.gameId,
      phase,
      players: r.players,
      race: r.race,
      wash: this.serializeWash(r.wash),
      joinUrl: `${r.origin}/?join=${r.code}`,
      screenUrl: `${r.origin}/?screen=${r.code}`,
      controllerUrl: `${r.origin}/?controller=${r.code}`,
      hostConnected: [...r.sessions.values()].some(s => s.role === 'host' && s.socket !== null),
      splitRequests: r.splitRequests,
    };
  }

  broadcast(r: Room) {
    const message = { type: 'state', room: this.state(r) };
    for (const s of r.sessions.values()) {
      if (s.socket) this.send(s.socket, message);
    }
  }

  attach(socket: WebSocket, r: Room, s: Session) {
    if (s.socket && s.socket !== socket) {
      this.bindings.delete(s.socket);
      s.socket.close(4001, 'Session resumed elsewhere');
    }
    s.socket = socket;
    this.bindings.set(socket, { room: r, session: s });

    const p = r.players.find(p => p.id === s.playerId);
    if (p) {
      if (s.role === 'controller') {
        p.pairedControllerConnected = true;
      } else {
        p.connected = true;
      }
    }

    const k = r.race?.karts.find(k => k.id === s.playerId);
    if (k) {
      k.connected = true;
      k.disconnectedAt = undefined;
    }

    const wp = r.wash?.players.find(wp => wp.id === s.playerId);
    if (wp) {
      wp.connected = true;
      wp.disconnectedAt = undefined;
    }

    if (s.role === 'host') r.hostGone = null;
    r.lastActivity = Date.now();
    this.send(socket, {
      type: 'session',
      token: s.token,
      code: r.code,
      role: s.role,
      playerId: s.playerId,
    });
    this.broadcast(r);
  }

  session(role: Session['role'], playerId?: string): Session {
    return {
      token: randomBytes(24).toString('hex'),
      role,
      playerId,
      socket: null,
    };
  }

  receive(socket: WebSocket, raw: unknown) {
    const parsed = messageSchema.safeParse(raw);
    if (!parsed.success) {
      this.error(socket, 'Invalid message or room code.');
      return;
    }
    const m = parsed.data;

    if (m.type === 'ping') {
      this.send(socket, { type: 'pong', sent: m.sent });
      return;
    }

    let b = this.bindings.get(socket);

    if (m.type === 'create') {
      if (b) {
        this.error(socket, 'Leave your current room first.');
        return;
      }
      if (this.rooms.size >= 200) {
        this.error(socket, 'Server is full. Try again later.');
        return;
      }
      if (m.mode !== this.config.mode) {
        this.error(
          socket,
          m.mode === 'online'
            ? 'Online hosting is not configured on this LAN server.'
            : 'This server is online. Start the LAN launcher on your computer.'
        );
        return;
      }
      let origin = this.config.origin || m.origin;
      const u = new URL(origin);
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.pathname !== '/' || u.search || u.hash) {
        this.error(socket, 'Invalid join origin.');
        return;
      }
      if (m.mode === 'online' && !this.config.origin && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) {
        this.error(socket, 'Set PUBLIC_ORIGIN on the online server.');
        return;
      }
      origin = u.origin;
      let code = '';
      do {
        code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');
      } while (this.rooms.has(code));

      const gameId = m.gameId && games.some(g => g.id === m.gameId && g.available) ? m.gameId : 'kart-rush';

      const r: Room = {
        code,
        mode: m.mode,
        origin,
        sessions: new Map(),
        players: [],
        race: null,
        wash: null,
        gameId,
        lastActivity: Date.now(),
        hostGone: null,
        inputs: new Map(),
        washInputs: new Map(),
        splitRequests: [],
        lastSplitRequestAt: new Map(),
      };
      this.rooms.set(code, r);
      const s = this.session('host');
      r.sessions.set(s.token, s);
      this.attach(socket, r, s);
      return;
    }

    if (m.type === 'join') {
      if (b) {
        this.error(socket, 'Already joined. Leave before joining another room.');
        return;
      }
      const r = this.rooms.get(m.code);
      if (!r) {
        this.error(socket, 'Room not found. Check the code and server address.');
        return;
      }

      const role = m.role || (m.screen ? 'screen' : 'player');

      if (role === 'screen') {
        if ([...r.sessions.values()].filter(s => s.role === 'screen').length >= 16) {
          this.error(socket, 'Spectator limit reached.');
          return;
        }
        const s = this.session('screen');
        r.sessions.set(s.token, s);
        this.attach(socket, r, s);
        return;
      }

      if (role === 'controller' && m.pairWithPlayerId) {
        // Pairing phone controller to an existing player
        const targetPlayer = r.players.find(p => p.id === m.pairWithPlayerId);
        if (!targetPlayer) {
          this.error(socket, 'Player to pair with not found.');
          return;
        }
        const s = this.session('controller', targetPlayer.id);
        r.sessions.set(s.token, s);
        targetPlayer.pairedControllerConnected = true;
        this.attach(socket, r, s);
        return;
      }

      // Regular player join
      const isGameRunning = Boolean(r.race || r.wash);
      const maxPlayers = r.gameId === 'power-wash' ? 4 : 8;
      if (isGameRunning || r.players.length >= maxPlayers) {
        this.error(
          socket,
          isGameRunning
            ? 'Game has started. Join after the host returns to the lobby.'
            : `Room is full (${maxPlayers} players).`
        );
        return;
      }

      const id = randomBytes(8).toString('hex');
      r.players.push({ id, name: m.name, color: m.color, ready: false, connected: true });
      const s = this.session('player', id);
      r.sessions.set(s.token, s);
      this.attach(socket, r, s);
      return;
    }

    if (m.type === 'pair_controller') {
      const r = this.rooms.get(m.code);
      if (!r) {
        this.error(socket, 'Room not found.');
        return;
      }
      const targetPlayer = r.players.find(p => p.id === m.playerId);
      if (!targetPlayer) {
        this.error(socket, 'Player not found in this room.');
        return;
      }
      if (b) {
        b.session.role = 'controller';
        b.session.playerId = targetPlayer.id;
        targetPlayer.pairedControllerConnected = true;
        this.send(socket, {
          type: 'session',
          token: b.session.token,
          code: r.code,
          role: 'controller',
          playerId: targetPlayer.id,
        });
        this.broadcast(r);
        return;
      }
      const s = this.session('controller', targetPlayer.id);
      r.sessions.set(s.token, s);
      targetPlayer.pairedControllerConnected = true;
      this.attach(socket, r, s);
      return;
    }

    if (m.type === 'resume') {
      if (b) {
        this.error(socket, 'Already connected.');
        return;
      }
      const r = this.rooms.get(m.code),
        s = r?.sessions.get(m.token);
      if (!r || !s) {
        this.error(socket, 'Session expired. Join again from the lobby.');
        return;
      }
      this.attach(socket, r, s);
      return;
    }

    if (!b) {
      this.error(socket, 'Join a room first.');
      return;
    }

    const { room: r, session: s } = b;
    r.lastActivity = Date.now();

    if (m.type === 'leave') {
      this.disconnect(socket, true);
      return;
    }

    // Kart input
    if (m.type === 'input') {
      if (!s.playerId || !r.race || !['racing', 'countdown'].includes(r.race.phase)) return;
      r.inputs.set(s.playerId, { value: m.input, at: Date.now() });
      return;
    }

    // Wash input
    if (m.type === 'wash_input') {
      if (!s.playerId || !r.wash || !['playing', 'countdown'].includes(r.wash.phase)) return;
      r.washInputs.set(s.playerId, { value: m.input, at: Date.now() });
      return;
    }

    // Split-screen consent request
    if (m.type === 'split_request') {
      if (!s.playerId) {
        this.error(socket, 'Only active players can request split screen.');
        return;
      }
      const sender = r.players.find(p => p.id === s.playerId);
      if (!sender) return;

      const lastReq = r.lastSplitRequestAt.get(s.playerId) || 0;
      if (Date.now() - lastReq < 3000) {
        this.error(socket, 'Please wait a moment before sending another split request.');
        return;
      }
      r.lastSplitRequestAt.set(s.playerId, Date.now());

      // Filter valid target player IDs
      const validTargets = m.targetPlayerIds.filter(id => id !== s.playerId && r.players.some(p => p.id === id));
      if (!validTargets.length) return;

      const req: SplitConsentRequest = {
        id: randomBytes(6).toString('hex'),
        fromPlayerId: s.playerId,
        fromName: sender.name,
        targetPlayerIds: validTargets,
        createdAt: Date.now(),
      };

      r.splitRequests.push(req);

      // Notify target players & controllers
      const msg = { type: 'split_request', request: req };
      for (const sess of r.sessions.values()) {
        if (sess.socket && sess.playerId && validTargets.includes(sess.playerId)) {
          this.send(sess.socket, msg);
        }
      }
      this.broadcast(r);
      return;
    }

    // Split-screen consent response (accept/decline)
    if (m.type === 'split_response') {
      if (!s.playerId) return;
      const reqIdx = r.splitRequests.findIndex(rq => rq.id === m.requestId);
      if (reqIdx === -1) return;
      const req = r.splitRequests[reqIdx];

      // Remove request
      r.splitRequests.splice(reqIdx, 1);

      // Broadcast decision to requester and recipients
      const decisionMsg = {
        type: 'split_decision',
        requestId: m.requestId,
        accepted: m.accept,
        fromPlayerId: s.playerId,
      };

      for (const sess of r.sessions.values()) {
        if (sess.socket && (sess.playerId === req.fromPlayerId || sess.playerId === s.playerId)) {
          this.send(sess.socket, decisionMsg);
        }
      }
      this.broadcast(r);
      return;
    }

    if (m.type === 'ready') {
      if (r.race || r.wash) return;
      const p = r.players.find(p => p.id === s.playerId);
      if (p) p.ready = m.ready;
      this.broadcast(r);
      return;
    }

    // Host actions
    if (s.role !== 'host') {
      this.error(socket, 'Only the host can do that.');
      return;
    }

    if (m.type === 'keyboard') {
      const isGameRunning = Boolean(r.race || r.wash);
      const maxPlayers = r.gameId === 'power-wash' ? 4 : 8;
      if (isGameRunning || r.players.length >= maxPlayers || s.playerId) {
        this.error(socket, 'Keyboard driver unavailable.');
        return;
      }
      s.playerId = randomBytes(8).toString('hex');
      r.players.push({ id: s.playerId, name: m.name, color: m.color, ready: true, connected: true });
      this.send(socket, {
        type: 'session',
        token: s.token,
        code: r.code,
        role: s.role,
        playerId: s.playerId,
      });
    }

    if (m.type === 'start') {
      if (r.race || r.wash || !r.players.length || r.players.some(p => !p.ready || !p.connected)) {
        this.error(socket, 'Every driver must be connected and ready. Add at least one driver.');
        return;
      }

      if (r.gameId === 'power-wash') {
        r.wash = createPowerWashMatch(r.players);
        r.race = null;
        r.washInputs.clear();
      } else {
        r.race = this.plugin.start(r.players);
        r.wash = null;
        r.inputs.clear();
      }
    }

    if (m.type === 'pause') {
      if (r.race) this.plugin.pause(r.race);
      if (r.wash) {
        if (r.wash.phase === 'paused') {
          r.wash.phase = r.wash.pausedFrom || 'playing';
        } else if (r.wash.phase === 'playing' || r.wash.phase === 'countdown') {
          r.wash.pausedFrom = r.wash.phase;
          r.wash.phase = 'paused';
        }
      }
    }

    if (m.type === 'lobby') {
      if (r.race) this.plugin.cleanup(r.race);
      r.race = null;
      r.wash = null;
      r.inputs.clear();
      r.washInputs.clear();
      r.splitRequests.length = 0;
      for (const p of r.players) p.ready = p.id === s.playerId;
    }

    if (m.type === 'remove' && !r.race && !r.wash) {
      r.players = r.players.filter(p => p.id !== m.id);
      for (const [token, other] of r.sessions) {
        if (other.playerId === m.id) {
          if (other === s) {
            s.playerId = undefined;
            this.send(socket, { type: 'session', token: s.token, code: r.code, role: s.role });
          } else {
            if (other.socket) {
              this.bindings.delete(other.socket);
              this.error(other.socket, 'Host removed your driver.');
              other.socket.close(4002);
            }
            r.sessions.delete(token);
          }
        }
      }
      r.inputs.delete(m.id);
      r.washInputs.delete(m.id);
    }

    if (m.type === 'game' && !r.race && !r.wash) {
      const g = games.find(g => g.id === m.id);
      if (!g?.available) {
        this.error(socket, 'This game is not playable yet.');
        return;
      }
      r.gameId = g.id;
    }

    this.broadcast(r);
  }

  disconnect(socket: WebSocket, permanent = false) {
    const b = this.bindings.get(socket);
    if (!b) return;
    this.bindings.delete(socket);
    const { room: r, session: s } = b;
    s.socket = null;
    if (s.role === 'host') r.hostGone = Date.now();

    const p = r.players.find(p => p.id === s.playerId);
    if (p) {
      if (s.role === 'controller') {
        p.pairedControllerConnected = false;
      } else {
        p.connected = false;
        p.ready = false;
      }
      r.inputs.delete(p.id);
      r.washInputs.delete(p.id);
      if (r.race) this.plugin.disconnect(r.race, p.id);
      if (r.wash) {
        const wp = r.wash.players.find(w => w.id === p.id);
        if (wp) {
          wp.connected = false;
          wp.spraying = false;
          wp.disconnectedAt = r.wash.time;
        }
      }
    }

    if (permanent) {
      r.sessions.delete(s.token);
      if (!r.race && !r.wash) r.players = r.players.filter(p => p.id !== s.playerId);
      this.send(socket, { type: 'error', message: 'You left the room.' });
    }
    this.broadcast(r);
  }

  tick(dt: number, now = Date.now()) {
    for (const r of this.rooms.values()) {
      if (r.race) {
        const inputs = new Map<string, Input>();
        for (const [id, v] of r.inputs) {
          if (now - v.at < 350) inputs.set(id, v.value);
        }
        this.plugin.update(r.race, inputs, dt);
        if (r.race.phase !== 'results' && r.race.phase !== 'paused') r.lastActivity = now;
      }

      if (r.wash) {
        const washInputs = new Map<string, WashInput>();
        for (const [id, v] of r.washInputs) {
          if (now - v.at < 450) washInputs.set(id, v.value);
        }
        stepPowerWash(r.wash, washInputs, dt);
        if (r.wash.phase !== 'results' && r.wash.phase !== 'paused') r.lastActivity = now;
      }

      // Expire stale split requests older than 15s
      if (r.splitRequests.length) {
        r.splitRequests = r.splitRequests.filter(req => now - req.createdAt < 15000);
      }
    }
  }

  cleanup(now = Date.now()) {
    for (const [code, r] of this.rooms) {
      if (
        now - r.lastActivity > (this.config.ttl ?? 1800000) ||
        (r.hostGone !== null && now - r.hostGone > 300000)
      ) {
        for (const s of r.sessions.values()) {
          if (s.socket) {
            this.bindings.delete(s.socket);
            this.error(s.socket, 'Room expired. Create a new room.');
            s.socket.close(4003);
          }
        }
        if (r.race) this.plugin.cleanup(r.race);
        this.rooms.delete(code);
      }
    }
  }
}
