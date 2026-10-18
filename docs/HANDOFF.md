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

## Open / do next (in this order)
1. Stale banner is confusing (owner didn't understand when/why it appeared).
   Rework the whole stale UX (case_stale_banner.dart, My cases, owner case,
   notification text): WHY ("Вы давно не заходили в этот кейс — он ещё
   актуален?"), WHEN it hides ("Если не ответите до <date>, кейс скроется из
   ленты адвокатов…"), primary «Да, ещё нужен», secondary «Жду предложений
   получше» / «Уже не нужен»; paused: «Кейс скрыт из ленты адвокатов — вы
   давно не отвечали» + «Вернуть в ленту». Theme styling.
2. APNs key (owner creates at developer.apple.com → Keys → APNs, .p8) →
   admin «Интеграции → Apple Push» or .env APNS_*; test a call with the app
   closed.
3. Search gaps: chat-list search («Поиск по чатам»), followers/following,
   stickers, notifications search; transliteration (Эмили↔Emily) and typos
   for people; Russian state names; client name search in «В работе»; check
   task_pickers.dart, templates_screen.dart, language_picker_sheet.dart.
4. Tech debt: feature_boundaries_baseline.json was raised (practice 4→5,
   profile 19→21) because practice_options.dart / practices_screen.dart import
   features/search/application/search_providers.dart (practiceMatchesProvider)
   — move it into the practice feature and lower the baseline back.
5. Push in the dev build is off (Firebase not configured: GoogleService-
   Info.plist / google-services.json, KEYS_SETUP steps 13–14).
6. Final: full checks (flutter analyze lib test, flutter test -j 2, API tsc,
   key e2e), build the APK once, install on the iPhone, report in Russian.
