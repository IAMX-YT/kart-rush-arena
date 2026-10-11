# Verification — 11 October 2026

## Executed successfully
`pnpm build`: strict TypeScript check, Vite production client build, esbuild Node server bundle. Client shell ~277 KB, lazy Three.js scene ~491 KB before gzip. Built server serves index, assets, controllers, `/ws`, `/api/config`, `/health`.

`pnpm test`: **19/19 passed**. Gas/steering/braking/reverse; camera-relative left/right direction at four headings; barrier and kart collision; all ordered gates, lap/finish/ranking; boost/shield/pulse; pickup/item cooldown behavior; drift traction; respawn; pause; disconnect grace; two independently controlled karts complete three laps; replay. Room creation/code/URLs, invalid code, full room, duplicate join, readiness/host authority, resume identity, stale input, cleanup/expiry, safe snapshots, mode/game selection and spectators. Actual online-mode loopback server test rejects wrong WS origin (403), >4 KiB message (1009), input/message flood (4008), malformed JSON, and pairs independent WS clients.

`node scripts/browser-test.mjs`: **Chrome passed**, host at localhost and two independent mobile browser contexts at host LAN IPv4 URL. 390×844, 430×932, rotated 844×390. Real CDP simultaneous gas + left touches moved/steered authoritative kart; blur/touch cancellation cleared controls; temporary WS interruption resumed same driver. Browser keyboard events through controller input pipeline drove both drivers through full three-lap race; all clients received same finish order; results screen and replay lobby verified. Runtime errors: zero. External browser requests blocked during final run; none requested. Screenshot files in `test-results/` were visually inspected.

Chrome final full-race run: race 45.77 simulated seconds; RTT samples 5 / 3 / 2 ms for screen/controllers; software-renderer sample 9 FPS. Maximum measured simulation update wall time 131.21 ms under CPU/software-rendering load. Earlier lighter Chrome run completed in 34.12 seconds with maximum simulation update 9.19 ms. Timing includes process scheduling and is not a production latency guarantee. Rendering is independent of authoritative simulation; snapshots use interpolation. Chromium background timer throttling was disabled in multi-context test so simulated phones behave as separate foreground devices.

`BROWSER_CHANNEL=msedge node scripts/browser-test.mjs`: **Edge passed**, same complete controller/reconnect/race/results/replay checks, zero runtime errors and no external asset requests. Race 53.97 simulated seconds; sampled RTT 253 / 22 / 63 ms; 7 FPS with software WebGL. This Edge run preceded final scenery instancing optimization. No claim of 60 FPS on ordinary hardware is made from these software-rendered tests. Final rendering batches repeated barriers, markings and trees; slow frames lower pixel ratio and disable shadows. GPU performance and network-latency/loss profiling remain release gates.

`node scripts/compatibility-test.mjs`: **passed with WebGL disabled**. 2D canvas renderer visible, keyboard throttle moved actual kart, AudioContext entered running state after click, host pause froze race timer and resume advanced it, lobby return worked, zero runtime errors.

`node scripts/lan.mjs` with PORT=3002: printed host LAN address, served bundled production build; host IPv4 `/health` returned `ok:true`, mode LAN. This is an implemented Node LAN hosting mechanism, not static-site LAN discovery.

`TEST_WEBGL=1 node scripts/compatibility-test.mjs`: final Three.js build passed keyboard motion, audio startup, graphics switching/resource cleanup, pause/resume and lobby return with zero runtime errors.

Windows `./Start-LAN.ps1` was also executed on PORT=3003; its server health returned `ok:true`. Test preview servers were stopped after verification; start the launcher to play.

## Fixes driven by testing
Exact-overlap kart separation; color selector submitting join form; unjoined controller reset sending input; stale pressed styling after touch interruption; low-speed steering lock against barriers; checkpoint detection and bounds after collision displacement; 15-second all-driver disconnect grace; separate/lazy 3D bundle; repeated scenery instancing. Reconnect token message type was corrected before browser tests. Initial full-browser autopilot timed out; recovered steering and foreground timer behavior were tested before reporting success.

## Implemented scope
Home/library/help, LAN/online selection, QR pairing and code entry, name/color selection, roster/ready checks, original karts/track/scenery, chase-camera selection, keyboard/phone input, laps/timer/ranks/results, power-ups, effects/synthesized audio, pause/replay, reconnect/stale-input reset, bounded messages and room cleanup. Server-only race authority and extensible game metadata/lifecycle. No proprietary assets, accounts, secrets or database.

## Not executed / external requirements
- Two **physical** phones sharing Wi-Fi/mobile hotspot, Android Chrome + iOS Safari multi-touch, device screen sleep/haptics/fullscreen/browser gesture behavior.
- Firefox/Safari runtime compatibility. Tested mobile viewports are desktop Chrome/Edge emulation, not those browsers.
- Clients in different cities or on separate physical networks. Public HTTPS/WSS deployment was verified using independent browser contexts on this computer; see the deployed verification below.
- Docker build/Caddy certificate issuance on a Docker-enabled internet host. The current public test uses Vercel and a temporary Sandbox.
- Deliberately disconnecting this computer's internet. Browser external requests were blocked, and bundled LAN assets needed none; that does not substitute for physical network-off verification.
- Dedicated high-latency/packet-loss, 8-phone load, soak/leak and regional scaling tests; hardware 60 FPS and item balance playtesting.
- Reference trailer frame-by-frame/gameplay session. Research records verified public descriptions and remaining unknowns.

