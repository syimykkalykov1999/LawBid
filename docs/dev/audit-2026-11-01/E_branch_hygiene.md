# Область 4: гигиена веток (01.11.2026)

Проверено `git cherry` / обратным применением диффа к main / «ветка целиком входит в другую ветку». Подписи коммитов в main переписаны (история сжата), поэтому «уже в main» по коммитам не подтверждается — решения ниже консервативные.

## Удалить можно без потери коммитов (24 ссылки)
Кончик ветки целиком содержится в другой остающейся ветке (`git branch -r --contains`). Удаление ссылки ничего не теряет. Удаление в этой сессии заблокировано политикой — ждёт команды владельца.

- worktree-agent-a025d551d4b77144a via origin/file04/stage-4-3
- worktree-agent-a1012e5616a8fffc9 via origin/rescue/wt-agent-a1012e5616a8fffc9
- worktree-agent-a20681b544533ec9b via origin/file04/stage-4-3
- worktree-agent-a246f948f0137f763 via origin/file04/stage-4-3
- worktree-agent-a33a10de8c4fe364b via origin/cursor/stage-1-7-onboarding-mobile
- worktree-agent-a387c3de63cec1680 via origin/file04/stage-4-3
- worktree-agent-a3bfdababa0956bf0 via origin/cursor/cost-guard
- worktree-agent-a40f92199cf4e01e3 via origin/file04/stage-4-3
- worktree-agent-a470f92e638146ab5 via origin/file04/stage-4-3
- worktree-agent-a586832c6f21eb673 via origin/file04/stage-4-3
- worktree-agent-a5b359266f21b6cfb via origin/file04/stage-4-3
- worktree-agent-a5c9c084cf5eba691 via origin/file04/stage-4-3
- worktree-agent-a6055c97d7e006405 via origin/cursor/keys-wiring
- worktree-agent-a77d3d0067d316f26 via origin/file04/stage-4-3
- worktree-agent-a833546c0ed4c25fc via origin/file04/stage-4-3
- worktree-agent-a9902344967ab32b0 via origin/file04/stage-4-3
- worktree-agent-a9e18c12bf2fc70b1 via origin/cursor/cost-guard
- worktree-agent-aa90a7d8e6acaea4b via origin/file04/stage-4-3
- worktree-agent-ab77a43464b8d5b00 via origin/file04/stage-4-3
- worktree-agent-ab96bb1bcbf0f644d via origin/claude/badge-toggle-29
- worktree-agent-abc3d25ea71b85f43 via origin/rescue/wt-agent-abc3d25ea71b85f43
- worktree-agent-ac7176048e8dd2fe7 via origin/file04/stage-4-3
- worktree-agent-ada12f76b379b43c7 via origin/file04/stage-4-3
- worktree-agent-aecc87cbe0d73422b via origin/file04/stage-4-3

## Оставить (уникальное содержимое, не слито)
- `claude/perf-round-2` — 1 WIP-коммит (кэш prefs бейджей, feed, lease skipIfBusy, нагрузочные скрипты); перенесён в PR этой ветки.
- `rescue/wt-*`, `rescue/stash-*` — по 1–3 коммита «незакоммиченное из worktree/stash» от 22–29.10; содержимое частично не применяется к main (обратное применение даёт конфликты) → нужен разбор владельцем по теме; `rescue/wt-agent-events`, `rescue/stash-12` (кончик 1 файл) уже совпадают с main по кончику, но стоят на длинной старой истории.
- `rescue/group-chats-polls-a41ykg-local`, `rescue/stash-12/13/14`, `rescue/wt-agent-a1012e…/abc3d…` — длинная старая линия (~1000–1500 коммитов до пересжатия main), держат ссылки на эти коммиты.
- `worktree-agent-a54c3d…, a610daf…, a6538ff…, a94e88c…, a96cdc0…, aaff298…` — 21.10, нигде больше не содержатся; уникальные правки чатов/каналов.
- `rescue/partition-messages-local` — только описание: 20 уникальных коммитов партиционирования messages; содержится в `rescue/wt-train-358`. Не сливать.
- `claude/calls-variant-a` — не сливать (по указанию).
- `claude/mac-rescue-2026-10-29`, `handoff/mac-2026-11-01` — хранят запросы владельца и карту проекта, не трогать.
