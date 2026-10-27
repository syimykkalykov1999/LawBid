# Switch inventory (admin on/off and mode controls)

Every setting whose key ends in `.mode`, `_mode`, `_enabled` or `.enabled` has one row here
(`apps/api/src/architecture/switch-inventory.spec.ts` fails otherwise).
Contract tests: `apps/api/src/common/app-settings/switch-contract.spec.ts`.
"State" is what the control has today on main: `2` = Выкл/Вкл, `3` = off/monitor/enforce or auto/manual.
The cost registry (`common/ops/cost-registry.ts`) is not on main yet; billable 2-state rows
move to Выкл/Вкл/Авто there. "Ceiling" is the number that caps the behaviour when it is on.

Rows are sorted by key: insert a new row at its alphabetical place (never append at the end), so parallel PRs do not conflict on this file.

| key | Русский ярлык (админка) | default | state | what it controls | reader | ceiling key | tested | registry row (fill after #372) |
|---|---|---|---|---|---|---|---|---|
| `billing.stripe_tax_enabled` | Stripe Tax | off | 2 | automatic_tax on subscriptions | `modules/billing/subscriptions.service.ts:1087` | none | yes | |
| `case_fanout.enabled` | Волны оповещений о делах | off | 2 | new-case alerts in waves | `modules/notifications/case-fanout/case-fanout.settings.ts:56` | `case_fanout.max_waves`, `daily_cap` | yes | |
| `chat.link_preview_enabled` | Карточки ссылок в чате | auto | 3 (off/on/auto, old boolean accepted) | outbound page fetch | `modules/link-preview/link-preview.service.ts:121` | `chat.link_preview_per_user_per_day` (+ per-minute and global constants) | yes | |
| `chat.search.backfill_mode` | Индексация старых сообщений для поиска | auto | 3 (off/on/auto) | landed on main after this inventory was written | `jobs/handlers/chat-search-backfill.job.ts:95` | see the setting | listed | |
| `client.events_enabled` | События приложения | on | 2 | app usage events (client tuning) | `common/app-settings/client-tuning.ts:63` (served via bootstrap) | `client.events_flush_s` | listed | |
| `client.guest_browse_app_enabled` | Гость в приложении | on | 2 | client tuning | `modules/feature-flags/services/bootstrap.service.ts:266` | none | listed | |
| `client.guest_browse_web_enabled` | Гость на сайте | on | 2 | client tuning | `modules/feature-flags/services/bootstrap.service.ts:268` | none | listed | |
| `db.health_mode` | Ежедневная проверка базы (размер таблиц, мёртвые строки) | auto | 3 (off/on/auto) | daily DB health check (#363): table sizes, dead rows, vacuum lag | `jobs/handlers/db-health.job.ts:104` | see the setting | listed | |
| `economy.ceiling_mode` | Потолок автомасштаба | auto | 3 (auto/manual) | autoscaling ceiling | `common/economy/economy.service.ts:178` | `economy.manual_api_max`, `manual_worker_max` | yes | |
| `feed.default_content_mode` | Лента по умолчанию | all | content filter, not billable | default feed filter | `modules/posts/content-filter.service.ts:21` | none | listed | |
| `files.access_log_enabled` | Журнал просмотров файлов | auto | 3 (off/on/auto, old boolean accepted) | DB write per confidential view; auto = sampled | `modules/files/file-access.service.ts:72` | `files.access_log_sample_percent` | yes | |
| `fraud.enabled` | Антифрод клиентов | on | 2 | client fraud scoring | `modules/client-fraud/client-fraud.service.ts:159,405` | none | default | |
| `guest.browsing_enabled` | Гостевой просмотр | on | 2 | token-less reads | `modules/auth/guards/jwt-auth.guard.ts:73` | per-IP guest limit | listed | |
| `images.avif_enabled` | AVIF-копии фото | off | 2 | AVIF twins written at upload | `modules/files/processing/image-processor.ts:51,76` | `images.avif_quality`, `images.avif_effort` | yes | |
| `ledger.reconcile_mode` | Ночная сверка денег (ledger) | auto | 3 (off/on/auto) | review R-26 (#411): on = whole ledger nightly; auto = last N days nightly, whole ledger weekly | `modules/ledger/ledger-reconcile.service.ts:304` | see the setting | listed | |
| `legal.disclaimer.enabled` | Пометка «не юридическая консультация» в ответах | on | 2 | legal Q&A safety (#378): server adds `meta.disclaimer` to Q&A, template and deadline responses | `common/legal-disclaimer/legal-disclaimer.interceptor.ts:70` | none | listed | |
| `moderation.csam.ncmec_submit_enabled` | Отправка отчёта CSAM в NCMEC через API | on | 2 | legal Q&A safety (#378): off = report opened and logged as «file by hand» | `modules/media-moderation/media-moderation.service.ts:770` | none | listed | |
| `moderation.image.enabled` | Проверка картинок | auto | 3 (off/on/auto, old boolean accepted) | image moderation (paid API); auto = on inside the cost-guard cap | `modules/media-moderation/media-moderation.service.ts:197` | cost guard `image_moderation` daily cap | yes | |
| `ops.auto_pause_heavy_jobs` | Авто-пауза тяжёлых задач | on | 2 | pause when DB slow | `jobs/handlers/ops-guard.job.ts:61` | `ops.db_slow_ms` | default | |
| `ops.auto_scale_down_on_budget` | Авто-снижение по бюджету | on | 2 | cap autoscaling at budget | `jobs/handlers/ops-guard.job.ts:107` | monthly budget | default | |
| `ops.route_metrics.mode` | Метрики по маршрутам (CloudWatch) | auto | 3 (off/on/auto) | per-route request / error / latency metrics, ~15 routes (S12-8); auto = only while a route has 5xx or p95 > 1 s | `common/ops/route-metrics.service.ts:192` | see the setting | listed | |
| `payments.own_page_enabled` | Своя страница оплаты | on | 2 | pay-link page | `modules/billing/pay-link.service.ts:138` | none | listed | |
| `qa.advice_flag_mode` | Ответы-консультации от юриста без лицензии в штате | flag | 3 (off/flag/hold) | legal Q&A safety (#378): flag = admin sees it; hold = hidden until a moderator restores it | `modules/legal-qa/qa-safety.service.ts:86` | none | listed | |
| `qa.banner_enabled` | Баннер вопросов | on | 2 | Q&A banner | `modules/legal-qa/legal-qa.service.ts:482` | `qa.banner_interval_hours` | listed | |
| `qa.pii_mode` | Личные данные в публичных вопросах и ответах | warn | 4 (off/warn/redact/block) | legal Q&A safety (#378): SSN, address, case number, opposing party name | `modules/legal-qa/qa-safety.service.ts:201` | none | listed | |
| `qa.profile_cta_enabled` | Кнопка «Задать вопрос» | on | 2 | Q&A profile CTA | `modules/legal-qa/legal-qa.service.ts:485` | none | listed | |
| `queues.push_rate_mode` | Ограничение скорости отправки пушей в FCM/APNs | auto | 3 (off/on/auto) | landed on main after this inventory was written | `modules/notifications/push/push-dispatcher.ts:160` | see the setting | listed | |
| `queues.scale_signal_mode` | Как считать нагрузку для автодобавления фоновых серверов | auto | 3 (off/on/auto) | landed on main after this inventory was written | `jobs/handlers/ops-metrics.job.ts:157` | see the setting | listed | |
| `ranking.events_mode` | Журнал показов и кликов для экспериментов | auto | 3 (off/on/auto) | experiments (#392): auto stores impressions/clicks only while an experiment runs | `modules/experiments/ranking-events.service.ts:97` | `ranking.impression_sample_percent` | listed | |
| `rewards.enabled` | Награды | off | 2 | periodic rewards | `modules/rewards/rewards.service.ts:85,323` | rewards budget keys | default | |
| `scale.bunny_hardstop.mode` | Новые загрузки видео (Bunny) | auto | 3 (off/on/auto) | landed on main after this inventory was written | `common/ops/cost-registry.ts:1622` | see the setting | listed | |
| `scale.capacity_ceiling.mode` | Потолок размера базы и Redis по деньгам | auto | 3 (off/on/auto) | landed on main after this inventory was written | `common/economy/economy.service.ts:348` | see the setting | listed | |
| `scale.cloudflare_hardstop.mode` | Групповые видеозвонки на Cloudflare | auto | 3 (off/on/auto) | landed on main after this inventory was written | `common/ops/cost-registry.ts:1654` | see the setting | listed | |
| `security.app_check.mode` | App Check | monitor | 3 | device attestation on SMS routes | `modules/auth/app-check/app-check.guard.ts` (`mode()`), `common/ops/launch/launch-checks.service.ts:666` | none | parse | |
| `security.password_breach_check_enabled` | Проверка паролей на утечки | on | 2 | outbound breach lookup | `modules/auth/services/password.service.ts:180` | none | listed | |
| `security.password_common_list_enabled` | Список частых паролей | on | 2 | local list check | `modules/auth/services/password.service.ts:173` | none | listed | |
| `security.turnstile.mode` | Проверка «не бот» | off | 3 | web bot check | `modules/auth/app-check/app-check.guard.ts:180` | none | parse | |
| `sms.cap_mode` | Как работают лимиты SMS | auto | 2 (auto/fixed) | review R-75 (#411): auto = caps are floors that grow with the last 7 days, capped by `sms.burst_ceiling_multiplier`; fixed = typed numbers | `common/cost-guard/sms-abuse-guard.service.ts:101` | `sms.burst_ceiling_multiplier` | listed | |
| `sms.login_code_enabled` | SMS-код для входа | off | 2 | passwordless SMS sign-in (SMS costs money) | `modules/auth/auth.service.ts:1128` | `sms.registration_per_number_per_day` | yes | |
| `storage.auto_cleanup` | Авто-очистка файлов | on | 2 | hourly storage GC | `modules/storage/storage-cleanup.service.ts:111` | `storage.orphan_grace_hours` | yes | |
| `storage.auto_retention` | Авто-удаление старых логов | on | 2 | log retention purge | `modules/storage/data-retention.service.ts:64` | retention days keys | yes | |
| `trust.enabled` | Проверка юристов | on | 2 | attorney trust master switch | `modules/attorney-trust/bar-number-blocks.service.ts:56,64` | none | default | |

"listed" = in the inventory and the reader exists, no behaviour test yet. `calls.channel_live_enabled` was removed (nothing read it; the feature does not exist).
Three billable/load switches were converted to off/on/auto (`common/app-settings/switch-mode.ts`).
