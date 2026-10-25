---
id: cloudflare-turn
title: Cloudflare: ключ для звонков (TURN)
category: keys
cost: Первые 1000 ГБ трафика в месяц бесплатно (общие с SFU), дальше $0,05 за ГБ. STUN бесплатный.
time: 10 минут
launch: cloudflare_turn
verified: 2026-10-25
sources:
  - Realtime TURN: Overview | https://developers.cloudflare.com/realtime/turn/
  - Realtime TURN: Generate credentials | https://developers.cloudflare.com/realtime/turn/generate-credentials/
  - Realtime TURN: FAQ and pricing | https://developers.cloudflare.com/realtime/turn/faq/
  - Realtime pricing | https://developers.cloudflare.com/realtime/sfu/pricing/
---

## Что это и зачем

TURN помогает дозвониться, когда телефоны не видят друг друга напрямую (мобильная сеть, офисный Wi-Fi). Без него часть звонков не соединится. Наш собственный TURN-сервер остаётся запасным.

## Что понадобится

- Аккаунт Cloudflare с двухфакторной защитой (см. инструкцию «Cloudflare: аккаунт и защита входа»).
- Доступ к админке с правом владельца.

## Шаги

1. Откройте [dash.cloudflare.com](https://dash.cloudflare.com) и войдите.
2. В левом меню нажмите **Realtime**.
3. В блоке **TURN Server** нажмите **Create**.
4. В поле имени впишите `lawbid-calls` и снова нажмите **Create**.
5. Cloudflare покажет **Key ID** (в документации он назван «TURN Token ID») и **API Token**. Токен виден только один раз.
6. Скопируйте оба значения в менеджер паролей, пока страница открыта.
7. Необязательно, для учёта трафика: найдите **Account ID** (см. инструкцию «Cloudflare: аккаунт и защита входа»).

> Название пункта меню в панели Cloudflare иногда меняется (**Realtime** → **TURN Server** или **TURN Keys**). Если не нашли, нажмите **Search** и впишите TURN. (Не удалось проверить: точные подписи кнопок в панели; документация даёт только ссылку на раздел, подписи взяты из примера Cloudflare и из сообщений пользователей.)

## Куда вставить в нашей админке

1. «Ключи и сервисы» → карточка **Cloudflare TURN (in-app calls)**.
2. Поле «TURN key ID» → вставьте Key ID.
3. Поле «TURN key API token» → вставьте API Token.
4. Нажмите «Добавить ключи» → «Сохранить» (потребуется код 2FA) → «Проверить» → «Включить».

## Как проверить

- На карточке после «Проверить» появится зелёная отметка.
- На странице «Запуск» (группа «Звонки») строка «Звонки: ключи Cloudflare TURN и проверка» станет зелёной.
- Позвоните с двух телефонов в разных сетях: один на Wi-Fi, второй на мобильном интернете.

## Частые ошибки

- Токен не скопировали сразу: повторно его не показать. Удалите ключ в Cloudflare и создайте новый.
- Перепутали Key ID и API Token: проверка покажет ошибку авторизации.
- Боитесь большого счёта: до 1000 ГБ в месяц платить не нужно. Расходы смотрите на странице «Расходы» в админке.
