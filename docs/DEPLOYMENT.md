# Current Rushroom deployment — October 12, 2026

Current frontend: https://rushroom-games.vercel.app

Current test backend: https://sb-2cf1zfkzsyid.vercel.run (`rushroom-live-restored`), expires **October 12 at 05:08:23 IST / October 11 at 23:38:23 UTC**. Static publication does not keep multiplayer running after sandbox expiry. Extending the previous sandbox beyond its maximum execution timeout was rejected. Persistent play needs a long-lived Node/WebSocket host.

When replacing a backend, update the **Vercel project environment variable `VITE_SERVER_ORIGIN`**, the client fallback in `src/client/config.ts`, and both HTTP rewrites in `vercel.json`, then redeploy. Environment values override the fallback. The reconnection incident was caused by an old expired backend URL remaining in this build setting.

Run `TEST_SERVER_URL=<current-backend> node scripts/public-connection-test.mjs` to verify the actual public WebSocket destination, create/join, game start and player resume. Record the deployment ID, source commit, backend URL/expiry and actual results in `AGENT-HANDOFF.md`. HTTP health/config responses alone do not prove multiplayer works.

## Historical deployment — October 11, 2026

The URLs and expiry below describe earlier testing, not the current backend.

October 12 naming update: the Vercel project is now `rushroom`; the main public URL is https://rushroom-games.vercel.app. The user retired both `rushroom-split.vercel.app` and `kart-rush-arena.vercel.app`; do not reattach them. `rushroom.vercel.app` is assigned to another project. Domain changes do not refresh the temporary backend. See [AGENT-HANDOFF.md](AGENT-HANDOFF.md) for current source/deployment status.

Current frontend: https://rushroom-games.vercel.app

Retired frontend: `kart-rush-arena.vercel.app` was removed on October 12 at the user's request; fresh requests return HTTP 404. Do not reattach it. The historical verification URLs below describe earlier tests.

Authoritative game server: https://sb-5gif87awqlqg.vercel.run

Server expires October 12, 2026 at **00:32:18 IST / October 11, 19:02:18 UTC**. This is a temporary test deployment. The static frontend remains published after expiry, but rooms and races need the running server. Restarting a server loses its ephemeral rooms.

Vercel project `kart-rush-arena` hosts the Vite frontend. `VITE_SERVER_ORIGIN` is a public build-time URL. The browser connects directly to the Sandbox over WSS; the backend validates the frontend Origin. Configuration requests use narrowly scoped CORS. HTTP configuration and health paths also have Vercel rewrites. No authentication credential is embedded in the build or server.

The Vercel Sandbox runs one long-lived Node 24 process, preserving shared room authority across all controllers and displays. The supplied short-lived token was passed to deployment tooling through stdin only; it was not written to files or passed as a command-line argument.

`scripts/deploy-vercel-test.mjs` accepts deployment credentials as JSON through stdin, creates a 45-minute test Sandbox or updates a named existing one, uploads built assets/server, installs runtime dependencies, starts the process and verifies health. Metadata without credentials is in `test-deployment.json`.

For a permanent deployment, run the authoritative server on a persistent Node/WebSocket host with HTTPS. Set `VITE_SERVER_ORIGIN` to that backend, `PUBLIC_ORIGIN` to the frontend, update the HTTP rewrites, and redeploy. The existing Docker/Caddy option serves frontend and backend at one origin. A normal Vercel Function cannot substitute for shared in-memory room state across separate function instances without an appropriate durable room architecture.

Public browser verification uses `TEST_URL=https://kart-rush-arena.vercel.app` and `TEST_SERVER_URL=https://sb-5gif87awqlqg.vercel.run` with `node scripts/browser-test.mjs`. These URLs contain no secrets.


