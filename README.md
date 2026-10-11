# Rushroom — Multiplayer Gaming Platform

Shared agent status and integration notes: [AGENT-HANDOFF.md](docs/AGENT-HANDOFF.md).

Original browser-based cooperative and competitive multiplayer platform: play on any phone, tablet, laptop, or shared TV screen with tactile phone controllers. Authoritative Node/WebSocket simulation. No login or office accounts needed.

## Games in the Platform
1. **Power Wash Simulator 2 (New)**: 3D cooperative pressure-washing game. Team up with friends to restore a sunlit garden courtyard (patio, bench, bicycle, garden cart, fence, and stone birdbath) to pristine glory. Features dynamic surface dirt removal, 4 swappable nozzles, dirt sonar highlights, simultaneous cleaning, and rewarding audio chimes.
2. **Kart Rush Arena**: 3D racing game around Sunburst Circuit with drift mechanics, items, and multi-camera split-screen chase viewports.
3. **Circuit Clash**: Combat racing game (in development).

## The Three Play Arrangements

The platform cleanly decouples player identity, controller device, display device, and display layout:

- **Arrangement A — Play on this device**:
  Each player uses their own phone, tablet, laptop or desktop. Gameplay and controls are on the same device (PC keyboard/mouse or Mobile touch overlay).
- **Arrangement B — Shared TV + Phone Controllers**:
  One shared large screen displays the game with up to 4 split viewports. Two to four players use their own phones as tactile gamepads. Phones in controller-only mode do not render the 3D scene, saving battery and GPU.
- **Arrangement C — Different Homes, Flexible Devices**:
  Players in different physical locations can mix device setups (e.g. Player A uses TV + phone at Home A, Player B plays on a tablet at Home B).

## Independent Split-Screen & Consent Protocol
Each display has a local layout control:
- Toggling split-screen changes **only** the local screen.
- Optional checkbox: *"Request split view on the other player’s screen too"* (unchecked by default).
- When requested, recipient displays receive a top-right consent banner identified with the requester's name to Accept or Decline.
- Paired phone controllers also show the Accept/Decline prompt so TV users without a mouse can respond.
- Layouts remain independent after acceptance.

## Install and Develop
Requirements: Node.js 24+, pnpm 11+.

```sh
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Development binds all network interfaces. Production:

```sh
pnpm test
pnpm build
pnpm start
```

## Power Wash Controls
- **PC Desktop**:
  - `WASD` / Arrows: Walk / Strafe
  - Mouse / Arrow keys: Aim washer nozzle
  - `Space` / Left Mouse Click: Spray water
  - `1` / `2` / `3` / `4`: Select nozzle (0° Pinpoint, 15° Narrow, 40° Wide, Turbo Soap)
  - `H` / `Tab`: Sonar Dirt Highlight (illuminates missed dirt in amber)
- **Phone Controller (Tactile Gamepad)**:
  - Left thumb: Virtual Joystick for smooth movement
  - Right thumb: Virtual Look Pad to aim
  - Big SPRAY button (plus optional Toggle Spray mode)
  - Nozzle switcher buttons
  - Highlight Dirt button
  - In-game Split Screen Consent prompt (Accept / Decline)

## Verification
All 43 automated unit and integration tests pass via `pnpm test`, verifying:
1. Two players using separate devices (Arrangement A).
2. One shared display with two phone controllers (Arrangement B).
3. One shared display with four player views/controllers.
4. Two homes, each represented by a display + paired phone (Arrangement C).
5. Mixed arrangements (Mobile player + TV/Phone player).
6. Local split toggles without affecting other screens.
7. Split request and acceptance consent flow.
8. Split request decline / timeout.
9. Returning to fullscreen leaves other screens unchanged.
10. Simultaneous cleaning of the same object without race conditions or double-counting.
11. Disconnect and reconnect with correct identity and dirt-state recovery.
12. Touch release / cancellation without stuck movement or spraying.
13. Completing a job (98% threshold), results screen, and replaying.
14. Preservation of the existing Kart Rush Arena game.
