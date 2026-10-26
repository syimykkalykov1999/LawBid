---
id: aws-delete-old-budget
title: Удалить старый бюджет AWS «LawBid Monthly» ($50)
category: money
cost: Бесплатно
time: 5 минут
launch: old_budget
verified: 2026-10-25
sources:
  - AWS: Deleting a budget | https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-delete.html
  - AWS: Managing your costs with AWS Budgets | https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html
  - Репозиторий: docs/runbooks/cost.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/cost.md
---

## Что это и зачем

В AWS остался старый бюджет «LawBid Monthly» с потолком $50. Он шлёт лишние письма «бюджет превышен» и путает. Настоящий бюджет теперь называется `lawbid-prod-monthly`. Старый нужно удалить, а новый не трогать.

## Что понадобится

- Вход в нашу админку как владелец и приложение с кодами 2FA.
- Если включено `admin.dual_control`, нужен второй админ (по умолчанию не нужен).
- Запасной путь: вход в AWS Console.

## Шаги

Самый простой путь, прямо в нашей админке:

1. Откройте в админке **Система → Масштаб** и найдите блок **Бюджеты AWS**.
2. Найдите строку «LawBid Monthly» с потолком 50 $. Она помечена как старая.
3. Нажмите **Удалить** и введите код 2FA.
4. Убедитесь, что `lawbid-prod-monthly` остался в списке.

Запасной путь через AWS (если админка не открывается):

1. Откройте [console.aws.amazon.com/cost-management](https://console.aws.amazon.com/cost-management/) и войдите.
2. В левом меню нажмите **Budgets**.
3. Поставьте галочку у бюджета **LawBid Monthly** (только у него!).
4. Сверху нажмите **Actions** → **Delete**.
5. Нажмите **Confirm**. Вернуть бюджет после этого нельзя, письма этого бюджета тоже исчезнут. Так и надо.

## Куда вставить в нашей админке

Ничего вставлять не нужно.

## Как проверить

Откройте **Система → Запуск**. Строка «Старый бюджет «LawBid Monthly» ($50) удалён» станет зелёной (проверка обновляется раз в 5 минут, можно нажать «Проверить заново»). Если сервер не видит AWS, поставьте галочку **Сделано** на этой строке сами.

## Частые ошибки

- Удалили не тот бюджет. Боевой называется `lawbid-prod-monthly`. Если удалили его случайно, напишите Claude: Terraform вернёт его при следующем `apply`.
- AWS показывает бюджеты с задержкой до 12 часов. Свет на «Запуске» может обновиться не сразу.
- См. инструкцию «Задать потолок расходов AWS на месяц».
