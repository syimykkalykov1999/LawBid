# Stripe Tax — налог с продаж (sales tax / VAT)

> **Для владельца:** пока LawBid продаёт в одном штате, налог можно не
> собирать. Как только появится обязанность (порог продаж в другом штате,
> покупатели из ЕС), включите Stripe Tax по шагам ниже — Stripe сам посчитает
> и добавит налог к каждой покупке, а в админке есть один переключатель
> `billing.stripe_tax_enabled` (Настройки). Пока он выключен, всё работает
> как раньше: цены как указаны, без строки налога.

## Что делает код (2026-10-22, чеклист систем §12)

- **Подписки** (`createSubscription`, hosted Checkout, переход на годовой,
  покупка мест): `automatic_tax: { enabled: true }`, но только если Stripe
  уже «видит», где находится покупатель (`customer.tax.automatic_tax ===
  'supported'`). Иначе подписка создаётся без налога — Stripe отказал бы
  в создании.
- **Hosted Checkout** (подписка и разовые покупки на странице Stripe):
  `billing_address_collection: 'required'` + `customer_update.address =
  'auto'` — Stripe сам спрашивает адрес и сохраняет его на клиенте.
- **Наша страница оплаты** (`/pay.html`): `POST /pay/session` принимает
  необязательный `address {country, postalCode, state?, city?, line1?}`;
  сервер считает налог через Tax Calculation API (по адресу, а без него —
  по IP покупателя), поднимает сумму PaymentIntent до итога и возвращает
  `priceCents` (итог), `subtotalCents`, `taxCents`. Для подписки/мест
  (сохранение карты) адрес записывается на клиента Stripe, чтобы
  подписка создалась с налогом. После успешной оплаты вебхук
  `payment_intent.succeeded` создаёт tax transaction (отчётность Stripe
  Tax) и пишет `tax_cents` в строку платежа.
- **Цены**: новые цены создаются с `tax_behavior: 'exclusive'` (налог
  сверху указанной цены).
- **Чеки/платежи**: `PaymentDto` и `AdminPaymentDto` получили
  необязательные `taxCents` и `subtotalCents` (из `invoice.total_taxes`);
  в превью мест `SeatPreviewDto.taxCents`.
- Локально и в тестах (fake provider) налог = 0, если не задать
  `taxRate` в тестах.

## Шаги владельца (один раз, ~20 минут)

1. **Включить Stripe Tax.** Stripe Dashboard → Settings → Tax → «Get
   started». Указать адрес компании (origin address) — он нужен для
   расчёта.
2. **Регистрации.** Settings → Tax → Registrations → добавить штаты/страны,
   где есть обязанность собирать налог (Stripe показывает, где вы
   приближаетесь к порогу: Tax → Monitoring). Без регистрации Stripe
   считает налог 0 для этой территории.
3. **Категория товара.** Settings → Tax → Default product tax code →
   выбрать «Software as a service (SaaS) — business use» (`txcd_10103001`)
   или «…personal use» (`txcd_10103000`) — подписки и Boost относятся к
   SaaS. И там же «Default tax behavior» = **Exclusive** (налог сверху
   цены).
4. **Старые цены.** Цены, созданные до этого дня, не имеют
   `tax_behavior`. В Dashboard → Product catalog открыть каждую активную
   цену и поставить «Tax behavior: Exclusive» (или положиться на default из
   шага 3 — он применяется к ценам без явного значения).
5. **Вебхук.** В Developers → Webhooks у нашего endpoint уже есть
   `invoice.paid` и `payment_intent.succeeded` — ничего добавлять не нужно.
6. **Включить в админке.** Настройки → `billing.stripe_tax_enabled` → Вкл.
   Проверить в тестовом режиме: открыть страницу оплаты Boost с адресом
   `94105, CA` — должна появиться строка налога.
7. **Отчётность.** Stripe → Tax → Reports: суммы по штатам для подачи
   деклараций (сам Stripe декларации не подаёт; можно подключить
   TaxJar/Avalara или бухгалтера).

Выключить: тот же переключатель — новые подписки создаются без
`automatic_tax`; уже созданные с налогом продолжают его собирать до
изменения в Dashboard.

## Что делает мобильный/веб-работник

- `apps/mobile/web/pay.js`: при `taxCents != null` показывать «Цена …,
  налог …, итого …»; добавить поля адреса (страна + ZIP обязательно для
  США, штат по желанию) и отправлять их в `POST /pay/session` как `address`
  — повторный вызов `/pay/session` с адресом пересчитает налог и вернёт
  новый итог (тот же `clientSecret`).
- Экран «Платежи» в приложении и админке: показывать `taxCents` /
  `subtotalCents`, когда они есть.
- Превью покупки мест: `SeatPreviewDto.taxCents`.
