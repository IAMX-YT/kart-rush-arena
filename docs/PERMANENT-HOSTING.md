# Permanent multiplayer backend deployment

The user requires a persistent backend and forbids IAMX-YT GitHub Actions. Do not substitute rotating Sandboxes or Actions jobs for permanent hosting.

## Ready-to-deploy server

The existing Docker image runs the authoritative Node server; `compose.yaml` starts it with `restart: unless-stopped`, a health check and Caddy HTTPS. One replica owns all active rooms. Rooms are in memory and reset on server restart; persistent hosting removes the fixed execution expiry, not room resets during deployments.

Deployment requires a personal VPS with Docker/Caddy access and a backend hostname resolving to it, or a persistent Node/container hosting account. The frontend remains `https://rushroom-games.vercel.app`.

On the authorized VPS, configure these values in its deployment environment:

```dotenv
GAME_DOMAIN=<backend-hostname-pointing-to-this-VPS>
PUBLIC_ORIGIN=https://rushroom-games.vercel.app
```

The backend hostname belongs to Caddy TLS; `PUBLIC_ORIGIN` belongs to frontend Origin validation and generated room links. They are separate so phone QR links continue opening the Vercel frontend.

Run `docker compose up -d --build`, verify `https://<backend-hostname>/health`, then set Vercel's public `VITE_SERVER_ORIGIN` environment variable to that backend. Update the source fallback and the `/api/config` and `/health` rewrites too, then redeploy the frontend.

Run the public browser test for both games:

```sh
TEST_SERVER_URL=https://<backend-hostname> node scripts/public-connection-test.mjs
TEST_SERVER_URL=https://<backend-hostname> TEST_GAME=kart-rush node scripts/public-connection-test.mjs
```

Verify Create, the three explicit join roles, start, phone controller inputs and reconnect. Check the service after a restart before calling deployment persistent. Record source commit, frontend deployment ID, backend URL and actual checks in `AGENT-HANDOFF.md`.

## Access still needed

Vercel now supports WebSockets in Functions (Beta): https://vercel.com/docs/functions/websockets . A Vercel-native on-demand migration is another option; this game's current single-process in-memory room simulation cannot simply be copied across independent Function instances. It needs shared durable state, one simulation owner per room, cross-instance coordination and reconnect recovery. The current Sandbox architecture has not been migrated.

The alternate GitHub token identifies `thatsego-account-manger`; API identity does not establish that it is a temporary account. No Actions workflow was created or run. GitHub repository access does not supply VPS or hosting credentials. Personal VPS/Node-hosting selection and access are still pending, so permanent hosting has not been deployed.

On October 12 the user selected **a different VPS / Railway / Render**, saying they will provide details. Do not use `145.223.33.135` for Rushroom. The chosen new host/project and its deployment access are still needed. Both the old sandbox `/health` and the public frontend `/health` return HTTP 410.
