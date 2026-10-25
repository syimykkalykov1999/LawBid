---
id: cloudflare-r2
title: Cloudflare: фото и медиа (R2)
category: keys
cost: 10 ГБ хранения, 1 млн записей и 10 млн чтений в месяц бесплатно. Дальше $0,015 за ГБ в месяц. Скачивание из R2 бесплатно.
time: 30 минут (плюс ожидание, если домен ещё не в Cloudflare)
launch: cloudflare_r2, r2_on
verified: 2026-10-25
sources:
  - R2: Get started | https://developers.cloudflare.com/r2/get-started/
  - R2: Pricing | https://developers.cloudflare.com/r2/pricing/
  - R2: Authenticate API requests (API tokens) | https://developers.cloudflare.com/r2/api/tokens/
  - R2: Public buckets and custom domains | https://developers.cloudflare.com/r2/buckets/public-buckets/
  - R2: Create new buckets | https://developers.cloudflare.com/r2/buckets/create-buckets/
---

## Что это и зачем

R2 хранит публичные фото (аватары, обложки) и отдаёт их быстро и без платы за скачивание. Это дешевле, чем отдавать их из AWS. Пока не включено, всё работает на AWS как раньше.

## Что понадобится

- Аккаунт Cloudflare (см. инструкцию «Cloudflare: аккаунт и защита входа»).
- Домен уже в Cloudflare (см. инструкцию «Домен под управлением Cloudflare (смена серверов имён)»). Адрес `media.lawbid.dev` работает только так.
- Банковская карта: R2 подключается через оформление подписки, хотя бесплатной квоты хватит надолго.

## Шаги

1. Откройте [dash.cloudflare.com](https://dash.cloudflare.com).
2. Слева выберите **Storage & databases** → **R2** → **Overview**.
3. Если R2 ещё не включён, пройдите оформление (**checkout**) и добавьте карту.
4. Создайте бакет: нажмите **Create bucket**, имя `lawbid-public-media` (только маленькие латинские буквы, цифры и дефисы, 3-63 символа). Имя не должно совпадать с бакетами AWS. Нажмите **Create bucket**.
5. Откройте бакет → **Settings** → блок **Custom Domains** → **Add**.
6. Впишите `media.lawbid.dev` и нажмите **Continue**, затем **Connect Domain**.
7. Подождите, пока статус сменится с **Initializing** на **Active** (несколько минут; обновите страницу). Если не меняется, нажмите **...** у бакета → **Retry connection**.
8. Не включайте адрес `r2.dev`: он медленный и только для разработки.
9. Вернитесь на **R2** → **Overview**. В блоке **Account Details** нажмите **Manage** рядом с **API Tokens**.
10. Нажмите **Create Account API token**. В **Permissions** выберите **Object Read & Write**. В области действия укажите только бакет `lawbid-public-media`. Нажмите **Create Account API token**.
11. Скопируйте **Access Key ID** и **Secret Access Key**. Секрет показывается один раз.
12. Две обязательные настройки (CORS и правило кэша) подробно описаны в `docs/runbooks/DNS_TO_CLOUDFLARE.md`, раздел «После переноса». Без CORS загрузка фото из браузера не заработает.

## Куда вставить в нашей админке

1. «Ключи и сервисы» → карточка **Public media storage (Cloudflare R2)**.
2. «Cloudflare account ID» → ваш Account ID (32 символа).
3. «R2 access key ID» и «R2 secret access key» → значения из шага 11.
4. «Bucket» → `lawbid-public-media`.
5. «Public base URL» → `https://media.lawbid.dev` (с https, без пути).
6. Поля Zone ID и токен очистки кэша необязательны: с ними удалённые фото пропадают сразу, а не через сутки.
7. «Добавить ключи» → «Сохранить» (код 2FA) → «Проверить».
8. «Настройки» → `media.public_store` = `r2`. Новые фото пойдут в R2, старые останутся на AWS и откроются как раньше. Откат: `media.public_store` = `aws`.

## Как проверить

- «Запуск» → «Фото и медиа: ключи Cloudflare R2 и проверка» зеленеет после «Проверить».
- «Запуск» → «Публичные фото идут через R2 (переключатель включён)» зеленеет, когда `media.public_store` = `r2` и ключи на месте. Жёлтая лампа значит: ключи есть, переключатель ещё на AWS.
- Загрузите аватар и откройте его: адрес должен начинаться с `https://media.lawbid.dev/`.
- Из терминала: `sh scripts/ops/verify-r2-media.sh <адрес-фото>`, все строки должны быть `OK`.

## Частые ошибки

- Бакет назвали так же, как бакет AWS: вставьте другое имя.
- Токен создан с правом только на чтение: загрузка не пойдёт. Нужно **Object Read & Write**.
- Домен не в Cloudflare: **Custom Domains** не активируется. Сначала перенос DNS.
- Секрет не сохранили: создайте токен заново.
