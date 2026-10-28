---
id: address-autocomplete
title: Подсказки адресов и открытие в картах
category: system
cost: Amazon Location $0,20 за 1 000 запросов (первые 3 месяца 10 000 в месяц бесплатно). Около $40–240 в месяц на 100 000 человек. Пока не включено, 0.
time: 15 минут
verified: 2026-10-28
sources:
  - Amazon Location Service: цены | https://aws.amazon.com/location/pricing/
  - Amazon Location: корзины цен Places | https://docs.aws.amazon.com/location/latest/developerguide/places-pricing.html
  - Amazon Location: Autocomplete | https://docs.aws.amazon.com/location/latest/APIReference/API_geoplaces_Autocomplete.html
  - Google Maps Platform: цены | https://developers.google.com/maps/billing-and-pricing/pricing
---

## Что это и зачем

Когда человек печатает адрес (место в чате, адрес в задаче, город в деле, адрес в жалобе DMCA), под полем появляются настоящие адреса США, включая маленькие города. Нажал строку — адрес вписан. Адрес в чате, в задаче и город в деле теперь нажимаются: на Android открывается список карт телефона (Google Maps, Waze и другие), на iPhone — Apple Maps, Google Maps или Waze (что установлено) и «Скопировать адрес».

Открытие в картах бесплатное и работает уже сейчас. Подсказки при вводе платные и ждут двух шагов ниже. Пока шаги не сделаны, поле адреса работает как обычное и ничего не стоит.

## Что понадобится

- Доступ к AWS для `terraform apply` (одно право для сервера).
- Доступ к админке с правом владельца и код 2FA.

## Шаги

1. Примените Terraform: `cd infra/envs/prod` → `terraform plan` (ожидается 1 новая политика `task_geo_places`) → `terraform apply`. Подробно: инструкция «Как применить Terraform» и `docs/runbooks/ADDRESS_AUTOCOMPLETE.md`.
2. Админка → «Ключи и сервисы» → «Подсказки адресов (Amazon Location)» → Region = регион сервера (например, us-east-1). Поля ключей оставьте пустыми: запросы подписывает роль сервера. «Сохранить» → «Включить».
3. Админка → «Настройки»: проверьте `addresses.autocomplete_enabled` = auto, `addresses.provider` = aws.
4. Поставьте потолок: `addresses.monthly_cap` (по умолчанию 300 000 запросов в месяц, это около $60). Лимит на одного человека в сутки: `addresses.per_user_per_day` (300).

Google вместо Amazon: ключ в «Ключи и сервисы» → «Подсказки адресов (Google Places)», затем `addresses.provider` = google. Google примерно в 14 раз дороже.

## Как проверить

- В приложении: чат → скрепка → «Место» → напечатайте «1600 Penn». Через полсекунды появятся адреса.
- Нажмите на отправленное место в чате: открылись карты с этим адресом.
- В AWS Cost Explorer строка «Amazon Location Service» растёт медленно и не выше потолка.

## Частые ошибки

- Регион в админке не тот, где работает сервер: право выдано только для региона стека, подсказок не будет.
- Не применили Terraform: AWS отвечает «нет доступа», подсказки пустые, ошибок у людей нет.
- Потолок `addresses.monthly_cap` = 0: подсказок нет до смены значения.
- Ответы Amazon и Google нельзя хранить по их правилам, поэтому каждый ввод — новый запрос. Экономию дают пауза 300 мс, минимум 3 буквы и лимиты.
