# Permanent multiplayer backend deployment

The user requires a persistent backend and forbids IAMX-YT GitHub Actions. Do not substitute rotating Sandboxes or Actions jobs for permanent hosting.

## Current live architecture

- Frontend and public HTTPS/WSS endpoint: `https://rushroom-games.vercel.app`. `/ws` uses `api/ws.ts`; `/health` uses `api/health.ts`; `/api/config` returns the online frontend origin. No sandbox URL is used by the current frontend.
- Authoritative game rooms/simulation stay in one persistent VPS process on `65.20.87.31`, listening privately on `127.0.0.1:3210`.
- Vercel Functions open an authenticated SSH exec channel to a fixed relay command. `deploy/relay.mjs` bridges stdin/stdout only to the local Rushroom port. Cloudways disables TCP forwarding, so SSH port forwarding is not used.
- The relay key cannot run arbitrary commands or enable forwarding/PTY. Vercel stores its private key as encrypted deployment environment configuration; the server host key is pinned by SHA256. Each websocket has its own SSH exec channel/connection. The relay verifies the frontend Origin; the backend validates it again.
- Vercel handles public TLS and connection renewal; state remains on the VPS across gateway instances and deployments. Gateway function duration is 300 seconds; clients reconnect/resume after a connection closes. A VPS service restart resets in-memory rooms. Public browser checks passed for both games, including reload/resume.
- This is a persistent backend with an on-demand relay, not a temporary Sandbox or an Actions-hosted game process. The VPS service stays available while idle; empty-room simulation work is minimal. Actions builds and activates releases, then exits.

## Alternative direct HTTPS hosting

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

## Prior access investigation

Vercel supports WebSockets in Functions (Beta): https://vercel.com/docs/functions/websockets . Game simulation is deliberately kept on the VPS because new connections may reach different Function instances. The gateway holds no room state.

The alternate GitHub token identifies `thatsego-account-manger`; API identity does not establish that it is a temporary account. A private deployment repository and manual workflow were created on this account and a VPS activation run succeeded. IAMX-YT Actions were not used.

On October 12 the user supplied SSH access to **65.20.87.31** (Cloudways master account), authorized creating the required setup, and requested GitHub Actions activation. Do not use `145.223.33.135` for Rushroom.

## Cloudways service and deployment automation

- Runtime: isolated Node 24.21.0, verified against the official SHA256 digest, under `/home/master/rushroom/runtime`.
- Backend: `/home/master/rushroom/current`, user systemd unit `rushroom.service`, enabled with `Restart=on-failure`. User lingering is enabled, so it starts without an interactive SSH login. Tested active after a service restart; an actual host reboot has not been performed.
- Listener: `127.0.0.1:3210`, online mode, accepts frontend Origin `https://rushroom-games.vercel.app`. Other server applications/services remain separate.
- Alternate-account deployment repository: `thatsego-account-manger/rushroom-deploy`. The real workflow lives there, not in IAMX-YT. Template: `deploy/rushroom-deploy.yml`; VPS activation script: `deploy/vps-deploy.sh`.
- Manual Actions deployment checks out the shared source repository, builds/tests it, and streams the release over SSH using a generated key. Its server authorization is restricted to the Rushroom deployment command, with forwarding and PTY disabled. The private key is sealed into GitHub Actions Secrets; SSH login passwords/PATs are not stored in the repository or VPS files.
- Deployments defer when rooms exist and roll back to the previous release if backend health fails. Rooms remain process-memory state and do not survive a service restart.

**Managed-host restriction resolved through the relay:** the master user cannot use sudo, change Nginx/TLS, or use SSH TCP forwarding. Public Rushroom traffic now reaches the private VPS backend through Vercel's authenticated fixed-command SSH relay. No existing WordPress route/site was replaced, and no Cloudways panel/API access is required for the deployed route. `deploy/cloudways-proxy.conf` is an optional future direct-proxy template only.

Cloudways reads SSH keys from `/home/master/.openssh/authorized_keys`, not the usual `.ssh/authorized_keys`. Existing keys were preserved. Actions run `38188011628`, attempt 2, succeeded: https://github.com/thatsego-account-manger/rushroom-deploy/actions/runs/38188011628 . Both games were then tested against the actual VPS and public WSS endpoint.
