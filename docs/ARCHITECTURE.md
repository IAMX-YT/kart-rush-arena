# Architecture

Browser React UI → same-origin WebSocket → Node room manager → game plugins (`kartPlugin` & `powerWashPlugin`) → fixed-step simulation → sanitized snapshots → display renderer / phone controller.

`src/shared` holds wire types, registry metadata, deterministic kart simulation, and authoritative power-wash simulation with compact run-length dirt grid synchronization. `src/server` owns authentication, rooms, validation, pairing, split-screen consent rate limiting, and timing. `src/client` owns pairing flows, lobby, tactile phone controllers, Three.js 3D multi-viewport rendering, and procedural Web Audio synthesizers. All essential assets are original procedural geometry, procedural canvas textures, or bundled SVG/CSS.

## Platform Device Model & Three Arrangements

The platform strictly decouples five concepts:
1. **Player Identity**: Represents a player profile (`id`, `name`, `color`, `ready`, `connected`).
2. **Controller Device**: Input transmitter (Phone touch gamepad or keyboard/mouse).
3. **Display Device**: Rendering canvas (TV, monitor, laptop, or phone).
4. **Display Layout**: Local viewport presentation (Single view or Split views).
5. **Shared Game State**: Authoritative server simulation.

### The 3 Play Arrangements
- **Arrangement A (Play on this device)**: Single device per player (phone, tablet, laptop, or desktop). On PC, keyboard/mouse controls are used; on mobile, overlaid touch controls are active.
- **Arrangement B (Shared TV + Phone Controllers)**: One big screen renders 2 to 4 split viewports using Three.js scissor regions on a single `WebGLRenderer`. Two to four players use their own phones as controllers. Phone controllers render large tactile touchpads without rendering 3D graphics.
- **Arrangement C (Different Homes, Flexible Devices)**: Mixed setups across physical locations (e.g. Player A uses TV + phone at home, Player B plays on mobile).

### Independent Split-Screen & Consent Protocol
Each display controls its own presentation layout independently:
- Enabling local split-screen affects only the local display.
- Requester can optionally check *"Request split view on the other player’s screen too"*.
- Targeted players receive a top-right consent banner identified with the requester's name.
- Recipients can Accept or Decline. Paired phone controllers also receive the prompt so TV users without mouse/touch can respond.
- Upon acceptance, the recipient's display updates to split view. Layouts remain independent thereafter.

## Power Wash Simulator 2 Game Engine

### Environment & Cleanable Objects
- **Courtyard Patio**: 16m × 16m sandstone terrace with procedural flagstone tiles and grime overlay (32×32 grid = 1,024 cells).
- **Garden Bench**: Cast-iron frame with varnished wood slats covered in algae and moss (16×16 grid = 256 cells).
- **Vintage Bicycle**: Painted steel frame, chrome handlebars, rubber wheels with dirt splatter (16×16 grid = 256 cells).
- **Garden Cart / Wheelbarrow**: Wood box with metal wheels and mud caking (20×20 grid = 400 cells).
- **Picket Fence**: White painted wood pickets with mildew (32×12 grid = 384 cells).
- **Stone Birdbath**: Carved stone pedestal and basin with algae (16×16 grid = 256 cells).

### Authoritative Dirt Synchronization
- Each cleanable object maintains a discrete surface cell grid.
- Hit detection uses ray-box intersections from the player's camera position and aim angles.
- When water spray hits a surface within range, affected cells are marked cleaned.
- **98% Completion Threshold**: When an object reaches ≥98% clean, remaining specks are auto-completed, awarding 100% completion and triggering an audio chime and visual toast.
- **Simultaneous Cleaning**: Cell updates are processed atomically; multiple players cleaning the same object do not corrupt progress or double-count cells.
- **Network Compression**: Dirt grids are serialized using run-length encoding (RLE), sending deltas and full state snapshots on client join/resume.

### Procedural Web Audio Engine
Implemented via Web Audio API (`src/client/washAudio.ts`), requiring no external audio assets and running 100% offline:
- Engine/motor hum oscillator (75 Hz with spray throttle).
- Bandpass-filtered high-pressure water hiss with nozzle-dependent frequency profiles.
- 3-note ascending bell chime (C6, E6, G6) on object completion.
- Sonar ping pulse on dirt highlight.
- Multi-chord victory fanfare on job completion.

## Verification
The test suite in `tests/` verifies all platform and game behaviors:
- `tests/rooms.test.ts`: Room lifecycles, authentication, origin validation, and rate limiting.
- `tests/powerwash.test.ts`: Simulation mechanics, hit testing, threshold triggers, and RLE network packing.
- `tests/platform_verification.test.ts`: Directly tests all 14 scenarios specified in the system brief (Arrangements A, B, C, independent split, consent accept/decline, reconnects, finishing jobs, and kart game compatibility).
