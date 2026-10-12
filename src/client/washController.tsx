import React, { useRef, useState, useEffect } from 'react';
import { NOZZLES, type WashInput, neutralWashInput } from '../shared/powerwash';
import { type RoomState, type SplitConsentRequest } from '../shared/types';
import {controllerFullscreen} from './controllerOrientation';

interface WashControllerProps {
  room: RoomState;
  playerId: string;
  onInput: (input: WashInput) => void;
  onSplitResponse?: (requestId: string, accept: boolean) => void;
  statusPill: React.ReactNode;
}

export function WashController({
  room,
  playerId,
  onInput,
  onSplitResponse,
  statusPill,
}: WashControllerProps) {
  const me = room.players.find(p => p.id === playerId);
  const myWashPlayer = room.wash?.players.find(p => p.id === playerId);

  const callback=useRef(onInput);callback.current=onInput;
  const inputRef = useRef<WashInput>({...neutralWashInput(),yaw:myWashPlayer?.yaw||0,pitch:myWashPlayer?.pitch||0,nozzle:1});
  const [sprayToggle, setSprayToggle] = useState(false);
  const [activeNozzle, setActiveNozzle] = useState(1);
  const [highlightActive, setHighlightActive] = useState(false);
  const [isSpraying, setIsSpraying] = useState(false);

  // Joystick state
  const joystickRef = useRef<HTMLDivElement>(null);
  const [joystickThumb, setJoystickThumb] = useState({ x: 0, y: 0 });
  const joystickTouchId = useRef<number | null>(null);
  const moveOrigin=useRef<{x:number;y:number}|null>(null);
  const [moveAnchor,setMoveAnchor]=useState<{x:number;y:number}|null>(null);
  const sprayPointer=useRef<number|null>(null);
  const highlightTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

  // Look pad state
  const lookPadRef = useRef<HTMLDivElement>(null);
  const lookLastPos = useRef<{ x: number; y: number } | null>(null);
  const lookTouchId = useRef<number | null>(null);

  // Split screen request modal for this player
  const pendingSplitRequest = room.splitRequests.find(r => r.targetPlayerIds.includes(playerId));

  function updateInput(partial: Partial<WashInput>) {
    inputRef.current = { ...inputRef.current, ...partial };
    callback.current(inputRef.current);
  }

  // Handle Joystick (Left thumb - Movement)
  function handleJoystickStart(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if(joystickTouchId.current!==null)return;
    e.currentTarget.setPointerCapture(e.pointerId);
    joystickTouchId.current = e.pointerId;
    moveOrigin.current={x:e.clientX,y:e.clientY};
    const rect=e.currentTarget.getBoundingClientRect();setMoveAnchor({x:e.clientX-rect.left,y:e.clientY-rect.top});
    updateJoystickPos(e.clientX, e.clientY);
  }

  function handleJoystickMove(e: React.PointerEvent<HTMLDivElement>) {
    if (joystickTouchId.current !== e.pointerId) return;
    updateJoystickPos(e.clientX, e.clientY);
  }

  function handleJoystickEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (joystickTouchId.current === e.pointerId) {
      joystickTouchId.current = null;
      moveOrigin.current=null;setMoveAnchor(null);
      setJoystickThumb({ x: 0, y: 0 });
      updateInput({ moveX: 0, moveZ: 0 });
    }
  }

  function updateJoystickPos(clientX: number, clientY: number) {
    if (!joystickRef.current) return;
    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = moveOrigin.current?.x ?? rect.left + rect.width / 2;
    const centerY = moveOrigin.current?.y ?? rect.top + rect.height / 2;
    const maxRadius = Math.min(rect.width,rect.height)*.3;

    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    setJoystickThumb({ x: dx, y: dy });

    // Normalized move vectors: dx = strafe (moveX), -dy = forward/backward (moveZ)
    const normX = dx / maxRadius;
    const normZ = -dy / maxRadius;
    updateInput({ moveX: normX, moveZ: normZ });
  }

  // Handle Look Pad (Right thumb - Aiming)
  function handleLookStart(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if(lookTouchId.current!==null)return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lookTouchId.current = e.pointerId;
    lookLastPos.current = { x: e.clientX, y: e.clientY };
  }

  function handleLookMove(e: React.PointerEvent<HTMLDivElement>) {
    if (lookTouchId.current !== e.pointerId || !lookLastPos.current) return;
    const dx = e.clientX - lookLastPos.current.x;
    const dy = e.clientY - lookLastPos.current.y;
    lookLastPos.current = { x: e.clientX, y: e.clientY };

    const sensitivity = 0.006;
    let newYaw = inputRef.current.yaw - dx * sensitivity;
    let newPitch = inputRef.current.pitch - dy * sensitivity;
    newPitch = Math.max(-1.3, Math.min(1.3, newPitch));

    updateInput({ yaw: newYaw, pitch: newPitch });
  }

  function handleLookEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (lookTouchId.current === e.pointerId) {
      lookTouchId.current = null;
      lookLastPos.current = null;
    }
  }

  // Handle Spray Press & Toggle
  function handleSprayDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    if(sprayPointer.current!==null)return;
    sprayPointer.current=e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (sprayToggle) {
      // In toggle mode, tap switches on/off
      const next = !isSpraying;
      setIsSpraying(next);
      updateInput({ spray: next });
      if ('vibrate' in navigator && next) navigator.vibrate(20);
    } else {
      // Hold mode
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsSpraying(true);
      updateInput({ spray: true });
      if ('vibrate' in navigator) navigator.vibrate(20);
    }
  }

  function handleSprayUp(e: React.PointerEvent<HTMLButtonElement>) {
    if(sprayPointer.current!==e.pointerId)return;
    sprayPointer.current=null;
    if (!sprayToggle) {
      setIsSpraying(false);
      updateInput({ spray: false });
    }
  }

  function selectNozzle(index: number) {
    setActiveNozzle(index);
    updateInput({ nozzle: index });
    if ('vibrate' in navigator) navigator.vibrate(10);
  }

  function triggerHighlight() {
    setHighlightActive(true);
    updateInput({ highlight: true });
    if ('vibrate' in navigator) navigator.vibrate([15, 30, 15]);
    if(highlightTimer.current)clearTimeout(highlightTimer.current);
    highlightTimer.current=setTimeout(() => {
      setHighlightActive(false);
      updateInput({ highlight: false });
    }, 2500);
  }

  // Safety release on window blur or pointer cancel
  useEffect(() => {
    function releaseAll() {
      setJoystickThumb({ x: 0, y: 0 });
      joystickTouchId.current = null;
      lookTouchId.current = null;
      lookLastPos.current = null;
      moveOrigin.current=null;setMoveAnchor(null);sprayPointer.current=null;
      setIsSpraying(false);
      updateInput({ moveX: 0, moveZ: 0, spray: false });
    }
    const visibility=()=>{if(document.hidden)releaseAll();};
    window.addEventListener('blur', releaseAll);
    window.addEventListener('pointercancel', releaseAll);
    window.addEventListener('resize', releaseAll);
    document.addEventListener('visibilitychange',visibility);
    return () => {
      window.removeEventListener('blur', releaseAll);
      window.removeEventListener('pointercancel', releaseAll);
      window.removeEventListener('resize',releaseAll);
      document.removeEventListener('visibilitychange',visibility);
      if(highlightTimer.current)clearTimeout(highlightTimer.current);
      callback.current({...inputRef.current,moveX:0,moveZ:0,spray:false,highlight:false});
    };
  }, []);

  return (
    <div className="wash-controller-container">
      {/* Top Header */}
      <header className="wash-controller-header">
        <div className="controller-player-badge">
          <span className="player-avatar-dot" style={{ background: me?.color || '#38bdf8' }} />
          <div>
            <h3>{me?.name || 'Player'}</h3>
            <small>ROOM: {room.code}</small>
          </div>
        </div>
        <div className="controller-job-stats">
          <span className="stat-pill">
            JOB: <b>{room.wash?.jobPercent || 0}%</b>
          </span>
          <span className="stat-pill">
            CLEANED: <b>{myWashPlayer?.cleanedCount || 0}</b>
          </span>
        </div>
        {statusPill}
        <button className="remote-fullscreen" aria-label="Controller fullscreen" onClick={controllerFullscreen}>⛶</button>
      </header>

      {/* Split-Screen Request Notification on Phone Controller */}
      {pendingSplitRequest && (
        <aside className="phone-consent-banner" role="alert">
          <div>
            <b>{pendingSplitRequest.fromName}</b> requested split screen on your display.
          </div>
          <div className="consent-actions">
            <button
              className="primary-small"
              onClick={() => onSplitResponse?.(pendingSplitRequest.id, true)}
            >
              ✓ Accept
            </button>
            <button
              className="outline-small"
              onClick={() => onSplitResponse?.(pendingSplitRequest.id, false)}
            >
              ✕ Decline
            </button>
          </div>
        </aside>
      )}

      {/* Central Touch Area */}
      <main className="wash-controller-touchpad">
        {/* Left Thumb Joystick */}
        <section
          className="virtual-joystick-base"
          ref={joystickRef}
          onPointerDown={handleJoystickStart}
          onPointerMove={handleJoystickMove}
          onPointerUp={handleJoystickEnd}
          onPointerCancel={handleJoystickEnd}
          onLostPointerCapture={handleJoystickEnd}
          aria-label="Move pad"
        >
          <div
            className="virtual-joystick-thumb"
            style={{
              left:moveAnchor?.x??'50%',top:moveAnchor?.y??'50%',
              transform: `translate(calc(-50% + ${joystickThumb.x}px), calc(-50% + ${joystickThumb.y}px))`,
            }}
          />
          <span className="joystick-guide-label">MOVE <small>Drag anywhere</small></span>
        </section>

        {/* Right Thumb Look Pad */}
        <section
          className="virtual-lookpad"
          ref={lookPadRef}
          onPointerDown={handleLookStart}
          onPointerMove={handleLookMove}
          onPointerUp={handleLookEnd}
          onPointerCancel={handleLookEnd}
          onLostPointerCapture={handleLookEnd}
          aria-label="Aim pad"
        >
          <div className="lookpad-reticle">
            <span className="reticle-dot" />
            <span className="lookpad-label">DRAG TO AIM</span>
          </div>
        </section>
      </main>

      {/* Bottom Tool & Spray Bar */}
      <footer className="wash-controller-toolbar">
        {/* Nozzle Switcher */}
        <div className="nozzle-selector-row">
          {NOZZLES.map((n, i) => (
            <button
              key={n.id}
              type="button"
              aria-label={`Nozzle ${n.name}`}
              aria-pressed={activeNozzle===i}
              className={`nozzle-btn ${activeNozzle === i ? 'active' : ''}`}
              style={{ borderColor: activeNozzle === i ? n.color : 'transparent' }}
              onClick={() => selectNozzle(i)}
            >
              <span className="nozzle-color-dot" style={{ background: n.color }} />
              <span className="nozzle-name">{n.name}</span>
            </button>
          ))}
        </div>

        {/* Action Buttons Row */}
        <div className="action-row">
          {/* Highlight Dirt Button */}
          <button
            type="button"
            className={`tool-action-btn ${highlightActive ? 'active' : ''}`}
            onClick={triggerHighlight}
            disabled={highlightActive}
          >
            <span>✨</span>
            <small>{highlightActive ? 'SCANNING…' : 'HIGHLIGHT DIRT'}</small>
          </button>

          {/* Toggle Spray Mode Switch */}
          <button
            type="button"
            className={`tool-action-btn toggle-spray-btn ${sprayToggle ? 'active' : ''}`}
            aria-pressed={sprayToggle}
            onClick={() => {
              setSprayToggle(!sprayToggle);
              if (sprayToggle && isSpraying) {
                setIsSpraying(false);
                updateInput({ spray: false });
              }
            }}
          >
            <span>⮂</span>
            <small>{sprayToggle ? 'TOGGLE: ON' : 'HOLD TO SPRAY'}</small>
          </button>

          {/* Big Spray Button */}
          <button
            type="button"
            className={`main-spray-btn ${isSpraying ? 'spraying' : ''}`}
            aria-label="Spray"
            aria-pressed={isSpraying}
            onPointerDown={handleSprayDown}
            onPointerUp={handleSprayUp}
            onPointerCancel={handleSprayUp}
            onLostPointerCapture={handleSprayUp}
          >
            <span className="spray-icon">💧</span>
            <b>{isSpraying ? 'SPRAYING' : 'SPRAY'}</b><small>{sprayToggle?'Tap on / off':'Hold to wash'}</small>
          </button>
        </div>
      </footer>
    </div>
  );
}
