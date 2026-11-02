# 2026-11-02: очередь отправки уважает Retry-After и размазывает повторы

**Что искали и где.** Идемпотентность уже есть: у каждого сообщения (текст, голос, файл, подарок) свой `clientMessageId`, уникальный на сервере, повтор не дублирует (`OutboxSender`, `chat_providers.dart`); `RetryInterceptor` (Dio) повторяет только GET/PUT/DELETE и POST с `Idempotency-Key`, отправка сообщений его не использует; Retry-After и backoff с jitter есть только в `RetryInterceptor`. Дыра: очередь сообщений и очередь загрузок ждали 1→2→4…30 с БЕЗ jitter и БЕЗ Retry-After (429/503 SERVER_BUSY), то есть при общем сбое клиенты возвращались одной волной и раньше, чем просил сервер.

**Что сделано.** `ApiException.retryAfter` (секунды из заголовка; дата и мусор = нет). `ClientTuning.outboxDelay`: `outboxBackoff` плюс до 30% jitter, не раньше `Retry-After`, максимум `outbox_retry_max_s` (30 с). Используют `OutboxSender` (самый большой Retry-After за проход) и `UploadQueue` (по цели). Дубли исключены прежним `clientMessageId`.

**Тесты.** Заголовок попадает в исключение; задержка с jitter/Retry-After/потолком; сообщение при Retry-After 4 с не уходит раньше, хотя сервер «вернулся».

**Осталось / не проверено.** `StorageUploader` (повторы частей на S3) Retry-After не читает: это другой хост (хранилище), не API. На устройстве и под нагрузкой не проверено.
