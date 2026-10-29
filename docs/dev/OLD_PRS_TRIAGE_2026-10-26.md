# Old open PRs (< #330) — triage 2026-10-26

Read-only triage. Nothing merged, closed, built or pushed.
Base for every check: `origin/main` = 99faf667e (#374). 45 open PRs < 330 (the 4+17+14 named in the brief, plus 10 older ones: #113, #112, #111, #97, #18, #14, #13, #12, #11, #7).

## How it was checked
- Real conflicts: `git merge-tree --write-tree --name-only origin/main origin/<branch>` (GitHub's MERGEABLE flag is stale/lazy; e.g. it says #220 CONFLICTING with +43k, really 1 leftover commit).
- What is really new: `git rev-list --count $(git merge-base origin/main origin/<b>)..origin/<b>` + `git diff --stat origin/main...origin/<b>`.
- Stacked PRs: `gh pr list --json baseRefName` — #116→#141 and #162/#211 are based on other feature branches, so GitHub's +/− numbers are against those bases, not main.
- Feature-on-main greps: listed per row.

## Table

| PR | branch | what it is (RU, one line) | on main already? | mergeable (real) | verdict | why | effort |
|---|---|---|---|---|---|---|---|
| 295 | claude/perf-fix | Тест скорости на телефоне проходит до конца (35/35 норм на S25), сид perf-юзера, фикс порядка согласий в контракте | No: `apps/api/prisma/seed-perf.ts`, `seed:perf` script, `nav-tab-*`/`pill-*` keys and the pinned `CONSENT_TYPES` in `users/dto/consents.dto.ts` are absent on main | Clean (4 commits ahead, 304 behind, 0 conflicts); CI was all green on its base | FINISH | Dev tooling + contract-flake fix; only invisible test keys in `app_bottom_nav.dart`/`pill_tabs.dart` (no look change). Needs `git merge origin/main`, contract regen (consent enum now ends with `do_not_sell` — already in the list), CI | S |
| 220 | claude/group-chats-polls-a41ykg | Групповые чаты, опросы, темы | Yes: `ChatGroup*`, `ChatGroupTopic`, `ChatGroupPoll*` models (schema.prisma:2968-3244), `apps/api/src/modules/groups`. Only leftover commit 1161837ea («+ новый чат» в Чатах) is on main as `_NewChatButton` (inbox_screen.dart:1641) | 2 conflicts (inbox_screen.dart, chat_folders_test.dart), 1097 behind | SUPERSEDED-CLOSE | Everything landed earlier; last commit re-implemented on main | — |
| 211 | claude/chat-message-actions | Чат: правка, удаление, ответ, пересылка, реакции, закрепы; «Переслано от» | Yes: `forwarded_from_name` (schema.prisma:2848), `forwardedFrom` in chat.dto.ts:709, chat.service.ts:720/1227. Base was claude/voice-messages | 3 conflicts (schema.prisma, translations_seed.xlsx, chat.service.ts) | SUPERSEDED-CLOSE | Only leftover commit 5695c98fd («Forwarded from») is already on main | — |
| 162 | claude/password-login-6wigbe | Вход по паролю без SMS каждый раз | Yes: branch tip d31317af6 is an ancestor of origin/main (`git merge-base --is-ancestor` → yes); later extended by #345 | 0 commits ahead | SUPERSEDED-CLOSE | Fully merged via its base feat/cards-mobile; PR stays open only because its base branch was never closed | — |
| 116 | feat/signup-remove-fillers | Регистрация: убрать лишние экраны | Yes (stacked chain merged into main) | 0 real changes (1 empty merge commit) | SUPERSEDED-CLOSE | `git diff origin/main...branch` empty | — |
| 120 | feat/form-buttons | Кнопки форм серые до заполнения | Yes, tip in main | 0 ahead | SUPERSEDED-CLOSE | Already merged | — |
| 121 | feat/compact-header | Компактная шапка и навбар | Yes, tip in main | 0 ahead | SUPERSEDED-CLOSE | Already merged | — |
| 122 | feat/post-card-a2 | Новая карточка поста с практикой | Yes, tip in main | 0 ahead | SUPERSEDED-CLOSE | Already merged | — |
| 123 | feat/picker-back | Фильтры ленты: кнопка назад | Yes, tip in main | 0 ahead | SUPERSEDED-CLOSE | Already merged | — |
| 124 | feat/card-empty-states | Пост без текста, фото выше | Yes, tip in main | 0 ahead | SUPERSEDED-CLOSE | Already merged | — |
| 125 | feat/hide-on-scroll | Шапка прячется при прокрутке, фильтры как Temu | Yes, tip in main | 0 ahead | SUPERSEDED-CLOSE | Already merged | — |
| 126 | feat/full-post | Демо-пост «полный фарш» | Yes, tip in main | 0 ahead | SUPERSEDED-CLOSE | Already merged | — |
| 127 | feat/chrome-hide-final | Шапка не возвращается при прокрутке вверх | Yes, tip in main | 0 ahead | SUPERSEDED-CLOSE | Already merged | — |
| 128 | feat/card-fixed-photo | Одинаковая высота фото в карточке | Yes, tip in main | 0 ahead | SUPERSEDED-CLOSE | Already merged | — |
| 129 | feat/card-full-screen | Карточка поста на весь экран | Yes | 0 real changes (empty merge commit 76893d824) | SUPERSEDED-CLOSE | Already merged | — |
| 132 | feat/demo-reels | Три демо-рилса для карточки | Yes | 0 real changes (empty merge commit c75f69cc3) | SUPERSEDED-CLOSE | Already merged | — |
| 135 | feat/nav-icons-only | Навбар без подписей | Yes, tip 3da0052e2 in main | 0 ahead | SUPERSEDED-CLOSE | Already merged | — |
| 136 | feat/reels-tab | Вкладка Reels в ленте | Yes, tip c6f33e322 in main | 0 ahead | SUPERSEDED-CLOSE | Already merged | — |
| 137 | feat/header-reels-safe-area | Шапка и Reels: выравнивание, safe area | Yes | 0 real changes (empty merge commit 127b1b6d3) | SUPERSEDED-CLOSE | Already merged | — |
| 140 | feat/post-views-api | Просмотры постов: база и API | Yes, tip 9344746f9 in main | 0 ahead | SUPERSEDED-CLOSE | Already merged | — |
| 141 | feat/post-views-app | Просмотры в приложении | Yes | 0 real changes (empty merge commit a8489d971) | SUPERSEDED-CLOSE | Already merged | — |
| 112 | claude/boost-pricing-admin-2pjbnz | Буст: цена за показы / людей / нажатия / реальные действия, возврат неистраченного, выбор модели оплаты в приложении и админке | No: main bills Boost only by CPM (`cpm_cents`, schema.prisma:5245); no `billing`/`target_units`/`unit_price_cents` columns | 29 conflicts, 1870 behind; migration uses CockroachDB types (`STRING(12)`, `INT4`) | OWNER-DECISION | Money model + new buttons in the Boost sheet and admin (UI frozen). Main's Boost has since moved (Stars, one card page, refunds on verification loss), so if «да» — rewrite on today's Boost, not rebase | L |
| 111 | claude/phone-test-fixes-p557vi | Новый экран рилса, полоска фоновой загрузки, демо-сессии без кода повторного входа | Mostly yes: background uploads `apps/mobile/lib/core/uploads/*`, gallery cover `video_editor_screen.dart:196`, `cover_file_id` in post-presenter. NOT on main: `POST /auth/reauth/demo` (demo reviewers get stuck at the re-auth code before history export, data export, account deletion) | 17 conflicts, 1870 behind | FINISH (port only commit 1f1590028 «demo reauth skip» as a new PR); close the rest | Owner asked 2026-10-08; App Store / Play reviewers use the demo world where no SMS/e-mail arrives — store-review blocker. Composer redesign superseded by main's video editor | M |
| 97 | claude/project-thread-afhxgh | Веб-версия приложения, фаза 1 + тест «сырых ключей» перевода | Yes for web: `apps/mobile/web/*`, CI «Build check — Web (wasm)». Partly for the test: main has only `test/core/l10n/system_texts_seed_test.dart` (app.dart + navigation keys); the whole-app «every key has English text» test + `untranslated_baseline.txt` is not on main | 34 conflicts, 1943 behind | SUPERSEDED-CLOSE | Web client shipped by later work. Optional small follow-up: port the whole-app raw-key test (S) | — |
| 259 | dependabot typescript-eslint 8.70.1→8.71.2 | Линтер TS, минорное | — | Clean; CI green | SAFE | Dev-only patch/minor, lockfile only | S |
| 255 | dependabot nestjs-pino 5.2.0→5.3.1 | Логи API, минорное | — | Clean; CI red = ERD drift of main on 2026-10-23 (log run 39897972435 shows `system_incidents` ERD diff), not the bump | SAFE (after `@dependabot rebase`) | Minor runtime lib | S |
| 254 | dependabot @aws-sdk/client-s3 3.1141→3.1152 | S3 клиент, минорное | — | Clean; CI green | SAFE (merge together with #248) | Same SDK family must move together | S |
| 248 | dependabot @aws-sdk/s3-request-presigner 3.1141→3.1152 | Подписанные ссылки S3 | — | Clean; CI cancelled | SAFE (with #254, after rebase) | Minor | S |
| 253 | dependabot twilio 6.1.1→6.2.0 | SMS-библиотека, минорное | — | Clean; CI red = same main ERD drift | SAFE (after rebase) | Minor; library only, nothing billable switched on | S |
| 252 | dependabot libphonenumber-js 1.13.13→1.13.15 | Номера телефонов, патч | — | Clean; CI red = same main ERD drift | SAFE (after rebase) | Patch | S |
| 250 | dependabot nodemailer 10.0.10→10.1.1 | Почта, минорное | — | Clean; CI red = same main ERD drift | SAFE (after rebase) | Minor | S |
| 194 | dependabot app_links 7.2.1→7.2.2 (pub) | Диплинки, патч | — | Clean; CI green (7/7) | SAFE | Patch, pubspec.lock only (`^7.2.1` already allows it) | S |
| 18 | dependabot @types/multer 2.0.0→2.3.0 | Типы для загрузок | — | Clean; CI red on a 2026-10-02 base (2237 behind) | SAFE (after rebase, watch typecheck) | Dev types only; may tighten typings | S |
| 258 | dependabot actions/checkout 4.4.0→7.0.1 | CI: checkout, 3 мажора | — | Clean but stale: bumps 32 lines in 19 files, main got new workflows since (115 behind) → mixed versions | RISKY → close, let Dependabot recreate | v6 stores git credentials in a separate file (jobs that `git push` inside containers can break); v7 «safer pull_request_target» defaults (we use none). Redo as one bump of all workflows + one green full CI | S |
| 257 | dependabot docker/build-push-action 6.19.2→7.4.0 | CI: сборка Docker-образа деплоя и PgBouncer | — | Clean | RISKY → close & redo later | Touches deploy.yml + build-pgbouncer.yml; v7 is ESM/Node 24 and should move with setup-buildx v3→v4; a broken image build = broken deploy. Redo with a staging deploy dry run | S |
| 256 | dependabot actions/download-artifact 4.3.0→8.0.2 | CI: скачивание артефактов в релизе приложения | — | Clean | RISKY → close & redo later | Only mobile-release.yml; upload-artifact stays v4.6.2; v8 now FAILS on digest mismatch (was warning) and is ESM. Bump upload+download together, test with a release dry run | S |
| 251 | dependabot github/codeql-action/init 3.39.1→4.39.0 | CI: проверка безопасности кода | — | Clean | RISKY → close | Bumps only `init` to v4 while `analyze` and `upload-sarif` stay on v3 (same SHA 4bfa242…) → mixed versions break the CodeQL job. Redo as one grouped bump of all three | S |
| 249 | dependabot aws-actions/configure-aws-credentials 4.3.1→6.3.0 | CI: вход в AWS при деплое | — | Clean but partial (12 files; main now has 15 usages) | RISKY → close & redo later | Deploy auth path (deploy.yml:64,174); two majors; partial bump leaves mixed versions. Redo with a staging deploy | S |
| 176 | dependabot nestjs group (13 updates, Nest 11→12) | Мажорное обновление всего бэкенда | — | Clean now, but lockfile ±3000 lines on a 383-behind base | RISKY → close, separate post-launch upgrade | Nest 12: `@nestjs/swagger` and `@nestjs/terminus` ESM-only, terminus removes `HealthIndicator`/`HealthCheckError` (used in `apps/api/src/modules/health/*`: 9 hits), `@nestjs/config` `validationOptions` shape change, swagger nullable spelling change → contract/oasdiff churn | L |
| 113 | dependabot node 22-alpine→25-alpine (API Dockerfile) | Версия Node в образе API | — | Clean | RISKY → close | Node 25 is a non-LTS line, end-of-life 2026-06; production must stay on LTS (22 now, 24 LTS later as its own PR with load test) | — |
| 14 | dependabot very_good_analysis 6→11 (pub) | Правила анализатора Flutter, 5 мажоров | — | Clean, 2068 behind | RISKY → close | Hundreds of new lint findings → `flutter analyze` gate goes red; not a library fix | M (if ever) |
| 13 | dependabot go_router 14.8.1→18.0.2 (pub) | Навигация приложения, 4 мажора | — | Clean, 2237 behind | RISKY → close, redo after launch | Breaking router API changes across 15–18; whole-app navigation risk | L |
| 12 | dependabot lint-staged 15.5.2→17.6.0 | Проверка перед коммитом | — | Clean; CI red on old base | RISKY → close & redo | Two majors; main just reworked lint-staged config (#344 «staged files only»); a broken hook blocks every commit. Redo + test one commit | S |
| 11 | dependabot flutter_secure_storage 9.2.4→10.3.4 (pub) | Защищённое хранилище токенов | — | 2 conflicts (pubspec.yaml/lock) | RISKY → close, redo with device test | v10 changes Android storage backend; without a migration test users can be logged out / lose saved keys | M |
| 7 | dependabot local_auth 2.3.0→3.0.2 (pub) | Вход по Face ID / отпечатку | — | Clean | RISKY → close, redo with device test | v3 API change: `AuthenticationOptions` (used in `core/session/biometric_auth_service.dart`) → compile break | S-M |

## Summary
1. Counts (45 PRs): SUPERSEDED-CLOSE 21 (#220, #211, #162, #97 and all 17 feat/*: #116 #120–#129 #132 #135–#137 #140 #141) · FINISH 2 (#111 partial, #295) · OWNER-DECISION 1 (#112) · dependabot SAFE 9 · dependabot RISKY 12 (close and redo later).
2. FINISH by value: (1) #111 → new PR with only the demo re-auth skip (store reviewers get stuck without it), M; (2) #295 perf suite + consent-order contract pin, merge main + regen, S. Optional: port #97's whole-app raw-key test, S.
3. Owner decision: #112 — «Буст: платить не только за показы, а на выбор за людей, нажатия или реальные действия; неистраченное возвращается; в приложении и админке появится выбор модели оплаты. Делать?» (if yes: rewrite on today's Boost, L).
4. All 17 feat/* UI PRs are already in main through their stacked bases — no UI decision needed, just close.
5. Dependabot safe to merge (after `@dependabot rebase`; their red CI was main's ERD drift on 2026-10-23): #259, #255, #254+#248 (together), #253, #252, #250, #194, #18.
6. Dependabot to close and redo later as grouped, tested bumps: #258, #257, #256, #251, #249, #176, #113, #14, #13, #12, #11, #7.
