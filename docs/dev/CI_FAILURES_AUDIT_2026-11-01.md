# Аудит красного CI — почему PR не сливаются с первого раза (2026-11-01)

Продолжение `docs/dev/CI_CHECKLIST.md` (PR #536: 223 красных прогона 22.10–01.11, список причин + `npm run precheck`). Здесь — свежая выборка и **исправление самих причин в workflow**, а не только памятка.

## Выборка

600 последних прогонов GitHub Actions (27.10 23:46 UTC — 01.11 20:28 UTC), 75 красных, 95 упавших jobs. Данные: `gh api repos/.../actions/runs` + `/jobs`, логи упавших шагов.

| Workflow | красных / всего | замечание |
|---|---|---|
| Load test watchdog | 21 / 21 | красный **каждый час** с 24.10, чистить нечего |
| API CI | 16 / 67 | см. таблицу ниже |
| Mobile CI | 9 / 63 | analyze/test, iOS-сборка (Dependabot, firebase SPM) |
| Self-check (production) | 5 / 5 | нет прав IAM + нет бюджета/тревог в AWS (только владелец) |
| SEO pages | 5 / 5 | AASA ≠ AndroidManifest (только на main) |
| Web deploy | 5 / 13 | «Wait for green CI»: ждёт чужой красный |
| Container scan | 4 / 18 | Trivy: новые CVE в follow-redirects / systeminformation |
| Mobile release | 4 / 4 | секреты подписи пустые (только владелец) |
| Secret scan | 2 / 121 | gitleaks на `rescue/*` и `id-selfie` |

## Категории причин → корень → что сделано

| # | Категория | Падений | Корень | Исправление (где) | Статус |
|---|---|---|---|---|---|
| 1 | **Ложная тревога watchdog** | 21 | Теневой индекс тегов вечно показывает 4 «ресурса» стека `40088605442-1` (неактивные task-definition, KMS «на удалении», удалённый ECS-кластер). `verify-clean.sh` их игнорирует, `watchdog.sh` нет → «уничтожал» их каждый час и падал | `loadtest/scripts/watchdog.sh`: тот же фильтр, что в `verify-clean.sh` | Готово (кодом); проверка — следующий часовой прогон |
| 2 | **Новая CVE красит все PR** | 4 Trivy + 2 audit + 3 Unit на dependabot | Любой новый advisory в npm красил **каждый** открытый PR, хотя они не трогали зависимости (follow-redirects, systeminformation 01.11) | `api-ci.yml` шаг «Dependency audit»: на PR без изменений package.json/lock/allowlist находка = `::warning`, не блок. Блок остаётся на push в main, в merge queue и на PR с зависимостями | Готово. Trivy на main/daily оставлен блокирующим (это сигнал владельцу) |
| 3 | **Бомбы времени в unit** | 4 + main 01.11 | Тесты с фикс. датой стареют (окно синка 7 дней, ключ бюджета на смене месяца) | `apps/api/test/time-shift.setup.js` + `.github/workflows/time-bomb-nightly.yml` (все unit со сдвигом часов +45 дн, ночью, уведомление владельцу); `precheck --full` гоняет связанные specs со сдвигом +45 | Готово. Проверено: весь unit (6062 теста, 638 файлов) с часами +60 дн — зелёный; живых бомб на main нет |
| 3b | **Тест ходит в интернет** | 0 в выборке (нашёл при прогоне) | `switch-contract.spec.ts` реально качает `https://example.com/`; без сети путь ошибки падал на `this.log` (объект без логгера) — красный при сбое сети раннера и на офлайн-precheck | Добавлен `log` в заглушку | Готово |
| 4 | **Проверки только в path-фильтре** | SEO 5, i18n 1+ | i18n-аудит жил только в API CI (paths `apps/api/**`) → PR только мобилки/админки с новым ключом был зелёный и краснел на main; SEO-тесты (AASA vs `AndroidManifest.xml`) бежали только на push в main (`/verification/wizard`) | Новый `repo-guards.yml` («Repo guards», без path-фильтра, ~1 мин): i18n-аудит, SEO-тесты, self-тесты CI-скриптов. Исправлен AASA (`scripts/seo/well-known.mjs`) | Готово |
| 5 | **Нечего требовать в защите ветки** | — | `main` **не защищена** (`branches/main/protection` = 404, rulesets = `[]`). Требовать `API CI`/`Mobile CI`/`admin-ci` нельзя: path-фильтры → на PR без этих путей статус не появляется и слияние висит на «Expected» | Новый `ci-gate.yml` («CI gate»): одна проверка, ждёт все остальные проверки коммита через `scripts/ci/require-green.sh`; «Repo guards» обязателен, поэтому непротестированный PR не пройдёт | Код готов; **включить правило может только владелец** (см. ниже) |
| 6 | Lint OOM / `ParentBasedSampler` | 7 | Куча 6 ГБ (28.10, уже поднята до 7 ГБ, lint в 2 процесса); `no-unsafe-*` — ветки Dependabot с `@opentelemetry` | Уже исправлено 28.10; Dependabot не трогаем (правило владельца) | Готово ранее |
| 7 | e2e | 3 + 1 | Детерминированные регрессии ветки (S14-4 «409», settings→account «401»), не флаки: падали одинаково во всех 3 попытках. Карантин `quarantine.json` пуст | Нечего «лечить» перезапуском: читать лог. Уже есть retry 1×/suite и ночной карантин | Не флаки — правило в CI_CHECKLIST п.4 |
| 8 | Mobile analyze/test/iOS | 2+2+3 | `flutter analyze` падает даже на info; конфликт версий `firebase-ios-sdk` у Dependabot | Памятка CI_CHECKLIST п.7; `precheck --full` гоняет analyze по всему приложению | Не код CI |
| 9 | gitleaks | 2 | Случайный токен-подобный фейк; `graphify-out/` | `.gitleaksignore` + правило в precheck | Готово ранее |
| 10 | Web/Deploy «Wait for green CI» | 5+1 | Deploy-гейт ждёт **все** проверки main, любой чужой красный (Trivy, SEO) блокирует релиз | Устранены красные источники (пп. 1, 2, 4); логика гейта сохранена намеренно | Косвенно |

## Ограничение детектора бомб

Спеки с `jest.useFakeTimers` пропускаются в ночном прогоне: фейковые часы стартуют от реального времени и дают ложные красные (`pay-page.service.spec`). Они задают своё «сейчас» сами; живые бомбы в них ловит только ревью.

## Что осталось и может сделать только владелец

1. **Защита `main`** (Settings → Rules → Rulesets → New branch ruleset → `main` → Require status checks): добавить ровно один check — **`CI gate`**. До этого PR можно сливать и красными: правила нет. Включить после того, как `CI gate` один раз отработает на PR (чтобы имя появилось в списке).
2. **Self-check (production)**: роли `lawbid-prod-github-deploy` не хватает `SNS:ListTopics`, в AWS нет бюджета `lawbid-prod-monthly` и ≥20 тревог CloudWatch → `terraform apply` в `infra/envs/prod` («ставь на AWS»). Пока не сделано — красный каждые сутки.
3. **Mobile release**: секреты `ANDROID_KEYSTORE_BASE64` и подписи iOS пустые — красный на каждый `v*`-тег / ручной запуск, пока их нет.
4. Dependabot-ветки красные сами по себе (prisma 8-rc, `@opentelemetry`, firebase SPM) — по правилу владельца не трогаем; закрывать/группировать решает владелец.

## Правила (дополнение к CI_CHECKLIST)

- «CI gate» — единственный required check. Новые проверки без path-фильтра кладём в `repo-guards.yml`.
- Дата в тесте — только относительная; `TIME_SHIFT_DAYS=45 npx jest --setupFiles '<rootDir>/../test/time-shift.setup.js' <spec>` покажет бомбу сразу.
- Находка `npm audit` вне PR с зависимостями — warning; чинить отдельным PR `npm audit fix`.

## Очередь раннеров: Mobile CI на macOS (второй проход, 01.11 21:10)

Замер (шаги упавших/успешных прогонов): на macOS `flutter test` 30–43 мин из 43–115 мин всего (490 тест-файлов, но golden-сравнение только в 7); analyze 2 мин, codegen 2 мин, установка Flutter 1,5 мин, iOS-сборка 13–16 мин. Пул macOS у GitHub мал, 3 мобильных PR одновременно ставили в очередь всё остальное. API CI при этом 16–17 мин и очередь не создаёт (метка «queued» у «All API jobs passed» — это итоговый job, ждущий остальные).

Сделано (`mobile-ci.yml`): analyze + unit/widget (483 файла, без golden) на **ubuntu**; macOS остаётся только для `Golden tests` (7 файлов) и iOS-сборки, и только если PR меняет `apps/mobile/**` (job `changes`; PR только с `packages/api-contract/**` macOS не занимает); `cache: true` у flutter-action; таймауты: API static 45, mobile ubuntu 45, golden macOS 45, iOS 25, остальные job-ы без таймаута получили 20–60; watchdog раз в 3 часа вместо часа.

**Следующий шаг (для следующего ИИ):**
1. Измерить новый прогон: цель — macOS-часть < 25 мин (golden 7 файлов + iOS). Если `flutter test` на ubuntu красный из-за разницы ОС (шрифты/метрики), чинить тест, а не возвращать на macOS целиком.
2. «CI gate» сейчас опрашивает API и держит 1 ubuntu-раннер до 90 мин. Заменить на `workflow_run`-workflow (срабатывает на завершение API CI / Mobile CI / admin-ci / Repo guards, ставит commit status «CI gate») или на короткий job с `gh api` — `workflow_run` работает только из `main`, поэтому проверять после слияния.
3. Если iOS-сборка останется самой долгой — кеш CocoaPods (`~/.cocoapods`, `ios/Pods`) по хешу `Podfile.lock`.
