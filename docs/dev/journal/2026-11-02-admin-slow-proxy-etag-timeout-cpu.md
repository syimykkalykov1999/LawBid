# 2026-11-02 · Админка зависает: прокси (ETag, таймаут чтения) + CPU задачи admin

Тред «Ускорить админку и веб».

- `apps/admin/src/app/api/proxy`: пробрасывает `If-None-Match`/`ETag` (раньше `GET /admin/counts` всегда отдавал полное 200, 304 до браузера не доходил); чтение (GET) ждёт ответа API 30 с вместо 120 (export — 120 с). Тесты в `proxy.test.ts`.
- Terraform: `admin_cpu`/`admin_memory` теперь настраиваются (были зашиты 256/512 и не выводились в prod/staging); по умолчанию 512/1024. Применяет владелец: `terraform apply` на Mac.
