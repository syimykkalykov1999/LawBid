---
id: aws-cost-tags
title: Включить теги расходов AWS (видно, на что уходят деньги)
category: money
cost: Бесплатно
time: 5 минут и ожидание до 48 часов
launch: cost_tags
verified: 2026-11-25
sources:
  - AWS: Activating user-defined cost allocation tags | https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html
  - AWS: Using cost allocation tags | https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-alloc-tags.html
  - Terraform: aws_ce_cost_allocation_tag | https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ce_cost_allocation_tag
  - Репозиторий: infra/modules/budget/main.tf | https://github.com/syimykkalykov1999/LawBid/blob/main/infra/modules/budget/main.tf
---

## Что это и зачем

Все наши ресурсы в AWS помечены метками (тегами). Пока метки не «включены» в биллинге, в отчётах о расходах их не видно, и нельзя понять, сколько стоит прод, а сколько тест. С 25.11 метки включает сам Terraform (ресурс `aws_ce_cost_allocation_tag`, список `cost_allocation_tags` в `infra/envs/prod/variables.tf`), руками нажимать ничего не нужно.

## Что понадобится

- Применённый Terraform прода (`terraform apply` в `infra/envs/prod`) и применённый `infra/bootstrap` (право `ce:UpdateCostAllocationTagsStatus`).
- Наши ключи меток: `Project`, `Env`, `Component`, `ManagedBy`. Их ставит Terraform.

## Шаги

1. Примените Terraform прода, как обычно. Он включит все четыре ключа.
2. Если apply пишет, что ключа нет (`Tag keys not found`), метки ещё не дошли до биллинга: подождите до 24 часов и примените ещё раз.
3. Если позже появится AWS Organizations, Terraform прода должен работать в главной (management) учётной записи, иначе AWS откажет.

Запасной путь руками, если Terraform применить нельзя: [console.aws.amazon.com/costmanagement](https://console.aws.amazon.com/costmanagement/) → **Cost allocation tags** → **User-defined cost allocation tags** → галочки у четырёх ключей → **Activate**.

Метки вида `aws:` (AWS-generated) нам не нужны.

## Куда вставить в нашей админке

Ничего вставлять не нужно.

## Как проверить

В списке **Cost allocation tags** у четырёх ключей статус **Active**. На **Система → Запуск** станет зелёной строка «Теги расходов AWS включены (видно, на что уходят деньги)». Если там написано «Не включены: ...», какого-то ключа не хватает. Потом страница **Система → Расходы** покажет расходы по меткам (до 24 часов после включения).

## Частые ошибки

- Ключей нет в биллинге: метки ещё не дошли, подождите сутки и примените снова.
- `AccessDenied` на `UpdateCostAllocationTagsStatus`: не применён `infra/bootstrap`.
