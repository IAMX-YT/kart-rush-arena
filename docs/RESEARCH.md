# Research — 11 October 2026

## Evidence and limits
Research preceded implementation. Sources are public descriptions and official documentation; no proprietary files were extracted. No reference game was personally played. Exact reference physics, controller button mapping, cooldowns and rendering performance remain unknown. A trailer is available on the official Play listing; its video could not be inspected frame by frame in this environment. Screenshots are linked there. Visual design below is original, not a claim about those screenshots.

| Source | Verified finding | Limits |
|---|---|---|
| [AirConsole](https://www.airconsole.com/) and [library](https://www.airconsole.com/games/top-games), [games](https://www.airconsole.com/games) | Platform/reference entry points | Dynamic catalog is not evidence of current availability of every historical game |
| [Official connection guide](https://airconsole.zendesk.com/hc/en-us/articles/360014511400-How-to-Connect) | Big screen displays QR/code; phone becomes controller; lobby selects game | Recommends same Wi-Fi; does not establish offline LAN hosting |
| [Xform developer](https://www.xformgames.com/) | GoKartGo Air is split-screen, up to four players | No authoritative physics specification |
| [Publisher Play listing, screenshots and trailer](https://play.google.com/store/apps/details?id=com.xformgames.gokartgoair) | Phone per player; selectable animals, racing to finish first, items, collectible character unlocks; nine characters and nine tracks advertised; audio/music | App listing version, not universal browser limits; precise lap count, braking/reverse, drift, checkpoint/respawn logic, item names/timing, exact HUD/camera and progression rules not verified |
| [Racing Wars official announcement](https://www.airconsole.com/games/racing-wars-is-finally-here) | Eight local players; Fast/War/Super cups; four named tracks; falling behind, off edges or explosions eliminate for round; starts at five points, first gains two, second one, ten-point goal | Historical announcement; hazard geometry, combat inventory, exact controller layout and detailed scoring loss rules not specified |
| [Official developer interview](https://www.airconsole.com/games/quick-chat-with-big-hut-studios) | Emphasis on eliminating rivals with power-ups and pushing off the road | Does not establish current support |

General inspiration: readable racing, accessible large phone buttons, shared screen, playful silhouettes, clear rankings, combat as a later game. Do not copy named tracks, characters, branding, sounds or geometry.

## Technical evaluation
- [Three.js](https://threejs.org/docs/): maintained browser renderer, procedural geometry, materials, shadows, cameras. Choose for original low-poly scene; render on display, phone controller is DOM.
- [Rapier](https://rapier.rs/docs/): maintained WASM rigid body engine; appropriate for complex terrain/vehicle dynamics. Defer: a planar arcade track needs deterministic, explicit traction and circle collisions, not a full vehicle solver. Our server uses a purpose-built arcade kinematic simulation. No claim of realistic suspension.
- [Colyseus](https://docs.colyseus.io/): room lifecycle/state syncing is useful as scale grows. For first release choose [ws](https://github.com/websockets/ws) with small typed messages, schema validation and explicit room/session ownership; fewer moving parts and one server for LAN/online. Native browser WebSocket connects to it.
- [Vite](https://vite.dev/guide/), React and TypeScript: local asset bundling and UI composition. No CDN/fonts/network asset fetch required during play.
- [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events): independent pointer capture for held multi-touch, cancellation/focus reset. [Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) is optional, secure-context dependent. [Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) requires user interaction for audio startup.
- [Node deployment](https://nodejs.org/en/learn/getting-started/security-best-practices): one long-lived process, TLS reverse proxy, WebSocket upgrades. No database for ephemeral races.

## First game specification (our decisions)
Kart Rush Arena: 1–8 drivers; single-player practice allowed, multiplayer requires every driver connected/ready. Original Sunburst Circuit, a closed oval with broad corners; three laps; 12 ordered gates; 60 Hz authoritative simulation, 20 Hz snapshots. Acceleration, brake/reverse, speed-sensitive steering, reduced traction while drifting, road barriers, kart separation, timed finish order, safe respawn at last checkpoint. Pickup boxes award boost, shield or pulse; only server grants/uses items. Pulse briefly slows nearby unshielded rivals. Third-person smooth camera cycles racers. Host keyboard kart is optional. Phone shows personal status and a live track overview for remote friends.

## Trade-offs and compatibility
Server authority prevents client position/score claims. TCP/WebSocket has head-of-line blocking at high packet loss; use LAN or a geographically close server. Render interpolates snapshots; no predictive collision/score authority on clients. Simulation timing is independent of frame rate. Bound catch-up after stalls and expose timing/room counts at health endpoint. Single process stores rooms; restart loses them; horizontal deployment must keep a room on one instance, with a future shared directory/routing layer.

Online requires a reachable HTTPS/WSS Node host. Code alone provides no network reachability. LAN launcher binds 0.0.0.0 and advertises private IPv4 candidates from host interfaces, with explicit address selection; phone and host must share network and firewall permit port. Local HTTP supports gameplay; wake lock/fullscreen/vibration vary by browser and context. No automatic router/firewall modification. Internet is unnecessary after dependencies/build are present. WebGL2 renderer has a functional 2D canvas fallback. Pixel ratio/shadows are adjustable; 60 FPS is a target, not a measured guarantee.

## Acceptance plan
1. Typecheck and bundle; serve index, controller, all assets locally.
2. Integration: code validation, QR/join URL, readiness, host-only operations, full room, rate/payload/schema limits, reconnect, stale inputs, cleanup.
3. Simulation: drive, turn, reverse, barriers/karts, ordered gates, laps/finish, ranks, all three items, replay.
4. Browser: independent host and two mobile-size clients, real pointer input drives kart, cancel/blur clears input, responsive lobby/controller/results and runtime errors.
5. Repeatable LAN launch and production deployment files. Physical two-phone hotspot and different-city tests are explicitly outstanding if hardware/hosting is unavailable. Record measured test results separately.
