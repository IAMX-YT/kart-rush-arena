import { SERVER_ORIGIN } from './config';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import { useNetwork } from './network';
import { HeroKart, HeroWasher } from './visuals';
import { games } from '../shared/registry';
import { COLORS, type Input, neutral, type RoomState } from '../shared/types';
import { ranking, LAPS } from '../shared/simulation';
import {
  CLEANABLE_OBJECTS,
  NOZZLES,
  type WashInput,
  neutralWashInput,
} from '../shared/powerwash';
import { WashAudio } from './washAudio';
import { WashController } from './washController';
import { KartTouchControls } from './kartTouchControls';
import './style.css';

const WorldPreview = React.lazy(() => import('./scene').then(m => ({ default: m.WorldPreview })));
const GameScene = React.lazy(() => import('./scene').then(m => ({ default: m.GameScene })));
const PowerWashScene = React.lazy(() => import('./washScene').then(m => ({ default: m.PowerWashScene })));
const PowerWashPreview = React.lazy(() => import('./washScene').then(m => ({ default: m.PowerWashPreview })));

type PlayArrangement = 'this_device' | 'tv_display' | 'phone_controller';

function App() {
  const net = useNetwork();
  const {
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
  } = net;

  const params = new URLSearchParams(location.search);
  const initialPage = params.has('create') ? 'create' : params.has('join')
    ? 'join'
    : params.has('screen')
    ? 'screen'
    : params.has('controller')
    ? 'controller'
    : 'home';

  const [page, setPage] = useState(initialPage);
  const [joinDeviceRole, setJoinDeviceRole] = useState<'screen' | 'controller' | 'player' | null>(null);
  const [hostRoleChosen, setHostRoleChosen] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<'kart-rush' | 'power-wash'>(params.get('create') === 'kart-rush' ? 'kart-rush' : 'power-wash');
  const [arrangement, setArrangement] = useState<PlayArrangement>(() => {
    try {const saved=sessionStorage.getItem('rush-host-arrangement');return saved==='tv_display'||saved==='phone_controller'?saved:'this_device';} catch {return 'this_device';}
  });
  useEffect(() => {sessionStorage.setItem('rush-host-arrangement',arrangement);}, [arrangement]);

  const [mode, setMode] = useState<'lan' | 'online'>('lan');
  const [config, setConfig] = useState<{ mode: 'lan' | 'online'; lan: string[]; origin: string | null } | null>(null);
  const [origin, setOrigin] = useState('');
  const [code, setCode] = useState(params.get('join') || params.get('screen') || params.get('controller') || '');
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [qr, setQr] = useState('');
  const [pairQr, setPairQr] = useState('');
  const [quality, setQuality] = useState(() => matchMedia('(pointer:coarse)').matches ? 'low' : 'high');
  const [sound, setSound] = useState(false);

  // Split-screen state (Independent per display)
  const [localSplit, setLocalSplit] = useState(initialPage === 'screen');
  const [showSplitMenu, setShowSplitMenu] = useState(false);
  const [requestOtherSplit, setRequestOtherSplit] = useState(false);
  const [activeToast, setActiveToast] = useState<string | null>(null);
  const [targetedObject, setTargetedObject] = useState<{ name: string; percent: number } | null>(null);

  // Audio engine
  const washAudio = useRef<WashAudio>(new WashAudio());

  // Input states
  const kartControls = useRef<Input>(neutral());
  const washControls = useRef<WashInput>(neutralWashInput());
  const keys = useRef(new Set<string>());
  const pointers = useRef(new Map<number, keyof Input>());
  const movePointer=useRef<number|null>(null);
  const moveThumb=useRef<HTMLDivElement>(null);
  const moveTouch=(e:React.PointerEvent<HTMLDivElement>)=>{
    if(movePointer.current!==e.pointerId)return;
    const bounds=e.currentTarget.getBoundingClientRect();const radius=bounds.width*.32;
    const dx=(e.clientX-bounds.x-bounds.width/2)/radius,dy=(e.clientY-bounds.y-bounds.height/2)/radius;const scale=Math.max(1,Math.hypot(dx,dy));
    washControls.current.moveX=dx/scale;washControls.current.moveZ=-dy/scale;
    if(moveThumb.current)moveThumb.current.style.transform=`translate(${dx/scale*radius}px,${dy/scale*radius}px)`;
    setWashInput(washControls.current);
  };
  const stopMoveTouch=()=>{movePointer.current=null;washControls.current.moveX=0;washControls.current.moveZ=0;if(moveThumb.current)moveThumb.current.style.transform='translate(0,0)';setWashInput(washControls.current);};

  // Last known cleaned object for toast
  const lastCompletedObject = useRef<string | null>(null);

  const handleWashLook = (deltaYaw: number, deltaPitch: number) => {
    washControls.current.yaw = (washControls.current.yaw + deltaYaw) % (Math.PI * 2);
    washControls.current.pitch = Math.max(-0.85, Math.min(0.85, washControls.current.pitch + deltaPitch));
    setWashInput(washControls.current);
  };

  const handleWashSprayChange = (spraying: boolean) => {
    if (washControls.current.spray === spraying) return;
    washControls.current.spray = spraying;
    washAudio.current.update(spraying, washControls.current.nozzle);
    setWashInput(washControls.current);
  };

  const handleWashNozzleCycle = (delta: number) => {
    const next = (washControls.current.nozzle + delta + 4) % 4;
    washControls.current.nozzle = next;
    washAudio.current.playNozzleClick();
    washAudio.current.update(washControls.current.spray, next);
    setWashInput(washControls.current);
  };

  useEffect(() => {
    fetch(SERVER_ORIGIN + '/api/config')
      .then(r => {
        if (!r.ok) throw new Error('config fetch failed');
        return r.json();
      })
      .then(c => {
        setConfig(c);
        setMode(c.mode);
        setOrigin(c.origin || c.lan[0] || location.origin);
      })
      .catch(() => {
        const fallback = {
          mode: 'online' as const,
          lan: [],
          origin: location.origin,
        };
        setConfig(fallback);
        setMode('online');
        setOrigin(location.origin);
      });
  }, []);

  useEffect(() => {
    if (room) {
      QRCode.toDataURL(room.joinUrl, {
        width: 220,
        margin: 2,
        color: { dark: '#101727', light: '#ffffff' },
      }).then(setQr);

      QRCode.toDataURL(room.controllerUrl, {
        width: 220,
        margin: 2,
        color: { dark: '#101727', light: '#ffffff' },
      }).then(setPairQr);
    }
  }, [room?.joinUrl, room?.controllerUrl]);

  // Object completion audio & toast notifications
  useEffect(() => {
    if (room?.wash) {
      const completed = Object.values(room.wash.objects).find(
        o => o.completed && o.id !== lastCompletedObject.current
      );
      if (completed) {
        lastCompletedObject.current = completed.id;
        setActiveToast(`✓ ${completed.name} 100% Clean!`);
        washAudio.current.playObjectComplete();
        setTimeout(() => setActiveToast(null), 3500);
      }
      if (room.wash.completed && room.wash.phase === 'results') {
        washAudio.current.playJobVictory();
      }
    }
  }, [room?.wash?.objects, room?.wash?.completed]);

  function resetInputs() {
    document.querySelectorAll('.pad.held').forEach(b => b.classList.remove('held'));
    kartControls.current = neutral();
    const player=room?.wash?.players.find(player=>player.id===session?.playerId);
    washControls.current = {...neutralWashInput(),yaw:player?.yaw??washControls.current.yaw,pitch:player?.pitch??washControls.current.pitch,nozzle:washControls.current.nozzle};
    pointers.current.clear();
    movePointer.current=null;if(moveThumb.current)moveThumb.current.style.transform='translate(0,0)';
    keys.current.clear();
    setInput(kartControls.current);
    setWashInput(washControls.current);
  }

  useEffect(() => {
    resetInputs();
  }, [room?.phase, session?.playerId, status]);
  useEffect(()=>{const player=room?.wash?.players.find(player=>player.id===session?.playerId);if(player){washControls.current={...neutralWashInput(),yaw:player.yaw,pitch:player.pitch};setWashInput(washControls.current);}},[Boolean(room?.wash),session?.playerId]);

  // Keyboard controls for both games (PC Arrangement A & Solo Play)
  useEffect(() => {
    const blur = () => resetInputs();
    const visibility = () => {
      if (document.hidden) resetInputs();
    };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);

    const kartKeyMap: Record<string, keyof Input> = {
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      ArrowUp: 'gas',
      KeyW: 'gas',
      ArrowDown: 'brake',
      KeyS: 'brake',
      Space: 'drift',
      KeyE: 'item',
      KeyR: 'respawn',
    };

    function handleKeyDown(e: KeyboardEvent) {
      if (!session?.playerId || /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return;

      // Power wash controls
      if (room?.gameId === 'power-wash' && room?.wash) {
        let changed = false;
        if (e.code === 'KeyW') {
          washControls.current.moveZ = 1;
          changed = true;
        } else if (e.code === 'KeyS') {
          washControls.current.moveZ = -1;
          changed = true;
        } else if (e.code === 'KeyA') {
          washControls.current.moveX = -1;
          changed = true;
        } else if (e.code === 'KeyD') {
          washControls.current.moveX = 1;
          changed = true;
        } else if (e.code === 'ArrowLeft') {
          washControls.current.yaw += 0.08;
          changed = true;
        } else if (e.code === 'ArrowRight') {
          washControls.current.yaw -= 0.08;
          changed = true;
        } else if (e.code === 'ArrowUp') {
          washControls.current.pitch = Math.min(0.85, washControls.current.pitch + 0.06);
          changed = true;
        } else if (e.code === 'ArrowDown') {
          washControls.current.pitch = Math.max(-0.85, washControls.current.pitch - 0.06);
          changed = true;
        } else if (e.code === 'Space') {
          washControls.current.spray = true;
          changed = true;
        } else if (e.code === 'Digit1') {
          washControls.current.nozzle = 0;
          washAudio.current.playNozzleClick();
          changed = true;
        } else if (e.code === 'Digit2') {
          washControls.current.nozzle = 1;
          washAudio.current.playNozzleClick();
          changed = true;
        } else if (e.code === 'Digit3') {
          washControls.current.nozzle = 2;
          washAudio.current.playNozzleClick();
          changed = true;
        } else if (e.code === 'Digit4') {
          washControls.current.nozzle = 3;
          washAudio.current.playNozzleClick();
          changed = true;
        } else if (e.code === 'KeyH' || e.code === 'Tab') {
          e.preventDefault();
          washControls.current.highlight = true;
          washAudio.current.playSonarPulse();
          changed = true;
          setTimeout(() => {
            washControls.current.highlight = false;
            setWashInput(washControls.current);
          }, 2500);
        }

        if (changed) {
          washAudio.current.update(washControls.current.spray, washControls.current.nozzle);
          setWashInput(washControls.current);
        }
        return;
      }

      // Kart controls
      if (room?.gameId === 'kart-rush' && room?.race) {
        const control = kartKeyMap[e.code];
        if (!control) return;
        e.preventDefault();
        keys.current.add(e.code);
        const value = neutral();
        for (const k of keys.current) value[kartKeyMap[k]] = true;
        kartControls.current = value;
        setInput(value);
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (!session?.playerId || /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return;

      // Power wash controls
      if (room?.gameId === 'power-wash' && room?.wash) {
        let changed = false;
        if (e.code === 'KeyW' || e.code === 'KeyS') {
          washControls.current.moveZ = 0;
          changed = true;
        }
        if (e.code === 'KeyA' || e.code === 'KeyD') {
          washControls.current.moveX = 0;
          changed = true;
        }
        if (e.code === 'Space') {
          washControls.current.spray = false;
          changed = true;
        }
        if (changed) {
          washAudio.current.update(washControls.current.spray, washControls.current.nozzle);
          setWashInput(washControls.current);
        }
        return;
      }

      // Kart controls
      if (room?.gameId === 'kart-rush' && room?.race) {
        const control = kartKeyMap[e.code];
        if (!control) return;
        e.preventDefault();
        keys.current.delete(e.code);
        const value = neutral();
        for (const k of keys.current) value[kartKeyMap[k]] = true;
        kartControls.current = value;
        setInput(value);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('blur', blur);
      window.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [session?.playerId, room?.phase, room?.gameId]);

  function toggleSound() {
    const isNowOn = washAudio.current.toggle();
    setSound(isNowOn);
  }

  function handleCreateRoom(gameIdToCreate = selectedGameId) {
    if (page !== 'create') {
      setSelectedGameId(gameIdToCreate);
      setHostRoleChosen(false);
      setPage('create');
      return;
    }
    if (!hostRoleChosen) return;
    send({
      type: 'create',
      mode: config?.mode || 'online',
      origin: config?.origin || config?.lan?.[0] || location.origin,
      gameId: gameIdToCreate,
    });
    setLocalSplit(arrangement === 'tv_display');
  }

  function handleJoinRoom(roleToJoin?: 'player' | 'screen' | 'controller') {
    const r = roleToJoin || joinDeviceRole;
    if (!r) return;
    setPage(r === 'screen' ? 'screen' : r === 'controller' ? 'controller' : 'join');
    setLocalSplit(r === 'screen');
    const search = new URLSearchParams(location.search);
    ['join', 'screen', 'controller'].forEach(key => search.delete(key));
    search.set(r === 'player' ? 'join' : r, code.trim().toUpperCase());
    history.replaceState(null, '', `/?${search}`);
    send({
      type: 'join',
      code: code.trim().toUpperCase(),
      name: r === 'screen' ? 'TV Screen' : name.trim() || 'Player',
      color,
      role: r,
      screen: r === 'screen',
    });
  }

  function handleSplitToggle() {
    const nextSplit = !localSplit;
    setLocalSplit(nextSplit);

    // If "Request split view on the other player's screen too" is checked
    if (nextSplit && requestOtherSplit && session?.playerId && room?.players.length) {
      const otherPlayerIds = room.players
        .filter(p => p.id !== session.playerId)
        .map(p => p.id);
      if (otherPlayerIds.length > 0) {
        requestSplit(otherPlayerIds);
      }
    }
  }

  function fullscreen() {
    void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const me = room?.players.find(p => p.id === session?.playerId);
  const isHost = session?.role === 'host';
  const isPhoneControllerOnly = session?.role === 'controller' || (session?.role === 'player' && page === 'controller') || (isHost && arrangement === 'phone_controller');
  const isSpectatorScreen = session?.role === 'screen';

  useEffect(() => {
    if (session?.role === 'host' && !session.playerId && room && !room.race && !room.wash && arrangement !== 'tv_display') {
      send({type:'keyboard', name:'Player 1', color:COLORS[0]});
    }
  }, [session?.role, session?.playerId, room?.code, arrangement]);

  // Check if there is an incoming split request directed at me on this display
  const incomingSplitRequest = room?.splitRequests.find(
    r => session?.playerId && r.targetPlayerIds.includes(session.playerId)
  );

  const statusPill = (
    <span className={`connection ${status === 'Connected' ? 'ok' : ''}`}>
      <i />
      {status}
      {status === 'Connected' && ` · ${latency} ms`}
    </span>
  );

  return (
    <>
      <header className={room?.race || room?.wash ? 'playing-header' : ''}>
        <a href="/" className="brand">
          <span className="brand-icon">R</span>
          rushroom
          <span className="brand-dot">●</span>
        </a>
        <nav>
          <button onClick={() => setPage('library')}>Games</button>
          <button onClick={() => setPage('arrangements')}>How to Play</button>
        </nav>
        {room ? (
          <button
            className="quiet"
            onClick={() => {
              net.leave();
              setPage('home');
              history.replaceState(null, '', '/');
            }}
          >
            Leave room
          </button>
        ) : (
          <button className="quiet" onClick={() => setPage('join')}>
            Join Room ↗
          </button>
        )}
      </header>

      {error && page !== 'home' && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => location.reload()}>Reconnect</button>
        </div>
      )}

      {room && status !== 'Connected' && (
        <div className="network-banner">
          {status} · Inputs released. Check server address and Wi-Fi.
        </div>
      )}

      {/* HOME PAGE */}
      {!room && page === 'home' && (
        <main className="home">
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow">
                <i /> BROWSER MULTIPLAYER PLAYGROUND
              </span>
              <h1>
                Power Wash.<br />
                Race. <em>Together.</em>
              </h1>
              <p>
                Turn any TV, laptop or phone into a shared arena.<br />
                Grab your friends. Play in person or from different homes.
              </p>

              <div className="actions">
                <button className="primary" onClick={() => handleCreateRoom('power-wash')}>
                  Create a room <span>↗</span>
                </button>
                <button className="outline" onClick={() => setPage('join')}>
                  Join a room
                </button>
              </div>

              <div className="hero-meta">
                <span>◉ Original 3D Environments</span>
                <span>◎ No App or Account Required</span>
                <span>⌁ TV + Phone Controllers</span>
              </div>
            </div>

            <div className="hero-art">
              <span className="art-chip chip-top">NEW 3D CO-OP GAME</span>
              <React.Suspense fallback={<HeroWasher />}>
                <PowerWashPreview />
              </React.Suspense>
              <span className="art-chip chip-bottom">
                <b>02</b> POWER WASH SIMULATOR 2 <span>↗</span>
              </span>
            </div>
          </section>

          {/* GAME SELECTION LIBRARY */}
          <section className="library">
            <div className="section-heading">
              <div>
                <span className="eyebrow">THE ROSTER</span>
                <h2>Good friends. Great games.</h2>
              </div>
              <button className="text-button" onClick={() => setPage('library')}>
                Explore the library →
              </button>
            </div>

            <div className="game-grid">
              {/* Game 1: Power Wash Simulator 2 */}
              <article className="game-card">
                <div className="card-art">
                  <div className="wash-card-art">
                    <span className="wash-art-water-jet">💦</span>
                    <span className="wash-art-clean-tag">100% ORIGINAL ART</span>
                  </div>
                  <span className="game-tag" style={{ color: '#38bdf8' }}>
                    PLAYABLE NOW
                  </span>
                  <span className="players-tag">1–4 players</span>
                </div>
                <div className="card-copy">
                  <div>
                    <h3>Power Wash Simulator 2</h3>
                    <p>
                      Co-op cleaning simulation. Grab your pressure washer and team up to restore a dirty garden courtyard to pristine glory.
                    </p>
                  </div>
                  <button
                    aria-label="Play Power Wash Simulator 2"
                    onClick={() => {
                      setSelectedGameId('power-wash');
                      handleCreateRoom('power-wash');
                    }}
                  >
                    ↗
                  </button>
                </div>
              </article>

              {/* Game 2: Kart Rush Arena */}
              <article className="game-card">
                <div className="card-art">
                  <img
                    className="world-card-art"
                    src="/sunburst-world.png"
                    alt="Original 3D miniature garden circuit"
                  />
                  <span className="game-tag">PLAYABLE NOW</span>
                  <span className="players-tag">1–8 players</span>
                </div>
                <div className="card-copy">
                  <div>
                    <h3>Kart Rush Arena</h3>
                    <p>
                      Big corners. Tiny karts. Brilliant chaos. Race your friends around Sunburst Circuit.
                    </p>
                  </div>
                  <button
                    aria-label="Play Kart Rush Arena"
                    onClick={() => {
                      setSelectedGameId('kart-rush');
                      handleCreateRoom('kart-rush');
                    }}
                  >
                    ↗
                  </button>
                </div>
              </article>
            </div>
          </section>

          {/* 3 PLAY ARRANGEMENTS SECTION */}
          <section className="steps">
            <span className="eyebrow">THE THREE DEVICE ARRANGEMENTS</span>
            <div className="arrangement-grid">
              <div className="arrangement-card">
                <span className="arrangement-icon">📱</span>
                <b>Arrangement A — Play on this device</b>
                <span>
                  Mobile touch controls or PC keyboard/mouse. Your view and controls live on the same phone, tablet or monitor.
                </span>
              </div>
              <div className="arrangement-card">
                <span className="arrangement-icon">📺</span>
                <b>Arrangement B — Shared TV + Phone Controllers</b>
                <span>
                  The TV renders 2 to 4 split viewports. Each player scans a QR code and holds their phone as a tactile gamepad.
                </span>
              </div>
              <div className="arrangement-card">
                <span className="arrangement-icon">🌐</span>
                <b>Arrangement C — Different Homes, Flexible Devices</b>
                <span>
                  One friend uses TV + phone at their house, while another joins on mobile from across the city.
                </span>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* GAME LIBRARY PAGE */}
      {!room && page === 'library' && (
        <main className="panel wide">
          <span className="eyebrow">THE GAME LIBRARY</span>
          <h1>Choose your game.</h1>
          <div className="game-grid">
            {games.map(g => (
              <article className="library-entry" key={g.id}>
                {g.id === 'power-wash' ? (
                  <div className="wash-card-art" style={{ height: 160, borderRadius: 12 }}>
                    <span style={{ fontSize: 50 }}>💦</span>
                  </div>
                ) : (
                  <img src={g.thumbnail} alt="" />
                )}
                <h2>{g.name}</h2>
                <p>{g.description}</p>
                <small>
                  {g.minPlayers}–{g.maxPlayers} players ·{' '}
                  {g.available ? 'Playable Now' : 'In Development'}
                </small>
                <button
                  className="primary"
                  disabled={!g.available}
                  onClick={() => {
                    setSelectedGameId(g.id as any);
                    handleCreateRoom(g.id as any);
                  }}
                >
                  {g.available ? 'Create a room' : 'Coming later'}
                </button>
              </article>
            ))}
          </div>
        </main>
      )}

      {/* ARRANGEMENTS & HELP */}
      {!room && page === 'arrangements' && (
        <main className="panel wide">
          <span className="eyebrow">FLEXIBLE HARDWARE</span>
          <h1>Play however you want.</h1>
          <div className="help-grid">
            <article>
              <h2>Arrangement A: Solo / Mobile</h2>
              <p>
                Open the link directly on your phone, tablet or computer. Touch buttons or WASD/mouse controls will be active immediately.
              </p>
            </article>
            <article>
              <h2>Arrangement B: Shared Big Screen</h2>
              <p>
                Open the room on your TV or monitor. Up to 4 players scan the room code with their phones and use them as tactile gamepads.
              </p>
            </article>
            <article>
              <h2>Arrangement C: Remote Friends</h2>
              <p>
                Each player gets their own perspective. A can use a TV + phone controller at home, while B plays on a tablet.
              </p>
            </article>
            <article>
              <h2>Independent Split View</h2>
              <p>
                Any display can toggle split-screen independently. Players can also request their split layout be mirrored to a friend with mutual consent.
              </p>
            </article>
          </div>
        </main>
      )}

      {/* CREATE ROOM FLOW */}
      {!room && page === 'create' && (
        <main className="panel">
          <span className="eyebrow">CREATE A ROOM</span>
          <h1>Start your match.</h1>
          <label>Selected Game</label>
          <select
            value={selectedGameId}
            onChange={e => setSelectedGameId(e.target.value as any)}
          >
            <option value="power-wash">Power Wash Simulator 2 (Co-op Garden)</option>
            <option value="kart-rush">Kart Rush Arena (Sunburst Circuit)</option>
          </select>

          <label>Device Arrangement</label>
          <div className="arrangement-grid">
            <button
              type="button"
              className={`arrangement-card ${hostRoleChosen && arrangement === 'this_device' ? 'selected' : ''}`}
              aria-pressed={hostRoleChosen && arrangement === 'this_device'}
              onClick={() => {setArrangement('this_device');setHostRoleChosen(true);}}
            >
              <b>Screen + Controls</b>
              <span>Gameplay & controls on this device.</span>
            </button>
            <button
              type="button"
              className={`arrangement-card ${hostRoleChosen && arrangement === 'tv_display' ? 'selected' : ''}`}
              aria-pressed={hostRoleChosen && arrangement === 'tv_display'}
              onClick={() => {setArrangement('tv_display');setHostRoleChosen(true);}}
            >
              <b>Screen only</b>
              <span>Shared display for phone controllers.</span>
            </button>
            <button type="button" aria-pressed={hostRoleChosen && arrangement === 'phone_controller'} className={`arrangement-card ${hostRoleChosen && arrangement === 'phone_controller' ? 'selected' : ''}`} onClick={() => {setArrangement('phone_controller');setHostRoleChosen(true);}}>
              <b>Controller only</b><span>Big controls here. Show gameplay on another screen.</span>
            </button>
          </div>

          <button
            className="primary full"
            disabled={!hostRoleChosen}
            onClick={() => handleCreateRoom(selectedGameId)}
          >
            {status === 'Connected' ? 'Create room ↗' : 'Connecting to Server…'}
          </button>
          {statusPill}
        </main>
      )}

      {/* JOIN ROOM FLOW */}
      {!room && (page === 'join' || page === 'screen' || page === 'controller') && (
        <main className="panel">
          <span className="eyebrow">JOIN ROOM</span>
          <h1>How will you play?</h1>

          <form
            onSubmit={e => {
              e.preventDefault();
              handleJoinRoom();
            }}
          >
            <label>
              Room code
              <input
                aria-label="Room code"
                value={code}
                onChange={e =>
                  setCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z2-9]/g, '')
                      .slice(0, 6)
                  )
                }
                placeholder="ABC234"
                maxLength={6}
                minLength={6}
                required
                className="code-input"
              />
            </label>

            <fieldset className="device-role-picker">
              <legend>How will you use this device?</legend>
              <div className="device-role-options">
                {([
                  ['screen', 'Screen only', 'Watch gameplay on this TV or monitor. Use a separate phone as your controller.'],
                  ['controller', 'Controller only', 'Big buttons on this device. Watch gameplay on another screen.'],
                  ['player', 'Screen + Controls', 'See your gameplay and control your player on this same device.'],
                ] as const).map(([value, title, description]) => (
                  <label key={value} className={`device-role-option ${joinDeviceRole === value ? 'selected' : ''}`}>
                    <input type="radio" name="deviceRole" value={value} checked={joinDeviceRole === value} onChange={() => setJoinDeviceRole(value)} required />
                    <span><b>{title}</b><small>{description}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>

            {joinDeviceRole && joinDeviceRole !== 'screen' && (
              <>
                <label>
                  Your Player Name
                  <input
                    aria-label="Player name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    maxLength={20}
                    placeholder="e.g. Sam"
                    required
                  />
                </label>
                <label>Pick your color</label>
                <div className="colors">
                  {COLORS.map((c, i) => (
                    <button
                      type="button"
                      key={c}
                      aria-label={`Color ${i + 1}`}
                      className={color === c ? 'selected' : ''}
                      style={{ background: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </>
            )}

            <button className="primary full" disabled={!joinDeviceRole}>
              {status === 'Connected' ? 'Join Room ↗' : 'Connecting to Server…'}
            </button>
          </form>
          {statusPill}
        </main>
      )}

      {/* LOBBY */}
      {room && !room.race && !room.wash && (
        <main className={`lobby ${isPhoneControllerOnly ? 'phone-lobby' : ''}`}>
          <section className="lobby-main">
            <span className="eyebrow">
              {room.mode === 'lan' ? 'LOCAL LAN' : 'ONLINE'} · {room.code}
            </span>
            <h1>
              {isPhoneControllerOnly ? 'Gamepad connected.' : 'Assemble your crew.'}
            </h1>
            <p>
              {room.gameId === 'power-wash'
                ? 'Power Wash Simulator 2 · Garden Courtyard'
                : 'Kart Rush Arena · Sunburst Circuit'}
            </p>

            {/* Game Selector for Host */}
            {isHost && (
              <div style={{ margin: '14px 0' }}>
                <label>Active Game</label>
                <select
                  value={room.gameId}
                  onChange={e => send({ type: 'game', id: e.target.value })}
                >
                  <option value="power-wash">Power Wash Simulator 2</option>
                  <option value="kart-rush">Kart Rush Arena</option>
                </select>
              </div>
            )}

            {/* Roster */}
            <div className="roster">
              {room.players.length === 0 && (
                <div className="empty">
                  No players yet.<br />
                  <span>Scan the QR code to bring in your first player.</span>
                </div>
              )}
              {room.players.map((p, i) => (
                <div className="driver" key={p.id}>
                  <span className="avatar" style={{ background: p.color }}>
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <b>
                      {p.name}
                      {p.id === session?.playerId ? ' (you)' : ''}
                    </b>
                    <small>
                      SLOT {String(i + 1).padStart(2, '0')} ·{' '}
                      {p.connected ? 'Connected' : 'Disconnected'}
                      {p.pairedControllerConnected ? ' · 📱 Phone Paired' : ''}
                    </small>
                  </div>
                  <span className={p.ready && p.connected ? 'ready' : 'waiting'}>
                    {p.ready && p.connected ? '✓ READY' : 'WAITING'}
                  </span>
                  {isHost && (
                    <button
                      className="remove"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => send({ type: 'remove', id: p.id })}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Ready button for player / phone */}
            {session?.playerId && (
              <button
                className="primary full"
                onClick={() => send({ type: 'ready', ready: !me?.ready })}
              >
                {me?.ready ? 'Unready' : 'Ready to Clean / Race ✓'}
              </button>
            )}

            {/* Host actions */}
            {isHost && (
              <div className="lobby-actions">
                {!session?.playerId && (
                  <button
                    className="outline"
                    onClick={() =>
                      send({
                        type: 'keyboard',
                        name: 'Solo Player',
                        color: COLORS[0],
                      })
                    }
                  >
                    Add local keyboard player
                  </button>
                )}
                <button
                  className="primary"
                  disabled={
                    !room.players.length ||
                    room.players.some(p => !p.connected || !p.ready)
                  }
                  onClick={() => send({ type: 'start' })}
                >
                  Start Game →
                </button>
              </div>
            )}
            {statusPill}
          </section>

          {/* Pairing QR for TV / Spectator Screen */}
          {!isPhoneControllerOnly && (
            <aside className="pairing">
              <span className="eyebrow">JOIN WITH PHONES</span>
              {qr && <img src={qr} alt="Scan to join with phone" />}
              <span className="room-code">{room.code}</span>
              <a className="join-url" href={room.joinUrl} target="_blank" rel="noreferrer">
                {room.joinUrl}
              </a>
              <p>
                Scan or open this address on your phone.<br />
                {room.mode === 'lan'
                  ? 'Stay on the host Wi-Fi or hotspot.'
                  : 'Share it with your friends.'}
              </p>
              <a className="small" href={room.controllerUrl} target="_blank" rel="noreferrer">
                Open phone controller mode ↗
              </a>
            </aside>
          )}
        </main>
      )}

      {/* GAMEPLAY: POWER WASH SIMULATOR 2 */}
      {room?.wash && room.wash.phase !== 'results' && (
        <main className={isPhoneControllerOnly ? 'controller-screen' : 'race-screen'}>
          {isPhoneControllerOnly ? (
            /* Tactile Phone Controller Viewport */
            <WashController
              room={room}
              playerId={session?.playerId || ''}
              onInput={input => {
                washAudio.current.update(input.spray, input.nozzle);
                setWashInput(input);
              }}
              onSplitResponse={(requestId, accept) => respondSplit(requestId, accept)}
              statusPill={statusPill}
            />
          ) : (
            /* 3D Game Viewport on TV / Desktop / Mobile */
            <>
              <React.Suspense fallback={<div className="countdown"><span>Loading Garden Courtyard…</span></div>}>
                <PowerWashScene
                  room={room}
                  follow={session?.playerId || room.players[0]?.id}
                  split={localSplit}
                  quality={quality}
                  localSprayState={{
                    spraying: washControls.current.spray,
                    nozzle: washControls.current.nozzle,
                  }}
                  onTargetObjectChange={(name, pct) => {
                    if (!name) {
                      setTargetedObject(null);
                    } else {
                      setTargetedObject({ name, percent: pct });
                    }
                  }}
                  onLook={session?.playerId?handleWashLook:undefined}
                  onSprayChange={session?.playerId?handleWashSprayChange:undefined}
                  onNozzleCycle={session?.playerId?handleWashNozzleCycle:undefined}
                />
              </React.Suspense>

              {/* Toast when an object completes */}
              {activeToast && <div className="object-toast">{activeToast}</div>}

              {/* Top-Right Split-Screen Consent Notification Banner */}
              {incomingSplitRequest && (
                <div className="consent-banner" role="alert">
                  <h4>⛶ Split Screen Request</h4>
                  <p>
                    <b>{incomingSplitRequest.fromName}</b> wants to share split view on your display.
                  </p>
                  <div className="consent-buttons">
                    <button
                      className="btn-accept"
                      onClick={() => {
                        setLocalSplit(true);
                        respondSplit(incomingSplitRequest.id, true);
                      }}
                    >
                      ✓ Accept
                    </button>
                    <button
                      className="btn-decline"
                      onClick={() => respondSplit(incomingSplitRequest.id, false)}
                    >
                      ✕ Decline
                    </button>
                  </div>
                </div>
              )}

              {/* Top HUD */}
              <div className="race-top">
                <div className="wash-title-card">
                  <span className="eyebrow">POWER WASH SIMULATOR 2</span>
                  <h2>SUBURBAN RESTORATION</h2>
                  <div className="job-stars">
                    {[20, 40, 60, 80, 98].map((t, idx) => (
                      <span key={idx} className={`star ${(room.wash?.jobPercent || 0) >= t ? 'filled' : ''}`}>★</span>
                    ))}
                  </div>
                  <div className="progress-container">
                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${room.wash.jobPercent}%` }}
                      />
                    </div>
                    <span className="progress-text">{room.wash.jobPercent}%</span>
                  </div>
                  <div className="wash-job-sub">
                    <span>🧼 {CLEANABLE_OBJECTS.filter(o => room.wash?.objects[o.id]?.completed).length}/{CLEANABLE_OBJECTS.length} Cleaned</span>
                    <span>⏱ {Math.floor(room.wash.time / 60)}:{String(Math.floor(room.wash.time) % 60).padStart(2, '0')}</span>
                  </div>
                  {statusPill}
                </div>

                <div className="race-tools">
                  <button onClick={toggleSound}>
                    {sound ? '🔊' : '🔇'}
                  </button>
                  <button onClick={() => setQuality(quality === 'high' ? 'low' : 'high')}>
                    {quality === 'high' ? '✦ HQ' : '◇ LQ'}
                  </button>
                  <button onClick={() => setShowSplitMenu(!showSplitMenu)}>
                    ⛶ {localSplit ? 'Split' : 'Solo'}
                  </button>
                  <button aria-label="Fullscreen" onClick={fullscreen}>
                    ⛶
                  </button>
                  {isHost && (
                    <button onClick={() => send({ type: 'pause' })}>
                      {room.wash.phase === 'paused' ? '▶ Resume' : '⏸ Pause'}
                    </button>
                  )}
                  {isHost && <button onClick={() => send({ type: 'lobby' })}>↩ Lobby</button>}
                </div>
              </div>

              {/* Independent Split Menu Dropdown */}
              {showSplitMenu && (
                <div className="split-options-dropdown">
                  <b>Display Layout</b>
                  <label>
                    <input
                      type="checkbox"
                      checked={localSplit}
                      onChange={handleSplitToggle}
                    />
                    Split players on this screen
                  </label>
                  <label style={{ opacity: localSplit ? 1 : 0.6 }}>
                    <input
                      type="checkbox"
                      checked={requestOtherSplit}
                      onChange={e => setRequestOtherSplit(e.target.checked)}
                      disabled={!localSplit}
                    />
                    Request split view on the other player's screen too
                  </label>
                </div>
              )}

              {/* Crosshair reticle with spray active ring */}
              <div className={`wash-crosshair ${washControls.current.spray ? 'spraying' : ''}`}>
                <span className="wash-crosshair-ring" />
                <span className="crosshair-dot" />
              </div>

              {/* Real-time Targeted Object Card */}
              {targetedObject && targetedObject.name && (
                <div className="wash-target-card">
                  <div className="target-card-top">
                    <span className="target-icon">🫧</span>
                    <span className="target-name">{targetedObject.name}</span>
                    <span className="target-percent">{targetedObject.percent}%</span>
                  </div>
                  <div className="target-mini-bar">
                    <div
                      className="target-mini-fill"
                      style={{ width: `${targetedObject.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Left HUD: Objects checklist with mini progress bars */}
              <div className="wash-hud" style={{ top: 160 }}>
                <div className="objects-hud-list">
                  {CLEANABLE_OBJECTS.map(def => {
                    const st = room.wash?.objects[def.id];
                    const pct = st?.percent || 0;
                    return (
                      <div
                        key={def.id}
                        className={`object-item ${st?.completed ? 'completed' : ''}`}
                      >
                        <span className="obj-icon">{st?.completed ? '✓' : '○'}</span>
                        <div className="object-item-info">
                          <span>{def.name}</span>
                          <div className="obj-mini-progress">
                            <div className="obj-mini-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <b>{pct}%</b>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom-right: Interactive Nozzle Dock */}
              {session?.playerId && <div className="nozzle-dock">
                <span className="nozzle-dock-title">NOZZLE SELECT [1–4]</span>
                <div className="nozzle-dock-buttons">
                  {NOZZLES.map((n, idx) => {
                    const isActive = washControls.current.nozzle === idx;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        className={`nozzle-btn ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          washControls.current.nozzle = idx;
                          washAudio.current.playNozzleClick();
                          washAudio.current.update(washControls.current.spray, idx);
                          setWashInput(washControls.current);
                        }}
                      >
                        <span className="nozzle-btn-key">{idx + 1}</span>
                        <span className="nozzle-btn-color" style={{ background: n.color, boxShadow: `0 0 8px ${n.color}` }} />
                        <span className="nozzle-btn-label">{n.name.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>}

              {/* Bottom-center: Dirt Sonar button */}
              {session?.playerId && <button
                type="button"
                className={`sonar-action-btn ${washControls.current.highlight ? 'active' : ''}`}
                onClick={() => {
                  washControls.current.highlight = true;
                  washAudio.current.playSonarPulse();
                  setWashInput(washControls.current);
                  setTimeout(() => {
                    washControls.current.highlight = false;
                    setWashInput(washControls.current);
                  }, 2500);
                }}
              >
                ✨ DIRT SONAR [Tab / H]
              </button>}

              {/* Mobile on-screen touch overlay for Arrangement A on phones */}
              {'ontouchstart' in window && session?.playerId && !isPhoneControllerOnly && (
                <div className="mobile-wash-overlay">
                  <div className="mobile-wash-overlay-controls">
                    <div
                      className="mobile-stick-area"
                      onPointerDown={e => {
                        e.preventDefault();if(movePointer.current!==null)return;movePointer.current=e.pointerId;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        moveTouch(e);
                      }}
                      onPointerMove={moveTouch}
                      onPointerUp={stopMoveTouch}
                      onPointerCancel={stopMoveTouch}
                      onLostPointerCapture={stopMoveTouch}
                    >
                      <div className="mobile-stick-thumb" ref={moveThumb} />
                    </div>

                    <div className="mobile-actions-area">
                      <button
                        type="button"
                        className="mobile-btn-sonar"
                        onClick={() => {
                          washControls.current.highlight = true;
                          washAudio.current.playSonarPulse();
                          setWashInput(washControls.current);
                          setTimeout(() => {
                            washControls.current.highlight = false;
                            setWashInput(washControls.current);
                          }, 2500);
                        }}
                      >
                        ✨ Highlight Dirt
                      </button>
                      <button
                        type="button"
                        className={`mobile-btn-spray ${washControls.current.spray ? 'spraying' : ''}`}
                        onPointerDown={e => {
                          e.currentTarget.setPointerCapture(e.pointerId);
                          washControls.current.spray = true;
                          washAudio.current.update(true, washControls.current.nozzle);
                          setWashInput(washControls.current);
                        }}
                        onPointerUp={() => {
                          washControls.current.spray = false;
                          washAudio.current.update(false, washControls.current.nozzle);
                          setWashInput(washControls.current);
                        }}
                        onPointerCancel={() => {washControls.current.spray=false;washAudio.current.update(false,washControls.current.nozzle);setWashInput(washControls.current);}}
                      >
                        SPRAY
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* PC Desktop Keyboard guide */}
              {session?.playerId && !('ontouchstart' in window) && (
                <div className="keyboard-hint">
                  WASD: Walk · ← → ↑ ↓: Aim · Space: Spray · 1–4: Nozzles · H: Highlight Dirt
                </div>
              )}

              {room.wash.phase === 'countdown' && (
                <div className="countdown">
                  <span>GET READY TO CLEAN</span>
                  <b>{Math.ceil(room.wash.countdown)}</b>
                </div>
              )}

              {room.wash.phase === 'paused' && (
                <div className="countdown">
                  <b>⏸</b>
                  <span>GAME PAUSED</span>
                </div>
              )}
            </>
          )}
        </main>
      )}

      {/* GAMEPLAY: KART RUSH ARENA (PRESERVED) */}
      {room?.race && room.phase !== 'results' && (
        <main className={isPhoneControllerOnly ? 'controller' : 'race-screen'}>
          {isPhoneControllerOnly ? (
            /* Kart Phone Gamepad */
            <>
              <div className="controller-top">
                <div>
                  <span className="eyebrow">
                    {room.code} · {me?.name}
                  </span>
                  <h2>You’re in the race</h2>
                </div>
                {statusPill}
              </div>
              <div className="gamepad">
                <div className="steering">
                  <button
                    className="pad"
                    onPointerDown={() => {
                      kartControls.current.left = true;
                      setInput(kartControls.current);
                    }}
                    onPointerUp={() => {
                      kartControls.current.left = false;
                      setInput(kartControls.current);
                    }}
                  >
                    ◀ LEFT
                  </button>
                  <button
                    className="pad"
                    onPointerDown={() => {
                      kartControls.current.right = true;
                      setInput(kartControls.current);
                    }}
                    onPointerUp={() => {
                      kartControls.current.right = false;
                      setInput(kartControls.current);
                    }}
                  >
                    RIGHT ▶
                  </button>
                </div>
                <div className="pedals">
                  <button
                    className="pad brake"
                    onPointerDown={() => {
                      kartControls.current.brake = true;
                      setInput(kartControls.current);
                    }}
                    onPointerUp={() => {
                      kartControls.current.brake = false;
                      setInput(kartControls.current);
                    }}
                  >
                    BRAKE
                  </button>
                  <button
                    className="pad gas"
                    onPointerDown={() => {
                      kartControls.current.gas = true;
                      setInput(kartControls.current);
                    }}
                    onPointerUp={() => {
                      kartControls.current.gas = false;
                      setInput(kartControls.current);
                    }}
                  >
                    GAS
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Kart 3D Screen */
            <>
              <React.Suspense fallback={<div className="countdown"><span>Loading circuit…</span></div>}>
                <GameScene
                  room={room}
                  follow={session?.playerId || ''}
                  split={localSplit}
                  quality={quality}
                  samples={net.samples}
                />
              </React.Suspense>
              <div className="race-top">
                <div className="hud-title">
                  <span className="eyebrow">SUNBURST CIRCUIT</span>
                  <h2>{room.players.length} PLAYER SPLIT SCREEN</h2>
                  {statusPill}
                </div>
                <div className="race-tools">
                  <button onClick={() => setQuality(quality === 'high' ? 'low' : 'high')}>
                    {quality === 'high' ? 'High' : 'Low'} graphics
                  </button>
                  <button onClick={fullscreen}>⛶</button>
                  {isHost && (
                    <button onClick={() => send({ type: 'pause' })}>
                      {room.race.phase === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                  )}
                  {isHost && <button onClick={() => send({ type: 'lobby' })}>Lobby</button>}
                </div>
              </div>
              {'ontouchstart' in window && session?.playerId && <KartTouchControls onInput={value => {kartControls.current=value;setInput(value);}} />}
            </>
          )}
        </main>
      )}

      {/* RESULTS SCREEN */}
      {room && (room.wash?.phase === 'results' || room.race?.phase === 'results') && (
        <main className="panel results">
          {room.wash ? (
            /* Power Wash Simulator 2 Completion Results */
            <>
              <span className="eyebrow">JOB COMPLETE · 100% RESTORED</span>
              <h1>Courtyard is Sparkling Clean!</h1>
              <p>
                Garden Courtyard finished in {room.wash.time.toFixed(1)} seconds.
              </p>
              <div style={{ margin: '20px 0' }}>
                <h3>Player Clean Contribution</h3>
                {room.wash.players.map((p, i) => {
                  const pct =
                    room.wash && room.wash.totalCleaned > 0
                      ? Math.round((p.cleanedCount / room.wash.totalCleaned) * 100)
                      : 0;
                  return (
                    <div className="result-row" key={p.id}>
                      <b>{String(i + 1).padStart(2, '0')}</b>
                      <span className="avatar" style={{ background: p.color }}>
                        {p.name[0]}
                      </span>
                      <strong>{p.name}</strong>
                      <span>
                        {p.cleanedCount} cells ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
              {isHost ? (
                <button
                  className="primary full"
                  onClick={() => send({ type: 'lobby' })}
                >
                  Back to Lobby · Clean Again ↗
                </button>
              ) : (
                <p>Waiting for the host to start another job.</p>
              )}
            </>
          ) : room.race ? (
            /* Kart Race Results */
            <>
              <span className="eyebrow">THE CHECKERED FLAG</span>
              <h1>{room.race.finishOrder.length ? 'Bragging rights earned.' : 'A race worth replaying.'}</h1>
              <p>Sunburst Circuit · {room.race.time.toFixed(2)} seconds</p>
              {ranking(room.race).map((k, i) => (
                <div className="result-row" key={k.id}>
                  <b>{String(i + 1).padStart(2, '0')}</b>
                  <span className="avatar" style={{ background: k.color }}>
                    {k.name[0]}
                  </span>
                  <strong>{k.name}</strong>
                  <span>{k.finished !== null ? `${k.finished.toFixed(2)}s` : 'DNF'}</span>
                </div>
              ))}
              {isHost ? (
                <button className="primary full" onClick={() => send({ type: 'lobby' })}>
                  Back to lobby · Race again ↗
                </button>
              ) : (
                <p>Waiting for host.</p>
              )}
            </>
          ) : null}
        </main>
      )}

      {!room && (
        <footer>
          <span>rushroom — made for playing together.</span>
          <span>Original games. Instant co-op & rivalries.</span>
        </footer>
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
