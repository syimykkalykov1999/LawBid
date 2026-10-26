---
id: cloudflare-turnstile
title: Cloudflare: защита сайта от ботов (Turnstile)
category: system
cost: Бесплатно (тариф Free: до 20 виджетов, по 10 доменов в каждом).
time: 15 минут
launch: turnstile
verified: 2026-10-25
sources:
  - Turnstile: Get started | https://developers.cloudflare.com/turnstile/get-started/
  - Turnstile: Widget management in the dashboard | https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/
  - Turnstile: Plans | https://developers.cloudflare.com/turnstile/plans/
---

## Что это и зачем

Turnstile — это невидимая проверка «вы не бот» на формах сайта (вход, регистрация). Работает только на веб-версии. Телефоны защищает App Check (см. инструкцию «Firebase App Check - защита от ботов»).

## Что понадобится

- Аккаунт Cloudflare (см. инструкцию «Cloudflare: аккаунт и защита входа»).
- Список адресов сайта: `lawbid.dev` и `www.lawbid.dev`.

## Шаги

1. Откройте [dash.cloudflare.com](https://dash.cloudflare.com) и войдите.
2. В левом меню нажмите **Turnstile**.
3. Нажмите **Add widget**.
4. **Widget name**: `lawbid-web`.
5. **Hostname management**: добавьте `lawbid.dev` и `www.lawbid.dev`. Только свои домены: чужие сайты не смогут использовать ваш виджет.
6. **Widget mode**: выберите **Managed** (Cloudflare сам решает, показывать ли проверку). Есть ещё **Non-Interactive** и **Invisible**, но для начала нужен **Managed**.
7. Поле **Pre-clearance support** оставьте выключенным.
8. Нажмите **Create**.
9. Скопируйте **Site key** (публичный) и **Secret key** (секретный, не показывайте никому). Позже их можно найти в настройках виджета: откройте виджет → **Settings**.

## Куда вставить в нашей админке

1. «Ключи и сервисы» → карточка **Cloudflare Turnstile (защита сайта от ботов)**.
2. «Секретный ключ (Secret key)» → Secret key.
3. «Ключ сайта (Site key, публичный)» → Site key.
4. «Разрешённые домены сайта» → `lawbid.dev,www.lawbid.dev` (через запятую).
5. «Добавить ключи» → «Сохранить» (код 2FA) → «Проверить» → «Включить».
6. Карточка сама ничего не блокирует. Режим: «Настройки» → `security.turnstile.mode` = `monitor` (только запись в журнал). Через неделю, если боты видны, а людей не блокирует, поставьте `enforce`.

## Как проверить

- На карточке после «Проверить» зелёная отметка.
- «Запуск» → «Защита сайта от ботов (Turnstile): ключи и проверка» станет зелёной.
- Откройте lawbid.dev в окне инкогнито: на форме входа должен быть виджет Cloudflare (может быть невидимым). В панели Turnstile → ваш виджет появится статистика.

## Частые ошибки

- Не указали `www.lawbid.dev`: на этой версии адреса проверка не пройдёт.
- Сразу поставили `enforce`: если что-то настроено неверно, люди не смогут войти. Сначала `monitor`.
- Перепутали ключи: Site key — публичный, Secret key — секретный.
