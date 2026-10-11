# Rushroom shared agent handoff

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
- Production alias targets deployment `dpl_H7U39He35YNV9REDxC6Hw6ycyWey` (built from commit `4b0f2f2`).
- The verified live page title is now: `Rushroom | Split-Screen Multiplayer Games`.
- Power Wash Simulator 2 realistic HUD, first-person pressure washer wand model, target object identification cards, interactive nozzle dock, dirt sonar, and desktop mouse drag/spray controls are now live on production.
- Historical backend `https://sb-5gif87awqlqg.vercel.run/health` returned **HTTP 410** during this handoff. The old sandbox has expired. A replacement backend must allow the new public frontend origin and publish correct join/display/controller URLs. Historical expiration is in `docs/DEPLOYMENT.md` and `docs/test-deployment.json`.
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
