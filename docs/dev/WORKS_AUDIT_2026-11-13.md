# Проверка «всё, что есть в коде, реально работает» (строка 39), 13.11.2026

Прод, только чтение. Окно: последние 24 часа до 12.11 22:00 (тихоокеанское время, все времена ниже — тоже), для упавших заданий 60 часов.
Источники: CloudWatch Logs Insights (`/lawbid/lawbid-prod/api`, `/worker`), список тревог CloudWatch, события и остановленные задачи ECS, SES, запуски `infra-apply.yml`, админ-API (прочитал координатор из своей сессии), открытый `/health/ready` (версия `4298549`).

## Итог

| Функция | Доказательство | Состояние | PR |
|---|---|---|---|
| Тревога «много фоновых задач падает» (`queue-failed-many`) | `ALARM` с 11.11 12:36; `QueueFailed5mAll` = 33 каждый час 40 ч подряд; последнее «cron job failed» 11.11 13:17 (простой базы, KE 99), с тех пор 0 | **Сломано: застрявшее значение.** BullMQ дописывает точку «failed» только при следующем падении, код читал пять старых точек (KE 125) | fix PR `claude/queue-failed-stale` |
| Демо-мир | `/admin/demo/status` `ready=false`, «LOCK TABLE can only be used in transaction blocks»; в журналах 46 + 34 «Demo world is not available» | Сломано, уже чинится | #973 (KE 124) |
| Письма-оповещения владельцу | 45 «ops alert email skipped» за 72 ч: «Email address is not verified»; SES `ProductionAccessEnabled=false` | Шаг владельца (SES в песочнице, `docs/runbooks/SES_PRODUCTION.md`) | — |
| Вебхук Bunny | 46 предупреждений «Bunny webhook URL is not set automatically» | Работает через `videos.sweep` (без падений); вебхук ждёт Account API key владельца | — |
| Хранилище ключей (`SecretsService`, P2028) | 22 ошибки уровня 50 за 24 ч, последняя 12.11 10:26; исправление #952 слито 13:16, после него 0 | Исправлено (KE 110) | #952 |
| «Авто» облака: OpenSearch | 9 падений `infra-apply` 11.11 23:09 – 12.11 08:11 (KE 104/105/108), затем успех 15:27; запуск 17:24 отменён в ожидании 2FA владельца | Исправлено; отмена = шаг владельца | — |
| R2 (публичные файлы) | 3 строки «R2 is selected but not ready: domain» (11.11 09:19, 09:33, 12.11 07:11); сейчас `media.lawbid.dev` отвечает 200 | Работает (разовые сбои домена, повторная проверка сама) | — |
| Очереди группы (`setGlobalConcurrency`) | 13 из 66 запусков API за 72 ч — «Command timed out» на старте; настройка хранится в Redis, остальные запуски её ставят | Работает (шум на старте) | — |
| Пауза тяжёлых задач | 10 пауз за 24 ч, каждая после одного медленного замера базы (напр. 961 мс в 21:38); `counters.reconcile` и `staff.head-score` пропустили по одному ночному запуску | Работает по замыслу («пропустить такт»); у ежедневных задач следующий такт — завтра. Отмечено, не менял | — |
| Плановые задания (110 расписаний) | «cron job done» за 24 ч у всех ежечасных и ежедневных; не было только месячных/недельных (не наступил срок: `disposable-domains.refresh`, `licenses.registry-recheck`, `admin.access-report`, `journal.retention`, `staff.weekly-digest`); ежеминутные успех не пишут по замыслу, падений 0 | Работают | — |
| Пропуски по выключателям | `staff.*` — `off`, `admin.audit-export` — «no bucket configured», `ops.usage-poll-near` — «far from the limits» | По замыслу (выключено в админке / нечего делать) | — |
| Ошибки API уровня ≥ 50 | 22 строки за 24 ч, все `SecretsService` (см. выше); ответов 5xx — 0 | Чисто | — |
| Ошибки воркера уровня ≥ 50 | 0 за 24 ч | Чисто | — |
| ECS | Остановки только из-за выкладок и масштабирования (код 143), задачи разовые/миграций вышли с 0; падений нет | Чисто | — |
| Прочие тревоги CloudWatch | Горят только `TargetTracking…AlarmLow` (сигнал автоуменьшения, норма) | Чисто | — |
| Карточки админки | Здоровье системы, backfills, search-index, partitions, db-replica, calls-path, интеграции: ни одного красного пункта. «Запуск»: `arm_spot`, `pagerduty`, `stripe` (тестовый ключ), `turnstile`, `restore_drill` — шаги владельца | Чисто / шаги владельца | — |
| Админ 404 | `admin/workspace/desk-decisions`, `admin/appeals` — функции персонала выключены; `admin/ai-worker` — до выкладки #955/#968 (последний раз 16:50) | По замыслу / разовый разрыв выкладки | — |

## Как повторить

`/tmp/.../lq.sh <api|worker> <часы> '<запрос Insights>'` — основные запросы:
- падения заданий: `filter msg="cron job failed" | stats count(*) by lane, job, err`;
- запуски заданий: `filter msg="cron job done" | stats count(*), max(@timestamp), latest(skipped) by job`;
- ошибки: `filter level >= 50 | stats count(*) by context, msg, err.message`;
- состояние очередей: `filter metric="queue_depth" and failed5m > 0 | stats max(failed5m) by queue`.
