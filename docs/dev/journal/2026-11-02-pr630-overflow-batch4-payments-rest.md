# 2026-11-02 — пачка 4 в тесте на наезд текста: остаток платежей и найденный дефект

Продолжение `2026-11-02-pr627-overflow-batch3-payments.md`.

Покрыто (`test/overflow/batch4_overflow_test.dart`): шторка встречного по комиссии (`FeePayerSheet`), шторка возврата (`RefundSheet`), платёжная панель в чате (`ChatPaymentBar`, клиент и адвокат), история платежей (`CasePaymentsHistoryList`, клиент и адвокат). 7 языков × масштаб 1 и 1,3 и 4 темы на самом длинном тексте, 108 проверок. Данные и фейк репозитория вынесены из пачки 3 в `test/helpers/overflow_payments_fixtures.dart` (их используют обе пачки).

**Найден настоящий дефект.** Кнопки в платёжной панели чата («Запросить» у адвоката, «Оплатить» у клиента) лежали в `Row` без ограничения ширины, а `AppButton` растягивается на всю ширину: в отладочной сборке это ошибка раскладки «BoxConstraints forces an infinite width» (в тесте падали все языки, масштабы и темы), в релизной кнопка могла не отрисоваться. Исправлено в `chat_payment_bar.dart`: кнопка в `ConstrainedBox(maxWidth: 148)`, как уже сделано в `contact_rows.dart` и `blocked_users_screen.dart`. Длинная подпись переносится внутри кнопки.

Чего ещё нет: `post_attachments_sheet`, `story_viewer_sheets`, `story_publish_sheet`, `sections_archive`, `chat_video`, `contacts_states`, `demo_section`, `app_paginated_list_view`; камерные экраны и `secure_screen` только на телефоне. Не проверено на телефоне.
