# Owner's latest cosmetics requests (after the 22 Oct list) vs current main — 2026-10-26

Reference = `origin/main` at 4abf9aa7d (fetched 2026-10-26). Read-only check, no code changed.
Owner rule: never revert to an older look; work only on top of current main. UI frozen: «чуть чуть» = ~20 px, show him first.

## Summary
1. Counts: 18 requests found after 22 Oct → DONE on main 13 (incl. #1 not yet seen on a phone), PARTIAL 2, NOT 3 (checkmarks, smoothness, desktop web — the last one scheduled later).
2. Real to-do, in order: (a) **checkmark colours in Blue/Green (and Dark gold)** — NOT done; (b) **animation smoothness** — nothing on main yet (S16 branch `claude/mobile-perf` unmerged); (c) **Android «+» lower** — code is on main since #293, but the phones run builds made BEFORE #293, so the owner never saw it: install a fresh build and let him look; change only if he still says «выше».
3. Leave for later (owner's own order): channel calls in «Идёт сейчас» (after release), desktop web cosmetics (after load tests).
4. Do NOT touch / accepted current look: everything from PRs #267 #268 #270 #282 #288 #293 #309 #310 (themes, gestures, chat bubbles, header order, FAB, call pill, picker sheets) — see the last section.
5. Do NOT merge `claude/mine-menus-polish` (held for owner, menu rewrites; picker sheet sizes on main = #309 «old size + 20 px» is the accepted one).

## Table

| # | Owner's words (source, date) | Status on main | Evidence | What remains | Effort | Device test |
|---|---|---|---|---|---|---|
| 1 | «FAB чатов на Android ниже (iOS ок)» (NEXT_CLAUDE l.593, 2026-10-23 (4)); repeated 2026-10-26 07:55 «Android «+» a bit lower» (l.175) | DONE in code, NOT seen by owner | `apps/mobile/lib/core/design_system/widgets/buttons/app_fab.dart:98-111` (Android gesture nav: no lift, standard 16 dp; 3-button bar: lifted by bar height), commit 66eac31cf in PR #293 (merged 24 Oct 06:03). Last phone builds = phone-build-2/3 (23 Oct: #280 #281 #286 #288 #289) — WITHOUT #293 | Fresh Samsung build from main, owner looks. Only if still high: lower ~4-8 dp on Android gesture nav only (iOS untouched) | S | YES (Samsung, gesture nav and 3-button) |
| 2 | «галочки … look greyish in some themes. Fix ONLY their colors per theme (Day, Night, Blue, Green)… Do not change the icon shape or size» (NEXT_CLAUDE l.906-908; HANDOFF #323, 2026-10-24); 2026-10-26 «checkmark colours NOT done» | NOT | Client gold check = `colors.goldAccent` (`post_card.dart:2086-2115`, `attorney_tile.dart:226`): Blue/Green = `goldLight #FFF2C7` (cream on blue #003B70 / green #007200 → pale/greyish), Dark = #E6CE98. Attorney green badge = `colors.success` (`trust_level_chip.dart:27-31`, `attorney_tile.dart:226`, white icon on it): Blue `#8FE0B0`, Green `#BDF2CC` (pale mint, white icon nearly invisible). Day/Night success #1F9D67 ok. No commit touched these since 23 Oct | Per-theme token values only (new `verifiedGold`/`verifiedGreen` or adjust in `app_color_tokens.dart` Blue/Green/Dark factories) — saturated gold/green with contrast vs bg and white icon; also `qa_widgets.dart:359`, `contact_info_screen.dart:332`, `group_info_member_tile.dart:100`. Shape/size unchanged; goldens 4 themes | S | YES (all 4 themes, screenshots to owner) |
| 3 | «только плавность анимаций» / «animation smoothness» (NEXT_CLAUDE l.163, 172, 174; ui-frozen memory, 2026-10-26) | NOT on main | Only the measuring suite is on main (#290). Measured 24 Oct: Samsung 35/35 ok (scroll p99 ≤16 ms), iPhone 28/29 (memory +30 %) (l.602-604). Fixes sit in unmerged `origin/claude/mobile-perf` (S16, 3 commits, 22 files, 25 Oct, one is «wip») and `origin/claude/perf-fix` (perf tooling) | Finish/merge S16 with NO visual change (rebuild on main, goldens identical), then re-run `tool/perf/run_device_perf.sh` on both phones; look at page/sheet transitions the owner feels | M | YES (both phones, perf run) |
| 4 | ««+» в чатах на iPhone выше как в WhatsApp» (l.569, 2026-10-23 (3)) | DONE | `app_fab.dart:109` (iOS: inset + 8), #288 «new-chat lift», #293 | — | — | done (owner: «iOS ок») |
| 5 | «Задачи и Вопросы — «+» как FAB в чатах (общий виджет)» (l.593) | DONE | `AppFab` used in `inbox_screen.dart:1657`, `tasks_tab.dart`, `qa_feed_screen.dart`; #293 | — | — | with #1 |
| 6 | «звонки: убрать зелёную полосу сверху, «Идёт сейчас» вверху вкладки Звонки, зелёная мигающая кнопка над «+»» (l.593) | PARTIAL | #293 (`live_calls_fab.dart`, `AppLiveDot` app_fab.dart:118-167). Channel calls not in «Идёт сейчас» (needs API list, l.597) | Channel calls — owner put «звонки каналов» AFTER release (l.789) | M | later |
| 7 | «Вопросы — поиск лупой» (l.593) | DONE | #293 «Q&A search icon» | — | — | — |
| 8 | Blue/Green «фон полностью насыщенный… не бледный», убрать «как в банке» (l.564, 2026-10-23) | DONE | #282 (bd6be5bdd), tokens `app_colors.dart:137-212` | — (checkmarks = #2) | — | — |
| 9 | Face ID/отпечаток → текстовая ссылка справа от «Forgot password?» (l.564) | DONE | #282 | — | — | — |
| 10 | «колокольчик всегда справа, слева лупа, затем 3-я иконка»; уведомления: колокольчик, настройки, ✓✓, без поиска (l.566, l.569) | DONE | #282 «header order», #288 «bell header» | — | — | — |
| 11 | «карточка загрузки поста — на всю ширину, ниже, «Не закрывайте LawBid…», полоса+%»; сырой ключ nav.backAgainToExit (l.566) | DONE | #282 «publish card, back-key text» | — | — | — |
| 12 | «кнопки видеозвонка везде, где аудио»; сплошной красный сброс (l.569) | DONE (hidden while flag `video_calls` = false) | #288 | Owner turns the flag on in admin when ready | — | — |
| 13 | «Вопросы» 3-й вкладкой в Делах, «?» убрать, Q&A уведомления по умолчанию ВЫКЛ (l.569) | DONE | #288 | — | — | — |
| 14 | «лого в профиле без анимации и крупнее (как в ленте)» (l.569) | DONE | #288 «profile logo» | — | — | — |
| 15 | Android back из ленты профиля выходит из приложения (BUG l.513, 2026-10-23) | PARTIAL | #268 + #288 «Android back»; «not reproduced, guarded; verify on device» (l.529) | Check on Samsung with the fresh build | S | YES |
| 16 | Мои: picker sheets raised «чуть чуть» (owner 2026-10-24; furious when they became half-screen — ui-frozen memory) | DONE | #309 incl. ee09d882d «pickers back to their old size, only 20px more room», #310 tap areas | Nothing. Do NOT merge held `claude/mine-menus-polish` (d7302119f, d0651a241) without his OK | — | — |
| 17 | Gestures like Instagram (tab swipes, back from anywhere), chat bubbles like WhatsApp + media composer (2026-10-23, backlog memory l.110-115) | DONE | #268, #270 | — | — | — |
| 18 | Desktop web: laptop layouts, misplaced dialogs/sheets (NEXT_CLAUDE l.1014-1015, 2026-10-25) | NOT (scheduled) | Plan only; owner's order: after merges, switch tests and load tests | Later, per plan | L | web |

Also open, origin unclear: «метка «ждёт ответа» на карточках ставок» noted as «Не сделано» after #288 (l.579) — no owner quote found; ask before doing (UI frozen).

## Accepted current look — last merged UI PRs (do not regress)
- 23 Oct: #267 themes (Day/Night/Blue/Green, Glass removed), #268 gestures, #269 instant content/publish card, #270 chat polish (bubbles, media pill, composer).
- 24 Oct: #282 owner-ui-themes (full-colour Blue/Green, Face ID link, guest off, header order, publish card, back-key text), #286 search grid video, #288 owner-ui-3 (video buttons, Q&A tab, bell header, iPhone «+» lift, call pill, profile logo, Android back), #289 QR on People tab, #293 owner-ui-4 (shared AppFab, ongoing-call button, «Идёт сейчас», Q&A search, compact 44 dp search fields), #298 «Просмотры» of case documents, #307 group calls app part, #309 + #310 Мои pickers/tap areas (old size + 20 px), #311 Cloudflare parity (video button).
- 25 Oct: #328 license expiry (badge hides on expiry), #374 mobile systems (no visual change). No UI PRs on 26 Oct.
- Not on main (not accepted): `claude/mine-menus-polish`, `claude/mobile-perf` (S16), `claude/perf-fix`.

Note: GitHub API hit its rate limit during the check, so PR bodies were read from merge/commit messages on main instead.
