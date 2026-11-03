# Журнал за 02.11.2026: все слитые в main PR

Из `git log origin/main --first-parent` за сутки 02.11 по Висконсину (UTC−6). SHA — SHA слияния в main (сокращённый). Слитое 03.11 смотри в git.

| PR | SHA | Время | Что |
|---|---|---|---|
| #593 | c205eabb | 00:31 | ci(api): случайные host-порты сервисов, чтобы job на одном хосте не сталкивались |
| #604 | f38f26e1 | 00:36 | test(overflow): bid form runs with reduce-motion like every other screen |
| #613 | b4e4fca9 | 00:37 | docs(infra): pre-release cost mode profile (Redis 1 node, Multi-AZ off) with return checklist |
| #610 | 005ce6a6 | 00:51 | perf: read public summaries and discover rows from the replica seam |
| #618 | db00bf9b | 01:02 | docs: journal for #610, RDS wording in the pre-release runbook |
| #603 | 7e0ce8e6 | 01:06 | ci: restore-only npm cache on self-hosted + per-runner ~/.npm volume |
| #619 | 62b51900 | 01:22 | docs(ops): secrets for mobile test builds are set from the Mac with gh, owner only logs in |
| #612 | a3ffd71c | 01:36 | perf: лента кейсов читает список id с реплики |
| #614 | c539c455 | 01:43 | fix(worker): messages.reencrypt падал каждые 5 минут — пустой uuid-курсор |
| #615 | 66c7b1a6 | 01:43 | fix(api): Redis недоступен — быстрый отказ, 503 с Retry-After, вход и конфиг работают без кэша |
| #609 | 081fd796 | 01:55 | test(overflow): пачка 1 непокрытых экранов + длинное дело + 4 темы |
| #617 | 25f0f35f | 01:56 | test(file-views): wait for the catch-up request instead of a fixed 100 ms (CI timing) |
| #620 | 35e89cc0 | 02:24 | docs: заявка AWS Activate Founders |
| #621 | 05e70db0 | 02:41 | perf: посты канала для читателей читаются с реплики |
| #623 | b362cdad | 02:50 | fix(api): Redis fail-fast в кластерном режиме - проверено на живом кластере |
| #586 | 6d9dac79 | 02:50 | perf: деление таблиц «auto» по умолчанию, роль lawbid_partition только воркеру, курсор отзывов о клиентах |
| #600 | 60a11fb7 | 02:53 | Статус-файл: честные строки «Частично/Не начато» |
| #622 | 8321c6c8 | 02:59 | test(overflow): пачка 2 непокрытых экранов (профиль клиента, дела и статистика адвоката, пост канала, шторки) |
| #626 | 358c7931 | 03:07 | docs(journal): merge SHA for PR #623 |
| #589 | ff7c9e7c | 03:16 | docs: режим работы и строгие правила проекта для каждого ИИ |
| #627 | 6282c134 | 04:12 | test(overflow): пачка 3 непокрытых экранов (платежи по делу: карточка, шторка оплаты, шторка счёта) |
| #628 | 51794229 | 04:59 | fix(mobile): копия списка групп обновляется после догонки updatedSince |
| #574 | 59752b7d | 05:04 | i18n: translate new strings into all languages + glyph (tofu) audit in CI |
| #599 | f7063116 | 05:04 | perf(realtime): лимит подключений сокетов считает человека, а не адрес |
| #567 | 104127fd | 05:05 | security: аудит 02.11 — зависимости, post:watch, лимит приёма крэшей |
| #572 | d163c51e | 05:05 | test(admin): контрактный smoke-тест страниц; fix(api): клик поиска не даёт 500; разбор 5xx за 7 дней |
| #597 | 4da68c2b | 05:05 | Покадровая проверка видео (за флагом, по умолчанию выкл.) |
| #598 | 13a03df2 | 05:05 | Поддержка: два тикета не уходят одному агенту сверх лимита (A-16) |
| #601 | 66a92259 | 05:05 | perf(db-autoscale): быстрая полоса по CPU и заметка про запас БД |
| #631 | 96c78e40 | 05:06 | docs(perf): аудит мобилки — какие списки без сохранённой копии, рилсы и поиск уже есть |
| #590 | 9f231026 | 06:05 | «Данные и память»: считать и чистить видео-кэш и голосовые заметки |
| #630 | 5fdca557 | 06:05 | test(overflow): пачка 4 (платежи: комиссия, возврат, панель в чате, история) + fix кнопок панели оплаты в чате |
| #635 | 32b20e1b | 07:03 | perf(mobile): списки кейсов, работ, ставок, сохранённых, каналов, уведомлений, консультаций открываются из копии телефона |
| #638 | 666ceb2e | 07:31 | ci: push checks on main get a per-sha concurrency group (a pending run was cancelled by the next push, gate went red) |
| #608 | 6627117e | 08:04 | security: админка на Next 16 и vitest 4 (postcss, tinypool из аудита) |
| #637 | 86552e02 | 08:04 | test(overflow): batch 5 (story publish panel, story menu and report, contacts states, post attachments) |
| #636 | b132a638 | 09:03 | Видеокэш: доработки после #590 (нулевой лимит, повтор старта, ранний старт) |
| #641 | aec12d41 | 09:05 | ci(admin): гейт уязвимостей зависимостей и итог повторного скана |
| #625 | 0034b1cf | 09:13 | feat: роль lawbid_partition с наименьшими правами (владеет только делимыми таблицами) + тест на PG16 |
| #639 | 300cb711 | 09:34 | perf(mobile): копия телефона не опаздывает за лимитом списка, тесты медленного диска и офлайн-старта |
| #606 | 03825c71 | 10:21 | perf(loadtest): отвал Postgres/Redis под 1 000 человек, soak 2 ч на 1 500, подготовка 10M — результаты и находки |
| #624 | ee35430f | 10:21 | feat: post_view_events по месяцам через онлайн-раннер |
| #591 | 66eb1631 | 10:57 | Статус: поправить web push, очистку кэша, адреса и п.37 |
| #642 | 8c9eed96 | 11:03 | perf(loadtest): проверка базы 10M одной командой (счётчики, EXPLAIN горячих чтений, r1k) |
| #596 | e74a3771 | 12:00 | feat: медленный режим в группах (как в Telegram) |
| #640 | ea00f3fb | 12:00 | test(overflow): пачка 6 (демо-аккаунты, «Архив (N)», подвал списка) |
| #587 | c1b8d442 | 14:03 | Merge pull request #587 from syimykkalykov1999/claude/project-thread-unx9ja |
| #546 | 16572262 | 14:34 | Merge pull request #546 from syimykkalykov1999/claude/project-thread-vlopum |
| #594 | 8e768337 | 14:40 | Merge pull request #594 from syimykkalykov1999/claude/quick-replies |
| #588 | f48993fe | 16:12 | Merge pull request #588 from syimykkalykov1999/claude/project-thread-unx9ja-post-place |
| #553 | 96530e7a | 16:27 | Merge pull request #553 from syimykkalykov1999/claude/project-thread-i0o4n9 |
| #652 | cdb0f449 | 16:57 | Merge pull request #652 from syimykkalykov1999/claude/audit-mobile-preflight |
| #607 | f8e858d2 | 17:05 | Merge pull request #607 from syimykkalykov1999/claude/project-thread-unx9ja-per-chat |
| #660 | fd6337e0 | 17:43 | test(api): мок логгера в revocation-спеке с info (красный API static на main после #553) |
| #648 | c994876d | 19:07 | Merge pull request #648 from syimykkalykov1999/claude/project-thread-ok6gzk |
| #651 | b444cf24 | 19:08 | Merge pull request #651 from syimykkalykov1999/claude/audit-tf-validate |
| #649 | 0e61b164 | 19:28 | Merge pull request #649 from syimykkalykov1999/claude/audit-api-startup |
| #650 | be0ea223 | 19:37 | Merge pull request #650 from syimykkalykov1999/claude/audit-ci-preflight |
| #653 | 2aebcc44 | 20:27 | Merge pull request #653 from syimykkalykov1999/claude/audit-api-kinesis |
| #655 | f5ff939f | 21:46 | Merge pull request #655 from syimykkalykov1999/claude/project-thread-b7iuoa |
| #656 | c4d4384e | 22:44 | Merge pull request #656 from syimykkalykov1999/claude/project-thread-b7iuoa-push-reads |
| #657 | 9d5e8387 | 23:41 | Merge pull request #657 from syimykkalykov1999/claude/project-thread-b7iuoa-ws-handshake |

Состояние, открытое и не сделанное: `docs/HANDOFF.md`, разделы «Состояние на 02.11» и «Что осталось и откуда продолжать (03.11)».
