---
id: aws-cost-tags
title: Включить теги расходов AWS (видно, на что уходят деньги)
category: money
cost: Бесплатно
time: 5 минут и ожидание до 48 часов
launch: cost_tags
verified: 2026-10-25
sources:
  - AWS: Activating user-defined cost allocation tags | https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html
  - AWS: Using cost allocation tags | https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-alloc-tags.html
  - Репозиторий: infra/modules/stack/main.tf | https://github.com/syimykkalykov1999/LawBid/blob/main/infra/modules/stack/main.tf
---

## Что это и зачем

Все наши ресурсы в AWS помечены метками (тегами). Пока метки не «включены» в биллинге, в отчётах о расходах их не видно, и нельзя понять, сколько стоит прод, а сколько тест. Включить их можно только вручную в AWS.

## Что понадобится

- Вход в AWS (root или админ с правом на биллинг).
- Terraform уже применён, ресурсы с метками существуют.
- Наши ключи меток: `Project`, `Env`, `ManagedBy`. Их ставит Terraform.

## Шаги

1. Откройте [console.aws.amazon.com/costmanagement](https://console.aws.amazon.com/costmanagement/) и войдите.
2. В левом меню нажмите **Cost allocation tags**.
3. Откройте вкладку **User-defined cost allocation tags**.
4. Поставьте галочки у `Project`, `Env` и `ManagedBy`.
5. Нажмите **Activate**.
6. Если этих ключей в списке нет, подождите. После создания меток ключи появляются в списке до 24 часов, потом ещё до 24 часов уходит на включение.

Метки вида `aws:` (AWS-generated) нам не нужны.

## Куда вставить в нашей админке

Ничего вставлять не нужно.

## Как проверить

В списке **Cost allocation tags** у трёх ключей статус **Active**. На **Система → Запуск** станет зелёной строка «Теги расходов AWS включены (видно, на что уходят деньги)». Если там написано «Не включены: ...», какого-то ключа не хватает. Потом страница **Система → Расходы** покажет расходы по меткам.

## Частые ошибки

- Ключей нет в списке: метки ещё не дошли до биллинга, подождите сутки.
- Включили только `Project`: свет останется красным, нужны все три ключа.
- Если позже появится AWS Organizations, делайте это в главной (management) учётной записи, см. инструкцию «AWS Organizations (делать позже)».
