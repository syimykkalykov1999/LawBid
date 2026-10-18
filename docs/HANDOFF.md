# HANDOFF — read this first (updated 2026-10-18)

The owner speaks Russian, is not a programmer, tests on his own phones and
wants results, not questions. Answer in Russian, short and plain.

## How the owner wants work done (non-negotiable)
- A request about one spot = rework the WHOLE related system (every screen,
  state, text, server rule, admin setting, tests), polished. Explain new UI
  inside the UI (why it appeared, what happens next).
- Everything follows the app themes (Day, Night, Navy, Glass): theme tokens
  only, NO gold/yellow fills on buttons/tiles/bubbles (gold = small accent).
  No raw colours / `fontSize:` numbers in feature files (design_tokens test).
- Use cheaper sub-agents (model sonnet) for simple tasks, but verify their
  work yourself (tests + look at goldens) before committing.
- Never SMS/Twilio for reminders. No price hints in inputs.
- The Mac freezes if many flutter test/analyze run in parallel: run full
  suites once yourself with `flutter test -j 2`; agents run only their files.
- When done, install on the iPhone (cable) and summarise what to check.
- Every UI text in ALL 85 languages at once (see translations workflow).
- Big system → ask the owner how first. Cheap sub-agents for simple tasks,
  strong ones for hard tasks, never too weak; verify their work.
- Commit locally after every finished part and keep this file current so
  another session/AI can continue. No push / GitHub until the owner says.
- Every stage: CHANGELOG entry + commit (local branch, no push unless asked).

## Where things are
- Repo `~/Desktop/LawBid`, branch `claude/chat-for-everyone` (not pushed).
- Specs `docs/01..07`, decisions `docs/OPEN_QUESTIONS.md` (OQ-052…055 new),
  history `docs/CHANGELOG.md`, keys `docs/KEYS_SETUP.md`.
- Run locally (Mac IP was 172.20.10.4 on the iPhone hotspot — check
  `ipconfig getifaddr en0`; if changed, update `apps/mobile/config/dev.json`
  API_BASE_URL and S3_ENDPOINT in `apps/api/.env`):
  - `docker compose up -d` (repo root); API `cd apps/api && npm run start:dev`
    (port 3000). Login OTP `000000`. Demo attorney code `GEMPMXNZ`.
  - iPhone (cable): `cd apps/mobile && flutter run -d <iphone-id> --flavor dev
    -t lib/main_dev.dart --dart-define-from-file=config/dev.json --pid-file=…`
    (Apple team 78T56RPM74 set locally in Runner.xcodeproj — keep it
    uncommitted). Hot reload `kill -USR1 $(cat pidfile)`, restart USR2.
  - Android APK: `flutter build apk --release --flavor dev -t lib/main_dev.dart
    --dart-define-from-file=config/dev.json`, copy to `~/Desktop/LawBid-download`
    and serve with `python3 -m http.server 8080` there
    (http://<mac-ip>:8080/LawBid.apk). Build the APK only at the END.
    Samsung wasn't visible over USB (allow USB debugging + File transfer, or
    another cable).

## Done this session (all committed)
Chat for everyone; percent (contingency) budgets/bids + admin cap/blocked
topics + percent budget filter; WhatsApp voice notes (avatar, mic badge,
speeds, auto-next); chat videos (720p, iOS black-video fix, fixed bubble
size, WhatsApp player); one gallery photo+video; chat in theme colours;
chat list like WhatsApp/Telegram; contact info screen; iPhone call background
modes + PushKit/VoIP (needs APNs key); support attachments/device info/macros/
unread filter; search per-tab + filters + text-search audit; reposts (undo,
tab for everyone, reposters list); stale-case cleanup OQ-054; case step 2
public block + private details for the accepted attorney; removed cover
picker; themed add tiles; one "ещё" for long titles; new-post Gallery/Camera
row + topic hint; budget step no jump.

## Done in session 2 (2026-10-18 evening, all committed locally, NOT pushed)
- Stale prompt explains itself: «Вы давно не заходили в этот кейс — он ещё
  актуален?», the real dates from the API (`hidesAt`, `archivesAt` on case
  DTOs; pure `pauseDueAt`/`archiveDueAt` in case-staleness.ts), button
  explanations, push text «Ваш кейс ещё актуален?».
- People search across alphabets/spellings/typos/word order: Postgres
  `f_name_skel` / `f_name_cons` (migration 20261018140000) +
  `nameMatchSql` (apps/api/src/common/search/name-match.sql.ts); the same
  rules in the app: apps/mobile/lib/core/text/search_fold.dart
  (`textMatches`, used by every OptionPickerSheet, state pickers, language
  picker). Russian state names: `kUsStateAliases` (us_states.dart),
  `PickerOption.keywords`.
- Server search: GET /conversations?q (name, @username, case title, message
  text — NOT encrypted bodies when MESSAGE_ENC_KEYS is set), followers /
  following ?q, «В работе» by client name (subscribed attorneys only),
  templates every word. App: search box in chats and follow lists
  (lib/shared/presentation/list_search_field.dart, flip_search_bar.dart moved
  to lib/shared/presentation).
- Post cards: title up to 2 lines; files moved into the «ещё» sheet in every
  card style (FeedCaption/PostBodyText/PostVideoCaption `forceMore`).
- Gallery hint «До 9 фото или 1 видео» / «До 9 фото» (video off). Locally
  video posts ON: feature flag `video_posts` = true in the dev DB,
  `DEV_FAKE_BUNNY=true` + `DEV_FAKE_BUNNY_HOST=<mac-ip>:4010` in apps/api/.env,
  run `node apps/api/tools/fake-bunny.mjs` (needs ffmpeg).
