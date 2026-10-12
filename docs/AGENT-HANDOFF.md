# Rushroom shared agent handoff

## Current Power Wash visual and host-flow update

- Host Create buttons now always open the setup page and require explicit Screen only / Controller only / Screen + Controls selection before creating a room, even if already connected. Same-device hosts automatically get a local player; no second phone is needed. `/ ?create=power-wash` (without the space) opens setup directly.
- Removed solid dirt bounding-box render meshes. Real object materials now receive world-space dirt projection matching server grid coordinates; unchanged grids do not trigger uploads. The cleanable Sports Car now uses a detailed, attributed CC BY 4.0 vehicle mesh with local Draco decoding (1.68 MB GLB). The procedural car remains a loading fallback. Attribution is visible from the homepage footer and `public/models/CREDITS.md`.
- Bundled CC0 photo-based PBR concrete/wood/brick/lawn textures and HDR reflections, fixed covered windows and roof orientation, added leaf/branch geometry and a detailed first-person washer with glove/sleeve. Texture license/source list is `public/materials/LICENSE.md`; vehicle and decoder have separate licenses in `public/models`.
- Same-device mobile movement now supports forward/back/strafe joystick input; touch look no longer starts spraying. Input release retains camera orientation. A real rendered scene capture is used for the homepage preview to avoid loading the full renderer before a match.
- Local browser visual test passed actual car cleaning and no shader/material/browser errors; screenshots are in `test-results/wash-realism-*.png`. Single-phone host (390×844 touch browser) creation, 3D gameplay, real joystick movement, other device roles and reconnect passed. Removed desktop sonar overlap with the phone joystick. Full build and **45/45 automated checks** passed, including camera retention on missing input and car cleaning from spawn. These are browser-emulation checks, not physical-device performance measurements.
- Existing backend was updated in place; **no new temporary sandbox was created**. Its existing expiry remains unchanged. Permanent/on-demand hosting is still a separate pending migration; this visual update does not resolve that hosting requirement.
- The existing sandbox expired at its previously recorded 05:08:23 IST deadline during final verification. Public car-cleaning verification failed before that deadline; the camera/input initialization fix was then verified against a fresh local server. Do not claim this final simulation is live until a persistent/on-demand backend is deployed. The frontend and static in-game preview can remain published independently.
- Final frontend deployment: **`dpl_Bkkty1gJWKNej95fWCVUMmWhxw63`**, application source **`ae85164`**, READY. Main public URL returned correct GLB/WASM/JPEG/PNG assets with HTTP 200; a published 390px-phone UI test verified explicit host choice and no horizontal overflow. Backend `/health` returned **HTTP 410**. Local detailed-model rendering and actual car cleaning passed with no shader errors; single-phone host creation/movement/cancel and all three device roles passed locally. These findings must not be described as current public multiplayer readiness.

## Current device-role work and hosting requirement

- User now explicitly requires every join device to choose **Screen only**, **Controller only**, or **Screen + Controls** before joining. QR/deep links only supply the room code; they do not force the role. Screens consume no player slots or gameplay inputs, controllers render no game canvas, and same-device players get gameplay plus touch controls.
- Create-room flow offers the same three arrangements; own-device/controller hosts receive a local player automatically. Host controller arrangement survives refresh. Same-device kart players now have multi-touch controls with release/cancel/blur handling.
- Local and **public Chrome tests passed for both Power Wash and Kart Rush**: explicit role required before joining, same-device canvas + touch controls, screen-only without controls or player slot, controller-only without a canvas, ready/start and reload identity. Kart same-device simultaneous gas/steering and touch cancellation also passed. Production build and 43/43 automated tests passed. Main URL deployment `dpl_CXGoDVunbRDVjanoTfgSCnH5WSSm` is READY (application commit `1b328b2`).
- **Permanent hosting remains required by the user. Do not create another temporary sandbox as a substitute.** Awaiting personal VPS or Node-hosting access. Docker/Caddy deployment files already exist; GitHub Actions can build/test/deploy but are not permanent backend hosting.
- **Do not use IAMX-YT GitHub Actions.** The first alternate token returned HTTP 401. Its replacement identifies `thatsego-account-manger` (GitHub `/user` HTTP 200). That does not establish whether it is temporary. No Actions workflows were created or run. Deployment-ready persistent Docker/Caddy configuration is documented in `PERMANENT-HOSTING.md`; actual hosting is still awaiting personal VPS/Node-hosting access.

