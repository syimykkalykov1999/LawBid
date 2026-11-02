# RDS lawbid-prod-postgres: окна недоступности (CloudWatch, шаг 1 мин)

Класс инстанса: db.t4g.medium, MultiAZ (по состоянию на 02.11). Для каждой метрики: минимум среднего / среднее / максимум за окно.


## 28.10 05:00-05:50 UTC

| Метрика | min(avg) | среднее | max |
|---|---|---|---|
| CPUCreditBalance | 0.4 | 59.7 | 288.0 |
| CPUUtilization | 2.7 | 7.4 | 24.8 |
| DatabaseConnections | 0.0 | 12.1 | 16.0 |
| FreeableMemory | 60 МБ | 1189 МБ | 3145 МБ |
| ReadIOPS | 0.0 | 6.2 | 103.7 |
| WriteIOPS | 0.7 | 2.3 | 12.0 |

## 31.10 08:25-09:15 UTC

| Метрика | min(avg) | среднее | max |
|---|---|---|---|
| CPUCreditBalance | 0.4 | 117.8 | 576.0 |
| CPUUtilization | 4.4 | 7.2 | 22.7 |
| DatabaseConnections | 0.0 | 9.2 | 13.0 |
| FreeableMemory | 1004 МБ | 1816 МБ | 3279 МБ |
| ReadIOPS | 0.0 | 4.9 | 83.3 |
| WriteIOPS | 0.8 | 2.4 | 11.7 |

## 02.11 01:30-01:50 UTC

| Метрика | min(avg) | среднее | max |
|---|---|---|---|
| CPUCreditBalance | 576.0 | 576.0 | 576.0 |
| CPUUtilization | 4.3 | 4.9 | 7.3 |
| DatabaseConnections | 11.0 | 11.0 | 11.0 |
| FreeableMemory | 2975 МБ | 2995 МБ | 3003 МБ |
| ReadIOPS | 0.0 | 0.3 | 1.3 |
| WriteIOPS | 0.9 | 2.1 | 6.0 |

## спокойный час 30.10 12:00-13:00 UTC

| Метрика | min(avg) | среднее | max |
|---|---|---|---|
| CPUCreditBalance | 576.0 | 576.0 | 576.0 |
| CPUUtilization | 4.2 | 4.8 | 6.9 |
| DatabaseConnections | 24.0 | 24.0 | 24.0 |
| FreeableMemory | 2894 МБ | 2905 МБ | 2919 МБ |
| ReadIOPS | 0.0 | 0.3 | 1.3 |
| WriteIOPS | 0.8 | 2.0 | 6.0 |

## Причина (события RDS)

Все три окна совпадают с нашими собственными изменениями класса инстанса (`Applying modification to database instance class`, затем `DB instance shutdown` → `Multi-AZ failover started/completed`, около 30-40 с недоступности на каждое переключение):
- 28.10: 05:05–05:19 и 05:35–05:47 (переключения 05:10:35 и 05:40:30);
- 31.10: 08:30–08:43 и 09:00–09:12 (переключения 08:35:13 и 09:06:01).
- 02.11 01:40: двух записей «database unreachable» в событиях RDS нет, одиночный сбой соединения при штатной работе (CPU 4.9 %, кредиты 576, соединений 11, память 2.9 ГБ).

Это не нехватка CPU-кредитов и не лимит соединений: в спокойное время баланс кредитов 576 (максимум), соединений 9–24, CPU ≈ 5 %. Падение кредитов до 0.4 и памяти до 60 МБ 28.10 это следствие пересоздания инстанса (кредиты и память сбрасываются при смене класса). Класс сейчас db.t4g.medium (не micro).

## Примеры ошибок (по 3, первые за 7 дней)

`counter flush failed` (CounterAggregator, Redis/команда): `{"level":50,"context":"CounterAggregator","err":"Command timed out","msg":"counter flush failed"}` — 3 раза подряд, 1793173402577, 1793173465068, 1793175493513 (мс), хосты api-задач.

`database unreachable` (health check): `Health Check has failed! {"redis":{"status":"up"},"database":{"message":"database unreachable","status":"down"}}` на GET /health/ready, затем `ServiceUnavailableException` из `@nestjs/terminus` HealthCheckService, ответ 503. Первые три — 28.10 ~05:10:34 UTC.
