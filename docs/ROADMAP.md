# Roadmap

## Release one
Research → reusable rooms and registry → deterministic arcade racer → mobile input → reconnect/security → bundled LAN host → browser/integration verification → deployment package.

Release scope: one original circuit, eight colors, three laps, three power-ups, TV split chase cameras, controller-only phones with large buttons, keyboard practice, reconnect, replay. No accounts, bots, unlock economy or database.

## Release two: Circuit Clash (original combat racer)
Use existing session/pairing pipeline; supply separate simulation, controller/display components and network payload validator. Build original city/mesa/dock tracks. Prototype race and elimination modes, environmental hazards, server-owned projectile collision and round scoring. Decide our own tournament rules through playtesting; don't duplicate Racing Wars content. Add tournament state/settings and cleanup hooks; test late spectators, elimination controllers, item spam and final scores. Unlock registry card only after playable integration tests pass.

## Before public release
Physical Android Chrome + iOS Safari multi-touch/hotspot tests, remote-network race with real TLS host, latency/loss profiling, accessibility review, long-running room/load test, memory budget, item balance. Then regional routing, sticky room assignment and persistent leaderboards only if usage requires them.

