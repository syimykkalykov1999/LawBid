# 2026-11-02 · Аудит предусловий, часть 6: зависимость Kinesis

Нашли: `event-stream.publisher.ts` грузит `@aws-sdk/client-kinesis` по вычисляемому имени, пакета нет в `package.json`/lock; Terraform при `growth.events_stream_enabled=true` выставляет `EVENTS_STREAM_NAME`, и каждая публикация падала бы в рантайме.

Сделали: пакет добавлен (`^3.1152.0`, как соседние aws-sdk), тест `event-stream.deps.spec.ts` ловит такой пропуск. Поведение при выключенном потоке не меняется.
