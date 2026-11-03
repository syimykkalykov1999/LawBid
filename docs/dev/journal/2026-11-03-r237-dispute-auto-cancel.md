# 2026-11-03 — R-237: спор (chargeback) по подписке отменяет подписку автоматически

PR: см. описание (ветка `claude/r237-dispute-auto-cancel`). SHA слияния: допишется после слияния.

- Было: `charge.dispute.*` слушались, платёжный спор по подписке (счёт платформы) попадал только в очередь «Проверки Stripe» (`DisputeService.onPlatformDispute`), подписка продолжала списываться.
- Стало: `modules/billing/subscription-dispute.service.ts` (хук из `SubscriptionSyncService`, после case-payments). `charge.dispute.created` по платежу-счёту подписки: `cancelNow` в Stripe (ключ `dispute:<id>:cancel`), синхронизация строки, запись аудита `system.billing.dispute.*`, письмо админам. `charge.dispute.closed`: только запись `closed_lost|won|closed`, без возвратов и без восстановления.
- Возврат не делается (спор сам отменяет платёж; рядом работает защита `refundGuard`). Остаток за другой период — только вручную из «Платежи и возвраты».
- Переключатель `billing.dispute_auto_cancel` (по умолчанию вкл), админка → Настройки. `payments_in_app` не тронут.
- Миграций нет. Тесты: unit (10 + 3), e2e `owner-dispute-auto-cancel`.
