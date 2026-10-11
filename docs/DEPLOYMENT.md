# Temporary Vercel test deployment — October 11, 2026

October 12 naming update: the Vercel project is now `rushroom`; the preferred verified public alias is https://rushroom-split.vercel.app. The earlier https://rushroom-games.vercel.app alias remains attached. They route to the existing production deployment. `rushroom.vercel.app` is assigned to another project. These alias changes do not refresh the temporary backend or deploy newer source commits. See [AGENT-HANDOFF.md](AGENT-HANDOFF.md) for shared agent and deployment status.

Frontend: https://kart-rush-arena.vercel.app

Authoritative game server: https://sb-5gif87awqlqg.vercel.run

Server expires October 12, 2026 at **00:32:18 IST / October 11, 19:02:18 UTC**. This is a temporary test deployment. The static frontend remains published after expiry, but rooms and races need the running server. Restarting a server loses its ephemeral rooms.

Vercel project `kart-rush-arena` hosts the Vite frontend. `VITE_SERVER_ORIGIN` is a public build-time URL. The browser connects directly to the Sandbox over WSS; the backend validates the frontend Origin. Configuration requests use narrowly scoped CORS. HTTP configuration and health paths also have Vercel rewrites. No authentication credential is embedded in the build or server.

The Vercel Sandbox runs one long-lived Node 24 process, preserving shared room authority across all controllers and displays. The supplied short-lived token was passed to deployment tooling through stdin only; it was not written to files or passed as a command-line argument.

`scripts/deploy-vercel-test.mjs` accepts deployment credentials as JSON through stdin, creates a 45-minute test Sandbox or updates a named existing one, uploads built assets/server, installs runtime dependencies, starts the process and verifies health. Metadata without credentials is in `test-deployment.json`.

For a permanent deployment, run the authoritative server on a persistent Node/WebSocket host with HTTPS. Set `VITE_SERVER_ORIGIN` to that backend, `PUBLIC_ORIGIN` to the frontend, update the HTTP rewrites, and redeploy. The existing Docker/Caddy option serves frontend and backend at one origin. A normal Vercel Function cannot substitute for shared in-memory room state across separate function instances without an appropriate durable room architecture.

Public browser verification uses `TEST_URL=https://kart-rush-arena.vercel.app` and `TEST_SERVER_URL=https://sb-5gif87awqlqg.vercel.run` with `node scripts/browser-test.mjs`. These URLs contain no secrets.


