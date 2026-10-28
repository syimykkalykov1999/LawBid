---
name: local-dev-environment
description: "How the local LawBid stack and test devices are wired on the Mac (API watch mode, logs, devices, web logins)"
metadata:
  node_type: memory
  type: reference
  originSessionId: 89489739-0c64-4b11-8f30-2213648918ab
  modified: 2026-10-21T15:53:26.871Z
---

- Local API runs as `nest start --watch` (apps/api) → auto-restarts on source edits; stdout/stderr go to `/tmp/lb_api.log` (pretty pino, grep `WARN (` lines to find real errors the owner hit on the phones).
- DB: docker `lawbid-postgres-1`, user `root`, db `lawbid` (`docker exec lawbid-postgres-1 psql -U root -d lawbid`). e2e make their own `<db>_e2e_*` DBs; run with `E2E_ISOLATION=<tag> E2E_REDIS_DB=<n>` to not clash with parallel runs.
- Devices (2026-10-21): Samsung `R5GL11433DD` = Thomas (attorney), emulator `emulator-5554` = Charlotte (client); adb at `~/Library/Android/sdk/platform-tools/adb`. Package `com.lawbid.lawbid.dev`. iPhone install: `flutter build ios --release --flavor dev …` then `xcrun devicectl device install app`.
- API calls as a user without kicking the phone: password login with platform `web` and the user's existing web deviceId (Thomas `dev-att1`, Charlotte `dev-char1`, Piter `dev-hb-14155552681`). See [[owner-working-rules]].
- Agent worktrees (`isolation: worktree`) may start from `main`, not the release head — tell agents to reset onto the release head first.

- Linux laptop (2026-10-28): `ssh sima@10.186.172.170` from the Mac (key installed; IP changes per network — check `hostname -I` there). Nobara 44, i9-14900HX 32 threads, 62 GB RAM, 1.7 TB free, Docker 29, Node 24 via nvm, git. Use it for heavy work: load tests, Android builds, test runs, security loop. Owner's ordinary Wi-Fi may isolate clients; a phone hotspot did.
