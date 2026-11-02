# API: ошибки и 5xx за 7 дней (CloudWatch /lawbid/lawbid-prod/api)

Источник: Logs Insights, фильтр level>=50 или статус>=500. Совпало 318 записей из 25533. UUID и числа в путях заменены, персональных данных нет.

| Раз | Статус | Сообщение | Путь |
|---|---|---|---|
| 100 | 503 | request errored | /health/ready |
| 100 |  | Health Check has failed! {"redis":{"status":"up"},"database":{"message":"database unreachable","status":"down"}} | /health/ready |
| 100 |  | Unhandled exception | /health/ready |
| 8 |  | counter flush failed |  |
| 3 |  | Unhandled exception | /api/v1/search/clicks |
| 3 | 500 | request errored | /api/v1/search/clicks |
| 2 |  | case view flush failed |  |
| 1 |  | Unhandled exception | /api/v1/config/bootstrap |
| 1 | 500 | request errored | /api/v1/config/bootstrap |

Заметки: «database unreachable» на /health/ready — всплески 28.10 05:10–05:41 (49), 31.10 08:35 и 09:06 (по ~25), 02.11 01:40 (2); вне этих окон база отвечала. Остальные 5xx: search/clicks (3), config/bootstrap (1).
