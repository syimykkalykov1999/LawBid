---
id: twilio-geo-permissions
title: Twilio - SMS и звонки только в США
category: people
cost: Бесплатно
time: 5 минут
verified: 2026-10-25
sources:
  - Twilio - SMS Geo Permissions | https://www.twilio.com/docs/messaging/guides/sms-geo-permissions
  - Twilio - защита от SMS pumping | https://www.twilio.com/en-us/blog/developers/best-practices/sms-pumping-protection-options
---

## Что это и зачем

Мошенники заставляют сервисы слать коды на дорогие номера в других странах, а платите вы. Если разрешены только США, такие SMS просто не уйдут.

## Что понадобится

- Роль Account Owner или Admin в Twilio (другие не могут менять эти настройки).
- Вход в [Twilio Console](https://console.twilio.com/).

## Шаги

1. Откройте [Twilio Console](https://console.twilio.com/) → **Messaging** → **Settings** → **Geo Permissions**.
2. В списке стран снимите галочки со всех, кроме **United States**. Страну можно найти через **Filter by Country**.
3. Нажмите **Save geo permissions** и подтвердите. Изменение действует сразу.
4. Для голоса откройте раздел Voice → Geographic Permissions (в Console найдите его через строку поиска по слову Geographic). Оставьте включённой только **United States**.
5. Если позже понадобится другая страна, включите её тут же. Страны с пометкой High Risk просят отдельно подтвердить риск галочкой.

## Куда вставить в нашей админке

Ничего вставлять не нужно. Страны для SMS ограничены и на нашей стороне: **Система** → **Настройки** → параметры `sms.*`. Держите там и в Twilio одно и то же: США.

## Как проверить

1. В списке Geo Permissions включена только United States.
2. SMS на номер другой страны вернёт в Twilio ошибку 21408 (страна отключена). Так и должно быть.
3. Отдельного огонька в «Запуске» нет. Для защиты от накруток см. инструкцию «Twilio - защита от накрутки SMS».

## Частые ошибки

- Новый аккаунт по умолчанию разрешает только страну номера, подтверждённого при регистрации. Проверьте, что это США.
- Субаккаунты наследуют настройки основного. Если у вас есть субаккаунты, проверьте их.
- Аккаунты внутри Twilio Organization настройки не наследуют, настраивайте каждый.
- (не удалось проверить: точный путь меню для голосовых Geographic Permissions в текущей Console)
