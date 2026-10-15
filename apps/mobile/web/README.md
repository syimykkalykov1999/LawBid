# apps/mobile/web

The web shell of the same Flutter app (`flutter build web --wasm`). The app
stays closed in a browser until it is built with
`--dart-define=WEB_ENABLED=true` (`lib/core/platform/web_gate.dart`).

- `sqlite3.wasm` and `drift_worker.js`: the local database on the web, at the
  versions pinned in `pubspec.lock` (drift 2.35.0, sqlite3 3.5.2). After a drift
  or sqlite3 upgrade, download the matching files:
  `https://github.com/simolus3/drift/releases/download/drift-<ver>/drift_worker.js`
  `https://github.com/simolus3/sqlite3.dart/releases/download/sqlite3-<ver>/sqlite3.wasm`
- `index.html` is `noindex`: search engines get the separate public pages.
- Run locally against the local API (CORS for `localhost` is on outside production):
  `flutter build web --wasm -t lib/main_dev.dart --dart-define-from-file=config/dev.json --dart-define=API_BASE_URL=http://localhost:3000/api/v1 --dart-define=WEB_ENABLED=true`,
  then serve `build/web` (any static server).
- Not a replacement for `tool/web_preview` (the owner's browser preview): that
  script copies its own `index.html` over this one while it builds.
