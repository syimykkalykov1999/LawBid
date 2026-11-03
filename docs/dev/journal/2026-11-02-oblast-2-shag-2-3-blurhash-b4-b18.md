# 2026-11-02 · Область 2, шаги 2–3 (PR #553)
- D-8 blurhash (сервер): files.blurhash, расчёт при скане, поле в media поста; B-13 лок старта видео-загрузки.
- B-4 в оставшихся 5 счётчиках (events, staff-security, ics, staff-ai, sms-abuse); B-18 gauge ws_connections раз в 30 с.
- Осознанно не делаем: B-8 (privacy-ревью), B-6/B-7 (нужен loadtest на кластере), B-10 (отдельный сервис ClamAV), B-15 (tmp-префикс S3 + lifecycle).
- Прошлый шаг: B-1,2,3,4,5,9,11,12,14,17 — PR #544, слит 3251cb18.