- Translations: all recent texts in all 85 languages. Workflow: add RU/EN in
  lib/core/l10n/strings, then `node scripts/i18n-add.mjs file.json` (key →
  {lang: text}) into apps/api/prisma/seed/translations_seed.xlsx, check
  `node scripts/i18n-audit.mjs` (0 missing), load into the dev DB with
  `npm run seed:i18n` in apps/api (NOT `npm run seed`: it resets feature
  flags).
- Tech debt: practiceMatchesProvider → features/practice/practice_matches.dart
  (baseline practice 4, profile 20); API module boundaries: cases.public.ts /
  files.public.ts, baseline refreshed.
- Sticker search (pack name + emoji, `searchStickers` in sticker_widgets.dart)
  and notifications search (`GET /notifications?q`, box above the chips) —
  DONE, all 85 languages.
- Test phones (dev DB, code 000000): +1 212 555 0101 attorney Thomas Brennan
  WITH subscription; +1 212 555 0102 attorney Victor Alvarez WITHOUT
  subscription; +1 212 555 0103 client Charlotte Davis.
- After `sh packages/api-contract/generate.sh` RESTART the API dev server
  (`nest build` inside it deletes dist/ and the watcher dies → app shows
  «Нет подключения»).
- Speed (2026-10-18, commits d3edd54c API, da1ea66b app): settings memo,
  Redis block sets / content mode, parallel awaits, partial indexes; app:
  photo decode, keepAlive for feeds/chats, caption_fit.dart cache, parallel
  startup, stable image cache keys. Open: profile posts as slivers (skipped,
  needs AppPaginatedListView rework), chat video posters (server has none).
  Owner answers (2026-10-18): Glass cards without blur (DONE, 3be3fff9; if
  scrolling still freezes on Glass the owner wants the Glass theme REMOVED —
  ask before deleting); tabs instant (DONE); economy guard: in
  NODE_ENV=development the assumed AWS bill is not counted (DONE — video
  works on the Mac again; production unchanged).
- Never touch third-party integrations (AWS, Stripe, Firebase, Bunny, APNs…):
  the project already runs on the production AWS server with all keys in the
  production admin; local work = updates and fixes only. apps/api/.env is
  local and gitignored (DEV_FAKE_BUNNY is for the Mac only).
- APK: build ONLY when the owner says (he checks the iPhone first).
- iPhone: install a RELEASE build (`flutter run --release …`) — a debug build
  stops working when the cable/session drops.

## Web / admin on a phone (session 3, 2026-10-18)
- Flutter web build for the phone: `flutter build web --profile -t lib/main_dev.dart
  --dart-define-from-file=<copy of config/dev.json with API_BASE_URL=/api/v1>
  --dart-define=WEB_ENABLED=true --no-web-resources-cdn -o <out>`, copy
  web/drift_worker.js + sqlite3.wasm into <out>, serve with
  `PREVIEW_API=http://localhost:3000 PREVIEW_STORAGE=http://<mac-ip>:9000,http://<mac-ip>:4010
  node tool/web_preview/serve.mjs <out> 8090` → phone opens http://<mac-ip>:8090.
- Admin on the phone: `npm run dev --prefix apps/admin` (3001), http://<mac-ip>:3001.
- Claude's built-in browser pane blocks fetch inside SharedWorkers: there the
  web app hangs on the splash (drift). Not a bug on phones/Safari; for pane
  tests serve a copy whose index.html sets `window.SharedWorker=undefined`.
- Test web client: +1 212 555 0177 «Webtest Client» (password WebTest2026!).
- Simulator «LawBid Web Test» (iPhone 17 Pro, iOS 27) was created for Safari
  checks; Claude needs «Let Claude use it» in the simulator panel to tap.

## Open / do next (in this order)
1. DONE (session 2). Stale banner is confusing (owner didn't understand when/why it appeared).
   Rework the whole stale UX (case_stale_banner.dart, My cases, owner case,
   notification text): WHY ("Вы давно не заходили в этот кейс — он ещё
   актуален?"), WHEN it hides ("Если не ответите до <date>, кейс скроется из
   ленты адвокатов…"), primary «Да, ещё нужен», secondary «Жду предложений
   получше» / «Уже не нужен»; paused: «Кейс скрыт из ленты адвокатов — вы
   давно не отвечали» + «Вернуть в ленту». Theme styling.
2. APNs key (owner creates at developer.apple.com → Keys → APNs, .p8) →
   admin «Интеграции → Apple Push» or .env APNS_*; test a call with the app
   closed.
3. MOSTLY DONE (session 2) — left: stickers search (stickers have no
   keywords; emoji names in 85 languages = big, ask the owner), notifications
   search, language names in the app language («английский»), chat message
   search for encrypted bodies. Search gaps: chat-list search («Поиск по чатам»), followers/following,
   stickers, notifications search; transliteration (Эмили↔Emily) and typos
   for people; Russian state names; client name search in «В работе»; check
   task_pickers.dart, templates_screen.dart, language_picker_sheet.dart.
4. DONE (session 2). Tech debt: feature_boundaries_baseline.json was raised (practice 4→5,
   profile 19→21) because practice_options.dart / practices_screen.dart import
   features/search/application/search_providers.dart (practiceMatchesProvider)
   — move it into the practice feature and lower the baseline back.
5. Push in the dev build is off (Firebase not configured: GoogleService-
   Info.plist / google-services.json, KEYS_SETUP steps 13–14).
6. Final: full checks (flutter analyze lib test, flutter test -j 2, API tsc,
   key e2e), build the APK once, install on the iPhone, report in Russian.
