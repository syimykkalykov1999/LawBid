---
id: stripe-robustness-webhooks
title: Stripe - события вебхука для споров, возвратов и выплат
category: keys
cost: Бесплатно (Smart Disputes берёт комиссию только с выигранных споров)
time: 15 минут
verified: 2026-10-25
sources:
  - Stripe - Receive Stripe events in your webhook endpoint | https://docs.stripe.com/webhooks
  - Stripe - Connect webhooks | https://docs.stripe.com/connect/webhooks
  - Stripe - How disputes work | https://docs.stripe.com/disputes/how-disputes-work
  - Stripe - Smart Disputes | https://docs.stripe.com/disputes/smart-disputes
  - Stripe - Dispute and fraud card monitoring programs | https://docs.stripe.com/disputes/monitoring-programs
  - Репозиторий: docs/runbooks/STRIPE_ROBUSTNESS.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/STRIPE_ROBUSTNESS.md
---

## Что это и зачем

Код уже умеет разбирать «странные» события Stripe: спор с банком, сорванный возврат, сорванную выплату адвокату, раннее предупреждение о мошенничестве. Но Stripe присылает только те события, которые вы отметили в **Workbench**. Здесь вы один раз отмечаете нужные. Без этого шага всё продолжает работать как раньше: ночная сверка сама перечитает платежи у Stripe, но споры и срывы выплат будут видны позже.

## Что понадобится

- Боевой аккаунт Stripe и два уже созданных вебхука: основной (Platform) и для адвокатов (Connect). Инструкция: «Платежи - боевые ключи Stripe и вебхуки».
- Вход в админку как владелец и код 2FA.

## Шаги

1. Откройте [dashboard.stripe.com](https://dashboard.stripe.com) → **Workbench** → вкладка **Webhooks**.
2. Откройте первый endpoint (Platform) → **Edit destination** → **Select events**.
3. Отметьте 11 событий: `payment_intent.payment_failed`, `checkout.session.expired`, `charge.refund.updated`, `payout.failed`, `account.application.deauthorized`, `capability.updated`, `radar.early_fraud_warning.created`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`, `invoice.upcoming`, `customer.subscription.trial_will_end`.
4. Нажмите **Save**.
5. Повторите шаги 2-4 для второго endpoint (Connect, у него отмечено **Listen to events on Connected accounts**).
6. Откройте **Settings** → **Disputes** и оставьте **Smart Disputes** включённым, если Stripe его предлагает.

## Куда вставить в нашей админке

Ключи не нужны. Все настройки в **Система** → **Настройки**, группа `stripe_ops.*`:
- `stripe_ops.hold_payouts_on_dispute` - приостанавливать выплаты адвокату на время спора (включено).
- `stripe_ops.dispute_auto_draft` - сразу готовить черновик доказательств (включено).
- `stripe_ops.dispute_reminder_days` - за сколько дней напоминать о сроке (5, 2, 1).
- `stripe_ops.efw_auto_refund_max_cents` - авто-возврат при раннем предупреждении до этой суммы в центах (0 = никогда).
- `stripe_ops.dispute_rate_warn_percent` и `stripe_ops.dispute_rate_alarm_percent` - пороги доли споров (0,5 % и 1 %).

Очередь проверок: **Деньги** → **Проверки Stripe**. Отправка доказательств и закрытие пункта требуют один код 2FA, второй админ не нужен.

## Как проверить

1. В **Workbench** → **Webhooks** → endpoint → **Send test webhook**, выберите `charge.dispute.funds_withdrawn`: в логе endpoint должен быть ответ `200`.
2. В тестовом режиме создайте спор картой `4000000000000259` (Stripe test card): в **Деньги** → **Проверки Stripe** появится пункт со сроком Stripe.
3. Через 30 секунд у платежа в тестовом споре должен быть черновик доказательств (**Dispute** → **Evidence** в Stripe).

## Частые ошибки

- Отметили события только на одном endpoint: события адвокатов (выплаты, отключение) или платформы (споры) пропадают.
- В тестовом режиме отметили события, а в боевом нет: режимы настраиваются отдельно.
- Ждёте письмо про долю споров сразу: пока споров меньше `stripe_ops.dispute_rate_min_count` (3), тревога молчит.
- (не удалось проверить: точные названия кнопок Workbench в вашем аккаунте - Stripe иногда меняет интерфейс, ориентируйтесь на слова Webhooks и Select events)
