# Ноутбук: второй раунд нагрузки (после #577) — 2026-11-02

Не повторять то, что уже делает сессия `claude/laptop-load-2` (убийство БД/Redis под нагрузкой, soak 2–4 ч, засев 10M, PR с `docs/perf/LOAD_RESILIENCE_2026-11-02.md`).

## Порядок
1. Свежий worktree от `origin/main` ПОСЛЕ слияния #577 (проверить: `git log origin/main --oneline | grep -i "поиск людей\|#577"`). Общий checkout не трогать.
2. Заново засеять 1M новыми сидами (имена не зависят от роли — `scripts/ops/search-load-gen.sql`, `admin-load-gen.sql`): `./seed.sh 10 lawbid_lt 8`, `licenses.sql`, `./prepare.sh <fx> 12000 3000 0` (см. LOAD_LADDER_2026-11-02.md).
3. Контроль поиска: `EXPLAIN (ANALYZE, BUFFERS)` слова из микса (`will`, `visa`, `law`, редкое имя) — ожидание: без Seq Scan по users, `law` ≪ 3 с (до фикса 3,2 с). Записать числа.
4. Повтор r1k на Postgres 2 CPU: `API_CPUS=2`, Postgres `cpus: 2`. Сравнить с красной r1k из #578 (p95 ≈ 2,4 с на `/search/people`).
5. r1kw — то же с записью постов.
6. auth: `AUTH_TEST=1 ./make-env.sh`, rung `auth`.
7. Сокеты: rung `r1k` (200) и `s10k`. Для s10k лимит на IP 600/мин мал (10k за ~4 мин): на время прогона `INSERT INTO app_config(key,value) VALUES ('realtime.max_connects_per_ip_per_minute','0')` (формат строки — как у `AUTH_CFG` в ladder.sh), после — удалить строку. Это тест-стенд, не прод.
8. Звонки: только сигнализация (WebRTC-медиа и Cloudflare на ноуте не проверить — так и писать). Если профиль `local` без `calls_per_s`, задать его временно в `loadtest/k6/profiles.json` для запуска и не коммитить; нет токенов бесед `at`+`ct` — записать «не проверено» с причиной.
9. Результаты — в `docs/perf/LOAD_TEST_2026-11-02.md` (раздел «Раунд 2»), PR docs-only, журнал `docs/dev/journal/2026-11-02-prNNN-кратко.md`.

## Правила
Только ноут, облако не предлагать. Остановка при ошибках >5 % или p95 >2 с 60 с (abort-правило k6). Честно: не прогонялось = «не проверено». Проверять `docker stats`: упёрлись ли в CPU ноута, а не в API.