## Limitations / next work
One planar arcade oval, one chase camera per display, 3D chase view on phones and shared displays, no bots/progression/accounts. Ephemeral single-process rooms reset on restart; multi-instance deployments require sticky routing/shared room directory. Pause does not require a voting protocol. Combat title Circuit Clash is locked, with integration interface and roadmap only. Public release requires the physical-device/network/performance checks above.




## Public Vercel verification — October 11, 2026

https://kart-rush-arena.vercel.app passed the full Chrome browser test against the Mumbai Vercel Sandbox: host display plus two independent phone-sized contexts, QR join URL, readiness gate, real simultaneous touchscreen gas/steering, blur/cancel reset, portrait/landscape layout, disconnect/resume with the same identity, a complete three-lap two-player race, identical finish order on every client, and replay lobby. Race duration 39.60 seconds; RTT host/phones 49/24/38 ms; zero browser errors and unexpected external requests. Software renderer reported 34 FPS in this run. Server maximum simulation tick cost 2.85 ms. This does not establish physical-device performance or performance for geographically separated players.

Early US-region attempts exposed controller latency and a flaky fixed-duration touch test; the server moved to Mumbai, duplicate input transmissions were suppressed, and the touch assertion now waits for authoritative movement while touch remains held. The final public run passed. Build and all 18 tests passed after the implementation changes.

The server is temporary and expires October 12 at 00:32:18 IST. The frontend remains published, but games need a running backend after that time. See DEPLOYMENT.md and test-deployment.json for details. No deployment credential is stored in the project.



## 3D cockpit and steering revision — October 11

Server steering sign now follows chase-camera screen coordinates. The added regression covers LEFT/RIGHT at four headings; all **19 tests** pass. Real CDP simultaneous gas+LEFT and gas+RIGHT were exercised in the deployed Chrome UI and produced the matching camera-relative heading change.

Phone controllers now have their own 3D chase camera, with portrait/landscape touch controls overlaid. Landing preview and game-library artwork use the original rendered miniature world. Toy karts, procedural ground/road textures, sculpted garden props, warm sky/lighting, soft shadows and a faster initial camera were added. Static props are merged by material and low graphics uses diffuse lighting.

Full public two-player test passed after the renderer update: all three laps, identical finish order, disconnect/resume identity and replay lobby, zero browser errors or unexpected external requests. The software-rendered host plus two 3D phone contexts were expensive on this machine: host 7 FPS, sampled RTT 276/225/273 ms, automated race 176.12 seconds. An earlier local 3D-cockpit run completed in 78.68 seconds. These are software-renderer measurements and do not verify physical mobile GPU performance. A 100-second test deadline was insufficient; the completed run used 180 seconds, below the game's five-minute race limit. WebGL-disabled compatibility and final low-graphics switching/audio/pause checks passed separately.

The final unchanged game code moved to a fresh Mumbai Sandbox for a longer test window (expires October 12 at 00:32:18 IST). The full race used the previous Mumbai session; the final session is checked with the deployed 3D/touch/reconnect smoke test. The previous session was retired after the full race. Refresh all existing browser tabs to load the updated frontend and server URL; existing ephemeral rooms are not transferred.


## TV split-screen and phone gamepads — October 12 IST

Updated product flow: Create a room opens a QR lobby directly. Both phones Join and Ready; the host starts from the TV. The TV uses independent chase cameras in a single Three.js scene/renderer with scissored viewports. Two players have side-by-side halves. All one-to-eight-player layouts are bounded and non-overlapping in viewport regression tests. Player name/color and lap/place labels identify each pane. Phones have no game canvas and use large touch targets in portrait/landscape. Steering stays on the left side of the controller and pedals on the right.

Build and all 21 tests pass. Public Chrome host plus two independent phone contexts verified distinct TV player panes, no phone game canvas, main portrait button rectangles at least 150px wide and 100px tall, actual simultaneous touches for both directions, touch interruption reset, reconnect identity, full two-player three-lap race, identical results and replay. Race 52.63s; sampled RTT 49/47/25ms; host software-renderer 14 FPS; zero browser errors or unexpected external requests. Physical TV/browser and real-phone hardware performance remain unverified. The final portrait thumb arrangement also receives the deployed smoke check.

The TV still uses a shared 2D map compatibility fallback if WebGL is unavailable; independent 3D split cameras require WebGL on the TV. Phones require no WebGL. Final deployment dpl_ARR37dVM4TxVrhVnr9eQteizy1gj on the same public URL and Mumbai backend. Backend expiry remains October 12 at 00:32:18 IST.
