# Подсказки адресов — как включить (runbook)

Код: `apps/api/src/modules/addresses`, приложение `apps/mobile/lib/core/addresses`.
Решение и цены: `docs/architecture/ADDRESS_AUTOCOMPLETE_2026-10-28.md`.

Пока шаги 1–2 не сделаны, подсказки выключены сами собой (режим «Авто» ждёт
региона), ничего не зовётся и не стоит денег. Поля адреса работают как раньше.

## 1. Право для сервера (Terraform, делает владелец)

Код уже в `infra/modules/ecs/main.tf`: политика `geo-places-autocomplete`
на роли задачи API (`geo-places:Autocomplete` на
`arn:aws:geo-places:<регион стека>::provider/default`). Только чтение.

```
cd infra/envs/prod
terraform plan    # ожидается: + aws_iam_role_policy.task_geo_places (1 to add)
terraform apply
```

Откат: удалить блок `task_geo_places` и снова `terraform apply`
(подсказки просто станут пустыми).

## 2. Регион в админке

Админка → Ключи и сервисы → «Подсказки адресов (Amazon Location)» →
Region = регион сервера (например `us-east-1`), ключи оставить пустыми →
«Сохранить» (код 2FA) → «Включить».

## 3. Проверка

- Телефон: чат → скрепка → Место → начните печатать «1600 Penn» —
  через полсекунды появятся адреса.
- Админка → Настройки: `addresses.autocomplete_enabled` = auto,
  `addresses.provider` = aws, `addresses.monthly_cap` = 300000.
- AWS Cost Explorer: сервис «Amazon Location Service».

## Google вместо Amazon (по желанию)

Ключи и сервисы → «Подсказки адресов (Google Places)» → ключ с ограничением
«Places API (New)» → Настройки → `addresses.provider` = google.

## Выключить

Настройки → `addresses.autocomplete_enabled` = off. Поля остаются обычными.
