# CI_CHECKLIST — что прогнать ДО пуша (аудит красных PR, 2026-11-01)

Зачем: с 22.10 по 01.11 в `LawBid` было **223 красных прогона** CI на PR и main (API CI — 162, Mobile CI — 32, admin-ci — 24, Secret scan — 5). Одни и те же ветки краснели по 5–9 раз подряд: каждый пуш открывал новый круг и новую причину (`age-sms-email-compliance` — 9 кругов, `privacy-hardening` — 8, `speed-hardening`/`report-abuse`/`legal-requests`/`case-tooling` — по 7). Почти все причины ловятся локально за секунды — но их никто не гонял, потому что единственный git-хук был `pre-commit` (lint-staged) и список правил жил только в памяти чатов.

## Одна команда

```bash
git fetch origin main
npm run precheck        # секунды: свежесть ветки, i18n-аудит, gitleaks, lock_timeout, hardcoded-строки
npm run precheck:full   # минуты, перед ПОСЛЕДНИМ пушем: tsc, связанные unit-тесты, ERD, контракт, flutter analyze
```

`precheck` также запускается хуком `.husky/pre-push` (пропустить один раз: `SKIP_PRECHECK=1 git push`). Скрипт — `scripts/dev/precheck.sh`.

## Причины красного, по частоте (упавший шаг → что делать)

| # | Шаг CI (кругов) | Причина | Команда до пуша |
|---|---|---|---|
| 1 | e2e shard 1–3 / «two databases» (~140) | Сервис вызван вне HTTP без `shardContext.runForCase`; общий реестр; нестабильный тест; после мерджа main. Часто отменяются каскадом из-за первого красного шага | `cd apps/api && E2E_TWO_DB=all npx jest --config ./test/jest-e2e.json <свой набор>` (нужны Postgres+Redis, см. `docker-compose.yml`); не перезапускать вслепую — открыть лог, найти `FAIL … ›` |
| 2 | OpenAPI breaking (27) | Новый обязательный заголовок/параметр/поле запроса (`x-justification`), сужение nullable | Сделать необязательным, либо строка в `packages/api-contract/oasdiff-err-ignore.txt` с причиной |
| 3 | ERD is up to date (22) | Менялась `schema.prisma`, `docs/db/ERD.md` не перегенерирован | `npm run db:erd --workspace apps/api && git diff --exit-code -- docs/db/ERD.md` |
| 4 | API contract is up to date (20) | Менялся контроллер/DTO, контракт не пересобран; или пересобран ДО мерджа main | `sh packages/api-contract/generate.sh` (не `contract:fast`) **после** мерджа main; `git status packages/api-contract` чистый |
| 5 | N-1 / «Migrations apply on previous release» (35) | Почти всегда ветки Dependabot (prisma 8-rc, ts-node/@types/node 26). Для людских веток — миграция не expand/contract | Dependabot не трогаем (правило владельца); свои миграции — только аддитивные |
| 6 | Unit tests (18) | **Бомба времени**: тест с фиксированной датой (`new Date('2026-10-22')`) стареет и падает (окно синка 7 дней; смена месяца ключа бюджета). Сломало main/#535 01.11 | Даты в тестах — от `Date.now()` или `jest.useFakeTimers({ now, doNotFake: [...] })`. Прогон: `cd apps/api && npx jest <файл>` |
| 7 | flutter analyze / test (22) | CI падает даже на `info`; тест по всему приложению, а не по изменённым файлам; флаки `voice_test` | `cd apps/mobile && flutter analyze` (всё приложение); `dart format <свои файлы>` |
| 8 | Lint (9) / Typecheck (admin 16) | Забытые типы, неиспользуемое | `npm run lint:fast --workspace apps/api`; `npx tsc --noEmit` в `apps/admin` |
| 9 | Gitleaks (5+5) | Случайно выглядящий фейковый токен в тесте; закоммичен `graphify-out/` (кэш с именами `sentry_*.dart` → правило sentry-access-token) | `gitleaks git --log-opts="origin/main..HEAD" .`; фейки называть `test-…-token`; `graphify-out/` не коммитить |
| 10 | Squawk online-DDL (2) | Миграция без `SET LOCAL lock_timeout = '5s';` первой строкой, индекс без `CONCURRENTLY` | `npx squawk-cli@2.70.0 -c .squawk.toml <файл>` |
| 11 | i18n (2) | Ключ используется в коде, но его нет в xlsx (`post.counts.hiddenForOthers`) | `node scripts/i18n-add.mjs …` затем `node scripts/i18n-audit.mjs --ci` |
| 12 | module-boundaries | Новый кросс-модульный импорт | `UPDATE_BOUNDARIES=1 npx jest architecture/module-boundaries` (обновить baseline сознательно) |
| 13 | Build iOS/Android (6) | Сеть раннера: `cdn.cocoapods.org` не резолвится; отмена из-за нового пуша | Не код. Перезапустить **только упавший job** один раз (`gh run rerun <id> --failed`) |
| 14 | Конфликт с main (`mergeable_state=dirty`: #515, #517) | Долгая ветка без ребейза; общие реестры (i18n/ERD/контракт) | Мерджить main в ветку каждый день; после мерджа — перегенерировать контракт/ERD |

## Правила работы с PR

1. **Один пуш — один полный прогон.** Перед первым пушем `npm run precheck:full`. Не «пушу и смотрю, что скажет CI» — один круг ≈ 40 мин.
2. **Ветка живёт не дольше суток без мерджа main.** Все долгие ветки (#515, #517, #511) сначала `git merge origin/main`, потом пуш.
3. **Стек PR** (B на ветке A, как #520→#515, #523→#522): после слития A сразу `base` B → `main`.
4. **Красный шаг — читать лог, не перезапускать.** Перезапуск допустим только для сетевых падений (п. 13).
5. **Тесты не зависят от текущей даты.** Любая литеральная дата в spec, которая сравнивается с «сейчас», — будущая красная main.
6. Новую причину красного — в `KNOWN_ERRORS.md` в тот же час.
