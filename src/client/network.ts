import { SERVER_ORIGIN } from './config';
import { useEffect, useRef, useState } from 'react';
import {
  type Input,
  type RoomState,
  type ServerMessage,
  type SessionRole,
  type SplitConsentRequest,
  neutral,
} from '../shared/types';
import { type WashInput, neutralWashInput } from '../shared/powerwash';

export type Session = {
  token: string;
  code: string;
  role: SessionRole;
  playerId?: string;
  pairedPlayerId?: string;
};

export function useNetwork() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState('Connecting');
  const [error, setError] = useState('');
  const [latency, setLatency] = useState(0);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [splitDecision, setSplitDecision] = useState<{
    requestId: string;
    accepted: boolean;
    fromPlayerId: string;
  } | null>(null);

  const ws = useRef<WebSocket | null>(null);
  const saved = useRef<Session | null>(null);
  const pending = useRef<unknown>(null);
  const input = useRef<Input>(neutral());
  const washInput = useRef<WashInput>(neutralWashInput());
  const hasWashInput = useRef(false);
  const samples = useRef<{ room: RoomState; at: number }[]>([]);
  const currentRoom=useRef<RoomState|null>(null);

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout>;
    let connectionTimeout: ReturnType<typeof setTimeout>;
    let failures = 0;
    let probe: AbortController | undefined;

    let retryDelay = 1500;

    try {
      saved.current = JSON.parse(sessionStorage.getItem('rush-session') || 'null');
    } catch {}

    function unavailable(message = 'The multiplayer server is unavailable. Please try again later.') {
      if (disposed) return;
      setStatus('Server unavailable');
      setError(message);
    }

    async function connect() {
      if (disposed) return;
      setStatus('Connecting');
      probe = new AbortController();
      // The same-origin health route is also reachable when the remote service
      // has expired and its response no longer supplies CORS headers.
      const currentProbe = probe;
      const probeTimeout = setTimeout(() => currentProbe.abort(), 4000);
      try {
        const health = await fetch('/health', {signal: currentProbe.signal, cache:'no-store'});
        if (health.status === 410) {
          unavailable('The multiplayer server has stopped. Rooms cannot be created or joined until hosting is restored.');
          return;
        }
      } catch {
        // A failed health probe is not proof that WebSockets are unavailable.
      } finally {clearTimeout(probeTimeout);}
      if (disposed) return;
      const endpoint = new URL(SERVER_ORIGIN || location.origin);
      const socket = new WebSocket(`${endpoint.protocol === 'https:' ? 'wss' : 'ws'}://${endpoint.host}/ws`);
      ws.current = socket;
      connectionTimeout = setTimeout(() => socket.close(), 8000);

      socket.onopen = () => {
        clearTimeout(connectionTimeout);
        failures = 0;
        retryDelay = 1500;
        setStatus('Connected');
        setError('');
        if (saved.current) {
          socket.send(JSON.stringify({ ...saved.current, type: 'resume' }));
        } else if (pending.current) {
          socket.send(JSON.stringify(pending.current));
          pending.current = null;
        }
      };

      socket.onmessage = e => {
        const m: ServerMessage = JSON.parse(e.data);
        if (m.type === 'session') {
          saved.current = {
            token: m.token,
            code: m.code,
            role: m.role,
            playerId: m.playerId,
            pairedPlayerId: m.pairedPlayerId,
          };
          sessionStorage.setItem('rush-session', JSON.stringify(saved.current));
          setSession(saved.current);
          setError('');
        }
        if (m.type === 'state') {
          if(m.room.wash&&!currentRoom.current?.wash){const player=m.room.wash.players.find(player=>player.id===saved.current?.playerId);if(player)washInput.current={...neutralWashInput(),yaw:player.yaw,pitch:player.pitch};}
          currentRoom.current=m.room;
          setRoom(m.room);
          samples.current.push({ room: m.room, at: performance.now() });
          if (samples.current.length > 4) samples.current.shift();
        }
        if (m.type === 'pong') {
          setLatency(Math.round(performance.now() - m.sent));
        }
        if (m.type === 'split_decision') {
          setSplitDecision({
            requestId: m.requestId,
            accepted: m.accepted,
            fromPlayerId: m.fromPlayerId,
          });
        }
        if (m.type === 'error') {
          setError(m.message);
          if (/expired|removed|left/.test(m.message)) {
            saved.current = null;
            sessionStorage.removeItem('rush-session');
            setSession(null);
            setRoom(null);
          }
        }
      };

      socket.onclose = e => {
        clearTimeout(connectionTimeout);
        if (disposed) return;
        input.current = neutral();
        hasWashInput.current = false;
        setStatus(e.code === 4001 ? 'Session opened elsewhere' : 'Reconnecting');
        if (e.code === 4001) return;
        if (++failures >= 3) {unavailable();return;}
        retry = setTimeout(connect, retryDelay);
        retryDelay = Math.min(8000, Math.round(retryDelay * 1.5));
      };

      socket.onerror = () => setStatus('Server unreachable');
    }

    connect();

    const heartbeat = setInterval(() => {
      if (ws.current?.readyState === 1) {
        ws.current.send(JSON.stringify({ type: 'ping', sent: performance.now() }));
      }
    }, 1000);
    let lastInputSent=0,lastInputPayload='';
    const inputSender=setInterval(()=>{
      if(ws.current?.readyState===1){
        if (saved.current?.playerId) {
          let message:unknown;
          if (hasWashInput.current && currentRoom.current?.wash) {
            message={type:'wash_input',input:washInput.current};
          } else if (currentRoom.current?.race) {
            message={type:'input',input:input.current};
          }
          if(message){const payload=JSON.stringify(message),now=performance.now();if(payload!==lastInputPayload||now-lastInputSent>=100){ws.current.send(payload);lastInputPayload=payload;lastInputSent=now;}}
        }
      }
    }, 33);

    return () => {
      disposed = true;
      clearTimeout(retry);
      clearTimeout(connectionTimeout);
      probe?.abort();
      clearInterval(heartbeat);
      clearInterval(inputSender);
      ws.current?.close();
    };
  }, [connectionAttempt]);

  const send = (message: unknown) => {
    if (status === 'Server unavailable') return;
    setError('');
    if (ws.current?.readyState === 1) {
      ws.current.send(JSON.stringify(message));
    } else {
      pending.current = message;
      setError('Waiting for the server connection…');
    }
  };

  const setInput = (value: Input) => {
    hasWashInput.current = false;
    input.current = {...value};
  };

  const setWashInput = (value: WashInput) => {
    hasWashInput.current = true;
    washInput.current = {...value};
  };

  const requestSplit = (targetPlayerIds: string[]) => {
    send({ type: 'split_request', targetPlayerIds });
  };

  const respondSplit = (requestId: string, accept: boolean) => {
    send({ type: 'split_response', requestId, accept });
  };

  const leave = () => {
    send({ type: 'leave'});
    saved.current = null;
    sessionStorage.removeItem('rush-session');
    setSession(null);
    setRoom(null);
    input.current = neutral();
    hasWashInput.current = false;
    samples.current = [];
    currentRoom.current=null;
  };

  return {
    room,
    session,
    status,
    error,
    latency,
    send,
    setInput,
    setWashInput,
    requestSplit,
    respondSplit,
    splitDecision,
    leave,
    samples,
    reconnect: () => {setError('');setConnectionAttempt(n => n + 1);},
  };
}
