# Website cross-origin isolation test stand (row 173)

Results and how they were read: `docs/dev/COOP_COEP_TEST_2026-11-14.md`.

1. A local API (`apps/api`, `.env` on a throwaway Postgres/Redis), `npm run seed:perf --workspace apps/api`
   (the attorney +12125550190 / Test1234!, a 400-message chat), and a web build:
   `flutter build web --wasm -t lib/main_dev.dart --dart-define=WEB_ENABLED=true --dart-define=API_BASE_URL=http://127.0.0.1:3173/api/v1`.
2. Servers (ROOT = `apps/mobile/build/web`, PROBE = this folder's `probe/`, DIR = a folder with
   `img.png`, `clip.webm`, `voice.wav`):
   `MODE=none|cred|corp|popups PORT=8173|8174|8175|8176 node serve.mjs`, `node other.mjs` (port 8179).
3. `npm i playwright-core` somewhere outside the repo (a local tool, not a dependency), then
   `STRIPE_PK=<a Stripe publishable test key> node probe-run.mjs` (third parties), `CHAT=<id> node app-measure.mjs <port> <label> [sw]`
   (sign in, open the long chat, scroll, frame times), `node sw-onoff.mjs` (the admin switch on/off;
   PG_CONTAINER / REDIS_CONTAINER = the throwaway containers).
