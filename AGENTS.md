# Rushroom agent coordination

Before working in this repository, read `docs/AGENT-HANDOFF.md`, inspect `git status --short`, and inspect recent commits. This repository is shared by agents working on different games in one platform.

- Preserve the user's three device arrangements and independent display/split-consent decisions recorded in the handoff.
- Do not stage, revert, reset, stash or deploy another agent's active edits. Stage exact files belonging to your completed task.
- Check remote progress before integration. Do not pull/rebase over a dirty shared checkout; resolve coordination through the handoff and small scoped commits.
- Update the handoff with your scope, verification, pending work and committed/pushed/deployed status. Do not treat source changes, a GitHub push or a responding frontend as proof of working multiplayer.
- Coordinate changes to shared client, schema, server-room and deployment files through the handoff. Preserve each game's registered identity and behavior.
- Keep credentials only in temporary session memory/stdin or child-process environment; never commit or save them in documentation, remote URLs or source.

Direct user instructions take precedence over this coordination guidance.
