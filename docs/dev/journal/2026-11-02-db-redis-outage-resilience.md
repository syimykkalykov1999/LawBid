# 2026-11-02 — отвал БД/Redis: ретраи, breaker, outageProof

- Класс ошибки: кратковременная недоступность БД (RDS Multi-AZ failover 30–60 с, мёртвые соединения пула) превращалась в 5xx и в упавшие джобы BullMQ.
- Сделано: `transient-errors.ts` (классификатор + retryTransient), Prisma-extension `transient-retry` (чтения повторяются; записи только если запрос точно не ушёл; raw SQL и P1002 не повторяются; circuit breaker `database#N`), `outageProof` для 11 воркеров/раннеров.
- Не сделано: проверка под нагрузкой с реальным отвалом (облачных прогонов нет), Redis-класс (counter flush уже безопасен).
- SHA слияния: (после слияния)
