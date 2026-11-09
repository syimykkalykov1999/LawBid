# Click audit (admin + web app)

A reusable click-through smoke suite: it opens **every admin route**
(`apps/admin/src/app/(app)/**/page.tsx`) and the web app screens, checks the
load (no console errors, no failed 4xx/5xx/network calls, content present,
full-page screenshot), then clicks **every control** in the page body once
(buttons, switches, tabs, checkboxes, selects, `<summary>`), presses the main
button of any dialog that opens, and types into the search box. Every
attempt becomes a row `page → element → expected → actual → status`
(`WORKS`, `BROKEN`, `DEAD BUTTON`, `ERROR`, `SKIPPED`) in `results/*.jsonl`;
`node report.mjs` turns them into `results/REPORT.md`.

**LOCAL stack only.** The suite refuses non-localhost URLs (`lib/env.ts`): it
presses delete/ban/refund buttons for real. Switches are flipped back after
the check.

## Run

```bash
# 1. database: an empty local DB, migrated and seeded
cd apps/api
DATABASE_URL=postgresql://root:lawbid@localhost:5432/lawbid_click npx prisma migrate deploy
npx ts-node --transpile-only prisma/seed.ts
npx ts-node --transpile-only scripts/seed-economy.ts
npx ts-node --transpile-only prisma/seed-demo.ts
TS_NODE_PROJECT=tsconfig.json npx ts-node --transpile-only ../../tests/click-audit/setup/seed-audit.ts

# 2. API (:3310), admin (:3311), web app build served on :3312
PORT=3310 node dist/src/main.js            # after a build; env from apps/api/.env.test + DATABASE_URL/REDIS_URL
cd apps/admin && API_BASE_URL=http://localhost:3310/api/v1 COOKIE_SECURE=false npx next dev --webpack -p 3311
cd apps/mobile && dart run build_runner build --delete-conflicting-outputs   # generated *.g.dart are not in git
flutter build web --release -t lib/main_dev.dart --dart-define=APP_CHECK_DEBUG=true \
  --dart-define=API_BASE_URL=http://localhost:3310/api/v1 --dart-define=WEB_ENABLED=true
npx serve@14.2.4 -s apps/mobile/build/web -l 3312   # -s: every path falls back to index.html (path URL strategy)

# 3. the audit (Chrome installed on the machine; PW_CHANNEL=chromium for Playwright's own)
cd tests/click-audit && npm ci
nice -n 15 ../../scripts/dev/heavy.sh -- npx playwright test admin   # ROUTES=/users,/flags to narrow
nice -n 15 ../../scripts/dev/heavy.sh -- npx playwright test web
node report.mjs
```

Test values only: `setup/fixtures.json` (owner admin login/password, one demo
client and one demo attorney with phone + password). The admin binds its
authenticator on the first run through the real setup screen; the secret is
kept in `.auth/` (git-ignored) for later sign-ins and step-up codes.

## Reading the result

- `DEAD BUTTON` is a candidate: nothing visible happened (no request, no
  dialog, no state or DOM change). Check the screenshot before fixing; a
  button that only works with data the seed does not have shows up here too.
- `SKIPPED` rows are honest gaps: disabled on load, a control that ends the
  audit's own session, or an `[id]` page with no link in the local data.

## Notes from the first run (2026-11-08)

- Admin: `./run-admin-chunks.sh` runs the routes section by section through
  the heavy queue (waits for load < 8 and >= 10 GB free disk), reusing one
  admin session (the admin sign-in limit is a few per hour).
  `SKIP_DONE=1` continues where `results/admin.jsonl` stopped.
- Web: the build opens only the four tabs and public links from a typed
  address; every other screen is reached by tapping (the crawl goes two
  levels deep from the tabs). With guest browsing on, a visitor lands on the
  feed and signs in from its «Sign in» bar.
- The local `.env.test` values keep the old refresh limits; the web crawl
  reloads the page ~60 times per account, so run the API with
  `AUTH_REFRESH_LIMIT_PER_IP_PER_HOUR=1200 AUTH_REFRESH_LIMIT_PER_SESSION_PER_HOUR=120`
  (the defaults since this audit).
- The admin pass changes data (switches are flipped back, but deletes, bans
  and language switches stay): seed a fresh database before the web pass.