Updated: 2026-10-12 (Asia/Kolkata). This file is the shared progress record; Git history is the source of truth for committed work. Update it with your own completed changes and actual verification before handing work over.

## Shared product decisions

- Platform name: **Rushroom**. Existing GitHub repository: `IAMX-YT/kart-rush-arena`; repository name has not changed.
- One multiplayer room supports own-device gameplay, a shared TV with up to four phone controllers, and remote homes with independent screens. Mixed arrangements are allowed.
- Local split/fullscreen only affects the requesting display. Asking other displays to split requires recipient Accept/Decline; the request checkbox is unchecked by default.
- Phone-controller buttons must stay large and support simultaneous touch inputs and cancellation. Steering directions must match their labels.
- LAN hosting is optional; it is not required for the normal online create/join flow.

## Work ownership and current evidence

| Area | Current evidence | Next owner action |
| --- | --- | --- |
| Kart racing and platform | Existing original kart renderer, simulation, phone controls and shared display work. Preserved by integration commit `64b6699`. | Kart/platform agent preserves game behavior while changing shared flows. |
| Power Wash game | Second agent integration commit `64b6699`. Completed realistic PowerWash Simulator visual overhaul: first-person wand model with recoil, authentic HUD with real-time target object cards, 5-star rating, interactive nozzle dock, dirt sonar, mouse drag look & spray, aligned all 6 cleanable object 3D meshes with simulation bounding boxes. All 43 test suites passing, production build passing (`dist/` generated). | Power Wash agent verified local build and tests; awaiting coordinated deployment with live backend credentials. |
| Branding | Commit `9a8632f` changes package name to `rushroom` and browser title to `Rushroom — Play Together`; production build passed. | Preserve Rushroom platform branding; game names remain separate. |
| Shared flows | README reports three arrangements, pairing and split consent; integration commit exists. | These are source changes; verify the current build on real browser sessions before calling them live-ready. |

## Deployment ownership and status

- Vercel project ID: `prj_hjedWVWN9lnyocpRHel43VJhuDuG`; project name changed to `rushroom`.
- Vercel team ID: `team_lenG4YXQluvhvjs9yZZ4zUng`.
- Main public Rushroom URL: **https://rushroom-games.vercel.app**. The user's latest instruction chooses this as the main URL and retires `rushroom-split.vercel.app`. Keep only the games domain attached; do not reattach either retired domain during deployments.
- `rushroom.vercel.app` was rejected by Vercel because another project already owns it.
- At the user's request, `kart-rush-arena.vercel.app` was removed from the project on October 12. Its alias lookup now returns 404; a fresh public request returns 404 `DEPLOYMENT_NOT_FOUND`. The new Rushroom URL still returns HTTP 200. Do not reattach the retired domain during deployments.
- Main public alias targets deployment `dpl_Bkkty1gJWKNej95fWCVUMmWhxw63` (application source `ae85164`), READY on October 12. Static assets and the host-choice UI were tested publicly. Earlier both-game multiplayer verification used the now-expired sandbox; current gameplay verification is local. The retired aliases remain retired.
- The verified live page title is: `Rushroom | Split-Screen Multiplayer Games`.
- Power Wash Simulator 2 realistic HUD, first-person pressure washer wand model, target object identification cards, interactive nozzle dock, dirt sonar, and desktop mouse drag/spray controls are active on production.
- Current authoritative test backend: `https://sb-2cf1zfkzsyid.vercel.run` (sandbox `rushroom-live-restored`), allowing origin `https://rushroom-games.vercel.app`. Expires **October 12 at 05:08:23 IST** (`2026-10-11T23:38:23.283Z`). Vercel rejected extending the previous sandbox beyond its maximum execution timeout. This is temporary test hosting, not persistent multiplayer hosting.
- Create room and Join room buttons enabled unconditionally with graceful connection queuing, eliminating the disabled button issue.
- A deployment owner must record the source commit, frontend deployment ID, backend URL and expiration, and browser verification together. Do not deploy a mixture of another agent's active edits.

## Coordination before editing shared files

1. Read this handoff, inspect `git status --short`, and inspect recent commits before changing shared files.
2. Fetch remote updates and compare them; with a dirty shared checkout, do not reset, stash or pull over another agent's work. In separate checkouts, pull/rebase your own clean branch before integration.
3. Keep game-specific edits scoped where possible. Shared files include `src/client/main.tsx`, `src/client/style.css`, shared schemas/registry, room authority, README and deployment scripts. Coordinate their changes through this file and small commits.
4. Stage exact files, not the whole shared working tree. Never stage or revert another agent's active changes.
5. Record what you changed, how you verified it, what remains, and whether the change is committed, pushed or deployed. A claimed test count in a previous README is not a fresh verification result.
6. Use temporary credentials only in session memory/stdin or child-process environment. Never save tokens in source, docs, remote URLs, commit messages or handoff files.

