# 2026-11-02 · Аудит предусловий, часть 2: сбой старта API/воркера

Нашли: `void bootstrap()` в `main.ts`/`worker.ts` — отказ старта уходил в guard `unhandledRejection` (только лог), процесс мог жить на открытых хендлах; а Nest по умолчанию (`abortOnError: true`) при ошибке конфига/DI/`onModuleInit` вызывает `process.abort()` (SIGABRT, без читаемой строки).

Сделали: `runEntrypoint()` в `common/process-guards.ts` пишет одну JSON-строку `startup_failed` (с `code`, `errors` AggregateError, `cause`; пароли в URL заменены на `***`) и выходит с кодом 1; `abortOnError: false` в обеих фабриках Nest, чтобы ошибки доходили до обработчика. Тесты: успех, reject, не-Error, AggregateError + скрытие пароля, синхронный throw.

Не сделано: сброс OTel/Sentry перед выходом (flush только на SIGTERM) — отдельный шаг.

По /simplify: маскирование паролей в URL перенесено в общий `telemetry/scrub.ts` (`scrubString`, закрывает и обычные pino-логи/Sentry), `serializeError` пропускает message/stack через него; `runEntrypoint` на async/try. Не делаем: общий helper для `NestFactory` (в 9 CLI-точках входа та же утечка abort, отдельный шаг), перевод CLI на `runEntrypoint`, фатальный `unhandledRejection` до готовности.
