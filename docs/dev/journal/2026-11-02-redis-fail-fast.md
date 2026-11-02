# 2026-11-02 · Redis недоступен: быстрый отказ, 503 с Retry-After, вход и конфиг без кэша

Из нагрузочного теста (PR #606, `docs/perf/LOAD_RESILIENCE_2026-11-02.md` §2): при отвале Redis на 40 с под 1 000 человек каждый запрос висел ≈ 4 с (ioredis `commandTimeout` 2 с × 2 команды) и падал 500 — 7 223 ошибки. PR: PR_LINK.

Сделано (класс, не точка): основной клиент Redis получает штатные опции ioredis `enableOfflineQueue: false` + `socketTimeout` (`requestPathOptions()`), запуск ждёт `ready` ограниченно (`waitForReady`); инфраструктурные ошибки Redis (`redis-errors.ts`) в `AllExceptionsFilter` → `503 SERVER_BUSY` + `Retry-After: 5`; проверка отзыва сессии при недоступном Redis читает таблицу `sessions` (одна строка, `revoked_at` nulls-first, memo `L1Cache` 5 с, single-flight), отзыв не падает из-за кэша; кэши `app_config` и feature-флагов обёрнуты существующим `failSoftRedis`. Как у Facebook memcache / Netflix Hystrix: отказ кэша стоит латентность промаха, а не таймаута.

Гейты: `/code-review high` (8 замечаний, все учтены), `/security-review` (уязвимостей нет; 2 замечания учтены), `/simplify` (4 агента: шлюз заменён штатными опциями, memo → `L1Cache`, try/catch → `failSoftRedis`, запрос в одну строку), `npm run precheck:full`. Проверка на стенде: отвал Redis 30 с на изолированной паре API + Redis — до/после в описании PR.