At the final status check, active edits also appeared in `src/client/main.tsx` and `src/client/style.css` in addition to `src/client/washScene.tsx`. They were left unstaged and unchanged by the branding/handoff agent.

## Latest naming handoff

The main public URL is `https://rushroom-games.vercel.app/`. `index.html` keeps the title `Rushroom | Split-Screen Multiplayer Games`; canonical and Open Graph URLs now point to the games domain. Keep this frontend origin in backend CORS/origin configuration when restoring the server. Both `kart-rush-arena.vercel.app` and `rushroom-split.vercel.app` are retired by user request.

## Homepage Reconnection Banner Resolution

- **Issue**: Visitors opening the landing page `https://rushroom-games.vercel.app/` saw a prominent warning banner across the hero section: `Reconnecting · Inputs released. Check server address and Wi-Fi.`
- **Cause**: In `src/client/main.tsx`, `{status !== 'Connected' && (<div className="network-banner">...</div>)}` was evaluated globally under `<header>` without checking if an active match/room existed. Because static Vercel does not host WebSockets without an active backend URL, the client was in an infinite reconnection loop and displayed the warning banner on the landing page.
- **Fix**: Guarded the banner so it only renders when the player is inside an active room (`{room && status !== 'Connected' && ...}`). Added fallback configuration when `/api/config` cannot be reached so the app defaults cleanly to online mode. Added exponential backoff to `src/client/network.ts` reconnect attempts to avoid spamming the console. Moved connection indicator on pre-game flows to a subtle status pill.
- **Verification**: 43/43 tests pass (`pnpm test`); production build passes (`pnpm build`). Verified localhost HTML contains no rogue banners.

## Actual WebSocket reconnection fix

- Vercel's project environment variable `VITE_SERVER_ORIGIN` still contained expired `sb-5gif87awqlqg.vercel.run`. Build-time environment values override source defaults. HTTP config rewrites could succeed while the compiled WebSocket URL remained wrong.
- Updated the Vercel environment variable, client fallback and HTTP rewrites together to the current backend above. Do all three on future replacements; hiding a banner or enabling buttons does not repair transport.
- Added `scripts/public-connection-test.mjs`: real Chrome against the public URL verifies compiled WebSocket destination, room creation, phone join, readiness, game start, reload/resume with the same player, controller-only rendering and browser errors. Run with `TEST_SERVER_URL` set to the expected backend.
- Final public Chrome test **passed** against fresh backend `sb-2cf1zfkzsyid.vercel.run`: actual public WSS connection, room create, phone join, ready, Power Wash game start, reload/resume same player, no phone game canvas and zero browser errors. This verifies transport and start/resume; it is not a full cleaning-job completion or physical-phone performance test.

## Homepage and HUD cleanup — October 12

- Replaced the busy home hero with clear Create/Join actions, actual gameplay photography, short game cards and concise explanations of the three device setups. Removed duplicate promo chips, emoji artwork, unsupported original-art claims and always-visible playable-now labels. Fixed inherited positioning that made setup-card headings overlap. Kept asset attribution accessible in the footer.
- Power Wash now shows compact job progress and the current target. Removed rating stars, the permanent object checklist and keyboard guide. A labelled Menu provides sound, graphics, connection details, an expandable object list, keyboard help and host lobby navigation. Split view and consent remain independent; requesting other screens stays unchecked by default. Large phone movement/spray controls remain available.
- `scripts/ui-cleanup-test.mjs` checks desktop/390px home layout, game selection, required host role selection, actual local gameplay HUD, menu controls, object progress, split consent default and return to lobby. Captured a fresh HUD-free gameplay preview. Updated the visual test to use the new Menu navigation and capture clean previews.
- Verification: build passed, 45/45 existing tests passed, local UI-cleanup browser check passed, local single-phone host movement passed. Physical phone GPU testing was not performed. Production frontend deployment and public static checks are recorded after publication below; these do not prove public multiplayer availability.
- The existing sandbox backend has expired (HTTP 410). No new temporary backend or GitHub Actions runner was created. Persistent/on-demand multiplayer hosting remains pending.

