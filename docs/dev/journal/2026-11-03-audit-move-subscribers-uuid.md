# 2026-11-03: «Перевести подписчиков на цену» давало 500

Причина (не «чужой actor id», как думали сначала): в журнал аудита как цель записывалось имя тарифа (`monthly`), а колонка `audit_log.target_id` — UUID. Запись падала с «Error creating UUID» уже после перевода подписчиков в Stripe, админ видел 500.
Исправление: цель — UUID активной строки цены (`plan_price.id`), если строки нет — пусто; имя тарифа остаётся в `after.kind`. Файл: `apps/api/src/modules/admin-billing/admin-pricing.service.ts`. Тест: `admin-pricing.service.spec.ts`.
Другие записи в аудит с не-UUID целью не найдены (поиск по `targetId:` в apps/api/src).
SHA слияния дописать после слияния.
