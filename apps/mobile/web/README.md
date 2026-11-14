# apps/mobile/web

The web shell of the same Flutter app (`flutter build web --wasm`). The app
stays closed in a browser until it is built with
`--dart-define=WEB_ENABLED=true` (`lib/core/platform/web_gate.dart`).

- `sqlite3.wasm` and `drift_worker.js`: the local database on the web, at the
  versions pinned in `pubspec.lock` (drift 2.35.3, sqlite3 3.5.2). After a drift
  or sqlite3 upgrade, download the matching files
  (`scripts/ci/check-web-assets-lock.sh` fails CI until they match):
  `https://github.com/simolus3/drift/releases/download/drift-<ver>/drift_worker.js`
  `https://github.com/simolus3/sqlite3.dart/releases/download/sqlite3-<ver>/sqlite3.wasm`
- `index.html` is `noindex`: search engines get the separate public pages.
- Run locally against the local API (CORS for `localhost` is on outside production):
  `flutter build web --wasm -t lib/main_dev.dart --dart-define-from-file=config/dev.json --dart-define=API_BASE_URL=http://localhost:3000/api/v1 --dart-define=WEB_ENABLED=true`,
  then serve `build/web` (any static server).
- Not a replacement for `tool/web_preview` (the owner's browser preview): that
  script copies its own `index.html` over this one while it builds.
- Deploy layout (2026-10-23): `scripts/deploy/web-immutable.py` moves
  `main.dart.*`, `canvaskit/` and `assets/` to `v/<sha>/` (immutable cache) and
  fills `__LB_V__` in `boot_head.js` (preload hints). A local build leaves the
  placeholder and everything is served from the root. See
  `docs/perf/WEB_PASS_2026-10-23.md`.
- `boot_head.js` / `boot_end.js` are scripts, not inline code (strict CSP).
- `firebase-messaging-sw.js`: `FIREBASE_JS_VERSION` is the page's Firebase JS
  SDK (firebase_core_web's `supportedFirebaseJsSdkVersion`); the same check
  fails when a FlutterFire bump changes it.
- `passkeys_bundle.js`: corbado flutter-passkeys release `bundle.js` 2.5.0 (the
  one passkeys_web 2.7+ is built for), see `boot_end.js`.
